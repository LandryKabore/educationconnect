import SwiftUI

/// School admin « Cahier de textes — suivi », like the web CahierEcole: per class and subject, who
/// fills the lesson log over the last 7 / 14 / 30 days (entries, lessons per week, last entry).
struct SchoolCahierView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var days = 14
    @State private var classFilter = ""
    @State private var rows: [EduAPI.CahierCoverageRow] = []
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "cahier-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    private var classes: [(String, String)] {
        var m: [String: String] = [:]
        for r in rows { m[r.classId] = r.className }
        return m.sorted { $0.value.localizedStandardCompare($1.value) == .orderedAscending }.map { ($0.key, $0.value) }
    }
    private var shown: [EduAPI.CahierCoverageRow] { rows.filter { classFilter.isEmpty || $0.classId == classFilter } }
    private var emptyCount: Int { shown.filter { $0.entries == 0 }.count }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ce.filters", icon: "line.3.horizontal.decrease.circle", title: "Période et classe",
                          message: "Les 7, 14 ou 30 derniers jours, pour toutes les classes ou une seule."),
            CoachMarkStep(id: "ce.list", icon: "book", title: "Le suivi",
                          message: "Pour chaque matière : l’enseignant, ses cours par semaine, le nombre de saisies et la dernière. En orange : aucune saisie sur la période."),
            CoachMarkStep(id: "ce.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        filters.coachMarkTarget("ce.filters")
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        if shown.isEmpty {
                            Text("Aucune matière affectée à un enseignant : le suivi apparaîtra quand les enseignants seront affectés aux classes.")
                                .font(.subheadline).foregroundStyle(EduTheme.muted).padding(16).modifier(HomeCardStyle())
                                .coachMarkTarget("ce.list")
                        } else {
                            Group {
                                if emptyCount > 0 {
                                    (Text("\(emptyCount)").fontWeight(.bold).foregroundColor(H.amber)
                                     + Text(" matière\(emptyCount > 1 ? "s" : "") sans aucune saisie sur la période.").foregroundColor(EduTheme.muted))
                                } else {
                                    Text("Toutes les matières ont au moins une saisie sur la période.").foregroundColor(H.emerald)
                                }
                            }
                            .font(.subheadline)
                            list.coachMarkTarget("ce.list")
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
        .navigationTitle("Cahier de textes")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: days) { _, _ in Task { await load() } }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Cahier de textes — suivi").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                    Text("Quels enseignants remplissent le cahier de textes de leur classe.")
                        .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                }
                Spacer()
                TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("ce.help")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var filters: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Période").foregroundStyle(EduTheme.ink)
                Spacer()
                Picker("Période", selection: $days) {
                    Text("7 derniers jours").tag(7)
                    Text("14 derniers jours").tag(14)
                    Text("30 derniers jours").tag(30)
                }
                .labelsHidden()
            }
            Divider()
            HStack {
                Text("Classe").foregroundStyle(EduTheme.ink)
                Spacer()
                Picker("Classe", selection: $classFilter) {
                    Text("Toutes les classes").tag("")
                    ForEach(classes, id: \.0) { Text($0.1).tag($0.0) }
                }
                .labelsHidden()
            }
        }
        .font(.subheadline).tint(EduTheme.teal)
        .padding(.horizontal, 16).padding(.vertical, 4)
        .modifier(HomeCardStyle())
    }

    private var list: some View {
        VStack(spacing: 0) {
            ForEach(Array(shown.enumerated()), id: \.offset) { i, r in
                if i > 0 { Divider().padding(.leading, 16) }
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        (Text(r.className).fontWeight(.semibold).foregroundColor(EduTheme.ink) + Text(" · \(r.subject)").foregroundColor(EduTheme.ink))
                            .font(.subheadline)
                        Text([r.teacher ?? "—", r.slotsPerWeek > 0 ? "\(r.slotsPerWeek) cours / semaine" : nil].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(EduTheme.muted)
                        Text(r.lastDate.flatMap { EduDates.parseDay(String($0.prefix(10))) }.map { "Dernière saisie : " + TeacherExercisesView.format($0, "d MMM yyyy") } ?? "Aucune saisie")
                            .font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    Spacer(minLength: 4)
                    Text("\(r.entries)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundStyle(r.entries == 0 ? H.amber : H.emerald)
                        .frame(minWidth: 34, minHeight: 28)
                        .background(r.entries == 0 ? H.amber50 : H.emerald50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        .accessibilityLabel("\(r.entries) saisie\(r.entries > 1 ? "s" : "")")
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            }
        }
        .modifier(HomeCardStyle())
    }

    private func load() async {
        guard let sid = auth.schoolId else { ready = true; return }
        let to = EduDates.day()
        let from = EduDates.day(Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date())
        do {
            rows = try await EduAPI().fetchCahierCoverage(schoolId: sid, from: from, to: to)
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }
}

extension EduAPI {
    struct CahierCoverageRow: Decodable {
        let classId: String
        let className: String
        let subjectId: String
        let subject: String
        let teacherId: String?
        let teacher: String?
        let entries: Int
        let lastDate: String?
        let slotsPerWeek: Int
    }

    func fetchCahierCoverage(schoolId: String, from: String, to: String) async throws -> [CahierCoverageRow] {
        struct P: Encodable { let p_school: String; let p_from: String; let p_to: String }
        return try await call("ef_cahier_coverage", params: P(p_school: schoolId, p_from: from, p_to: to))
    }
}
