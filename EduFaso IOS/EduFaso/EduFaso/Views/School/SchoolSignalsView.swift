import SwiftUI

/// « Signalements », like the web Signalements: problems reported with « Signaler un problème »
/// (school admins see their school, super admins all), each with its status and an internal note.
struct SchoolSignalsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var rows: [Report] = []
    @State private var filter = "ouverts"
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "signalements")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private var isSuper: Bool { auth.primaryRole == .superAdmin }

    struct Report: Decodable, Identifiable, Hashable {
        struct Person: Decodable, Hashable { let first_name: String?; let last_name: String? }
        struct School: Decodable, Hashable { let name: String? }
        let id: String
        let created_at: String
        let role: String?
        let route: String?
        let app_version: String?
        let platform: String?
        let online: Bool?
        let viewport: String?
        let user_agent: String?
        let error_messages: [String]?
        let message: String
        let status: String
        let admin_note: String?
        let auteur: Person?
        let ecole: School?
    }

    static let statuses: [(String, String)] = [("nouveau", "Nouveau"), ("vu", "Vu"), ("en_cours", "En cours"), ("resolu", "Résolu")]

    private var shown: [Report] {
        rows.filter { filter == "tous" ? true : (filter == "ouverts" ? $0.status != "resolu" : $0.status == filter) }
    }
    private var newCount: Int { rows.filter { $0.status == "nouveau" }.count }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "si.filter", icon: "line.3.horizontal.decrease.circle", title: "À traiter",
                          message: "Les signalements pas encore résolus, ou filtrez par statut."),
            CoachMarkStep(id: "si.list", icon: "exclamationmark.bubble", title: "Suivre",
                          message: "Le message, la page et l’appareil de l’utilisateur. Changez le statut et ajoutez une note interne, puis « Enregistrer »."),
            CoachMarkStep(id: "si.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        HStack {
                            Text("Afficher").foregroundStyle(EduTheme.ink)
                            Spacer()
                            Picker("Filtre", selection: $filter) {
                                Text("À traiter" + (newCount > 0 ? " (\(newCount) nouveau\(newCount > 1 ? "x" : ""))" : "")).tag("ouverts")
                                Text("Nouveaux").tag("nouveau"); Text("Vus").tag("vu"); Text("En cours").tag("en_cours"); Text("Résolus").tag("resolu"); Text("Tous").tag("tous")
                            }
                            .labelsHidden().tint(EduTheme.teal)
                        }
                        .font(.subheadline).padding(.horizontal, 16).padding(.vertical, 6).modifier(HomeCardStyle())
                        .coachMarkTarget("si.filter")
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        if shown.isEmpty {
                            Text("Aucun signalement dans cette liste.").font(.subheadline).foregroundStyle(EduTheme.muted)
                                .frame(maxWidth: .infinity).padding(24).modifier(HomeCardStyle()).coachMarkTarget("si.list")
                        } else {
                            VStack(spacing: 12) {
                                ForEach(shown) { r in ReportCard(row: r, showSchool: isSuper) { Task { await load() } } }
                            }
                            .coachMarkTarget("si.list")
                        }
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await load() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Signalements")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Signalements").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                    Text(isSuper ? "Problèmes signalés par les utilisateurs de toutes les écoles." : "Problèmes signalés par les utilisateurs de votre école.")
                        .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                }
                Spacer()
                TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("si.help")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func load() async {
        do {
            rows = try await EduAPI().fetchReports()
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger les signalements." }
        }
        ready = true
    }
}

private struct ReportCard: View {
    let row: SchoolSignalsView.Report
    let showSchool: Bool
    var onSaved: () -> Void

    @State private var status = ""
    @State private var note = ""
    @State private var details = false
    @State private var saving = false
    @State private var error: String?

    private typealias H = TeacherHomeView
    private var dirty: Bool { status != row.status || note.trimmingCharacters(in: .whitespaces) != (row.admin_note ?? "") }

    private func tone(_ s: String) -> (Color, Color) {
        switch s {
        case "nouveau": return (Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255), Color(red: 255 / 255, green: 228 / 255, blue: 230 / 255))
        case "vu": return (Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255), Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255))
        case "en_cours": return (H.amber, H.amber50)
        default: return (H.emerald, H.emerald50)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                let t = tone(row.status)
                Text(SchoolSignalsView.statuses.first { $0.0 == row.status }?.1 ?? row.status)
                    .font(.caption.weight(.bold)).foregroundStyle(t.0)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(t.1, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                Text("\(row.auteur?.first_name ?? "") \(row.auteur?.last_name ?? "")".trimmingCharacters(in: .whitespaces))
                    .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).lineLimit(1)
                Spacer()
            }
            Text([Self.roleLabel(row.role), showSchool ? row.ecole?.name : nil, SchoolPeriodsView.dateTime(row.created_at)].compactMap { $0 }.joined(separator: " · "))
                .font(.caption).foregroundStyle(EduTheme.muted)
            Text(row.message).font(.subheadline).foregroundStyle(EduTheme.ink).fixedSize(horizontal: false, vertical: true)
            Text("Page : \(row.route ?? "?") · Version : \(row.app_version ?? "?") · Appareil : \(row.platform ?? "?") · \(row.online == nil ? "Connexion inconnue" : (row.online! ? "En ligne" : "Hors ligne"))")
                .font(.caption2).foregroundStyle(EduTheme.muted)
            if !(row.error_messages ?? []).isEmpty || row.user_agent != nil {
                Button(details ? "Masquer les détails" : "Détails techniques") { withAnimation { details.toggle() } }
                    .font(.caption.weight(.semibold)).tint(EduTheme.teal)
                if details {
                    VStack(alignment: .leading, spacing: 4) {
                        if let v = row.viewport { Text("Écran : \(v)") }
                        if let ua = row.user_agent { Text("Navigateur : \(ua)") }
                        ForEach(Array((row.error_messages ?? []).enumerated()), id: \.offset) { _, m in Text("• \(m)") }
                    }
                    .font(.caption2).foregroundStyle(EduTheme.muted)
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
            }
            Divider()
            HStack {
                Text("Statut").font(.subheadline).foregroundStyle(EduTheme.ink)
                Spacer()
                Picker("Statut", selection: $status) { ForEach(SchoolSignalsView.statuses, id: \.0) { Text($0.1).tag($0.0) } }.labelsHidden().tint(EduTheme.teal)
            }
            TextField("Note interne (visible seulement par les administrateurs)", text: $note, axis: .vertical)
                .lineLimit(2...4).font(.subheadline)
                .padding(10)
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
            if let error { Text(error).font(.caption).foregroundStyle(EduTheme.fasoRed) }
            Button { Task { await save() } } label: {
                Text(saving ? "Enregistrement…" : "Enregistrer").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            .buttonStyle(.plain).disabled(!dirty || saving).opacity(!dirty ? 0.5 : 1)
        }
        .padding(14)
        .modifier(HomeCardStyle())
        .onAppear { status = row.status; note = row.admin_note ?? "" }
    }

    static func roleLabel(_ r: String?) -> String {
        switch r {
        case "student": return "Élève"
        case "parent": return "Parent"
        case "teacher": return "Enseignant"
        case "school_admin": return "Administration"
        case "super_admin": return "Super admin"
        default: return "rôle inconnu"
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await EduAPI().updateReport(id: row.id, status: status, note: note.trimmingCharacters(in: .whitespaces))
            onSaved()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

extension EduAPI {
    func fetchReports() async throws -> [SchoolSignalsView.Report] {
        try await client.from("signalements")
            .select("id, created_at, role, route, app_version, platform, online, viewport, user_agent, error_messages, message, status, admin_note, auteur:profils!signalements_user_id_fkey(first_name, last_name), ecole:ecoles(name)")
            .order("created_at", ascending: false).limit(200).execute().value
    }

    func updateReport(id: String, status: String, note: String) async throws {
        struct P: Encodable {
            let status: String; let admin_note: String?
            func encode(to e: Encoder) throws { var c = e.container(keyedBy: K.self); try c.encode(status, forKey: .status); try c.encode(admin_note, forKey: .admin_note) }
            enum K: String, CodingKey { case status, admin_note }
        }
        try await client.from("signalements").update(P(status: status, admin_note: note.isEmpty ? nil : note)).eq("id", value: id).execute()
    }
}
