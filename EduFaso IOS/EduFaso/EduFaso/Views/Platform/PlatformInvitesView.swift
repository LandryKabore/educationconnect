import SwiftUI
import Supabase

/// Super admin « Invitations », like the web AdminInvites: search, pending invitations
/// (renvoyer, annuler) and the 20 latest accepted ones.
struct PlatformInvitesView: View {
    @State private var pending: [Invite] = []
    @State private var accepted: [Invite] = []
    @State private var search = ""
    @State private var tab = "pending"
    @State private var busyId: String?
    @State private var cancelling: Invite?
    @State private var resent: Resent?
    @State private var notice: String?
    @State private var error: String?
    @State private var ready = false

    @State private var tour = TabTour(key: "admin-invitations")
    @State private var coach = CoachMarkRegistry()

    struct Invite: Decodable, Identifiable, Hashable {
        struct S: Decodable, Hashable { let name: String? }
        let id: String
        let email: String
        let first_name: String?
        let last_name: String?
        let role: String
        let school_id: String?
        let expires_at: String
        let accepted_at: String?
        let ecoles: S?
        var name: String { "\(first_name ?? "") \(last_name ?? "")".trimmingCharacters(in: .whitespaces) }
        var schoolName: String { ecoles?.name ?? (role == "super_admin" ? "Plateforme" : "—") }
    }
    struct Resent: Identifiable { let id = UUID(); let message: String?; let emailSent: Bool }

    private func filtered(_ list: [Invite]) -> [Invite] {
        let q = Platform.normalized(search.trimmed)
        guard !q.isEmpty else { return list }
        return list.filter { Platform.normalized("\($0.name) \($0.email) \($0.ecoles?.name ?? "")").contains(q) }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ai.filter", icon: "magnifyingglass", title: "Rechercher", message: "Par nom, e-mail ou école ; en attente ou récemment acceptées."),
            CoachMarkStep(id: "ai.list", icon: "envelope", title: "Les invitations", message: "Renvoyez une invitation (un nouveau lien est créé) ou annulez-la."),
            CoachMarkStep(id: "ai.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: "Invitations", tour: tour, coach: coach, ready: ready, onRefresh: { await load() }) {
            PlatformBanner(title: "Invitations", subtitle: "Invitations en attente et récemment acceptées.",
                           onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "ai.help") {
                HStack(spacing: 8) {
                    PlatformBannerStat(label: "En attente", value: "\(pending.count)")
                    PlatformBannerStat(label: "Acceptées", value: "\(accepted.count)", hint: "les 20 dernières")
                }
            }
            VStack(spacing: 8) {
                PlatformSearchField(placeholder: "Rechercher par nom, e-mail ou école…", text: $search)
                PlatformFilterBar(options: [("pending", "En attente", filtered(pending).count), ("accepted", "Récemment acceptées", filtered(accepted).count)], selection: $tab)
            }
            .coachMarkTarget("ai.filter")
            if let notice { Label(notice, systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Platform.H.emerald) }
            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
            VStack(spacing: 10) {
                let list = filtered(tab == "pending" ? pending : accepted)
                if list.isEmpty {
                    PlatformEmpty(text: tab == "pending" ? "Aucune invitation en attente." : "Aucune invitation acceptée récemment.")
                } else {
                    ForEach(list) { card($0, pending: tab == "pending") }
                }
            }
            .coachMarkTarget("ai.list")
        }
        .task { await load() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
        .sheet(item: $cancelling) { inv in
            EduFormSheet(title: "Annuler l’invitation ?", subtitle: inv.name.isEmpty ? inv.email : inv.name, primary: "Annuler l’invitation",
                         busy: busyId == inv.id, destructive: true, onPrimary: { Task { await cancel(inv) } }) {
                Text("Le lien envoyé à \(inv.email) ne fonctionnera plus.").font(.subheadline).foregroundStyle(EduTheme.ink)
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $resent) { r in
            EduFormSheet(title: r.emailSent ? "Invitation renvoyée" : "Invitation recréée",
                         subtitle: r.emailSent ? "L’e-mail est parti." : "E-mail non envoyé : copiez le message pour le partager.",
                         primary: "Copier le message", primaryDisabled: r.message == nil,
                         onPrimary: { UIPasteboard.general.string = r.message; resent = nil; notice = "Message copié." }) {
                Section("Message d’invitation") {
                    Text(r.message ?? "—").font(.caption).foregroundStyle(EduTheme.ink).textSelection(.enabled)
                }
            }
        }
    }

    private func card(_ inv: Invite, pending: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(inv.name.isEmpty ? inv.email : inv.name).font(.headline).foregroundStyle(EduTheme.ink)
                    Text(inv.email).font(.caption).foregroundStyle(EduTheme.muted)
                }
                Spacer()
                pending ? PlatformChip(text: "En attente", fg: Platform.H.amber, bg: Platform.H.amber50)
                        : PlatformChip(text: "Acceptée", fg: Platform.H.emerald, bg: Platform.H.emerald50)
            }
            HStack(spacing: 6) {
                PlatformChip(text: PlatformUsersView.roleLabel(inv.role), fg: Platform.sky, bg: Platform.sky100)
                Text(inv.schoolName + (pending ? " · Expire le \(Platform.format(inv.expires_at))" : inv.accepted_at.map { " · Acceptée le \(Platform.format($0))" } ?? ""))
                    .font(.caption).foregroundStyle(EduTheme.muted).lineLimit(2)
            }
            if let sid = inv.school_id {
                NavigationLink { PlatformSchoolDetailView(schoolId: sid) } label: {
                    Label("Voir l’école", systemImage: "building.2").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                }
                .buttonStyle(.plain)
            }
            if pending {
                HStack(spacing: 8) {
                    PlatformButton(title: busyId == inv.id ? "Envoi…" : "Renvoyer", icon: "envelope", busy: busyId == inv.id) { Task { await resend(inv) } }
                    PlatformButton(title: "Annuler", icon: "xmark.circle", outline: true, danger: true) { cancelling = inv }
                }
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private func load() async {
        let client = SupabaseManager.client
        let cols = "id, email, first_name, last_name, role, school_id, expires_at, accepted_at, ecoles(name)"
        do {
            async let p: [Invite] = client.from("invitations").select(cols).is("accepted_at", value: nil).is("cancelled_at", value: nil)
                .gt("expires_at", value: ISO8601DateFormatter().string(from: Date())).order("created_at", ascending: false).execute().value
            async let a: [Invite] = client.from("invitations").select(cols).not("accepted_at", operator: .is, value: "null").is("cancelled_at", value: nil)
                .order("accepted_at", ascending: false).limit(20).execute().value
            (pending, accepted) = try await (p, a)
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger les invitations." }
        }
        ready = true
    }

    private struct Response: Decodable { let error: String?; let emailMessage: String?; let emailSent: Bool? }

    private func cancel(_ inv: Invite) async {
        busyId = inv.id
        defer { busyId = nil }
        do {
            let res: Response = try await SupabaseManager.client.functions.invoke("support-user-action", options: FunctionInvokeOptions(body: ["action": "cancel_invite", "inviteId": inv.id]))
            if let e = res.error { throw NSError(domain: "invite", code: 0, userInfo: [NSLocalizedDescriptionKey: e]) }
            cancelling = nil
            notice = "Invitation annulée."
            await load()
        } catch {
            cancelling = nil
            self.error = error.localizedDescription
        }
    }

    private func resend(_ inv: Invite) async {
        busyId = inv.id
        defer { busyId = nil }
        var body = ["email": inv.email, "firstName": inv.first_name ?? "", "lastName": inv.last_name ?? "", "role": inv.role]
        if let sid = inv.school_id { body["schoolId"] = sid }
        do {
            let res: Response = try await SupabaseManager.client.functions.invoke("inviter-admin", options: FunctionInvokeOptions(body: body))
            if let e = res.error { throw NSError(domain: "invite", code: 0, userInfo: [NSLocalizedDescriptionKey: e]) }
            resent = Resent(message: res.emailMessage, emailSent: res.emailSent == true)
            notice = res.emailSent == true ? "Invitation renvoyée par e-mail." : "Invitation recréée : copiez le message."
            error = nil
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
