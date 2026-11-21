import SwiftUI
import Supabase

/// Super admin « Tableau de bord », like the web AdminDashboard: greeting banner with the
/// platform figures (schools, school admins, pending invitations, subscriptions), what needs
/// handling, the latest schools and the pending invitations.
struct PlatformHomeView: View {
    var open: (AppScreen) -> Void
    @EnvironmentObject private var auth: AuthViewModel

    @State private var schools: [PSchool] = []
    @State private var adminSchoolIds: [String?] = []
    @State private var invites: [PInvite] = []
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "admin-dashboard")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)
    private let rose100 = Color(red: 255 / 255, green: 228 / 255, blue: 230 / 255)
    private static let day: TimeInterval = 24 * 3600

    // MARK: - Rows

    struct PSchool: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        let city: String?
        let school_type: String?
        let active: Bool?
        let billing_status: String?
        let subscription_ends_at: String?
        let created_at: String?
        var isActive: Bool { active != false }
    }

    struct PInvite: Decodable, Identifiable, Hashable {
        struct School: Decodable, Hashable { let name: String? }
        let id: String
        let email: String
        let first_name: String?
        let last_name: String?
        let role: String?
        let school_id: String?
        let expires_at: String
        let created_at: String?
        let ecoles: School?
        var name: String { "\(first_name ?? "") \(last_name ?? "")".trimmingCharacters(in: .whitespaces) }
    }

    private struct AdminRole: Decodable { let school_id: String? }

    struct Attention: Identifiable {
        let id: String
        let title: String
        let detail: String
        let danger: Bool
        let target: Target
        enum Target { case screen(AppScreen), school(String) }
    }

    // MARK: - Figures

    private var activeSchools: [PSchool] { schools.filter(\.isActive) }
    private var withoutAdmin: [PSchool] {
        let ids = Set(adminSchoolIds.compactMap { $0 })
        return activeSchools.filter { !ids.contains($0.id) }
    }
    private var expiringInvites: [PInvite] {
        invites.filter { (Self.date($0.expires_at)?.timeIntervalSinceNow ?? .infinity) < 2 * Self.day }
    }
    private var pastDue: [PSchool] { activeSchools.filter { $0.billing_status == "past_due" } }
    private var endingSoon: [PSchool] {
        activeSchools.filter { s in
            guard s.billing_status != "cancelled", let end = s.subscription_ends_at.flatMap(Self.date) else { return false }
            let left = end.timeIntervalSinceNow
            return left >= 0 && left < 30 * Self.day
        }
    }
    private var paying: Int { schools.filter { $0.billing_status == "active" }.count }
    private var trial: Int { schools.filter { ($0.billing_status ?? "trial") == "trial" }.count }
    private var recent: [PSchool] {
        Array(schools.sorted { ($0.created_at ?? "") > ($1.created_at ?? "") }.prefix(6))
    }

    private var attention: [Attention] {
        pastDue.map { Attention(id: "due-\($0.id)", title: $0.name, detail: "Abonnement impayé", danger: true, target: .screen(.adminBilling)) }
        + withoutAdmin.map { Attention(id: "admin-\($0.id)", title: $0.name, detail: "Aucun administrateur actif", danger: false, target: .school($0.id)) }
        + endingSoon.map { s in
            Attention(id: "end-\(s.id)", title: s.name,
                      detail: "Abonnement jusqu’au \(s.subscription_ends_at.flatMap(Self.date).map { TeacherExercisesView.format($0, "d MMMM yyyy") } ?? "—")",
                      danger: false, target: .screen(.adminBilling))
        }
        + expiringInvites.map { i in
            Attention(id: "inv-\(i.id)", title: i.name.isEmpty ? i.email : i.name,
                      detail: "Invitation qui expire \(Self.relative(i.expires_at))", danger: false, target: .screen(.adminInvites))
        }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ad.stats", icon: "chart.bar.fill", title: "La plateforme",
                          message: "Les écoles, leurs administrateurs, les invitations en attente et les abonnements. Touchez un chiffre pour ouvrir la liste."),
            CoachMarkStep(id: "ad.todo", icon: "exclamationmark.triangle", title: "À traiter",
                          message: "Abonnements impayés ou bientôt terminés, écoles sans administrateur, invitations qui expirent."),
            CoachMarkStep(id: "ad.recent", icon: "building.2", title: "Écoles récentes",
                          message: "Les dernières écoles créées. Touchez une école pour ouvrir sa fiche."),
            CoachMarkStep(id: "ad.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    // MARK: - Body

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 16) {
                        banner
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        attentionPanel.coachMarkTarget("ad.todo")
                        recentPanel.coachMarkTarget("ad.recent")
                        invitesPanel
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
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    private var banner: some View {
        let first = auth.profile?.firstName.trimmingCharacters(in: .whitespaces) ?? ""
        let today = TeacherExercisesView.format(Date(), "EEEE d MMMM yyyy")
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(SchoolHomeView.greeting())\(first.isEmpty ? "" : ", \(first)") · \(today)".uppercased())
                            .font(.system(size: 11, weight: .semibold)).tracking(1.0)
                            .foregroundStyle(.white.opacity(0.7))
                        Text("Tableau de bord").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Plateforme EduFaso").font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("ad.help")
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    let a = activeSchools.count, ina = schools.count - activeSchools.count
                    stat("Écoles", "\(schools.count)", "\(a) active\(a > 1 ? "s" : "") · \(ina) inactive\(ina > 1 ? "s" : "")", warn: false) { open(.adminSchools) }
                    let w = withoutAdmin.count
                    stat("Admins d’école", "\(adminSchoolIds.count)", w > 0 ? "\(w) école\(w > 1 ? "s" : "") sans admin" : "Chaque école active en a un", warn: w > 0) { open(.adminUsers) }
                    let e = expiringInvites.count
                    stat("Invitations", "\(invites.count)", e > 0 ? "\(e) expire\(e > 1 ? "nt" : "") sous 48 h" : "Aucune n’expire sous 48 h", warn: e > 0) { open(.adminInvites) }
                    let d = pastDue.count
                    stat("Abonnements", "\(paying)", "\(trial) en essai · \(d) impayé\(d > 1 ? "s" : "")", warn: d > 0) { open(.adminBilling) }
                }
                .coachMarkTarget("ad.stats")
                Button { open(.adminSchools) } label: {
                    Label("Nouvelle école", systemImage: "plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, _ hint: String, warn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .semibold)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.8)
                Text(value).font(.title2.weight(.bold).monospacedDigit()).foregroundStyle(.white)
                HStack(spacing: 4) {
                    if warn { Circle().fill(EduTheme.fasoYellow).frame(width: 6, height: 6) }
                    Text(hint).font(.caption2).foregroundStyle(.white.opacity(0.85)).lineLimit(2).minimumScaleFactor(0.8)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
            .padding(12)
            .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Panels

    private func panel<Content: View>(icon: String, title: String, subtitle: String, count: Int? = nil,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                    .frame(width: 36, height: 36)
                    .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(EduTheme.ink)
                    Text(subtitle).font(.caption).foregroundStyle(EduTheme.muted)
                }
                Spacer(minLength: 0)
                if let count {
                    Text("\(count)").font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(EduTheme.teal)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
            }
            content()
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func empty(_ text: String, ok: Bool = false) -> some View {
        Label { Text(text) } icon: { if ok { Image(systemName: "checkmark.circle.fill").foregroundStyle(H.emerald) } }
            .font(.subheadline).foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func linkButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func row(title: String, subtitle: String, leading: AnyView? = nil, trailing: AnyView? = nil) -> some View {
        HStack(spacing: 10) {
            if let leading { leading }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).lineLimit(1)
                Text(subtitle).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(2)
            }
            Spacer(minLength: 6)
            if let trailing { trailing }
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.muted)
        }
        .padding(10)
        .background(H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func destination(_ a: Attention, @ViewBuilder label: () -> some View) -> some View {
        switch a.target {
        case .screen(let s): Button { open(s) } label: { label() }.buttonStyle(.plain)
        case .school(let id): NavigationLink { PlatformSchoolDetailView(schoolId: id) } label: { label() }.buttonStyle(.plain)
        }
    }

    private var attentionPanel: some View {
        panel(icon: "exclamationmark.triangle", title: "À traiter", subtitle: "Ce qui demande votre attention", count: attention.count) {
            if attention.isEmpty {
                empty("Rien à traiter pour le moment.", ok: true)
            } else {
                VStack(spacing: 8) {
                    ForEach(attention.prefix(6)) { a in
                        destination(a) {
                            row(title: a.title, subtitle: a.detail,
                                leading: AnyView(Image(systemName: "exclamationmark.triangle.fill").font(.caption)
                                    .foregroundStyle(a.danger ? EduTheme.fasoRed : H.amber)))
                        }
                    }
                }
                linkButton("Voir les rapports") { open(.adminReports) }
            }
        }
    }

    private var recentPanel: some View {
        panel(icon: "building.2", title: "Écoles récentes", subtitle: "Les dernières créées") {
            if recent.isEmpty {
                empty("Aucune école pour le moment.")
            } else {
                VStack(spacing: 8) {
                    ForEach(recent) { s in
                        NavigationLink { PlatformSchoolDetailView(schoolId: s.id) } label: {
                            row(title: s.name,
                                subtitle: [SchoolSettingsView.types.first { $0.0 == s.school_type }?.1, s.city,
                                           s.created_at.map { "créée \(Self.relative($0))" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
                                trailing: AnyView(statusChip(s.isActive)))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            linkButton("Toutes les écoles") { open(.adminSchools) }
        }
    }

    private func statusChip(_ active: Bool) -> some View {
        Text(active ? "Active" : "Inactive").font(.caption.weight(.bold))
            .foregroundStyle(active ? H.emerald : rose)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(active ? H.emerald50 : rose100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var invitesPanel: some View {
        panel(icon: "envelope", title: "Invitations en attente", subtitle: "Pas encore acceptées", count: invites.count) {
            if invites.isEmpty {
                empty("Aucune invitation en cours.")
            } else {
                VStack(spacing: 8) {
                    ForEach(invites.prefix(6)) { i in
                        Button { open(i.school_id == nil ? .adminSuperAdmins : .adminInvites) } label: {
                            row(title: i.name.isEmpty ? i.email : i.name,
                                subtitle: "\(i.email) · \(i.role == "super_admin" ? "Super admin" : (i.ecoles?.name ?? "École"))",
                                trailing: AnyView(Text("expire \(Self.relative(i.expires_at))").font(.caption2).foregroundStyle(EduTheme.muted)))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            linkButton("Toutes les invitations") { open(.adminInvites) }
        }
    }

    // MARK: - Helpers

    static func date(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: iso) { return d }
        return EduDates.parseDay(String(iso.prefix(10)))
    }

    static func relative(_ iso: String) -> String {
        guard let d = date(iso) else { return "" }
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.unitsStyle = .full
        return f.localizedString(for: d, relativeTo: Date())
    }

    // MARK: - Loading

    private func load() async {
        let client = SupabaseManager.client
        do {
            async let s: [PSchool] = client.from("ecoles")
                .select("id, name, city, school_type, active, billing_status, subscription_ends_at, created_at")
                .order("name").execute().value
            async let a: [AdminRole] = client.from("roles_utilisateurs").select("school_id")
                .eq("role", value: "school_admin").eq("active", value: true).execute().value
            async let i: [PInvite] = client.from("invitations")
                .select("id, email, first_name, last_name, role, school_id, expires_at, created_at, ecoles(name)")
                .is("accepted_at", value: nil).is("cancelled_at", value: nil)
                .gt("expires_at", value: ISO8601DateFormatter().string(from: Date()))
                .order("created_at", ascending: false).limit(200).execute().value
            let (schoolsRows, adminRows, inviteRows) = try await (s, a, i)
            schools = schoolsRows
            adminSchoolIds = adminRows.map(\.school_id)
            invites = inviteRows
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger le tableau de bord." }
        }
        ready = true
        auth.markPortalReady()
    }
}
