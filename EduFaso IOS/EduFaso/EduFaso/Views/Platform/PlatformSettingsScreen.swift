import SwiftUI
import Supabase

/// Super admin « Paramètres », like the web AdminSettings: the platform's invitation site,
/// app name, support e-mail and default school year label (saved to the audit log).
struct PlatformSettingsScreen: View {
    @State private var base = Form()
    @State private var form = Form()
    @State private var saving = false
    @State private var notice: String?
    @State private var error: String?
    @State private var ready = false

    @State private var tour = TabTour(key: "admin-parametres")
    @State private var coach = CoachMarkRegistry()

    struct Form: Equatable { var site = "", appName = "", support = "", year = "" }
    private struct Row: Decodable { let invite_site_url: String?; let app_name: String?; let support_email: String?; let default_year_label: String? }

    private var dirty: Bool { form != base }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ap.form", icon: "gearshape", title: "La plateforme", message: "Le site utilisé dans les liens d’invitation, le nom de l’application, l’e-mail de support et l’année par défaut."),
            CoachMarkStep(id: "ap.save", icon: "checkmark.circle", title: "Enregistrer", message: "Le site d’invitation et le nom de l’application sont obligatoires."),
            CoachMarkStep(id: "ap.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: "Paramètres", tour: tour, coach: coach, ready: ready, onRefresh: { await load() }) {
            PlatformBanner(title: "Paramètres", subtitle: "Configuration globale de la plateforme EduFaso.",
                           onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "ap.help") {
                HStack(spacing: 8) {
                    PlatformBannerStat(label: "Application", value: base.appName.isEmpty ? "EduFaso" : base.appName)
                    PlatformBannerStat(label: "Année par défaut", value: base.year.isEmpty ? "—" : base.year)
                }
            }
            PlatformPanel(icon: "gearshape", title: "Configuration", subtitle: "Utilisée par toutes les écoles.") {
                field("URL du site d’invitation", "https://edufaso.example.com", $form.site, required: true, keyboard: .URL)
                field("Nom de l’application", "EduFaso", $form.appName, required: true)
                field("E-mail de support", "support@edufaso.bf", $form.support, keyboard: .emailAddress)
                field("Libellé d’année scolaire par défaut", "2025-2026", $form.year)
            }
            .coachMarkTarget("ap.form")
            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
            if let notice { Label(notice, systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Platform.H.emerald) }
            VStack(spacing: 6) {
                PlatformButton(title: saving ? "Enregistrement…" : "Enregistrer", icon: "checkmark", busy: saving) { Task { await save() } }
                    .disabled(!dirty).opacity(dirty ? 1 : 0.5)
                Text(dirty ? "Modifications non enregistrées" : "Aucune modification")
                    .font(.caption).foregroundStyle(dirty ? Platform.H.amber : EduTheme.muted)
            }
            .coachMarkTarget("ap.save")
        }
        .task { await load() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
    }

    private func field(_ label: String, _ placeholder: String, _ text: Binding<String>, required: Bool = false, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            (Text(label) + (required ? Text(" *").foregroundColor(EduTheme.fasoRed) : Text(""))).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
            TextField(placeholder, text: text)
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .default ? .sentences : .never)
                .autocorrectionDisabled(keyboard != .default)
                .font(.subheadline)
                .padding(.horizontal, 12).frame(minHeight: 42)
                .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(required && text.wrappedValue.trimmed.isEmpty ? Platform.H.amberDot.opacity(0.6) : EduTheme.border, lineWidth: 1))
        }
    }

    private func load() async {
        do {
            let r: Row = try await SupabaseManager.client.from("platform_settings").select().eq("id", value: 1).single().execute().value
            base = Form(site: r.invite_site_url ?? "", appName: r.app_name ?? "", support: r.support_email ?? "", year: r.default_year_label ?? "")
            form = base
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger les paramètres." }
        }
        ready = true
    }

    private struct Payload: Encodable {
        let invite_site_url: String; let app_name: String; let support_email: String?; let default_year_label: String?; let updated_at: String
        enum K: String, CodingKey { case invite_site_url, app_name, support_email, default_year_label, updated_at }
        func encode(to e: Encoder) throws {
            var c = e.container(keyedBy: K.self)
            try c.encode(invite_site_url, forKey: .invite_site_url); try c.encode(app_name, forKey: .app_name)
            try c.encode(support_email, forKey: .support_email); try c.encode(default_year_label, forKey: .default_year_label)
            try c.encode(updated_at, forKey: .updated_at)
        }
    }

    private func save() async {
        guard dirty else { return }
        guard !form.site.trimmed.isEmpty, !form.appName.trimmed.isEmpty else {
            error = "URL d'invitation et nom de l'application sont obligatoires"; return
        }
        saving = true
        defer { saving = false }
        let p = Payload(invite_site_url: form.site.trimmed, app_name: form.appName.trimmed,
                        support_email: form.support.trimmed.isEmpty ? nil : form.support.trimmed,
                        default_year_label: form.year.trimmed.isEmpty ? nil : form.year.trimmed,
                        updated_at: ISO8601DateFormatter().string(from: Date()))
        do {
            try await SupabaseManager.client.from("platform_settings").update(p).eq("id", value: 1).execute()
            await Platform.audit("update_settings", entityType: "platform_settings", entityId: "1", details: [
                "invite_site_url": .string(p.invite_site_url), "app_name": .string(p.app_name),
                "support_email": p.support_email.map { .string($0) } ?? .null, "default_year_label": p.default_year_label.map { .string($0) } ?? .null,
            ])
            notice = "Paramètres enregistrés."
            error = nil
            await load()
        } catch {
            self.error = "Impossible d'enregistrer les paramètres"
        }
    }
}
