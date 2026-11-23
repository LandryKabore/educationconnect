import SwiftUI
import Supabase

// MARK: - Data

/// A school as the super admin sees it (table ecoles).
struct PlatformSchool: Decodable, Identifiable, Hashable {
    let id: String
    var name: String
    var code: String?
    var school_type: String?
    var region: String?
    var city: String?
    var address: String?
    var phone: String?
    var email: String?
    var active: Bool?
    var billing_status: String?
    var plan: String?
    var subscription_ends_at: String?
    var created_at: String?
    var isActive: Bool { active != false }
    var place: String { [city, region].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") }
}

/// The school form, like the web SchoolFieldsForm (every field required).
struct SchoolFormFields: Equatable {
    var name = "", code = "", schoolType = "", region = "", city = "", address = "", phone = "", email = ""

    init() {}
    init(_ s: PlatformSchool) {
        name = s.name; code = s.code ?? ""; schoolType = s.school_type ?? ""; region = s.region ?? ""
        city = s.city ?? ""; address = s.address ?? ""; phone = s.phone ?? ""; email = s.email ?? ""
    }

    struct Payload: Encodable { let name, code, school_type, region, city, address, phone, email: String }
    var payload: Payload {
        let t = { (s: String) in s.trimmingCharacters(in: .whitespaces) }
        return Payload(name: t(name), code: t(code), school_type: schoolType, region: t(region), city: t(city),
                       address: t(address), phone: t(phone), email: t(email).lowercased())
    }
    var isComplete: Bool {
        let p = payload
        return ![p.name, p.code, p.school_type, p.region, p.city, p.address, p.phone, p.email].contains { $0.isEmpty }
    }
}

/// The modules catalogue, like the web lib/modules.ts.
enum SchoolModules {
    enum Level: String, CaseIterable { case aucun, consulter, modifier
        var label: String { switch self { case .aucun: "Aucun accès"; case .consulter: "Consulter"; case .modifier: "Modifier" } }
        var rank: Int { switch self { case .aucun: 0; case .consulter: 1; case .modifier: 2 } }
    }
    struct Access { let max: Level; let start: Level }
    struct Module: Identifiable {
        let id: String; let name: String; let description: String; let category: String
        let available: Bool; let defaultOn: Bool; let requires: [String]
        /// school_admin, teacher, student, parent
        let access: [Access]?
    }
    static let roles = ["school_admin", "teacher", "student", "parent"]
    static let roleLabels = ["school_admin": "Administration", "teacher": "Enseignants", "student": "Élèves", "parent": "Parents"]
    static let rolePeople = ["school_admin": "Les membres de l’administration", "teacher": "Les enseignants", "student": "Les élèves", "parent": "Les parents"]
    static let categories: [(String, String)] = [("pedagogie", "Pédagogie"), ("vie_scolaire", "Vie scolaire"), ("communication", "Communication"), ("administration", "Administration"), ("services", "Services")]

    private static let M = Access(max: .modifier, start: .modifier), C = Access(max: .consulter, start: .consulter), N = Access(max: .aucun, start: .aucun)
    static let all: [Module] = [
        Module(id: "emplois_du_temps", name: "Emplois du temps", description: "Emploi du temps des classes, des enseignants et des élèves.", category: "pedagogie", available: true, defaultOn: true, requires: [], access: [M, C, C, C]),
        Module(id: "notes", name: "Notes", description: "Évaluations, saisie des notes et moyennes par matière.", category: "pedagogie", available: true, defaultOn: true, requires: [], access: [M, M, C, C]),
        Module(id: "devoirs", name: "Devoirs et examens", description: "Exercices de maison, interrogations et examens programmés.", category: "pedagogie", available: true, defaultOn: true, requires: [], access: [M, M, C, C]),
        Module(id: "compositions", name: "Compositions", description: "Sessions de compositions organisées par l'administration.", category: "pedagogie", available: true, defaultOn: true, requires: ["notes"], access: [M, M, C, C]),
        Module(id: "bulletins", name: "Bulletins", description: "Bulletins de chaque Trimestre : moyenne, rang, appréciation, PDF.", category: "pedagogie", available: true, defaultOn: true, requires: ["notes"], access: [M, N, C, C]),
        Module(id: "cahier_textes", name: "Cahier de textes", description: "Contenu des cours et avancement des programmes.", category: "pedagogie", available: true, defaultOn: true, requires: [], access: [C, M, C, C]),
        Module(id: "presences", name: "Présences", description: "Appel à chaque cours, absences, retards et justifications.", category: "vie_scolaire", available: true, defaultOn: true, requires: [], access: [M, M, C, C]),
        Module(id: "saisie_secretariat", name: "Saisie par le secrétariat", description: "Le secrétariat saisit à la place d'un enseignant sans connexion.", category: "vie_scolaire", available: true, defaultOn: true, requires: [], access: [M, N, N, N]),
        Module(id: "messages", name: "Messages et annonces", description: "Messagerie interne et annonces de l'école.", category: "communication", available: true, defaultOn: true, requires: [], access: [M, M, M, M]),
        Module(id: "statistiques", name: "Statistiques", description: "Résultats et présences par classe et par matière.", category: "administration", available: true, defaultOn: true, requires: [], access: [C, N, N, N]),
        Module(id: "discipline", name: "Discipline", description: "Avertissements, sanctions et conduite.", category: "vie_scolaire", available: false, defaultOn: false, requires: [], access: nil),
        Module(id: "sms", name: "Alertes SMS", description: "Absences et notes envoyées aux parents par SMS.", category: "communication", available: false, defaultOn: false, requires: [], access: nil),
        Module(id: "frais_scolarite", name: "Frais de scolarité", description: "Échéances, paiements, reçus et relances, paiement mobile.", category: "administration", available: false, defaultOn: false, requires: [], access: nil),
        Module(id: "certificats", name: "Certificats", description: "Certificats de scolarité et attestations.", category: "administration", available: false, defaultOn: false, requires: [], access: nil),
        Module(id: "cantine", name: "Cantine", description: "Inscriptions et suivi des repas.", category: "services", available: false, defaultOn: false, requires: [], access: nil),
        Module(id: "bibliotheque", name: "Bibliothèque", description: "Prêts et retours de livres.", category: "services", available: false, defaultOn: false, requires: [], access: nil),
        Module(id: "transport", name: "Transport", description: "Circuits et inscriptions au transport scolaire.", category: "services", available: false, defaultOn: false, requires: [], access: nil),
    ]
    static func module(_ key: String) -> Module? { all.first { $0.id == key } }
    static var availableCount: Int { all.filter(\.available).count }

    struct Row: Decodable { let school_id: String; let module_key: String; let enabled: Bool }
    struct PermRow: Decodable { let school_id: String; let module_key: String; let role: String; let level: String }

    static func states(_ rows: [Row]) -> [String: Bool] {
        let saved = Dictionary(rows.map { ($0.module_key, $0.enabled) }, uniquingKeysWith: { a, _ in a })
        return Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0.available && (saved[$0.id] ?? $0.defaultOn)) })
    }
    static func dependents(_ key: String) -> [Module] { all.filter { $0.requires.contains(key) } }

    static func level(_ m: Module, role: String, on: Bool, rows: [PermRow]) -> Level {
        guard on, let i = roles.firstIndex(of: role), let acc = m.access?[i] else { return .aucun }
        let saved = rows.first { $0.module_key == m.id && $0.role == role }.flatMap { Level(rawValue: $0.level) }
        let l = saved ?? acc.start
        return l.rank > acc.max.rank ? acc.max : l
    }
    static func isMissingTable(_ e: Error) -> Bool {
        let s = "\(e)"
        return s.contains("42P01") || s.contains("PGRST205") || s.localizedCaseInsensitiveContains("does not exist") || s.localizedCaseInsensitiveContains("could not find the table")
    }
}

/// The school fields inside an EduFormSheet.
struct SchoolFieldsSection: View {
    @Binding var form: SchoolFormFields
    var body: some View {
        Section("Identité") {
            TextField("Nom de l’établissement", text: $form.name)
            TextField("Code école (ex. LP-SJ-OUA)", text: $form.code).textInputAutocapitalization(.characters)
            Picker("Type d’établissement", selection: $form.schoolType) {
                Text("Choisir…").tag("")
                ForEach(SchoolSettingsView.types, id: \.0) { Text($0.1).tag($0.0) }
            }
        }
        Section("Localisation") {
            TextField("Région / province", text: $form.region)
            TextField("Ville / commune", text: $form.city)
            TextField("Adresse complète", text: $form.address)
        }
        Section("Contact") {
            TextField("Téléphone", text: $form.phone).keyboardType(.phonePad)
            TextField("E-mail de contact", text: $form.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
    }
}

// MARK: - List

/// Super admin « Écoles », like the web EcolesList: search, filters (toutes, actives, inactives,
/// sans administrateur), each school with its type, place, admins and modules, and « Nouvelle école ».
struct PlatformSchoolsView: View {
    @State private var schools: [Item] = []
    @State private var query = ""
    @State private var filter = "toutes"
    @State private var creating = false
    @State private var form = SchoolFormFields()
    @State private var saving = false
    @State private var formError: String?
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "admin-ecoles")
    @State private var coach = CoachMarkRegistry()

    struct Item: Identifiable, Hashable {
        let school: PlatformSchool
        let adminCount: Int
        let modulesOn: Int?
        var id: String { school.id }
    }

    private var counts: [String: Int] {
        ["toutes": schools.count, "actives": schools.filter(\.school.isActive).count,
         "inactives": schools.filter { !$0.school.isActive }.count, "sans_admin": schools.filter { $0.adminCount == 0 }.count]
    }

    private var visible: [Item] {
        let q = Platform.normalized(query.trimmingCharacters(in: .whitespaces))
        return schools.filter { i in
            let s = i.school
            switch filter {
            case "actives": if !s.isActive { return false }
            case "inactives": if s.isActive { return false }
            case "sans_admin": if i.adminCount > 0 { return false }
            default: break
            }
            guard !q.isEmpty else { return true }
            return Platform.normalized([s.name, s.code, s.city, s.region].compactMap { $0 }.joined(separator: " ")).contains(q)
        }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ae.new", icon: "plus.circle", title: "Nouvelle école", message: "Créez un établissement : tous les champs sont obligatoires."),
            CoachMarkStep(id: "ae.filter", icon: "line.3.horizontal.decrease.circle", title: "Rechercher et filtrer", message: "Par nom, code ou ville ; ou seulement les écoles actives, inactives ou sans administrateur."),
            CoachMarkStep(id: "ae.list", icon: "building.2", title: "Les écoles", message: "Touchez une école pour voir ses informations, ses administrateurs, ses modules et ses permissions."),
            CoachMarkStep(id: "ae.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: "Écoles", tour: tour, coach: coach, ready: ready, onRefresh: { await load() }) {
            PlatformBanner(title: "Écoles",
                           subtitle: "\(counts["toutes"] ?? 0) établissements · \(counts["actives"] ?? 0) actifs · \(counts["sans_admin"] ?? 0) sans administrateur",
                           onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "ae.help") {
                Button { form = SchoolFormFields(); formError = nil; creating = true } label: {
                    Label("Nouvelle école", systemImage: "plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .coachMarkTarget("ae.new")
            }
            VStack(spacing: 8) {
                PlatformSearchField(placeholder: "Rechercher par nom, code ou ville", text: $query)
                PlatformFilterBar(options: [("toutes", "Toutes", counts["toutes"]), ("actives", "Actives", counts["actives"]),
                                            ("inactives", "Inactives", counts["inactives"]), ("sans_admin", "Sans administrateur", counts["sans_admin"])],
                                  selection: $filter)
            }
            .coachMarkTarget("ae.filter")
            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
            VStack(spacing: 8) {
                if visible.isEmpty {
                    PlatformEmpty(text: schools.isEmpty ? "Aucune école enregistrée." : "Aucune école ne correspond à cette recherche.")
                } else {
                    ForEach(visible) { i in
                        NavigationLink { PlatformSchoolDetailView(schoolId: i.id) } label: { row(i) }.buttonStyle(.plain)
                    }
                }
            }
            .coachMarkTarget("ae.list")
        }
        .task { await load() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
        .sheet(isPresented: $creating) {
            EduFormSheet(title: "Nouvelle école", subtitle: "Tous les champs sont obligatoires.",
                         primary: saving ? "Création…" : "Créer l’école", primaryDisabled: !form.isComplete, busy: saving,
                         onPrimary: { Task { await create() } }) {
                SchoolFieldsSection(form: $form)
                if let formError { Text(formError).font(.footnote.weight(.semibold)).foregroundStyle(EduTheme.fasoRed) }
            }
        }
    }

    private func row(_ i: Item) -> some View {
        let s = i.school
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.name).font(.headline).foregroundStyle(EduTheme.ink).lineLimit(2).multilineTextAlignment(.leading)
                    if let code = s.code, !code.isEmpty {
                        Text(code).font(.caption.monospaced()).foregroundStyle(EduTheme.muted)
                    }
                }
                Spacer()
                PlatformChip.active(s.isActive)
            }
            Text([Platform.typeLabel(s.school_type) ?? "Type non renseigné", s.place.isEmpty ? "Lieu non renseigné" : s.place].joined(separator: " · "))
                .font(.caption).foregroundStyle(EduTheme.muted)
            HStack(spacing: 6) {
                if i.adminCount > 0 {
                    PlatformChip(text: "\(i.adminCount) admin\(i.adminCount > 1 ? "s" : "")", fg: Platform.sky, bg: Platform.sky100)
                } else {
                    PlatformChip(text: "Aucun administrateur", fg: Platform.H.amber, bg: Platform.H.amber50)
                }
                if let m = i.modulesOn {
                    PlatformChip(text: "\(m) / \(SchoolModules.availableCount) modules", fg: EduTheme.teal, bg: EduTheme.brand50)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.muted)
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private struct AdminRole: Decodable { let school_id: String? }

    private func load() async {
        let client = SupabaseManager.client
        do {
            async let s: [PlatformSchool] = client.from("ecoles").select().order("name").execute().value
            async let a: [AdminRole] = client.from("roles_utilisateurs").select("school_id").eq("role", value: "school_admin").eq("active", value: true).execute().value
            let (rows, admins) = try await (s, a)
            var modules: [SchoolModules.Row]? = nil
            do { modules = try await client.from("ecole_modules").select("school_id, module_key, enabled").execute().value } catch {}
            var counts: [String: Int] = [:]
            for r in admins { if let id = r.school_id { counts[id, default: 0] += 1 } }
            let bySchool = Dictionary(grouping: modules ?? [], by: \.school_id)
            schools = rows.map { s in
                let on = modules.map { _ in SchoolModules.states(bySchool[s.id] ?? []).values.filter { $0 }.count }
                return Item(school: s, adminCount: counts[s.id] ?? 0, modulesOn: on)
            }
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger les écoles." }
        }
        ready = true
    }

    private func create() async {
        guard form.isComplete else { formError = "Tous les champs sont obligatoires"; return }
        saving = true
        defer { saving = false }
        do {
            try await SupabaseManager.client.from("ecoles").insert(form.payload).execute()
            creating = false
            await load()
        } catch {
            let s = "\(error)"
            formError = s.contains("23505") || s.contains("duplicate") ? "Ce code d'école existe déjà" : "Impossible de créer l'école"
        }
    }
}

// MARK: - Detail

/// Super admin school page, like the web EcoleDetail: informations (modifier), désactiver /
/// réactiver, school administrators (retirer), pending invitations (renvoyer, copier le lien),
/// inviter un administrateur, modules and permissions par rôle.
struct PlatformSchoolDetailView: View {
    let schoolId: String

    @State private var school: PlatformSchool?
    @State private var admins: [AdminRow] = []
    @State private var invites: [InviteRow] = []
    @State private var moduleRows: [SchoolModules.Row] = []
    @State private var permRows: [SchoolModules.PermRow] = []
    @State private var modulesMissing = false
    @State private var permsMissing = false
    @State private var ready = false
    @State private var notice: String?

    @State private var editing = false
    @State private var form = SchoolFormFields()
    @State private var saving = false
    @State private var formError: String?
    @State private var confirmToggle = false
    @State private var toggling = false
    @State private var revoking: AdminRow?
    @State private var inviting = false
    @State private var invFirst = ""
    @State private var invLast = ""
    @State private var invEmail = ""
    @State private var sendingInvite = false
    @State private var inviteError: String?
    @State private var inviteResult: InviteResult?
    @State private var resendingId: String?
    @State private var pendingModule: SchoolModules.Module?
    @State private var busyModule: String?
    @State private var pendingPerm: PermChange?
    @State private var busyPerm: String?

    @State private var tour = TabTour(key: "admin-ecole-detail")
    @State private var coach = CoachMarkRegistry()

    struct AdminRow: Decodable, Identifiable, Hashable {
        struct P: Decodable, Hashable { let first_name: String?; let last_name: String?; let email: String? }
        let id: String
        let user_id: String
        let profils: P?
        var name: String { "\(profils?.first_name ?? "") \(profils?.last_name ?? "")".trimmingCharacters(in: .whitespaces) }
    }
    struct InviteRow: Decodable, Identifiable, Hashable {
        let id: String; let email: String; let first_name: String?; let last_name: String?; let token: String; let expires_at: String
        var name: String { "\(first_name ?? "") \(last_name ?? "")".trimmingCharacters(in: .whitespaces) }
    }
    struct InviteResult: Identifiable { let id = UUID(); let url: String; let message: String?; let emailSent: Bool }
    struct PermChange: Identifiable { let module: SchoolModules.Module; let role: String; let from: SchoolModules.Level; let to: SchoolModules.Level; var id: String { "\(module.id):\(role)" } }

    private var states: [String: Bool] { SchoolModules.states(moduleRows) }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "sd.info", icon: "building.2", title: "Informations", message: "Les coordonnées de l’école. « Modifier » pour les corriger, « Désactiver » pour couper l’accès."),
            CoachMarkStep(id: "sd.admins", icon: "person.badge.key", title: "Administrateurs", message: "Invitez le directeur par e-mail, renvoyez une invitation ou copiez son lien."),
            CoachMarkStep(id: "sd.modules", icon: "square.grid.2x2", title: "Modules", message: "Activez ou désactivez chaque fonction pour cette école."),
            CoachMarkStep(id: "sd.perms", icon: "lock.shield", title: "Permissions", message: "Ce que chaque rôle peut faire dans chaque module."),
            CoachMarkStep(id: "sd.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: school?.name ?? "École", tour: tour, coach: coach, ready: ready, onRefresh: { await load() }) {
            if let s = school {
                PlatformBanner(title: s.name, subtitle: s.place.isEmpty ? "École" : s.place,
                               onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "sd.help") {
                    HStack(spacing: 8) {
                        PlatformBannerStat(label: "Statut", value: s.isActive ? "Active" : "Inactive")
                        PlatformBannerStat(label: "Admins", value: "\(admins.count)", hint: invites.isEmpty ? nil : "\(invites.count) en attente")
                        PlatformBannerStat(label: "Modules", value: "\(states.values.filter { $0 }.count) / \(SchoolModules.availableCount)")
                    }
                }
                if let notice { Label(notice, systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Platform.H.emerald) }
                infoPanel(s).coachMarkTarget("sd.info")
                adminsPanel.coachMarkTarget("sd.admins")
                modulesPanel.coachMarkTarget("sd.modules")
                permissionsPanel.coachMarkTarget("sd.perms")
            } else {
                PlatformEmpty(text: "École introuvable.")
            }
        }
        .task { await load() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
        .sheet(isPresented: $editing) {
            EduFormSheet(title: "Modifier l’école", subtitle: "Tous les champs sont obligatoires.",
                         primary: saving ? "Enregistrement…" : "Enregistrer", primaryDisabled: !form.isComplete, busy: saving,
                         onPrimary: { Task { await saveSchool() } }) {
                SchoolFieldsSection(form: $form)
                if let formError { Text(formError).font(.footnote.weight(.semibold)).foregroundStyle(EduTheme.fasoRed) }
            }
        }
        .sheet(isPresented: $confirmToggle) {
            let on = school?.isActive ?? true
            EduFormSheet(title: on ? "Désactiver l’école ?" : "Réactiver l’école ?", subtitle: school?.name,
                         primary: on ? "Désactiver" : "Réactiver", busy: toggling, destructive: on,
                         onPrimary: { Task { await toggleActive() } }) {
                Text(on ? "Les membres de l’école ne pourront plus se connecter. Les données sont conservées." : "Les membres de l’école pourront de nouveau se connecter.")
                    .font(.subheadline).foregroundStyle(EduTheme.ink)
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $revoking) { a in
            EduFormSheet(title: "Retirer cet administrateur ?", subtitle: a.name, primary: "Retirer", destructive: true,
                         onPrimary: { Task { await revoke(a) } }) {
                Text("\(a.name.isEmpty ? "Cette personne" : a.name) n’aura plus accès à l’administration de l’école.")
                    .font(.subheadline).foregroundStyle(EduTheme.ink)
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $inviting) {
            EduFormSheet(title: "Inviter un administrateur", subtitle: "Un e-mail d’invitation est envoyé. Vous pouvez aussi copier le lien (WhatsApp, etc.).",
                         primary: sendingInvite ? "Envoi…" : "Inviter", primaryDisabled: invFirst.trimmed.isEmpty || invLast.trimmed.isEmpty || invEmail.trimmed.isEmpty,
                         busy: sendingInvite, onPrimary: { Task { await invite(first: invFirst, last: invLast, email: invEmail) } }) {
                Section("Administrateur") {
                    TextField("Prénom", text: $invFirst)
                    TextField("Nom", text: $invLast)
                    TextField("E-mail (ex. directeur@ecole.bf)", text: $invEmail).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                }
                if let inviteError { Text(inviteError).font(.footnote.weight(.semibold)).foregroundStyle(EduTheme.fasoRed) }
            }
        }
        .sheet(item: $inviteResult) { r in
            EduFormSheet(title: r.emailSent ? "Invitation envoyée" : "Invitation créée",
                         subtitle: r.emailSent ? "L’e-mail est parti. Vous pouvez aussi partager le message." : "E-mail non envoyé : copiez le message pour le partager.",
                         primary: "Copier le message", onPrimary: { UIPasteboard.general.string = r.message ?? r.url; inviteResult = nil; notice = "Message d’invitation copié." }) {
                Section("Message d’invitation EduFaso") {
                    Text(r.message ?? r.url).font(.caption).foregroundStyle(EduTheme.ink).textSelection(.enabled)
                }
                Button { UIPasteboard.general.string = r.url; inviteResult = nil; notice = "Lien copié." } label: {
                    Label("Copier le lien seul", systemImage: "link")
                }
            }
        }
        .sheet(item: $pendingModule) { m in
            let turningOn = !(states[m.id] ?? false)
            let also = turningOn
                ? m.requires.filter { !(states[$0] ?? false) }.compactMap { SchoolModules.module($0)?.name }
                : SchoolModules.dependents(m.id).filter { states[$0.id] ?? false }.map(\.name)
            let schoolName = school.map { "« \($0.name) »" } ?? "cette école"
            EduFormSheet(title: "\(turningOn ? "Activer" : "Désactiver") \(m.name) ?", subtitle: school?.name,
                         primary: turningOn ? "Activer" : "Désactiver", busy: busyModule == m.id, destructive: !turningOn,
                         onPrimary: { Task { await toggleModule(m) } }) {
                Text(turningOn ? "\(m.name) apparaîtra dans les menus de \(schoolName), pour les rôles qui y ont accès."
                               : "\(m.name) disparaîtra des menus de \(schoolName), pour tous les rôles. Les données déjà saisies sont conservées.")
                    .font(.subheadline).foregroundStyle(EduTheme.ink)
                if !also.isEmpty {
                    Text("\(turningOn ? "Sera aussi activé" : "Sera aussi désactivé") : \(also.joined(separator: ", ")).")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Platform.H.amber)
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $pendingPerm) { p in
            EduFormSheet(title: "Modifier cette permission ?", subtitle: "\(SchoolModules.roleLabels[p.role] ?? p.role) · \(p.module.name)",
                         primary: "Confirmer", busy: busyPerm == p.id, destructive: p.to.rank < p.from.rank,
                         onPrimary: { Task { await changePerm(p) } }) {
                Text("\(p.from.label) → \(p.to.label)\(school.map { " à « \($0.name) »" } ?? "").")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Text(effect(p)).font(.subheadline).foregroundStyle(EduTheme.ink)
            }
            .presentationDetents([.medium])
        }
    }

    private func effect(_ p: PermChange) -> String {
        let who = SchoolModules.rolePeople[p.role] ?? "", mod = p.module.name
        switch p.to {
        case .aucun: return "\(who) ne verront plus \(mod) : le module disparaît de leurs menus."
        case .consulter: return "\(who) pourront voir \(mod), mais plus rien y ajouter, modifier ou supprimer."
        case .modifier: return "\(who) pourront voir \(mod) et y saisir des données."
        }
    }

    // MARK: Panels

    private func infoPanel(_ s: PlatformSchool) -> some View {
        PlatformPanel(icon: "building.2", title: "Informations", subtitle: s.code) {
            VStack(spacing: 0) {
                ForEach(Array([("Code", s.code), ("Type", Platform.typeLabel(s.school_type)), ("Région", s.region), ("Ville", s.city),
                               ("Adresse", s.address), ("Téléphone", s.phone), ("E-mail", s.email)].enumerated()), id: \.offset) { i, f in
                    if i > 0 { Divider() }
                    HStack(alignment: .top) {
                        Text(f.0).foregroundStyle(EduTheme.muted)
                        Spacer(minLength: 12)
                        Text(f.1?.isEmpty == false ? f.1! : "—").foregroundStyle(EduTheme.ink).multilineTextAlignment(.trailing)
                    }
                    .font(.subheadline).padding(.vertical, 8)
                }
            }
            HStack(spacing: 8) {
                PlatformButton(title: "Modifier", icon: "pencil", outline: true) { form = SchoolFormFields(s); formError = nil; editing = true }
                PlatformButton(title: s.isActive ? "Désactiver" : "Réactiver", outline: s.isActive, danger: s.isActive) { confirmToggle = true }
            }
        }
    }

    private var adminsPanel: some View {
        PlatformPanel(icon: "person.badge.key", title: "Administrateurs d’école", subtitle: "Ils gèrent l’école au quotidien.", count: admins.count) {
            if admins.isEmpty {
                PlatformEmpty(text: "Aucun administrateur actif pour le moment.")
            } else {
                VStack(spacing: 8) {
                    ForEach(admins) { a in
                        PlatformRow(title: a.name.isEmpty ? "Sans nom" : a.name, subtitle: a.profils?.email, chevron: false) {
                            Button("Retirer") { revoking = a }.font(.caption.weight(.semibold)).foregroundStyle(EduTheme.fasoRed)
                        }
                    }
                }
            }
            if !invites.isEmpty {
                Text("INVITATIONS EN ATTENTE").font(.system(size: 11, weight: .semibold)).tracking(0.6).foregroundStyle(EduTheme.muted)
                VStack(spacing: 8) {
                    ForEach(invites) { inv in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(inv.name.isEmpty ? inv.email : inv.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                                    Text("\(inv.email) · expire \(Platform.relative(inv.expires_at))").font(.caption).foregroundStyle(EduTheme.muted)
                                }
                                Spacer()
                                PlatformChip(text: "En attente", fg: Platform.H.amber, bg: Platform.H.amber50)
                            }
                            HStack(spacing: 8) {
                                PlatformButton(title: resendingId == inv.id ? "Envoi…" : "Renvoyer", icon: "arrow.clockwise", outline: true, busy: resendingId == inv.id) {
                                    Task { resendingId = inv.id; await invite(first: inv.first_name ?? "", last: inv.last_name ?? "", email: inv.email); resendingId = nil }
                                }
                                PlatformButton(title: "Copier le lien", icon: "doc.on.doc", outline: true) {
                                    Task { UIPasteboard.general.string = "\(await Platform.inviteSite())/invitation?token=\(inv.token)"; notice = "Lien d’invitation copié : envoyez-le à la personne." }
                                }
                            }
                        }
                        .padding(10)
                        .background(Platform.H.amber50.opacity(0.6), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
            }
            PlatformButton(title: "Inviter un administrateur", icon: "person.badge.plus") {
                invFirst = ""; invLast = ""; invEmail = ""; inviteError = nil; inviting = true
            }
        }
    }

    private var modulesPanel: some View {
        let on = states.values.filter { $0 }.count
        return PlatformPanel(icon: "square.grid.2x2", title: "Modules", subtitle: "\(on) sur \(SchoolModules.availableCount) activés · un module désactivé disparaît des menus de l’école, pour tous les rôles.") {
            if modulesMissing {
                Text("La base de données n’a pas encore les tables des modules : l’école utilise tous les modules par défaut.")
                    .font(.caption).foregroundStyle(Platform.H.amber)
            }
            ForEach(SchoolModules.categories, id: \.0) { cat in
                let mods = SchoolModules.all.filter { $0.category == cat.0 }
                if !mods.isEmpty {
                    Text(cat.1.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(0.6).foregroundStyle(EduTheme.muted).padding(.top, 4)
                    VStack(spacing: 0) {
                        ForEach(Array(mods.enumerated()), id: \.element.id) { i, m in
                            if i > 0 { Divider() }
                            moduleRow(m)
                        }
                    }
                }
            }
        }
    }

    private func moduleRow(_ m: SchoolModules.Module) -> some View {
        let isOn = states[m.id] ?? false
        let needs = m.requires.compactMap { SchoolModules.module($0)?.name }
        return HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(m.name).font(.subheadline.weight(.semibold)).foregroundStyle(m.available ? EduTheme.ink : EduTheme.muted)
                    if !m.available { PlatformChip(text: "Bientôt", fg: EduTheme.muted, bg: Platform.H.slate100) }
                }
                Text(m.description + (needs.isEmpty ? "" : " Nécessite : \(needs.joined(separator: ", ")).")).font(.caption).foregroundStyle(EduTheme.muted)
            }
            Spacer(minLength: 6)
            if m.available {
                if busyModule == m.id { ProgressView().tint(EduTheme.teal) }
                Toggle("", isOn: Binding(get: { isOn }, set: { _ in pendingModule = m }))
                    .labelsHidden().tint(EduTheme.teal).disabled(modulesMissing || busyModule != nil)
            }
        }
        .padding(.vertical, 8)
    }

    private var permissionsPanel: some View {
        PlatformPanel(icon: "lock.shield", title: "Permissions par rôle", subtitle: "Consulter : voir seulement. Modifier : voir et saisir. Aucun accès : le module disparaît pour ce rôle.") {
            if permsMissing {
                Text("La base de données n’a pas encore la table des permissions : chaque rôle garde ses accès par défaut.")
                    .font(.caption).foregroundStyle(Platform.H.amber)
            }
            VStack(spacing: 8) {
                ForEach(SchoolModules.all.filter { $0.available && $0.access != nil }) { m in
                    let on = states[m.id] ?? false
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(m.name).font(.subheadline.weight(.semibold)).foregroundStyle(on ? EduTheme.ink : EduTheme.muted)
                            Spacer()
                            if !on { Text("Module désactivé").font(.caption).foregroundStyle(EduTheme.muted) }
                        }
                        ForEach(Array(SchoolModules.roles.enumerated()), id: \.offset) { i, role in
                            permCell(m, role: role, access: m.access![i], on: on)
                        }
                    }
                    .padding(10)
                    .background(Platform.H.slate100.opacity(on ? 0.7 : 0.4), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
            }
        }
    }

    private func permCell(_ m: SchoolModules.Module, role: String, access: SchoolModules.Access, on: Bool) -> some View {
        let level = SchoolModules.level(m, role: role, on: on, rows: permRows)
        let options = SchoolModules.Level.allCases.filter { $0.rank <= access.max.rank }
        let fixed = !on || options.count < 2
        return HStack {
            Text(SchoolModules.roleLabels[role] ?? role).font(.caption).foregroundStyle(EduTheme.muted)
            Spacer()
            if fixed {
                Text(access.max == .aucun ? "—" : level.label).font(.caption.weight(.semibold))
                    .foregroundStyle(on ? (level == .modifier ? EduTheme.teal : EduTheme.ink) : EduTheme.muted)
            } else {
                Menu {
                    ForEach(options, id: \.self) { l in
                        Button("\(l.label)\(l == access.start ? " (défaut)" : "")") {
                            if l != level { pendingPerm = PermChange(module: m, role: role, from: level, to: l) }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(level.label).font(.caption.weight(.semibold))
                        Image(systemName: "chevron.up.chevron.down").font(.caption2)
                    }
                    .foregroundStyle(level == .modifier ? EduTheme.teal : (level == .aucun ? EduTheme.muted : EduTheme.ink))
                    .padding(.horizontal, 10).frame(minHeight: 30)
                    .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                        .stroke(level == access.start ? EduTheme.border : Platform.H.amberDot, lineWidth: 1))
                }
                .disabled(permsMissing || busyPerm != nil)
            }
        }
    }

    // MARK: Loading and actions

    private func load() async {
        let client = SupabaseManager.client
        do {
            async let s: PlatformSchool = client.from("ecoles").select().eq("id", value: schoolId).single().execute().value
            async let a: [AdminRow] = client.from("roles_utilisateurs").select("id, user_id, profils(first_name, last_name, email)")
                .eq("school_id", value: schoolId).eq("role", value: "school_admin").eq("active", value: true).execute().value
            async let i: [InviteRow] = client.from("invitations").select("id, email, first_name, last_name, token, expires_at")
                .eq("school_id", value: schoolId).eq("role", value: "school_admin")
                .is("accepted_at", value: nil).is("cancelled_at", value: nil)
                .gt("expires_at", value: ISO8601DateFormatter().string(from: Date()))
                .order("created_at", ascending: false).execute().value
            (school, admins, invites) = try await (s, a, i)
        } catch {
            if error.isCancellation { return }
        }
        do {
            moduleRows = try await client.from("ecole_modules").select("school_id, module_key, enabled").eq("school_id", value: schoolId).execute().value
            modulesMissing = false
        } catch { modulesMissing = SchoolModules.isMissingTable(error) }
        do {
            permRows = try await client.from("ecole_role_permissions").select("school_id, module_key, role, level").eq("school_id", value: schoolId).execute().value
            permsMissing = false
        } catch { permsMissing = SchoolModules.isMissingTable(error) }
        ready = true
    }

    private func saveSchool() async {
        guard form.isComplete else { formError = "Tous les champs sont obligatoires"; return }
        saving = true
        defer { saving = false }
        do {
            try await SupabaseManager.client.from("ecoles").update(form.payload).eq("id", value: schoolId).execute()
            editing = false
            notice = "Informations mises à jour."
            await load()
        } catch {
            formError = "\(error)".contains("23505") ? "Ce code d'école existe déjà" : "Impossible d'enregistrer"
        }
    }

    private func toggleActive() async {
        guard let s = school else { return }
        toggling = true
        defer { toggling = false }
        struct P: Encodable { let active: Bool }
        do {
            try await SupabaseManager.client.from("ecoles").update(P(active: !s.isActive)).eq("id", value: schoolId).execute()
            confirmToggle = false
            notice = s.isActive ? "École désactivée." : "École réactivée."
            await load()
        } catch { notice = nil }
    }

    private func revoke(_ a: AdminRow) async {
        struct P: Encodable { let active: Bool }
        _ = try? await SupabaseManager.client.from("roles_utilisateurs").update(P(active: false)).eq("id", value: a.id).execute()
        revoking = nil
        notice = "Administrateur retiré."
        await load()
    }

    private struct InviteResponse: Decodable { let error: String?; let inviteUrl: String?; let emailMessage: String?; let emailSent: Bool? }

    private func invite(first: String, last: String, email: String) async {
        sendingInvite = true
        defer { sendingInvite = false }
        inviteError = nil
        do {
            let res: InviteResponse = try await SupabaseManager.client.functions.invoke("inviter-admin", options: FunctionInvokeOptions(body: [
                "role": "school_admin", "schoolId": schoolId, "firstName": first.trimmed, "lastName": last.trimmed, "email": email.trimmed.lowercased(),
            ]))
            if let e = res.error { throw NSError(domain: "invite", code: 0, userInfo: [NSLocalizedDescriptionKey: e]) }
            guard let url = res.inviteUrl else { throw NSError(domain: "invite", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invitation échouée"]) }
            inviting = false
            inviteResult = InviteResult(url: url, message: res.emailMessage, emailSent: res.emailSent == true)
            await load()
        } catch {
            if inviting { inviteError = error.localizedDescription } else { notice = nil; inviteError = error.localizedDescription }
        }
    }

    private struct ModuleUpsert: Encodable { let school_id: String; let module_key: String; let enabled: Bool }

    private func toggleModule(_ m: SchoolModules.Module) async {
        let next = !(states[m.id] ?? false)
        busyModule = m.id
        defer { busyModule = nil; pendingModule = nil }
        let client = SupabaseManager.client
        func save(_ key: String, _ on: Bool) async throws {
            try await client.from("ecole_modules").upsert(ModuleUpsert(school_id: schoolId, module_key: key, enabled: on), onConflict: "school_id,module_key").execute()
        }
        var also: [String] = []
        do {
            if next {
                for r in m.requires where !(states[r] ?? false) { try await save(r, true); also.append(SchoolModules.module(r)?.name ?? r) }
                try await save(m.id, true)
            } else {
                for d in SchoolModules.dependents(m.id) where states[d.id] ?? false { try await save(d.id, false); also.append(d.name) }
                try await save(m.id, false)
            }
            await Platform.audit(next ? "module_active" : "module_desactive", entityType: "ecole", entityId: schoolId,
                                 details: ["module": .string(m.id), "aussi": .array(also.map { .string($0) })])
            notice = "\(m.name) \(next ? "activé" : "désactivé")" + (also.isEmpty ? "" : " (et \(also.joined(separator: ", ")))") + "."
        } catch { notice = nil }
        await load()
    }

    private struct PermUpsert: Encodable { let school_id: String; let module_key: String; let role: String; let level: String }

    private func changePerm(_ p: PermChange) async {
        busyPerm = p.id
        defer { busyPerm = nil; pendingPerm = nil }
        do {
            try await SupabaseManager.client.from("ecole_role_permissions")
                .upsert(PermUpsert(school_id: schoolId, module_key: p.module.id, role: p.role, level: p.to.rawValue), onConflict: "school_id,module_key,role").execute()
            await Platform.audit("permission_modifiee", entityType: "ecole", entityId: schoolId,
                                 details: ["module": .string(p.module.id), "role": .string(p.role), "niveau": .string(p.to.rawValue)])
            notice = "\(SchoolModules.roleLabels[p.role] ?? p.role) · \(p.module.name) : \(p.to.label)."
        } catch { notice = nil }
        await load()
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
