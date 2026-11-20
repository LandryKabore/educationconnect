import SwiftUI
import UIKit
import Supabase

/// School admin « Enseignants », like the web Enseignants: the teacher accounts with their login
/// and temporary password, their classes and subjects; creating an account, assigning classes
/// and subjects, removing an assignment (admin password), new temporary password, reset link.
struct SchoolTeachersView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var rows: [Teacher] = []
    @State private var total = 0
    @State private var search = ""
    @State private var credentials: [String: Credential] = [:]
    @State private var assignments: [Assignment] = []
    @State private var expanded: Set<String> = []
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?
    @State private var searchTask: Task<Void, Never>?

    @State private var creating = false
    @State private var assigning: Teacher?
    @State private var removing: Assignment?
    @State private var password = ""
    @State private var notice: EduNotice?
    @State private var pendingAssign: Teacher?
    @State private var busyId: String?

    @State private var tour = TabTour(key: "enseignants-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct Teacher: Decodable, Identifiable, Hashable {
        let id: String
        let first_name: String?
        let last_name: String?
        let phone: String?
        let email: String?
        var name: String { "\(first_name ?? "") \(last_name ?? "")".trimmingCharacters(in: .whitespaces) }
    }

    struct Credential { let username: String; let tempPassword: String?; let used: Bool }

    struct Assignment: Decodable, Identifiable, Hashable {
        let id: String
        let teacher_id: String
        let class_section_id: String
        let subject_id: String
        let classes: NamedEntity?
        let matieres: NamedEntity?
    }


    private func credential(_ t: Teacher) -> Credential {
        credentials[t.id] ?? Credential(username: t.email.map { $0.replacingOccurrences(of: "@edufaso.local", with: "") } ?? "—", tempPassword: nil, used: false)
    }

    private func groups(_ t: Teacher) -> [(String, [Assignment])] {
        let list = assignments.filter { $0.teacher_id == t.id }
        let by = Dictionary(grouping: list, by: { $0.classes?.name ?? "Classe" })
        return by.map { ($0.key, $0.value.sorted { ($0.matieres?.name ?? "") < ($1.matieres?.name ?? "") }) }
            .sorted { TeacherClassesView.gradeRank(name: $0.0, gradeLevel: nil) != TeacherClassesView.gradeRank(name: $1.0, gradeLevel: nil)
                ? TeacherClassesView.gradeRank(name: $0.0, gradeLevel: nil) < TeacherClassesView.gradeRank(name: $1.0, gradeLevel: nil)
                : $0.0.localizedStandardCompare($1.0) == .orderedAscending }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "en.new", icon: "person.badge.plus", title: "Nouvel enseignant",
                          message: "Créez le compte : l’identifiant et le mot de passe temporaire s’affichent, à donner à l’enseignant."),
            CoachMarkStep(id: "en.list", icon: "person.2", title: "Les comptes",
                          message: "Pour chaque enseignant : son identifiant, son mot de passe temporaire tant qu’il ne l’a pas changé, et ses classes. « Affecter » ajoute des classes et matières ; « ⋯ » pour un nouveau mot de passe ou un lien."),
            CoachMarkStep(id: "en.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        searchField
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        list.coachMarkTarget("en.list")
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load(reset: true) }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Enseignants")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load(reset: true) }
        .onChange(of: search) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                if !Task.isCancelled { await load(reset: true) }
            }
        }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(isPresented: $creating) {
            NewTeacherSheet { created in
                Task {
                    await load(reset: true)
                    try? await Task.sleep(for: .milliseconds(450))
                    if let c = created {
                        notice = EduNotice(title: "Compte créé", message: "Identifiant : \(c.username)\nMot de passe temporaire : \(c.tempPassword)\n\nDonnez-les à l’enseignant ; il choisira son mot de passe à la première connexion.",
                                        copy: "\(c.username)\n\(c.tempPassword)")
                        pendingAssign = rows.first(where: { $0.id == c.userId })
                    }
                }
            }
            .environmentObject(auth)
        }
        .sheet(item: $assigning) { t in
            AssignSheet(teacher: t) { Task { await loadAssignments() } }.environmentObject(auth)
        }
        .passwordConfirm(item: $removing, password: $password, title: { "Retirer \($0.matieres?.name ?? "cette matière") en \($0.classes?.name ?? "classe") ?" }, message: "L’enseignant ne verra plus cette classe pour cette matière. Saisissez votre mot de passe administrateur pour confirmer.", confirm: "Retirer") { a in await remove(a) }
        .eduNotice($notice)
        .onChange(of: notice) { _, n in
            // the assignment sheet opens once the « Compte créé » message is closed
            if n == nil, let t = pendingAssign {
                pendingAssign = nil
                Task { try? await Task.sleep(for: .milliseconds(450)); assigning = t }
            }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Enseignants").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Comptes, identifiants et affectations par enseignant.")
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("en.help")
                }
                Button { creating = true } label: {
                    Label("Nouvel enseignant", systemImage: "person.badge.plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .coachMarkTarget("en.new")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(EduTheme.subtle)
            TextField("Rechercher un enseignant…", text: $search).textInputAutocapitalization(.never).autocorrectionDisabled()
            if !search.isEmpty { Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(EduTheme.subtle) } }
        }
        .font(.subheadline)
        .padding(.horizontal, 12).frame(minHeight: 42)
        .modifier(HomeCardStyle())
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(total) enseignant\(total > 1 ? "s" : "")").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            if loading && rows.isEmpty {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity).padding(24)
            } else if rows.isEmpty {
                Text(search.isEmpty ? "Aucun enseignant pour le moment." : "Aucun enseignant ne correspond à la recherche.")
                    .font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            }
            ForEach(rows) { t in
                row(t)
                Divider().padding(.leading, 16)
            }
            if rows.count < total {
                Button { Task { await load(reset: false) } } label: {
                    Text(loading ? "Chargement…" : "Afficher plus (\(total - rows.count) restants)")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain).disabled(loading)
            }
        }
        .modifier(HomeCardStyle())
    }

    private func row(_ t: Teacher) -> some View {
        let cred = credential(t)
        let gs = groups(t)
        let count = gs.reduce(0) { $0 + $1.1.count }
        let open = expanded.contains(t.id)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(t.name.isEmpty ? "Enseignant" : t.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                    if let p = t.phone, !p.isEmpty { Text(p).font(.caption).foregroundStyle(EduTheme.muted) }
                    HStack(spacing: 6) {
                        tag(cred.username, EduTheme.muted, H.slate100)
                        if let pw = cred.tempPassword, !cred.used { tag(pw, H.amber, H.amber50) }
                    }
                }
                Spacer(minLength: 4)
                Button { assigning = t } label: {
                    Text("Affecter").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                        .padding(.horizontal, 10).frame(minHeight: 32)
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
                }
                .buttonStyle(.plain)
                Menu {
                    Button { Task { await credentialAction(t, reset: true) } } label: { Label("Nouveau mot de passe", systemImage: "key") }
                    Button { Task { await credentialAction(t, reset: false) } } label: { Label("Lien oublié", systemImage: "link") }
                } label: {
                    Image(systemName: busyId == t.id ? "hourglass" : "ellipsis")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.muted)
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel("Actions pour \(t.name)")
            }
            if count == 0 {
                Text("Pas encore affecté").font(.caption).foregroundStyle(EduTheme.subtle)
            } else {
                Button {
                    withAnimation { if open { expanded.remove(t.id) } else { expanded.insert(t.id) } }
                } label: {
                    Label("\(gs.count) classe\(gs.count > 1 ? "s" : "") · \(count) matière\(count > 1 ? "s" : "")", systemImage: open ? "chevron.down" : "chevron.right")
                        .font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                }
                .buttonStyle(.plain)
                if open {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(gs, id: \.0) { g in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(g.0) · \(g.1.count) matière\(g.1.count > 1 ? "s" : "")").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                                ForEach(g.1) { a in
                                    HStack {
                                        Text(a.matieres?.name ?? "—").font(.caption).foregroundStyle(EduTheme.ink.opacity(0.8))
                                        Spacer()
                                        Button("Retirer") { removing = a }.font(.caption.weight(.semibold))
                                            .tint(Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255))
                                    }
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func tag(_ text: String, _ fg: Color, _ bg: Color) -> some View {
        Text(text).font(.caption.weight(.semibold).monospaced()).foregroundStyle(fg)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(bg, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
            .textSelection(.enabled)
    }

    // MARK: - Data

    private func load(reset: Bool) async {
        guard let sid = auth.schoolId else { ready = true; return }
        loading = true
        defer { loading = false; ready = true }
        do {
            let page = try await EduAPI().fetchAdminUsersPage(role: "teacher", schoolId: sid, search: search.trimmingCharacters(in: .whitespaces),
                                                             offset: reset ? 0 : rows.count) as EduAPI.Page<Teacher>
            rows = reset ? page.rows : rows + page.rows
            total = page.total
            await loadCredentials()
            if reset { await loadAssignments() }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func loadCredentials() async {
        guard !rows.isEmpty, let list = try? await EduAPI().fetchTempCredentials(userIds: rows.map(\.id)) else { return }
        var map: [String: Credential] = [:]
        for c in list { map[c.user_id] = Credential(username: c.username, tempPassword: c.temp_password_hint, used: c.used ?? false) }
        credentials = map
    }

    private func loadAssignments() async {
        guard let sid = auth.schoolId else { return }
        assignments = (try? await EduAPI().fetchSchoolAssignmentRows(schoolId: sid)) ?? []
    }

    private func remove(_ a: Assignment) async {
        let pw = password
        password = ""
        removing = nil
        do {
            guard let email = SupabaseManager.client.auth.currentUser?.email else { error = "Session expirée."; return }
            _ = try await SupabaseManager.client.auth.signIn(email: email, password: pw)
        } catch {
            self.error = "Mot de passe incorrect."
            return
        }
        do {
            try await EduAPI().deleteAssignment(id: a.id)
            await loadAssignments()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func credentialAction(_ t: Teacher, reset: Bool) async {
        guard let sid = auth.schoolId else { return }
        busyId = t.id
        defer { busyId = nil }
        do {
            let res = try await EduAPI().manageCredential(action: reset ? "reset_password" : "recovery_link", userId: t.id, schoolId: sid)
            if let e = res.error { throw NSError(domain: "edufaso", code: 1, userInfo: [NSLocalizedDescriptionKey: e]) }
            if reset, let pw = res.tempPassword {
                notice = EduNotice(title: "Nouveau mot de passe temporaire", message: "\(res.username ?? "")\n\(pw)", copy: "\(res.username ?? "")\n\(pw)")
                await loadCredentials()
            } else if let link = res.recoveryLink {
                UIPasteboard.general.string = link
                notice = EduNotice(title: "Lien de réinitialisation copié", message: "Envoyez-le à l’enseignant.", copy: link)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - New teacher

private struct NewTeacherSheet: View {
    struct Created { let userId: String?; let username: String; let tempPassword: String }
    var onDone: (Created?) -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var first = ""
    @State private var last = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        EduFormSheet(title: "Nouvel enseignant", primary: saving ? "Création…" : "Créer", primaryDisabled: saving || first.trimmingCharacters(in: .whitespaces).isEmpty || last.trimmingCharacters(in: .whitespaces).isEmpty, busy: saving, onPrimary: { Task { await save() } }) {
                Section {
                    TextField("Prénom", text: $first).textContentType(.givenName)
                    TextField("Nom", text: $last).textContentType(.familyName)
                } footer: {
                    Text("L’identifiant et un mot de passe temporaire sont créés. Vous pourrez ensuite affecter ses classes.")
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
    }

    private func save() async {
        guard let sid = auth.schoolId else { return }
        saving = true
        defer { saving = false }
        do {
            let res = try await EduAPI().createUserAccount(role: "teacher", schoolId: sid,
                                                          firstName: first.trimmingCharacters(in: .whitespaces),
                                                          lastName: last.trimmingCharacters(in: .whitespaces))
            if let e = res.error { error = e; return }
            onDone(res.username.map { Created(userId: res.userId, username: $0, tempPassword: res.tempPassword ?? "—") })
            dismiss()
        } catch {
            self.error = "La création a échoué"
        }
    }
}

// MARK: - Assign

private struct AssignSheet: View {
    let teacher: SchoolTeachersView.Teacher
    var onDone: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var classes: [ClassRow] = []
    @State private var subjects: [NamedEntity] = []
    @State private var programme: [String: [String]] = [:]
    @State private var picked: [String: Set<String>] = [:]
    @State private var openClass: String?
    @State private var saving = false
    @State private var error: String?

    private func subjectsFor(_ classId: String) -> [NamedEntity] {
        let ids = Set(programme[classId] ?? [])
        let list = ids.isEmpty ? subjects : subjects.filter { ids.contains($0.id ?? "") }
        return list.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    private var chosen: Int { picked.values.reduce(0) { $0 + $1.count } }

    var body: some View {
        EduFormSheet(title: "Affecter \(teacher.name)", primary: saving ? "Enregistrement…" : "Affecter (\(chosen))", primaryDisabled: saving || chosen == 0, busy: saving, onPrimary: { Task { await save() } }) {
                Section { Text("Choisissez une ou plusieurs classes, puis les matières qu’il y enseigne.").font(.caption).foregroundStyle(EduTheme.muted) }
                ForEach(classes) { c in
                    Section {
                        DisclosureGroup(isExpanded: Binding(get: { openClass == c.id }, set: { openClass = $0 ? c.id : nil })) {
                            ForEach(subjectsFor(c.id), id: \.id) { s in
                                let on = picked[c.id]?.contains(s.id ?? "") ?? false
                                Button {
                                    var set = picked[c.id] ?? []
                                    if on { set.remove(s.id ?? "") } else { set.insert(s.id ?? "") }
                                    picked[c.id] = set
                                } label: {
                                    HStack {
                                        Image(systemName: on ? "checkmark.square.fill" : "square").foregroundStyle(on ? EduTheme.teal : EduTheme.subtle)
                                        Text(s.name).foregroundStyle(EduTheme.ink)
                                    }
                                }
                            }
                        } label: {
                            HStack {
                                Text(c.name).font(.subheadline.weight(.semibold))
                                Spacer()
                                if let n = picked[c.id]?.count, n > 0 {
                                    Text("\(n)").font(.caption.weight(.bold)).foregroundStyle(.white)
                                        .padding(.horizontal, 6).padding(.vertical, 2)
                                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: 3))
                                }
                            }
                        }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .task {
            guard let sid = auth.schoolId else { return }
            let api = EduAPI()
            classes = ((try? await api.fetchClasses(schoolId: sid)) ?? []).sorted { a, b in
                let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
                let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
                return ra != rb ? ra < rb : a.name.localizedStandardCompare(b.name) == .orderedAscending
            }
            subjects = (try? await api.fetchSchoolSubjects(schoolId: sid)) ?? []
            programme = (try? await api.fetchProgrammeMap(classIds: classes.map(\.id))) ?? [:]
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var ok = 0, skipped = 0
        for (classId, subjectIds) in picked {
            for sid in subjectIds {
                do {
                    try await EduAPI().insertAssignment(teacherId: teacher.id, classId: classId, subjectId: sid)
                    ok += 1
                } catch {
                    if String(describing: error).contains("23505") || String(describing: error).contains("duplicate") { skipped += 1 }
                    else { self.error = error.localizedDescription; return }
                }
            }
        }
        onDone()
        if ok > 0 || skipped > 0 { dismiss() }
    }
}

// MARK: - API

extension EduAPI {
    struct Page<T: Decodable>: Decodable { let total: Int; let rows: [T] }

    struct AdminUsersPageParams: Encodable { let p_role: String; let p_school: String; let p_class: String; let p_search: String; let p_limit: Int; let p_offset: Int }

    func fetchAdminUsersPage<T: Decodable>(role: String, schoolId: String, search: String, offset: Int, classId: String = "") async throws -> Page<T> {
        try await call("ef_admin_users_page", params: AdminUsersPageParams(p_role: role, p_school: schoolId, p_class: classId, p_search: search, p_limit: 50, p_offset: offset))
    }

    struct TempCredential: Decodable { let user_id: String; let username: String; let temp_password_hint: String?; let used: Bool? }

    func fetchTempCredentials(userIds: [String]) async throws -> [TempCredential] {
        try await client.from("identifiants_temporaires").select("user_id, username, temp_password_hint, used").in("user_id", values: userIds).execute().value
    }

    func fetchSchoolAssignmentRows(schoolId: String) async throws -> [SchoolTeachersView.Assignment] {
        try await client.from("affectations_enseignement")
            .select("id, teacher_id, class_section_id, subject_id, classes!inner(name, school_id), matieres(name)")
            .eq("classes.school_id", value: schoolId)
            .execute().value
    }

    func deleteAssignment(id: String) async throws {
        try await client.from("affectations_enseignement").delete().eq("id", value: id).execute()
    }

    func insertAssignment(teacherId: String, classId: String, subjectId: String) async throws {
        struct P: Encodable { let teacher_id: String; let class_section_id: String; let subject_id: String }
        try await client.from("affectations_enseignement").insert(P(teacher_id: teacherId, class_section_id: classId, subject_id: subjectId)).execute()
    }

    func fetchProgrammeMap(classIds: [String]) async throws -> [String: [String]] {
        guard !classIds.isEmpty else { return [:] }
        struct Row: Decodable { let class_section_id: String; let subject_id: String }
        let rows: [Row] = try await client.from("programme_classe").select("class_section_id, subject_id").in("class_section_id", values: classIds).execute().value
        return Dictionary(grouping: rows, by: \.class_section_id).mapValues { $0.map(\.subject_id) }
    }

    struct AccountResult: Decodable { let username: String?; let tempPassword: String?; let userId: String?; let recoveryLink: String?; let error: String? }

    func createUserAccount(role: String, schoolId: String, firstName: String, lastName: String, extra: [String: String] = [:]) async throws -> AccountResult {
        var body: [String: String] = ["role": role, "schoolId": schoolId, "firstName": firstName, "lastName": lastName]
        for (k, v) in extra { body[k] = v }
        return try await client.functions.invoke("creer-utilisateur", options: FunctionInvokeOptions(body: body))
    }

    func manageCredential(action: String, userId: String, schoolId: String) async throws -> AccountResult {
        let site = (try? await fetchPlatformSettings())??.inviteSiteUrl ?? "https://edufaso.bf"
        let body = ["action": action, "userId": userId, "schoolId": schoolId, "redirectTo": "\(site.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/premiere-connexion"]
        return try await client.functions.invoke("gerer-identifiant", options: FunctionInvokeOptions(body: body))
    }
}
