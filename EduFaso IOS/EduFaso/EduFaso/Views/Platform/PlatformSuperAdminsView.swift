import SwiftUI
import Supabase

/// Super admin « Super admins », like the web AdminSuperAdmins: the active platform accounts
/// and « Inviter un super administrateur » (with the invitation message to copy).
struct PlatformSuperAdminsView: View {
    @State private var admins: [Row] = []
    @State private var inviting = false
    @State private var first = ""
    @State private var last = ""
    @State private var email = ""
    @State private var sending = false
    @State private var formError: String?
    @State private var result: Result?
    @State private var notice: String?
    @State private var error: String?
    @State private var ready = false

    @State private var tour = TabTour(key: "admin-super-admins")
    @State private var coach = CoachMarkRegistry()

    struct Row: Decodable, Identifiable {
        struct P: Decodable { let first_name: String?; let last_name: String?; let email: String?; let active: Bool? }
        let id: String
        let profils: P?
        var name: String { "\(profils?.first_name ?? "") \(profils?.last_name ?? "")".trimmingCharacters(in: .whitespaces) }
    }
    struct Result: Identifiable { let id = UUID(); let message: String?; let emailSent: Bool }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "sa.list", icon: "person.badge.key", title: "Comptes actifs", message: "Les personnes qui ont accès à toute la plateforme EduFaso."),
            CoachMarkStep(id: "sa.invite", icon: "person.badge.plus", title: "Inviter", message: "Envoyez une invitation par e-mail ; vous pouvez aussi copier le message."),
            CoachMarkStep(id: "sa.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: "Super admins", tour: tour, coach: coach, ready: ready, onRefresh: { await load() }) {
            PlatformBanner(title: "Super administrateurs", subtitle: "Comptes avec accès à la plateforme EduFaso.",
                           onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "sa.help") {
                Button { first = ""; last = ""; email = ""; formError = nil; inviting = true } label: {
                    Label("Inviter un super administrateur", systemImage: "person.badge.plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .coachMarkTarget("sa.invite")
            }
            if let notice { Label(notice, systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Platform.H.emerald) }
            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
            PlatformPanel(icon: "person.badge.key", title: "Comptes actifs", count: admins.count) {
                if admins.isEmpty {
                    PlatformEmpty(text: "Aucun super administrateur actif.")
                } else {
                    VStack(spacing: 8) {
                        ForEach(admins) { a in
                            PlatformRow(title: a.name.isEmpty ? "Sans nom" : a.name, subtitle: a.profils?.email, chevron: false) {
                                a.profils?.active == false ? PlatformChip(text: "Inactif", fg: Platform.rose, bg: Platform.rose100)
                                                           : PlatformChip(text: "Actif", fg: Platform.H.emerald, bg: Platform.H.emerald50)
                            }
                        }
                    }
                }
            }
            .coachMarkTarget("sa.list")
        }
        .task { await load() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
        .sheet(isPresented: $inviting) {
            EduFormSheet(title: "Inviter un super administrateur", subtitle: "Il aura accès à toute la plateforme.",
                         primary: sending ? "Envoi…" : "Envoyer l’invitation",
                         primaryDisabled: first.trimmed.isEmpty || last.trimmed.isEmpty || email.trimmed.isEmpty,
                         busy: sending, onPrimary: { Task { await invite() } }) {
                Section("Super administrateur") {
                    TextField("Prénom", text: $first)
                    TextField("Nom", text: $last)
                    TextField("E-mail", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                }
                if let formError { Text(formError).font(.footnote.weight(.semibold)).foregroundStyle(EduTheme.fasoRed) }
            }
        }
        .sheet(item: $result) { r in
            EduFormSheet(title: r.emailSent ? "Invitation envoyée" : "Invitation créée",
                         subtitle: r.emailSent ? "L’e-mail est parti." : "E-mail non envoyé : copiez le message pour le partager.",
                         primary: "Copier le message", primaryDisabled: r.message == nil,
                         onPrimary: { UIPasteboard.general.string = r.message; result = nil; notice = "Message copié." }) {
                Section("Message d’invitation") {
                    Text(r.message ?? "—").font(.caption).foregroundStyle(EduTheme.ink).textSelection(.enabled)
                }
            }
        }
    }

    private func load() async {
        do {
            admins = try await SupabaseManager.client.from("roles_utilisateurs").select("id, profils(first_name, last_name, email, active)")
                .eq("role", value: "super_admin").eq("active", value: true).execute().value
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger les super administrateurs." }
        }
        ready = true
    }

    private struct Response: Decodable { let error: String?; let emailMessage: String?; let emailSent: Bool? }

    private func invite() async {
        sending = true
        defer { sending = false }
        do {
            let res: Response = try await SupabaseManager.client.functions.invoke("inviter-admin", options: FunctionInvokeOptions(body: [
                "role": "super_admin", "firstName": first.trimmed, "lastName": last.trimmed, "email": email.trimmed.lowercased(),
            ]))
            if let e = res.error { throw NSError(domain: "invite", code: 0, userInfo: [NSLocalizedDescriptionKey: e]) }
            inviting = false
            result = Result(message: res.emailMessage, emailSent: res.emailSent == true)
            await load()
        } catch {
            formError = error.localizedDescription
        }
    }
}
