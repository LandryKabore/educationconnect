import SwiftUI

// MARK: - Data for one child

/// Everything the parent home shows for one child, loaded in one pass.
struct ParentChildHome: Equatable {
    var classId: String?
    var className: String?
    var annual: AnnualAverageResult?
    /// Latest published grades, newest first.
    var recentGrades: [GradeRow] = []
    /// Grades under 8/20 published in the last 14 days.
    var lowGrades: [GradeRow] = []
    /// Attendance over the current trimester.
    var attendance: AttendanceTotals?
    /// Unjustified absences over the last 30 days, newest first.
    var recentAbsences: [AttendanceRow] = []
    /// Last 4 weeks, one cell per school day (worst status of the day).
    var strip: [ParentStripDay] = []
    /// Interrogations, confirmed examens and compositions in the next 7 days.
    var upcoming: [ParentUpcomingItem] = []
    /// Exercices (type devoir) and confirmed devoirs (type examen) of the next 7 days — web « Devoirs de la semaine ».
    var weekHomework: [EvaluationRow] = []
    /// Cahier de textes homework still to do (due tomorrow or later) — web « Devoirs pour demain ».
    var cahierHomework: [CahierEntry] = []
    var failed = false
}

struct ParentStripDay: Hashable, Identifiable {
    var id: String { date }
    let date: String
    let status: String
}

struct ParentUpcomingItem: Hashable, Identifiable {
    enum Kind: Hashable { case quiz, exam, composition }
    let id: String
    let kind: Kind
    let title: String
    let subject: String?
    /// yyyy-MM-dd
    let day: String?
}

enum ParentHomeLoader {
    static let lowGradeOn20 = 8.0
    static let lowGradeWindowDays = 14
    static let absenceWindowDays = 30
    static let upcomingWindowDays = 7

    /// The trimester to report on: the one containing today, else the last one once
    /// the school year is over, else the first (same choice as the web parent home).
    static func currentTrimester(from periods: [AttendancePeriod], today: String = EduDates.day()) -> AttendancePeriod? {
        let trimesters = periods.filter { $0.key != .all }
        if let match = trimesters.first(where: { p in
            guard let from = p.from, let to = p.to else { return false }
            return today >= from && today <= to
        }) {
            return match
        }
        if let last = trimesters.last, let to = last.to, today > to { return last }
        return trimesters.first
    }

    static func load(childId: String, trimester: AttendancePeriod?) async -> ParentChildHome {
        let api = EduAPI()
        let now = Date()
        let cal = Calendar.current
        let today = EduDates.day(now)
        func dayOffset(_ days: Int) -> String {
            EduDates.day(cal.date(byAdding: .day, value: days, to: now) ?? now)
        }
        let weekEnd = dayOffset(upcomingWindowDays)
        let stripStart = dayOffset(-27)
        let absenceStart = dayOffset(-absenceWindowDays)
        let lowGradeStart = dayOffset(-lowGradeWindowDays)

        var home = ParentChildHome()
        var failed = false

        let enrollment = try? await api.activeEnrollment(studentId: childId)
        home.classId = enrollment?.classId
        home.className = enrollment?.className

        async let gradesTask = api.fetchGrades(studentId: childId, limit: 40)
        async let attendanceTask = api.fetchAttendance(studentId: childId, limit: 300)
        async let totalsTask = api.fetchAttendanceTotals(
            studentId: childId,
            from: trimester?.from,
            to: trimester?.to,
            subjectId: nil
        )

        if let classId = home.classId {
            async let annualTask = api.fetchAnnualAverage(studentId: childId, classSectionId: classId)
            async let quizzesTask = api.fetchEvaluations(classId: classId, type: "interrogation")
            async let examsTask = api.fetchEvaluations(classId: classId, type: "examen", confirmedOnly: true)
            async let compositionsTask = api.fetchCompositionSessions(classSectionId: classId)
            async let devoirsTask = api.fetchEvaluations(classId: classId, type: "devoir")
            async let cahierTask = api.fetchCahier(classId: classId)

            home.annual = await annualTask

            func inWindow(_ row: EvaluationRow) -> String? {
                guard let raw = row.evalDate ?? row.dueDate, !raw.isEmpty else { return nil }
                let day = String(raw.prefix(10))
                return (day >= today && day <= weekEnd) ? day : nil
            }
            let quizzes = ((try? await quizzesTask) ?? []).compactMap { row -> ParentUpcomingItem? in
                guard let day = inWindow(row) else { return nil }
                return ParentUpcomingItem(
                    id: "iq-\(row.id)", kind: .quiz,
                    title: nonEmpty(row.title) ?? row.matieres?.name ?? "Interrogation",
                    subject: row.matieres?.name, day: day
                )
            }
            let examRows = (try? await examsTask) ?? []
            let devoirRows = (try? await devoirsTask) ?? []
            home.weekHomework = Array(
                (devoirRows + examRows)
                    .filter { inWindow($0) != nil }
                    .sorted { ($0.evalDate ?? "") < ($1.evalDate ?? "") }
                    .prefix(8)
            )
            let tomorrow = dayOffset(1)
            home.cahierHomework = ((try? await cahierTask) ?? [])
                .filter { entry in
                    guard let hw = entry.homework?.trimmingCharacters(in: .whitespacesAndNewlines), !hw.isEmpty else { return false }
                    guard let due = entry.homeworkDue?.prefix(10) else { return false }
                    return String(due) >= tomorrow
                }
                .sorted { ($0.homeworkDue ?? "") < ($1.homeworkDue ?? "") }
            let exams = examRows.compactMap { row -> ParentUpcomingItem? in
                guard let day = inWindow(row) else { return nil }
                return ParentUpcomingItem(
                    id: "dv-\(row.id)", kind: .exam,
                    title: nonEmpty(row.title) ?? row.matieres?.name ?? "Examen",
                    subject: row.matieres?.name, day: day
                )
            }
            // a composition that is running or starts within the window
            let compositions = ((try? await compositionsTask) ?? []).compactMap { session -> ParentUpcomingItem? in
                let starts = session.startsOn.map { String($0.prefix(10)) }
                let ends = session.endsOn.map { String($0.prefix(10)) } ?? starts
                guard let starts, let ends, ends >= today, starts <= weekEnd else { return nil }
                return ParentUpcomingItem(
                    id: "co-\(session.id)", kind: .composition,
                    title: nonEmpty(session.title) ?? "Composition",
                    subject: session.periodLabel, day: max(starts, today)
                )
            }
            home.upcoming = (quizzes + exams + compositions)
                .sorted { ($0.day ?? "9999") < ($1.day ?? "9999") }
        }

        if let grades = try? await gradesTask {
            home.recentGrades = Array(grades.prefix(4))
            home.lowGrades = grades.filter { grade in
                guard let on20 = scoreOn20(grade), on20 < lowGradeOn20 else { return false }
                return (grade.createdAt.map { String($0.prefix(10)) } ?? "") >= lowGradeStart
            }
        } else {
            failed = true
        }

        if let rows = try? await attendanceTask {
            home.recentAbsences = rows.filter { $0.status == "absent" && $0.date >= absenceStart }
            home.strip = buildStrip(rows.filter { $0.date >= stripStart && $0.date <= today })
        } else {
            failed = true
        }

        home.attendance = try? await totalsTask
        home.failed = failed
        return home
    }

    /// One cell per school day (days with at least one record); the worst status wins.
    static func buildStrip(_ rows: [AttendanceRow]) -> [ParentStripDay] {
        let rank: [String: Int] = ["absent": 3, "late": 2, "excused": 1, "present": 0]
        var byDay: [String: String] = [:]
        for row in rows {
            if let current = byDay[row.date], (rank[current] ?? 0) >= (rank[row.status] ?? 0) { continue }
            byDay[row.date] = row.status
        }
        return byDay.keys.sorted().map { ParentStripDay(date: $0, status: byDay[$0] ?? "present") }
    }

    static func scoreOn20(_ grade: GradeRow) -> Double? {
        if grade.isAbsent == true { return nil }
        guard let score = grade.score, let max = grade.maxScore, max > 0 else { return nil }
        return (score / max) * 20
    }

    private static func nonEmpty(_ text: String?) -> String? {
        guard let t = text?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }
}

// MARK: - Parent home

struct ParentHomeView: View {
    var title: String = "Accueil"
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.scenePhase) private var scenePhase

    @AppStorage("edufaso.parent.selectedChild") private var selectedChildId: String = ""
    @State private var children: [ChildSummary] = []
    @State private var homes: [String: ParentChildHome] = [:]
    @State private var trimester: AttendancePeriod?
    @State private var inbox: [MessageRow] = []
    @State private var ready = false
    @State private var listFailed = false
    @State private var detailChild: ChildSummary?

    // guided tour
    @State private var tour = TabTour(key: "parentHome.v3")
    @State private var coach = CoachMarkRegistry()

    private static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    private static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)
    private static let brand50 = Color(red: 240 / 255, green: 253 / 255, blue: 250 / 255)
    private static let sky = Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)
    private static let rose = Color(red: 225 / 255, green: 29 / 255, blue: 72 / 255)
    private static let amber = Color(red: 217 / 255, green: 119 / 255, blue: 6 / 255)
    private static let emerald = Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)
    private static let softFill = Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)
    private static let childColors: [(fill: Color, text: Color)] = [
        (Color(red: 204 / 255, green: 251 / 255, blue: 241 / 255), Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)),
        (Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255), Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)),
        (Color(red: 254 / 255, green: 243 / 255, blue: 199 / 255), Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255)),
        (Color(red: 237 / 255, green: 233 / 255, blue: 254 / 255), Color(red: 91 / 255, green: 33 / 255, blue: 182 / 255)),
        (Color(red: 255 / 255, green: 228 / 255, blue: 230 / 255), Color(red: 159 / 255, green: 18 / 255, blue: 57 / 255)),
    ]

    /// Tour steps adapted to how many children are linked to this parent.
    private static func tour(forChildCount count: Int) -> [CoachMarkStep] {
        let help = CoachMarkStep(
            id: "parent.help", icon: "questionmark.circle.fill",
            title: "Revoir ce guide",
            message: "Touchez ce bouton à tout moment pour relancer la visite."
        )
        if count == 0 {
            return [
                CoachMarkStep(
                    id: "parent.empty", icon: "person.2.slash",
                    title: "Pas encore d’enfant lié",
                    message: "Quand l’école rattache votre enfant à ce compte, son suivi (notes, présences, devoirs…) apparaîtra ici."
                ),
                help,
            ]
        }
        let childRef = count == 1 ? "votre enfant" : "l’enfant choisi"
        var steps: [CoachMarkStep] = [
            CoachMarkStep(
                id: "parent.stats", icon: "person.crop.square",
                title: "L’essentiel en un coup d’œil",
                message: "Moyenne de l’année, présence du Trimestre et nombre de choses à faire pour \(childRef). « Bulletin » ouvre le bulletin."
            ),
        ]
        if count > 1 {
            steps.insert(CoachMarkStep(
                id: "child.switcher", icon: "arrow.left.arrow.right",
                title: "Changer d’enfant",
                message: "Vous avez plusieurs enfants. Essayez maintenant : touchez le prénom d’un autre enfant dans la barre en haut.",
                requiresAction: true,
                doneMessage: "Voilà ! Toute la page affiche maintenant le suivi de cet enfant. Le bouton plein, en haut, montre toujours l’enfant affiché."
            ), at: 0)
        }
        steps.append(contentsOf: [
            CoachMarkStep(
                id: "parent.watch", icon: "exclamationmark.triangle.fill",
                title: "À faire",
                message: "Absences à justifier, notes faibles récentes et messages non lus. Touchez « Voir » pour le détail."
            ),
            CoachMarkStep(
                id: "parent.results", icon: "chart.bar.fill",
                title: "Moyennes et présence",
                message: "Moyenne de chaque Trimestre, présence du Trimestre et un carré par jour de classe sur 4 semaines."
            ),
            CoachMarkStep(
                id: "parent.week", icon: "calendar",
                title: "Devoirs de la semaine",
                message: "Exercices et devoirs des 7 prochains jours pour \(childRef)."
            ),
            CoachMarkStep(
                id: "parent.quick", icon: "square.grid.2x2.fill",
                title: "Accès rapide",
                message: "Notes, bulletin, présences, emploi du temps, examens, exercices et compositions de \(childRef)."
            ),
            help,
        ])
        return steps
    }

    // MARK: Derived

    private var selected: ChildSummary? {
        children.first { $0.id == selectedChildId } ?? children.first
    }

    private var home: ParentChildHome? { selected.flatMap { homes[$0.id] } }

    private var parentName: String {
        let full = auth.profile?.fullName.trimmingCharacters(in: .whitespaces) ?? ""
        return full
    }

    private var schoolName: String? { auth.schools.first?.name }
    private var unreadMessages: Int { inbox.filter { $0.readAt == nil && $0.isAnnouncement != true }.count }
    private var unreadAnnouncements: Int { inbox.filter { $0.readAt == nil && $0.isAnnouncement == true }.count }
    private var latestMessages: [MessageRow] { Array(inbox.filter { $0.isAnnouncement != true }.prefix(3)) }
    private var latestAnnouncements: [MessageRow] { Array(inbox.filter { $0.isAnnouncement == true }.prefix(2)) }

    private func colors(for child: ChildSummary) -> (fill: Color, text: Color) {
        let index = children.firstIndex(of: child) ?? 0
        return Self.childColors[index % Self.childColors.count]
    }

    private func firstName(_ child: ChildSummary) -> String {
        if let f = child.firstName?.trimmingCharacters(in: .whitespaces), !f.isEmpty { return f }
        return child.fullName.split(separator: " ").first.map(String.init) ?? "Enfant"
    }

    // MARK: Body

    var body: some View {
        ScrollViewReader { scroller in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if !ready {
                        loadingSkeleton
                    } else {
                        banner
                        if listFailed || home?.failed == true { errorBanner }
                        if children.isEmpty || selected == nil {
                            noChildrenCard.coachMarkTarget("parent.empty")
                        } else if let child = selected {
                            todoBanner(child).coachMarkTarget("parent.watch")
                            tomorrowCard(child)
                            VStack(spacing: 12) {
                                HStack(alignment: .top, spacing: 12) {
                                    averageCard(child)
                                    presenceCard(child)
                                }
                                stripCard(child)
                            }
                            .coachMarkTarget("parent.results")
                            homeworkPanel(child).coachMarkTarget("parent.week")
                            gradesPanel(child)
                            messagesPanel
                            announcementsPanel
                            quickLinks(child).coachMarkTarget("parent.quick")
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
                .animation(.easeInOut(duration: 0.2), value: selected?.id)
            }
            .tabTour(tour, registry: coach, scroller: scroller)
        }
        // sticky child switcher, same as on the child tabs
        .safeAreaInset(edge: .top, spacing: 0) {
            if ready && children.count > 1 {
                ChildSwitcherBar(children: children, selectedId: selected?.id ?? "") { id in
                    withAnimation(.snappy(duration: 0.25)) { selectedChildId = id }
                }
            }
        }
        .environment(coach)
        .onChange(of: selectedChildId) { _, id in
            // interactive tour step: the parent really used the bar at the top
            guard tour.showing, tour.steps.indices.contains(tour.index),
                  tour.steps[tour.index].requiresAction else { return }
            if let child = children.first(where: { $0.id == id }) {
                tour.steps[tour.index].doneMessage = "Voilà ! Toute la page affiche maintenant le suivi \(Self.de(firstName(child))). Le bouton plein, en haut, montre toujours l’enfant affiché."
            }
            tour.actionDone = true
        }
        .onChange(of: home != nil) { _, loaded in if loaded { scheduleFirstTour() } }
        .onChange(of: ready) { _, isReady in if isReady, children.isEmpty { scheduleFirstTour() } }
        .refreshable { await load() }
        .background(EduTheme.page.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $detailChild) { child in ChildDetailView(child: child) }
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && ready { Task { await load() } }
        }
    }

    // MARK: Banner (teal, like the web)

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text([TimeGreeting.current(), schoolName].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption.weight(.semibold))
                            .tracking(1.4)
                            .textCase(.uppercase)
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(2)
                        Text(parentName.isEmpty ? "…" : "\(parentName) 👋")
                            .font(.system(size: 28, weight: .bold))
                            .tracking(-0.4)
                            .foregroundStyle(.white)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        Text("Le suivi scolaire de vos enfants, au même endroit.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer(minLength: 0)
                    Button { startTour() } label: {
                        Image(systemName: "questionmark")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.18), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Revoir le guide de cette page")
                    .coachMarkTarget("parent.help")
                }

                HStack(spacing: 10) {
                    bannerStat(
                        label: children.count > 1 ? "Enfants" : "Enfant",
                        value: "\(children.count)",
                        hint: children.isEmpty ? "aucun lié" : children.map(firstName).joined(separator: ", ")
                    )
                    NavigationLink { MessagesView() } label: {
                        bannerStat(
                            label: "Messages",
                            value: "\(unreadMessages)",
                            hint: unreadMessages == 0 ? "tout est lu" : (unreadMessages > 1 ? "non lus" : "non lu")
                        )
                    }
                    .buttonStyle(.plain)
                    NavigationLink { MessagesView(announcementsOnly: true) } label: {
                        bannerStat(
                            label: "Annonces",
                            value: "\(unreadAnnouncements)",
                            hint: unreadAnnouncements == 0 ? "rien de nouveau" : (unreadAnnouncements > 1 ? "nouvelles" : "nouvelle")
                        )
                    }
                    .buttonStyle(.plain)
                }

                if let child = selected {
                    selectedChildCard(child).coachMarkTarget("parent.stats")
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MES ENFANTS")
                            .font(.caption2.weight(.semibold)).tracking(1)
                            .foregroundStyle(.white.opacity(0.7))
                        Text("Aucun enfant lié pour le moment")
                            .font(.headline)
                            .foregroundStyle(.white)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
            }
            .padding(20)

            HStack(spacing: 0) {
                EduTheme.fasoRed
                EduTheme.fasoYellow
                EduTheme.fasoGreen
            }
            .frame(height: 4)
            .accessibilityHidden(true)
        }
        .background {
            ZStack {
                LinearGradient(colors: [Self.brand800, EduTheme.teal, Self.brand600], startPoint: .topLeading, endPoint: .bottomTrailing)
                Circle().fill(.white.opacity(0.06)).frame(width: 260, height: 260).offset(x: 150, y: -120)
                Circle().fill(.white.opacity(0.04)).frame(width: 220, height: 220).offset(x: -40, y: 200)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Self.brand800.opacity(0.25), radius: 14, y: 8)
    }

    private func bannerStat(label: String, value: String, hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
            Text(hint)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    private func selectedChildCard(_ child: ChildSummary) -> some View {
        let avg = home?.annual?.annualAverage
        let rate = home?.attendance?.ratePercent
        let todos = todoItems(for: child, includeUnread: false).count
        let c = colors(for: child)
        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Text(Self.initials(child.fullName))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(c.text)
                    .frame(width: 44, height: 44)
                    .background(c.fill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(child.fullName)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    Text(home?.className ?? child.className ?? "Sans classe")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                NavigationLink { BulletinBoard(studentId: child.id, title: "Bulletin") } label: {
                    Text("BULLETIN")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            Rectangle().fill(EduTheme.border.opacity(0.7)).frame(height: 1)
            HStack(spacing: 0) {
                childStat("Moyenne", value: avg.map { Self.format($0, digits: 2) } ?? "—", color: (avg ?? 20) < 10 ? Self.rose : EduTheme.ink)
                Rectangle().fill(EduTheme.border.opacity(0.7)).frame(width: 1, height: 36)
                childStat("Présence", value: rate.map { "\($0) %" } ?? "—", color: EduTheme.ink)
                Rectangle().fill(EduTheme.border.opacity(0.7)).frame(width: 1, height: 36)
                childStat("À faire", value: home == nil ? "—" : "\(todos)", color: todos > 0 ? Self.rose : Self.emerald)
            }
        }
        .padding(18)
        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .redacted(reason: home == nil ? .placeholder : [])
    }

    private func childStat(_ label: String, value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(EduTheme.muted)
            Text(value)
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: À faire

    private struct TodoItem: Identifiable {
        enum Tone { case danger, warning, info }
        let id: String
        let tone: Tone
        let text: String
        let detail: String?
        let target: Target
        enum Target { case attendance, grades, messages }
    }

    /// Same rules as the web: unjustified absences (30 days), grades under 8/20 (14 days), unread messages.
    private func todoItems(for child: ChildSummary, includeUnread: Bool) -> [TodoItem] {
        var out: [TodoItem] = []
        if let home = homes[child.id] {
            let absences = home.recentAbsences
            if !absences.isEmpty {
                let detail = absences.prefix(3).map { row in
                    [row.matieres?.name, Self.shortDate(row.date)].compactMap { $0 }.joined(separator: " ")
                }.joined(separator: " · ")
                out.append(TodoItem(
                    id: "absences", tone: .danger,
                    text: "\(absences.count) absence\(absences.count > 1 ? "s" : "") non justifiée\(absences.count > 1 ? "s" : "")",
                    detail: detail.isEmpty ? nil : detail, target: .attendance
                ))
            }
            let low = home.lowGrades
            if let first = low.first {
                let value = ParentHomeLoader.scoreOn20(first).map { Self.format($0, digits: 1) } ?? "—"
                out.append(TodoItem(
                    id: "low-grades", tone: .warning,
                    text: low.count > 1 ? "\(low.count) notes inférieures à 8/20" : "Note inférieure à 8/20",
                    detail: "\(first.matieres?.name ?? "Matière") · \(value)/20", target: .grades
                ))
            }
        }
        if includeUnread, unreadMessages > 0 {
            out.append(TodoItem(
                id: "unread", tone: .info,
                text: "\(unreadMessages) message\(unreadMessages > 1 ? "s non lus" : " non lu")",
                detail: nil, target: .messages
            ))
        }
        return out
    }

    @ViewBuilder private func todoBanner(_ child: ChildSummary) -> some View {
        let items = todoItems(for: child, includeUnread: true)
        if !items.isEmpty {
            let danger = items.contains { $0.tone == .danger }
            VStack(alignment: .leading, spacing: 10) {
                Label("À FAIRE", systemImage: "exclamationmark.triangle")
                    .font(.caption.weight(.semibold))
                    .tracking(0.6)
                    .foregroundStyle(EduTheme.ink.opacity(0.8))
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.text)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(item.tone == .danger ? Color(red: 159 / 255, green: 18 / 255, blue: 57 / 255) : item.tone == .warning ? Color(red: 120 / 255, green: 53 / 255, blue: 15 / 255) : EduTheme.ink)
                                if let detail = item.detail {
                                    Text(detail)
                                        .font(.caption)
                                        .foregroundStyle(EduTheme.muted)
                                        .lineLimit(1)
                                }
                            }
                            Spacer(minLength: 8)
                            NavigationLink {
                                switch item.target {
                                case .attendance: StudentAttendanceView(studentIdOverride: child.id, childName: firstName(child))
                                case .grades: StudentGradesView(studentIdOverride: child.id, childName: firstName(child))
                                case .messages: MessagesView()
                                }
                            } label: {
                                Text(item.target == .messages ? "Lire" : "Voir")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                    .padding(.horizontal, 14)
                                    .frame(minHeight: 40)
                                    .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.vertical, 8)
                        .overlay(alignment: .top) {
                            if index > 0 { Rectangle().fill(.black.opacity(0.05)).frame(height: 1) }
                        }
                    }
                }
            }
            .padding(14)
            .background(
                (danger ? Color(red: 255 / 255, green: 241 / 255, blue: 242 / 255) : Color(red: 255 / 255, green: 251 / 255, blue: 235 / 255)),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(danger ? Color(red: 254 / 255, green: 205 / 255, blue: 211 / 255) : Color(red: 253 / 255, green: 230 / 255, blue: 138 / 255), lineWidth: 1)
            )
        }
    }

    // MARK: Devoirs pour demain (cahier de textes)

    @ViewBuilder private func tomorrowCard(_ child: ChildSummary) -> some View {
        let items = home?.cahierHomework ?? []
        let tomorrow = Self.dayOffset(1)
        let forTomorrow = items.filter { $0.homeworkDue.map { String($0.prefix(10)) } == tomorrow }
        let later = items.filter { ($0.homeworkDue.map { String($0.prefix(10)) } ?? "") > tomorrow }
        if home != nil {
            panel(
                icon: "book.closed",
                title: "Devoirs \(Self.de(firstName(child))) pour demain",
                subtitle: "Cahier de textes",
                actionTitle: "Voir le cahier de textes",
                destination: { CahierFeedView(studentId: child.id) }
            ) {
                if items.isEmpty {
                    panelEmpty("Rien à faire pour demain.")
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        if !forTomorrow.isEmpty { cahierSection("Pour demain", forTomorrow, tone: Self.amber) }
                        if !later.isEmpty { cahierSection("Plus tard", Array(later.prefix(3)), tone: EduTheme.muted) }
                    }
                }
            }
        }
    }

    private func cahierSection(_ title: String, _ items: [CahierEntry], tone: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(title).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Text("\(items.count)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(tone)
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(tone.opacity(0.12), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
            ForEach(items) { entry in
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.matieres?.name ?? "Matière")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    Text(entry.homework ?? "")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(2)
                    if let due = entry.homeworkDue, String(due.prefix(10)) != Self.dayOffset(1) {
                        Text("Pour le \(Self.longDate(String(due.prefix(10))))")
                            .font(.caption2)
                            .foregroundStyle(EduTheme.subtle)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
        }
    }

    // MARK: Cards

    private func averageCard(_ child: ChildSummary) -> some View {
        let value = home?.annual?.annualAverage
        let trimesters = home?.annual?.trimesters ?? []
        return NavigationLink { StudentGradesView(studentIdOverride: child.id, childName: firstName(child)) } label: {
            VStack(alignment: .leading, spacing: 10) {
                cardLabel("Moyennes \(Self.de(firstName(child))) · année")
                if home == nil {
                    cardLoading
                } else {
                    HStack(spacing: 10) {
                        ring(fraction: value.map { $0 / 20 }, label: value.map { Self.format($0, digits: 1) } ?? "—", color: Self.averageColor(value))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Annuelle").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                            Text(value.map { "\(Self.format($0, digits: 2)) /20" } ?? "— /20")
                                .font(.caption)
                                .foregroundStyle(Self.gradeColor(value))
                        }
                    }
                    if trimesters.isEmpty {
                        Text("Aucune note publiée.").font(.caption).foregroundStyle(EduTheme.muted)
                    } else {
                        HStack(spacing: 4) {
                            ForEach(Array(trimesters.prefix(3).enumerated()), id: \.offset) { _, t in
                                VStack(spacing: 1) {
                                    Text(Self.shortPeriod(t.periodLabel))
                                        .font(.system(size: 9, weight: .semibold))
                                        .foregroundStyle(EduTheme.muted)
                                        .lineLimit(1)
                                    Text(t.generalAverage.map { Self.format($0, digits: 2) } ?? "—")
                                        .font(.caption.weight(.bold).monospacedDigit())
                                        .foregroundStyle(Self.gradeColor(t.generalAverage))
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.7)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 5)
                                .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            }
                        }
                    }
                    Spacer(minLength: 0)
                    cardButton("Voir les notes")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(14)
            .modifier(HomeCardStyle())
        }
        .buttonStyle(.plain)
    }

    private func presenceCard(_ child: ChildSummary) -> some View {
        let att = home?.attendance
        let rate = att?.ratePercent
        return NavigationLink { StudentAttendanceView(studentIdOverride: child.id, childName: firstName(child)) } label: {
            VStack(alignment: .leading, spacing: 10) {
                cardLabel("Présence \(Self.de(firstName(child)))" + (trimester.map { " · \(Self.shortPeriod($0.label))" } ?? ""))
                if home == nil {
                    cardLoading
                } else {
                    HStack(spacing: 10) {
                        ring(fraction: rate.map { Double($0) / 100 }, label: rate.map { "\($0) %" } ?? "—", color: Self.rateColor(rate))
                        if let att, att.total > 0 {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("\(att.absencesTotal) absence\(att.absencesTotal > 1 ? "s" : "")")
                                Text("\(att.late) retard\(att.late > 1 ? "s" : "")")
                            }
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                        }
                    }
                    if att == nil || att?.total == 0 {
                        Text("Aucun cours enregistré.").font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    Spacer(minLength: 0)
                    cardButton("Voir les présences")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(14)
            .modifier(HomeCardStyle())
        }
        .buttonStyle(.plain)
    }

    private func stripCard(_ child: ChildSummary) -> some View {
        let strip = home?.strip ?? []
        return VStack(alignment: .leading, spacing: 10) {
            cardLabel("Assiduité \(Self.de(firstName(child))) · 4 dernières semaines")
            if home == nil {
                RoundedRectangle(cornerRadius: 4).fill(Self.softFill).frame(height: 22)
            } else if strip.isEmpty {
                Text("Aucun cours enregistré ces 4 dernières semaines.").font(.caption).foregroundStyle(EduTheme.muted)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(16), spacing: 4), count: 14), alignment: .leading, spacing: 4) {
                    ForEach(strip) { day in
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(Self.statusColor(day.status))
                            .frame(width: 16, height: 16)
                            .accessibilityLabel("\(Self.shortDate(day.date)) : \(Self.statusLabel(day.status))")
                    }
                }
                Text("Vert présent · rouge absent · jaune retard · bleu justifié (un carré par jour de classe)")
                    .font(.caption2)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            NavigationLink { StudentAttendanceView(studentIdOverride: child.id, childName: firstName(child)) } label: { cardButton("Voir le détail") }
                .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .modifier(HomeCardStyle())
    }

    // MARK: Panels

    private func homeworkPanel(_ child: ChildSummary) -> some View {
        let rows = home?.weekHomework ?? []
        let today = EduDates.day()
        return panel(
            icon: "list.clipboard",
            title: "Devoirs \(Self.de(firstName(child))) cette semaine",
            subtitle: "Exercices et devoirs des 7 prochains jours",
            actionTitle: "Tous les exercices",
            destination: { ExercisesBoardView(studentIdOverride: child.id, childName: firstName(child)) }
        ) {
            if home == nil {
                cardLoading
            } else if home?.classId == nil {
                panelEmpty("Cet enfant n’est pas encore inscrit dans une classe.")
            } else if rows.isEmpty {
                panelEmpty("Rien à rendre cette semaine.")
            } else {
                VStack(spacing: 8) {
                    ForEach(rows) { row in
                        let day = String((row.evalDate ?? "").prefix(10))
                        let isExam = row.type == "examen"
                        NavigationLink {
                            if isExam {
                                ExamsBoardView(studentIdOverride: child.id, childName: firstName(child))
                            } else {
                                ExercisesBoardView(studentIdOverride: child.id, childName: firstName(child))
                            }
                        } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text([row.matieres?.name, row.title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(EduTheme.ink)
                                        .lineLimit(1)
                                    Text((isExam ? "Devoir" : "Exercice") + (row.startTime.map { " · \($0.prefix(5))" } ?? ""))
                                        .font(.caption)
                                        .foregroundStyle(EduTheme.muted)
                                }
                                Spacer(minLength: 8)
                                pill(day == today ? "Aujourd’hui" : Self.weekdayDate(day), color: day == today ? Self.rose : Self.amber)
                            }
                            .padding(.horizontal, 12).padding(.vertical, 10)
                            .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func gradesPanel(_ child: ChildSummary) -> some View {
        let grades = (home?.recentGrades ?? []).filter { $0.isAbsent != true }.prefix(4)
        return panel(
            icon: "book",
            title: "Dernières notes \(Self.de(firstName(child)))",
            subtitle: "Publiées par ses enseignants",
            actionTitle: "Toutes les notes",
            destination: { StudentGradesView(studentIdOverride: child.id, childName: firstName(child)) }
        ) {
            if home == nil {
                cardLoading
            } else if grades.isEmpty {
                panelEmpty("Aucune note publiée pour le moment.")
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(grades)) { grade in
                        let v = ParentHomeLoader.scoreOn20(grade)
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(grade.matieres?.name ?? "Matière")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                    .lineLimit(1)
                                Text([grade.periodLabel, grade.createdAt.map { Self.shortDate(String($0.prefix(10))) }].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            Spacer(minLength: 8)
                            HStack(alignment: .firstTextBaseline, spacing: 2) {
                                Text(v.map { Self.format($0, digits: 1) } ?? "—")
                                    .font(.title3.weight(.bold).monospacedDigit())
                                    .foregroundStyle(Self.gradeColor(v))
                                Text("/ 20").font(.caption).foregroundStyle(EduTheme.muted)
                            }
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
            }
        }
    }

    private var messagesPanel: some View {
        panel(
            icon: "message",
            title: "Messages",
            subtitle: "École et enseignants",
            actionTitle: "Voir tous les messages",
            destination: { MessagesView() }
        ) {
            if latestMessages.isEmpty {
                panelEmpty("Aucun message pour le moment.")
            } else {
                VStack(spacing: 8) {
                    ForEach(latestMessages) { m in
                        let unread = m.readAt == nil
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(m.sender?.fullName ?? "Expéditeur")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                    .lineLimit(1)
                                if unread { Circle().fill(EduTheme.teal).frame(width: 7, height: 7) }
                                Spacer(minLength: 8)
                                Text(Self.relative(m.createdAt))
                                    .font(.caption2)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            Text(m.subject?.trimmingCharacters(in: .whitespaces).isEmpty == false ? m.subject! : "Sans objet")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(EduTheme.ink.opacity(0.85))
                                .lineLimit(1)
                            Text(Self.snippet(m.body, 64))
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(unread ? Self.brand50 : Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                                .stroke(unread ? EduTheme.teal.opacity(0.2) : .clear, lineWidth: 1)
                        )
                    }
                }
            }
        }
    }

    private var announcementsPanel: some View {
        panel(
            icon: "bell",
            title: "Annonces de l’école",
            subtitle: "Infos officielles de l’administration",
            actionTitle: "Voir les annonces",
            destination: { MessagesView(announcementsOnly: true) }
        ) {
            if latestAnnouncements.isEmpty {
                panelEmpty("Aucune annonce pour le moment.")
            } else {
                VStack(spacing: 8) {
                    ForEach(latestAnnouncements) { m in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(m.subject?.trimmingCharacters(in: .whitespaces).isEmpty == false ? m.subject! : "Annonce")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                Spacer(minLength: 8)
                                Text(Self.numericDate(m.createdAt))
                                    .font(.caption2)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            Text(Self.snippet(m.body, 110))
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
            }
        }
    }

    private func quickLinks(_ child: ChildSummary) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            cardLabel("Accès rapide · \(firstName(child))")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                quickLink("Notes", icon: "book") { StudentGradesView(studentIdOverride: child.id, childName: firstName(child)) }
                quickLink("Bulletin", icon: "doc.text") { BulletinBoard(studentId: child.id, title: "Bulletin") }
                quickLink("Présences", icon: "calendar.badge.checkmark") { StudentAttendanceView(studentIdOverride: child.id, childName: firstName(child)) }
                quickLink("Emploi du temps", icon: "calendar") { TimetableView(mode: .student, studentIdOverride: child.id) }
                quickLink("Examens", icon: "list.clipboard") { ExamsBoardView(studentIdOverride: child.id, childName: firstName(child)) }
                quickLink("Exercices", icon: "square.and.pencil") { ExercisesBoardView(studentIdOverride: child.id, childName: firstName(child)) }
                quickLink("Compositions", icon: "graduationcap") { StudentCompositionsView(studentIdOverride: child.id) }
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private func quickLink<Destination: View>(_ title: String, icon: String, @ViewBuilder destination: () -> Destination) -> some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.teal)
                    .frame(width: 18)
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: Building blocks

    private func panel<Destination: View, Content: View>(
        icon: String,
        title: String,
        subtitle: String,
        actionTitle: String,
        @ViewBuilder destination: @escaping () -> Destination,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.teal)
                    .frame(width: 34, height: 34)
                    .background(Self.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                }
            }
            content()
            NavigationLink(destination: destination) {
                Text(actionTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func panelEmpty(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 14)
    }

    private func cardLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(EduTheme.muted)
            .lineLimit(3)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)
    }

    private func cardButton(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func pill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.weight(.medium))
            .foregroundStyle(color)
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
    }

    private func ring(fraction: Double?, label: String, color: Color) -> some View {
        ZStack {
            Circle().stroke(Self.softFill, lineWidth: 5)
            Circle()
                .trim(from: 0, to: min(max(fraction ?? 0, 0), 1))
                .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(label)
                .font(.system(size: 12, weight: .bold).monospacedDigit())
                .foregroundStyle(EduTheme.ink)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .padding(6)
        }
        .frame(width: 52, height: 52)
    }

    private var cardLoading: some View {
        HStack { Spacer(); ProgressView(); Spacer() }.frame(minHeight: 60)
    }

    private var noChildrenCard: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "person.2")
                .foregroundStyle(EduTheme.teal)
                .frame(width: 40, height: 40)
                .background(Self.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text("Aucun enfant lié à votre compte")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("Demandez à l’école de lier votre compte à vos enfants. Vous retrouverez ici leurs notes, présences et devoirs.")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            }
        }
        .padding(18)
        .modifier(HomeCardStyle())
    }

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 16) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(EduTheme.teal.opacity(0.25))
                .frame(maxWidth: .infinity, minHeight: 300)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(.white)
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Chargement en cours")
    }

    private var errorBanner: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle").foregroundStyle(Color.orange)
            VStack(alignment: .leading, spacing: 4) {
                Text("Certaines données n’ont pas pu être chargées.")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.ink)
                Button("Réessayer") { Task { await load() } }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.teal)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(Color.orange.opacity(0.3), lineWidth: 1))
    }

    // MARK: Helpers

    private static let monthShort = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

    static func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    /// "de Fatoumata", "d’Amadou" (French elision before a vowel or a mute h).
    static func de(_ name: String) -> String {
        let first = name.folding(options: .diacriticInsensitive, locale: .current).lowercased().first
        if let first, "aeiouyh".contains(first) { return "d’\(name)" }
        return "de \(name)"
    }

    private static func dayOffset(_ days: Int) -> String {
        EduDates.day(Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date())
    }

    private static func parseDay(_ iso: String) -> Date? {
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(iso.prefix(10)))
    }

    /// "2026-05-22" → "22 mai"
    private static func shortDate(_ iso: String) -> String {
        let parts = iso.prefix(10).split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), (1...12).contains(m), let d = Int(parts[2]) else { return iso }
        return "\(d) \(monthShort[m - 1])"
    }

    /// "2026-05-22" → "ven. 22 mai"
    private static func weekdayDate(_ iso: String) -> String {
        guard let date = parseDay(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEE d MMM"
        return f.string(from: date)
    }

    private static func longDate(_ iso: String) -> String {
        guard let date = parseDay(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEEE d MMMM"
        return f.string(from: date)
    }

    private static func numericDate(_ iso: String?) -> String {
        guard let iso, let date = parseDay(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d/MM/yyyy"
        return f.string(from: date)
    }

    private static func relative(_ iso: String?) -> String {
        guard let iso else { return "" }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) ?? parseDay(iso)
        guard let date else { return "" }
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.unitsStyle = .short
        return f.localizedString(for: date, relativeTo: Date())
    }

    private static func snippet(_ text: String?, _ max: Int) -> String {
        let t = (text ?? "").replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespaces)
        return t.count > max ? String(t.prefix(max - 1)) + "…" : t
    }

    /// "Trimestre 1" stays as is; long custom labels are shortened for the small cells.
    private static func shortPeriod(_ label: String?) -> String {
        guard let label, !label.isEmpty else { return "—" }
        return label.count > 14 ? String(label.prefix(13)) + "…" : label
    }

    private static func gradeColor(_ value: Double?) -> Color {
        guard let value else { return EduTheme.muted }
        if value >= 10 { return EduTheme.ink }
        return rose
    }

    private static func averageColor(_ value: Double?) -> Color {
        guard let value else { return EduTheme.subtle }
        if value >= 14 { return emerald }
        if value >= 10 { return sky }
        return rose
    }

    private static func rateColor(_ rate: Int?) -> Color {
        guard let rate else { return EduTheme.subtle }
        if rate >= 95 { return emerald }
        if rate >= 85 { return amber }
        return rose
    }

    private static func statusColor(_ status: String) -> Color {
        switch status {
        case "absent": return rose
        case "late": return Color(red: 250 / 255, green: 204 / 255, blue: 21 / 255)
        case "excused": return sky
        default: return Color(red: 52 / 255, green: 211 / 255, blue: 153 / 255)
        }
    }

    private static func statusLabel(_ status: String) -> String {
        switch status {
        case "absent": return "absent"
        case "late": return "en retard"
        case "excused": return "absence justifiée"
        default: return "présent"
        }
    }

    private static func format(_ value: Double, digits: Int) -> String {
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "fr_FR")
        nf.minimumFractionDigits = digits
        nf.maximumFractionDigits = digits
        return nf.string(from: NSNumber(value: value)) ?? String(format: "%.\(digits)f", value)
    }

    // MARK: Guided tour

    private func scheduleFirstTour() {
        tour.autoStartOnce({ Self.tour(forChildCount: children.count) }, registry: coach)
    }

    private func startTour() {
        tour.start(Self.tour(forChildCount: children.count), registry: coach)
    }

    // MARK: Loading

    private func load() async {
        let api = EduAPI()
        var failed = false

        async let childrenTask = api.fetchChildren()
        async let periodTask = api.fetchAttendancePeriodContext()

        if let uid = auth.userId, let rows = try? await api.fetchInbox(userId: uid, kind: .all, limit: 30) {
            inbox = rows.sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
        }

        let periods: [AttendancePeriod]
        if let ctx = try? await periodTask {
            periods = AttendancePeriodBuilder.build(yearStart: ctx.start, yearEnd: ctx.end, custom: ctx.custom)
        } else {
            periods = AttendancePeriodBuilder.build()
        }
        trimester = ParentHomeLoader.currentTrimester(from: periods)

        do {
            children = try await childrenTask
        } catch {
            failed = true
        }
        if let first = children.first, !children.contains(where: { $0.id == selectedChildId }) {
            selectedChildId = first.id
        }
        listFailed = failed
        ready = true
        auth.markPortalReady()

        // selected child first so its cards fill in quickly, then the others
        let ordered = children.sorted { a, _ in a.id == selectedChildId }
        for child in ordered {
            homes[child.id] = await ParentHomeLoader.load(childId: child.id, trimester: trimester)
        }
    }
}

// MARK: - Child file (from "Mes enfants")

struct ChildDetailView: View {
    let child: ChildSummary

    var body: some View {
        PremiumScreenChrome {
            List {
                Section {
                    HStack(spacing: 12) {
                        Text(ParentHomeView.initials(child.fullName))
                            .font(.headline.weight(.medium))
                            .foregroundStyle(.white)
                            .frame(width: 48, height: 48)
                            .background(EduTheme.navy, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(child.fullName).font(.headline).foregroundStyle(EduTheme.ink)
                            Text(child.className ?? "Classe non renseignée")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                    }
                    .listRowBackground(EduTheme.brand50)
                }

                Section("Vie scolaire") {
                    NavigationLink("Notes") { StudentGradesView(studentIdOverride: child.id, childName: child.firstName ?? child.fullName) }
                    NavigationLink("Présences") { StudentAttendanceView(studentIdOverride: child.id, childName: child.firstName ?? child.fullName) }
                    NavigationLink("Examens") {
                        ExamsBoardView(studentIdOverride: child.id, childName: child.firstName ?? child.fullName)
                    }
                    NavigationLink("Interrogations") {
                        EvaluationsBrowser(studentId: child.id, type: "interrogation", title: "Interrogations")
                    }
                    NavigationLink("Compositions") {
                        StudentCompositionsView(studentIdOverride: child.id)
                    }
                    NavigationLink("Bulletin") { BulletinBoard(studentId: child.id) }
                    NavigationLink("Emploi du temps") {
                        TimetableView(mode: .student, studentIdOverride: child.id)
                    }
                    NavigationLink("Cahier de textes") { CahierFeedView(studentId: child.id) }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .premiumTitle(child.fullName)
        .navigationBarTitleDisplayMode(.inline)
    }
}
