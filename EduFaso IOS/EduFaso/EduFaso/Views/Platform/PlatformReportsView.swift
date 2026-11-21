import SwiftUI
import Supabase

/// Super admin « Rapports », like the web AdminReports: four figures (écoles sans admin,
/// inactives, créées en 30 jours, invitations en attente) and the lists of active schools
/// without an administrator and inactive schools.
struct PlatformReportsView: View {
    var open: (AppScreen) -> Void = { _ in }

    @State private var schools: [PlatformSchool] = []
    @State private var adminIds: Set<String> = []
    @State private var pendingInvites = 0
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "admin-rapports")
    @State private var coach = CoachMarkRegistry()

    private var withoutAdmin: [PlatformSchool] { schools.filter { $0.isActive && !adminIds.contains($0.id) } }
    private var inactive: [PlatformSchool] { schools.filter { !$0.isActive } }
    private var recentCount: Int {
        let limit = Date().addingTimeInterval(-30 * 24 * 3600)
        return schools.filter { ($0.created_at.flatMap(Platform.date) ?? .distantPast) >= limit }.count
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ar.stats", icon: "chart.bar.fill", title: "Vue d’ensemble", message: "Les alertes de la plateforme en quatre chiffres."),
            CoachMarkStep(id: "ar.lists", icon: "exclamationmark.triangle", title: "À régler", message: "Les écoles actives sans administrateur et les écoles inactives. Touchez une école pour l’ouvrir."),
            CoachMarkStep(id: "ar.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: "Rapports", tour: tour, coach: coach, ready: ready, onRefresh: { await load() }) {
            PlatformBanner(title: "Rapports", subtitle: "Vue d’ensemble et alertes de la plateforme.",
                           onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "ar.help") {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    PlatformBannerStat(label: "Sans admin actif", value: "\(withoutAdmin.count)", hint: "écoles")
                    PlatformBannerStat(label: "Inactives", value: "\(inactive.count)", hint: "écoles")
                    PlatformBannerStat(label: "Créées", value: "\(recentCount)", hint: "30 derniers jours")
                    Button { open(.adminInvites) } label: { PlatformBannerStat(label: "Invitations", value: "\(pendingInvites)", hint: "en attente") }.buttonStyle(.plain)
                }
                .coachMarkTarget("ar.stats")
            }
            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
            VStack(spacing: 14) {
                PlatformPanel(icon: "person.crop.circle.badge.xmark", title: "Écoles actives sans administrateur", count: withoutAdmin.count) {
                    if withoutAdmin.isEmpty {
                        PlatformEmpty(text: "Toutes les écoles actives ont un administrateur.")
                    } else {
                        VStack(spacing: 8) {
                            ForEach(withoutAdmin) { s in
                                NavigationLink { PlatformSchoolDetailView(schoolId: s.id) } label: {
                                    PlatformRow(title: s.name, subtitle: [Platform.typeLabel(s.school_type), s.city].compactMap { $0 }.joined(separator: " · "))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                PlatformPanel(icon: "building.2.crop.circle", title: "Écoles inactives", count: inactive.count) {
                    if inactive.isEmpty {
                        PlatformEmpty(text: "Aucune école inactive.")
                    } else {
                        VStack(spacing: 8) {
                            ForEach(inactive) { s in
                                NavigationLink { PlatformSchoolDetailView(schoolId: s.id) } label: {
                                    PlatformRow(title: s.name, subtitle: s.city) { PlatformChip.active(false) }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .coachMarkTarget("ar.lists")
        }
        .task { await load() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
    }

    private struct AdminRole: Decodable { let school_id: String? }

    private func load() async {
        let client = SupabaseManager.client
        do {
            async let s: [PlatformSchool] = client.from("ecoles").select().order("name").execute().value
            async let a: [AdminRole] = client.from("roles_utilisateurs").select("school_id").eq("role", value: "school_admin").eq("active", value: true).execute().value
            async let c = client.from("invitations").select("id", head: true, count: .exact).is("accepted_at", value: nil).is("cancelled_at", value: nil)
                .gt("expires_at", value: ISO8601DateFormatter().string(from: Date())).execute().count
            let (rows, admins, count) = try await (s, a, c)
            schools = rows
            adminIds = Set(admins.compactMap(\.school_id))
            pendingInvites = count ?? 0
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger les rapports." }
        }
        ready = true
    }
}
