import SwiftUI
import Supabase

/// Super admin « Utilisateurs », like the web AdminUsers: filter by role (with counts), school
/// and class, search by name or e-mail, 50 at a time; each account with its roles and schools,
/// and the support actions (déverrouiller, verrouiller, forcer le changement, réinitialiser).
struct PlatformUsersView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var role = "school_admin"
    @State private var schoolId = ""
    @State private var classId = ""
    @State private var search = ""
    @State private var rows: [UserRow] = []
    @State private var total = 0
    @State private var facets: Facets?
    @State private var loadingMore = false
    @State private var ready = false
    @State private var error: String?
    @State private var busy: (id: String, action: String)?
    @State private var confirm: Action?
    @State private var tempPassword: TempPassword?
    @State private var notice: String?
    @State private var searchTask: Task<Void, Never>?
    @State private var supportFor: UserRow.Role?
    @State private var openingSupport = false

    @State private var tour = TabTour(key: "admin-utilisateurs")
    @State private var coach = CoachMarkRegistry()

    static let roleOrder = ["super_admin", "school_admin", "teacher", "student", "parent", "none"]
    static let rolesWithSchool = ["school_admin", "teacher", "student"]
    static func roleLabel(_ r: String) -> String {
        switch r {
        case "super_admin": "Super admin"
        case "school_admin": "Administration"
        case "teacher": "Enseignant"
        case "student": "Élève"
        case "parent": "Parent"
        case "none": "Sans rôle actif"
        default: r
        }
    }
    static func rolePlural(_ r: String) -> String {
        switch r {
        case "super_admin": "Super admins"
        case "school_admin": "Administrateurs d’école"
        case "teacher": "Enseignants"
        case "student": "Élèves"
        case "parent": "Parents"
        default: "Sans rôle actif"
        }
    }

    struct UserRow: Decodable, Identifiable, Hashable {
        struct Role: Decodable, Hashable, Identifiable { let id: String; let role: String; let school_id: String?; let active: Bool }
        let id: String
        let first_name: String?
        let last_name: String?
        let email: String?
        let active: Bool?
        let must_change_password: Bool?
        let roles: [Role]
        let schoolNames: [String]
        let className: String?
        var name: String { "\(first_name ?? "") \(last_name ?? "")".trimmingCharacters(in: .whitespaces) }
        var isActive: Bool { active != false }
    }
    struct Facets: Decodable {
        struct S: Decodable, Hashable { let id: String; let name: String; let count: Int }
        let roleCounts: [String: Int]?
        let schools: [S]?
        let classes: [S]?
        let noClass: Int?
    }
    struct Action: Identifiable {
        let user: UserRow; let action: String
        var id: String { "\(user.id):\(action)" }
        var title: String {
            switch action {
            case "lock": "Verrouiller ce compte ?"
            case "unlock": "Déverrouiller ce compte ?"
            case "force_password_change": "Forcer le changement de mot de passe ?"
            default: "Réinitialiser le mot de passe ?"
            }
        }
        var message: String {
            switch action {
            case "lock": "La personne ne pourra plus se connecter tant que le compte est verrouillé."
            case "unlock": "La personne pourra de nouveau se connecter."
            case "force_password_change": "La personne devra choisir un nouveau mot de passe à sa prochaine connexion."
            default: "Un mot de passe temporaire est créé : transmettez-le à la personne, qui devra le changer."
            }
        }
        var confirm: String {
            switch action {
            case "lock": "Verrouiller"
            case "unlock": "Déverrouiller"
            case "force_password_change": "Forcer le changement"
            default: "Réinitialiser"
            }
        }
    }
    struct TempPassword: Identifiable { let id = UUID(); let name: String; let password: String }

    private var showSchool: Bool { Self.rolesWithSchool.contains(role) }
    private var schoolName: String? { facets?.schools?.first { $0.id == schoolId }?.name }
    private var className: String? { classId == "__none__" ? "Sans classe" : facets?.classes?.first { $0.id == classId }?.name }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "au.filters", icon: "line.3.horizontal.decrease.circle", title: "Filtrer", message: "Par rôle, puis par école et par classe. Ou cherchez un nom ou un e-mail."),
            CoachMarkStep(id: "au.list", icon: "person.2", title: "Les comptes", message: "Chaque compte avec ses rôles et ses écoles : verrouillez-le, ou réinitialisez son mot de passe."),
            CoachMarkStep(id: "au.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: "Utilisateurs", tour: tour, coach: coach, ready: ready, onRefresh: { await reload() }) {
            PlatformBanner(title: "Utilisateurs", subtitle: "Gérer les comptes et rôles de la plateforme.",
                           onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "au.help") {
                HStack(spacing: 8) {
                    PlatformBannerStat(label: Self.rolePlural(role), value: "\(total)",
                                       hint: { let h = [schoolName, className].compactMap { $0 }.joined(separator: " · "); return h.isEmpty ? nil : h }())
                }
            }
            filters.coachMarkTarget("au.filters")
            if let notice { Label(notice, systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Platform.H.emerald) }
            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
            VStack(spacing: 10) {
                if rows.isEmpty {
                    PlatformEmpty(text: emptyText)
                } else {
                    ForEach(rows) { u in card(u) }
                    if rows.count < total {
                        PlatformButton(title: loadingMore ? "Chargement…" : "Afficher plus (\(total - rows.count) restants)", outline: true, busy: loadingMore) {
                            Task { await loadMore() }
                        }
                    }
                }
            }
            .coachMarkTarget("au.list")
        }
        .task { await reload() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
        .onChange(of: role) { _, r in classId = ""; if !Self.rolesWithSchool.contains(r) { schoolId = "" }; Task { await reload() } }
        .onChange(of: schoolId) { _, _ in classId = ""; Task { await reload() } }
        .onChange(of: classId) { _, _ in Task { await reload() } }
        .onChange(of: search) { _, _ in
            searchTask?.cancel()
            searchTask = Task { try? await Task.sleep(for: .milliseconds(300)); if !Task.isCancelled { await reload() } }
        }
        .sheet(item: $confirm) { a in
            EduFormSheet(title: a.title, subtitle: a.user.name.isEmpty ? a.user.email : a.user.name, primary: a.confirm,
                         busy: busy?.id == a.user.id, destructive: a.action == "lock",
                         onPrimary: { Task { await run(a) } }) {
                Text(a.message).font(.subheadline).foregroundStyle(EduTheme.ink)
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $supportFor) { r in
            EduFormSheet(title: "Ouvrir le mode support ?", subtitle: "Vous verrez l’école comme son administration.",
                         primary: openingSupport ? "Ouverture…" : "Ouvrir l’école", busy: openingSupport,
                         onPrimary: { Task { await openSupport(r) } }) {
                Text("Toutes vos actions seront faites comme administrateur de l’école. Le bandeau en haut de l’écran permet de quitter le mode support.")
                    .font(.subheadline).foregroundStyle(EduTheme.ink)
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $tempPassword) { t in
            EduFormSheet(title: "Mot de passe temporaire", subtitle: t.name, primary: "Copier",
                         onPrimary: { UIPasteboard.general.string = t.password; tempPassword = nil; notice = "Mot de passe temporaire copié." }) {
                Section("À transmettre à la personne") {
                    Text(t.password).font(.title3.monospaced().weight(.semibold)).foregroundStyle(EduTheme.ink).textSelection(.enabled)
                }
                Text("La personne devra le changer à sa prochaine connexion.").font(.caption).foregroundStyle(EduTheme.muted)
            }
            .presentationDetents([.medium])
        }
    }

    private var emptyText: String {
        if let c = className { return "Aucun élève dans « \(c) »\(schoolName.map { " (\($0))" } ?? "")." }
        if let s = schoolName { return "Aucun \(Self.roleLabel(role).lowercased()) pour « \(s) »." }
        return "Aucun utilisateur « \(Self.roleLabel(role)) » trouvé."
    }

    private var filters: some View {
        VStack(spacing: 8) {
            PlatformSearchField(placeholder: "Rechercher par nom ou e-mail…", text: $search)
            VStack(spacing: 0) {
                pickerRow("Rôle") {
                    Picker("Rôle", selection: $role) {
                        ForEach(Self.roleOrder, id: \.self) { r in Text("\(Self.roleLabel(r)) (\(facets?.roleCounts?[r] ?? 0))").tag(r) }
                    }
                }
                if showSchool {
                    Divider()
                    pickerRow("École") {
                        Picker("École", selection: $schoolId) {
                            Text("Toutes les écoles").tag("")
                            ForEach(facets?.schools ?? [], id: \.id) { s in Text("\(s.name) (\(s.count))").tag(s.id) }
                        }
                    }
                }
                if role == "student" {
                    Divider()
                    pickerRow("Classe") {
                        Picker("Classe", selection: $classId) {
                            Text("Toutes les classes").tag("")
                            if let n = facets?.noClass, n > 0 { Text("Sans classe (\(n))").tag("__none__") }
                            ForEach(facets?.classes ?? [], id: \.id) { c in Text("\(c.name) (\(c.count))").tag(c.id) }
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .modifier(HomeCardStyle())
        }
    }

    private func pickerRow<P: View>(_ label: String, @ViewBuilder picker: () -> P) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(EduTheme.ink)
            Spacer()
            picker().labelsHidden().tint(EduTheme.teal)
        }
        .frame(minHeight: 44)
    }

    private func card(_ u: UserRow) -> some View {
        let roles = u.roles.filter(\.active)
        let rowBusy = busy?.id == u.id
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(u.name.isEmpty ? "Sans nom" : u.name).font(.headline).foregroundStyle(EduTheme.ink)
                    if let e = u.email, !e.isEmpty { Text(e).font(.caption).foregroundStyle(EduTheme.muted) }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    u.isActive ? PlatformChip(text: "Actif", fg: Platform.H.emerald, bg: Platform.H.emerald50)
                               : PlatformChip(text: "Verrouillé", fg: Platform.rose, bg: Platform.rose100)
                    if u.must_change_password == true { PlatformChip(text: "MDP à changer", fg: Platform.H.amber, bg: Platform.H.amber50) }
                }
            }
            FlowLayout(spacing: 6) {
                if roles.isEmpty { PlatformChip(text: "Aucun rôle actif", fg: EduTheme.muted, bg: Platform.H.slate100) }
                ForEach(roles, id: \.id) { r in PlatformChip(text: Self.roleLabel(r.role), fg: Platform.sky, bg: Platform.sky100) }
            }
            if !u.schoolNames.isEmpty {
                Text("École\(u.schoolNames.count > 1 ? "s" : "") : \(u.schoolNames.joined(separator: ", "))").font(.caption).foregroundStyle(EduTheme.muted)
            }
            if role == "student" { Text("Classe : \(u.className ?? "Sans classe")").font(.caption).foregroundStyle(EduTheme.muted) }
            if let adminRole = roles.first(where: { $0.role == "school_admin" && $0.school_id != nil }) {
                PlatformButton(title: "Mode support", icon: "headphones", outline: true) { supportFor = adminRole }
            }
            HStack(spacing: 8) {
                if u.isActive {
                    PlatformButton(title: "Verrouiller", icon: "lock", outline: true, danger: true, busy: rowBusy && busy?.action == "lock") { confirm = Action(user: u, action: "lock") }
                } else {
                    PlatformButton(title: "Déverrouiller", icon: "lock.open", outline: true, busy: rowBusy && busy?.action == "unlock") { confirm = Action(user: u, action: "unlock") }
                }
                Menu {
                    Button("Forcer le changement de mot de passe", systemImage: "key") { confirm = Action(user: u, action: "force_password_change") }
                    Button("Réinitialiser le mot de passe", systemImage: "arrow.counterclockwise") { confirm = Action(user: u, action: "reset_password") }
                } label: {
                    HStack(spacing: 6) {
                        if rowBusy && busy?.action != "lock" && busy?.action != "unlock" { ProgressView().tint(.white) } else { Image(systemName: "key") }
                        Text("Mot de passe")
                    }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 42)
                    .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .disabled(rowBusy)
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    // MARK: Loading

    private struct PageParams: Encodable {
        let p_role: String; let p_school: String?; let p_class: String; let p_search: String; let p_limit: Int; let p_offset: Int
        enum K: String, CodingKey { case p_role, p_school, p_class, p_search, p_limit, p_offset }
        func encode(to e: Encoder) throws {
            var c = e.container(keyedBy: K.self)
            try c.encode(p_role, forKey: .p_role); try c.encode(p_school, forKey: .p_school); try c.encode(p_class, forKey: .p_class)
            try c.encode(p_search, forKey: .p_search); try c.encode(p_limit, forKey: .p_limit); try c.encode(p_offset, forKey: .p_offset)
        }
    }
    private struct FacetParams: Encodable {
        let p_role: String; let p_school: String?
        enum K: String, CodingKey { case p_role, p_school }
        func encode(to e: Encoder) throws { var c = e.container(keyedBy: K.self); try c.encode(p_role, forKey: .p_role); try c.encode(p_school, forKey: .p_school) }
    }

    private func page(offset: Int) async throws -> EduAPI.Page<UserRow> {
        try await SupabaseManager.client.rpc("ef_admin_users_page", params: PageParams(
            p_role: role, p_school: schoolId.isEmpty ? nil : schoolId, p_class: role == "student" ? classId : "",
            p_search: search.trimmed, p_limit: 50, p_offset: offset)).execute().value
    }

    private func reload() async {
        do {
            async let f: Facets = SupabaseManager.client.rpc("ef_admin_users_facets", params: FacetParams(p_role: role, p_school: schoolId.isEmpty ? nil : schoolId)).execute().value
            let p = try await page(offset: 0)
            rows = p.rows
            total = p.total
            facets = try? await f
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger les utilisateurs." }
        }
        ready = true
    }

    private func loadMore() async {
        loadingMore = true
        defer { loadingMore = false }
        if let p = try? await page(offset: rows.count) { rows += p.rows; total = p.total }
    }

    private func openSupport(_ r: UserRow.Role) async {
        guard let sid = r.school_id else { return }
        openingSupport = true
        defer { openingSupport = false }
        do {
            guard let school = try await EduAPI().fetchSchool(id: sid) else { throw URLError(.badServerResponse) }
            supportFor = nil
            try? await Task.sleep(for: .milliseconds(350))
            auth.enterSupportMode(school)
        } catch {
            supportFor = nil
            self.error = "Impossible d’ouvrir l’école."
        }
    }

    private struct ActionResponse: Decodable { let success: Bool?; let error: String?; let tempPassword: String? }

    private func run(_ a: Action) async {
        busy = (a.user.id, a.action)
        defer { busy = nil }
        do {
            let res: ActionResponse = try await SupabaseManager.client.functions.invoke("support-user-action", options: FunctionInvokeOptions(body: ["action": a.action, "userId": a.user.id]))
            if let e = res.error { throw NSError(domain: "support", code: 0, userInfo: [NSLocalizedDescriptionKey: e]) }
            confirm = nil
            switch a.action {
            case "reset_password":
                if let p = res.tempPassword { tempPassword = TempPassword(name: a.user.name, password: p) }
                notice = "Mot de passe temporaire généré."
            case "lock": notice = "Compte verrouillé."
            case "unlock": notice = "Compte déverrouillé."
            default: notice = "Changement de mot de passe requis au prochain accès."
            }
            error = nil
            await reload()
        } catch {
            confirm = nil
            self.error = error.localizedDescription
        }
    }
}
