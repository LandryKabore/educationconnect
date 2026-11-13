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
    /// Interrogations, confirmed devoirs and compositions in the next 7 days.
    var upcoming: [ParentUpcomingItem] = []
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
            let exams = ((try? await examsTask) ?? []).compactMap { row -> ParentUpcomingItem? in
                guard let day = inWindow(row) else { return nil }
                return ParentUpcomingItem(
                    id: "dv-\(row.id)", kind: .exam,
                    title: nonEmpty(row.title) ?? row.matieres?.name ?? "Devoir",
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
    @Namespace private var switcherNamespace

    @AppStorage("edufaso.parent.selectedChild") private var selectedChildId: String = ""
    @State private var children: [ChildSummary] = []
    @State private var homes: [String: ParentChildHome] = [:]
    @State private var trimester: AttendancePeriod?
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0
    @State private var ready = false
    @State private var listFailed = false
    @State private var detailChild: ChildSummary?

    // guided tour
    @AppStorage("edufaso.tour.parentHome.v1") private var tourDone = false
    @State private var coach = CoachMarkRegistry()
    @State private var tourSteps: [CoachMarkStep] = []
    @State private var tourIndex = 0
    @State private var showTour = false
    @State private var tourScheduled = false

    private static let tour: [CoachMarkStep] = [
        CoachMarkStep(
            id: "parent.switcher", icon: "hand.tap.fill",
            title: "Choisissez un enfant",
            message: "Touchez le prénom d’un enfant : toute la page affiche alors son suivi. Le ✓ montre l’enfant affiché."
        ),
        CoachMarkStep(
            id: "parent.stats", icon: "chart.bar.fill",
            title: "L’essentiel en un coup d’œil",
            message: "Moyenne de l’année, présence du trimestre et épreuves de la semaine. Touchez la moyenne pour ouvrir le bulletin, la présence pour le détail."
        ),
        CoachMarkStep(
            id: "parent.watch", icon: "exclamationmark.triangle.fill",
            title: "À surveiller",
            message: "Les absences à justifier et les notes faibles récentes s’affichent ici. Touchez « Voir » pour en savoir plus."
        ),
        CoachMarkStep(
            id: "parent.week", icon: "calendar",
            title: "Cette semaine",
            message: "Interrogations, devoirs et compositions des 7 prochains jours, avec le jour exact. Touchez une ligne pour le détail."
        ),
        CoachMarkStep(
            id: "parent.results", icon: "chart.line.uptrend.xyaxis",
            title: "Résultats",
            message: "Les moyennes de chaque trimestre et les dernières notes. « Bulletin » ouvre le bulletin officiel."
        ),
        CoachMarkStep(
            id: "parent.attendance", icon: "checkmark.seal.fill",
            title: "Assiduité",
            message: "La présence du trimestre, et un carré de couleur par jour de classe sur les 4 dernières semaines."
        ),
        CoachMarkStep(
            id: "parent.quick", icon: "square.grid.3x3.fill",
            title: "Accès rapide",
            message: "Tous les espaces de votre enfant : notes, présences, emploi du temps, cahier de textes, messages…"
        ),
        CoachMarkStep(
            id: "parent.help", icon: "questionmark.circle.fill",
            title: "Revoir ce guide",
            message: "Touchez ce bouton à tout moment pour relancer la visite."
        ),
    ]

    private static let sky = Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)
    private static let softFill = Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)
    private static let childColors: [Color] = [
        EduTheme.teal,
        Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255),
        Color(red: 234 / 255, green: 88 / 255, blue: 12 / 255),
        Color(red: 124 / 255, green: 58 / 255, blue: 237 / 255),
        EduTheme.fasoGreen,
    ]

    // MARK: Derived

    private var selected: ChildSummary? {
        children.first { $0.id == selectedChildId } ?? children.first
    }

    private var home: ParentChildHome? {
        selected.flatMap { homes[$0.id] }
    }

    private var parentFirstName: String {
        if let first = auth.profile?.firstName.trimmingCharacters(in: .whitespaces), !first.isEmpty {
            return first
        }
        return auth.profile?.fullName.split(separator: " ").first.map(String.init) ?? ""
    }

    private func color(for child: ChildSummary) -> Color {
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
                VStack(alignment: .leading, spacing: 22) {
                    if !ready {
                        loadingSkeleton
                    } else if children.isEmpty {
                        hero
                        if listFailed { errorBanner }
                        noChildrenCard
                    } else {
                        hero
                        if unreadMessages > 0 || unreadAnnouncements > 0 { inboxPills }
                        if listFailed || home?.failed == true { errorBanner }
                        if let child = selected {
                            watchCard(child).coachMarkTarget("parent.watch")
                            weekCard(child).coachMarkTarget("parent.week")
                            resultsCard(child).coachMarkTarget("parent.results")
                            attendanceCard(child).coachMarkTarget("parent.attendance")
                            if children.count > 1 { childrenOverview }
                            quickActions(child).coachMarkTarget("parent.quick")
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)
                .padding(.bottom, 32)
                .animation(.easeInOut(duration: 0.2), value: selected?.id)
            }
            .scrollDisabled(showTour)
            .onChange(of: tourIndex) { _, index in
                guard showTour, tourSteps.indices.contains(index) else { return }
                withAnimation(.easeInOut(duration: 0.4)) {
                    scroller.scrollTo(tourSteps[index].id, anchor: .center)
                }
            }
            .onChange(of: showTour) { _, isOn in
                guard isOn, let first = tourSteps.first else { return }
                withAnimation(.easeInOut(duration: 0.4)) { scroller.scrollTo(first.id, anchor: .center) }
            }
        }
        .environment(coach)
        .fullScreenCover(isPresented: $showTour) {
            CoachMarkOverlay(steps: tourSteps, index: $tourIndex, registry: coach) {
                endTour()
            }
            .presentationBackground(.clear)
        }
        .onChange(of: home != nil) { _, loaded in
            if loaded { scheduleFirstTour() }
        }
        .refreshable { await load() }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $detailChild) { child in
            ChildDetailView(child: child)
        }
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && ready { Task { await load() } }
        }
    }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Self.todayCaption(Date()))
                        .font(.caption.weight(.bold))
                        .tracking(0.8)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.75))
                    Text("\(TimeGreeting.current()), \(parentFirstName.isEmpty ? "…" : parentFirstName)")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    Label(heroContext, systemImage: "figure.and.child.holdinghands")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Button {
                    startTour()
                } label: {
                    Image(systemName: "questionmark")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 48, height: 48)
                        .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 15, style: .continuous)
                                .stroke(.white.opacity(0.25), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Revoir le guide de cette page")
                .coachMarkTarget("parent.help")
            }

            if children.count > 1 { childSwitcher.coachMarkTarget("parent.switcher") }

            if let child = selected {
                HStack(spacing: 10) {
                    NavigationLink {
                        BulletinBoard(studentId: child.id, title: "Bulletin")
                    } label: {
                        heroStat(
                            value: home?.annual?.annualAverage.map { Self.format($0, digits: 1) } ?? "—",
                            label: "Moyenne",
                            systemImage: "chart.bar.fill"
                        )
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        StudentAttendanceView(studentIdOverride: child.id)
                    } label: {
                        heroStat(
                            value: home?.attendance?.ratePercent.map { "\($0)%" } ?? "—",
                            label: "Présence",
                            systemImage: "checkmark.seal.fill"
                        )
                    }
                    .buttonStyle(.plain)

                    heroStat(
                        value: home.map { "\($0.upcoming.count)" } ?? "—",
                        label: "Cette semaine",
                        systemImage: "calendar"
                    )
                }
                .redacted(reason: home == nil ? .placeholder : [])
                .coachMarkTarget("parent.stats")
            }
        }
        .padding(20)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                LinearGradient(
                    colors: [EduTheme.navyDark, EduTheme.navy, EduTheme.teal],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Circle()
                    .fill(.white.opacity(0.07))
                    .frame(width: 220, height: 220)
                    .offset(x: 140, y: -90)
                Circle()
                    .fill(.white.opacity(0.05))
                    .frame(width: 140, height: 140)
                    .offset(x: -150, y: 90)
            }
        }
        .overlay(alignment: .bottom) { fasoStripe }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .shadow(color: EduTheme.navy.opacity(0.28), radius: 18, y: 10)
    }

    private var heroContext: String {
        if let child = selected {
            // with a switcher on screen the name is already shown there: keep the class only
            let cls = home?.className ?? child.className
            if children.count > 1 { return cls.map { "Classe · \($0)" } ?? firstName(child) }
            return [firstName(child), cls].compactMap { $0 }.joined(separator: " · ")
        }
        return auth.schools.first?.name ?? "Espace parent"
    }

    /// Segmented control on the hero: a dark track, the selected child on a white pill
    /// that slides across, so it reads as something to tap rather than a label.
    private var childSwitcher: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Choisir un enfant", systemImage: "hand.tap.fill")
                .font(.caption2.weight(.bold))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.75))
                .accessibilityHidden(true)

            Group {
                if children.count <= 3 {
                    HStack(spacing: 4) {
                        ForEach(children) { child in
                            switcherSegment(child, fill: true)
                        }
                    }
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            ForEach(children) { child in
                                switcherSegment(child, fill: false)
                            }
                        }
                    }
                }
            }
            .padding(4)
            .background(.black.opacity(0.22), in: Capsule())
            .overlay(Capsule().stroke(.white.opacity(0.2), lineWidth: 1))
            .sensoryFeedback(.selection, trigger: selectedChildId)
        }
    }

    private func switcherSegment(_ child: ChildSummary, fill: Bool) -> some View {
        let isOn = child.id == selected?.id
        return Button {
            withAnimation(.snappy(duration: 0.28)) { selectedChildId = child.id }
        } label: {
            HStack(spacing: 8) {
                Text(Self.initials(child.fullName))
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(color(for: child), in: Circle())
                Text(firstName(child))
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                if isOn {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.heavy))
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .foregroundStyle(isOn ? EduTheme.ink : .white.opacity(0.9))
            .padding(.leading, 6)
            .padding(.trailing, 12)
            .frame(maxWidth: fill ? .infinity : nil, minHeight: 46)
            .background {
                if isOn {
                    Capsule()
                        .fill(.white)
                        .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
                        .matchedGeometryEffect(id: "selected-child", in: switcherNamespace)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Afficher \(firstName(child))")
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }

    private var fasoStripe: some View {
        HStack(spacing: 0) {
            EduTheme.fasoRed
            EduTheme.fasoYellow
            EduTheme.fasoGreen
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }

    private func heroStat(value: String, label: String, systemImage: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.8))
                .accessibilityHidden(true)
            Text(value)
                .font(.system(size: 26, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(.white)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
                .contentTransition(.numericText())
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.13), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.white.opacity(0.18), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(value) \(label)")
    }

    // MARK: Inbox

    private var inboxPills: some View {
        HStack(spacing: 10) {
            if unreadMessages > 0 {
                NavigationLink { MessagesView() } label: {
                    Label(
                        "\(unreadMessages) message\(unreadMessages > 1 ? "s" : "") non lu\(unreadMessages > 1 ? "s" : "")",
                        systemImage: "envelope.fill"
                    )
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 40)
                    .background(EduTheme.navy, in: Capsule())
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
            if unreadAnnouncements > 0 {
                NavigationLink { MessagesView(announcementsOnly: true) } label: {
                    Label(
                        "\(unreadAnnouncements) annonce\(unreadAnnouncements > 1 ? "s" : "")",
                        systemImage: "megaphone.fill"
                    )
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 40)
                    .background(EduTheme.fasoYellow.opacity(0.18), in: Capsule())
                    .overlay(Capsule().stroke(EduTheme.fasoYellow.opacity(0.5), lineWidth: 1))
                    .foregroundStyle(EduTheme.ink)
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: À surveiller

    private struct WatchItem: Identifiable {
        enum Tone { case danger, warning }
        let id: String
        let tone: Tone
        let systemImage: String
        let title: String
        let detail: String?
    }

    private func watchItems(for child: ChildSummary) -> [WatchItem] {
        guard let home else { return [] }
        var out: [WatchItem] = []
        let absences = home.recentAbsences
        if !absences.isEmpty {
            let detail = absences.prefix(3).map { row in
                [row.matieres?.name, Self.shortDate(row.date)].compactMap { $0 }.joined(separator: " ")
            }.joined(separator: " · ")
            out.append(WatchItem(
                id: "absences",
                tone: .danger,
                systemImage: "person.fill.xmark",
                title: "\(absences.count) absence\(absences.count > 1 ? "s" : "") non justifiée\(absences.count > 1 ? "s" : "")",
                detail: "\(detail) — sur 30 jours"
            ))
        }
        let low = home.lowGrades
        if let first = low.first {
            let value = ParentHomeLoader.scoreOn20(first).map { Self.format($0, digits: 1) } ?? "—"
            out.append(WatchItem(
                id: "low-grades",
                tone: .warning,
                systemImage: "arrow.down.right.circle.fill",
                title: low.count > 1 ? "\(low.count) notes sous 8/20" : "Note sous 8/20",
                detail: "\(first.matieres?.name ?? "Matière") · \(value)/20 — sur 14 jours"
            ))
        }
        return out
    }

    private func watchCard(_ child: ChildSummary) -> some View {
        let items = watchItems(for: child)
        return VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "À surveiller", subtitle: nil) { EmptyView() }

            if home == nil {
                cardLoading
            } else if items.isEmpty {
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.title2)
                        .foregroundStyle(EduTheme.fasoGreen)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Tout va bien pour \(firstName(child))")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(EduTheme.ink)
                        Text("Aucune absence non justifiée ni note faible récente.")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
                .background(EduTheme.fasoGreen.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityElement(children: .combine)
            } else {
                VStack(spacing: 8) {
                    ForEach(items) { item in
                        NavigationLink {
                            if item.id == "absences" {
                                StudentAttendanceView(studentIdOverride: child.id)
                            } else {
                                StudentGradesView(studentIdOverride: child.id)
                            }
                        } label: {
                            watchRow(item)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func watchRow(_ item: WatchItem) -> some View {
        let tint: Color = item.tone == .danger ? EduTheme.fasoRed : Color.orange
        return HStack(spacing: 12) {
            Image(systemName: item.systemImage)
                .font(.body.weight(.bold))
                .foregroundStyle(tint)
                .frame(width: 38, height: 38)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                if let detail = item.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            Text("Voir")
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(tint.opacity(0.2), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    // MARK: Cette semaine

    private func weekCard(_ child: ChildSummary) -> some View {
        let items = home?.upcoming ?? []
        return VStack(alignment: .leading, spacing: 12) {
            sectionHeader(
                title: "Cette semaine",
                subtitle: items.isEmpty ? "7 prochains jours" : "\(items.count) à préparer · 7 prochains jours"
            ) {
                NavigationLink {
                    EvaluationsBrowser(studentId: child.id, type: "interrogation", title: "Interrogations")
                } label: {
                    Text("Tout voir")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }

            if home == nil {
                cardLoading
            } else if items.isEmpty {
                HomePanelEmpty(message: "Rien de prévu pour \(firstName(child)) dans les 7 prochains jours.")
            } else {
                VStack(spacing: 8) {
                    ForEach(items.prefix(5)) { item in
                        NavigationLink {
                            switch item.kind {
                            case .quiz:
                                EvaluationsBrowser(studentId: child.id, type: "interrogation", title: "Interrogations")
                            case .exam:
                                EvaluationsBrowser(studentId: child.id, type: "examen", confirmedOnly: true, title: "Devoirs")
                            case .composition:
                                StudentCompositionsView(studentIdOverride: child.id)
                            }
                        } label: {
                            upcomingRow(item)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func upcomingRow(_ item: ParentUpcomingItem) -> some View {
        let badge: (title: String, color: Color) = {
            switch item.kind {
            case .quiz: return ("Interro", Self.sky)
            case .exam: return ("Devoir", EduTheme.navy)
            case .composition: return ("Compo", EduTheme.teal)
            }
        }()

        return HStack(spacing: 12) {
            dateBlock(item.day, color: badge.color)
            VStack(alignment: .leading, spacing: 4) {
                Text(badge.title)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(badge.color)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(badge.color.opacity(0.12), in: Capsule())
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let subject = item.subject, !subject.isEmpty, subject != item.title {
                    Text(subject)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 6) {
                if let day = item.day, let relative = Self.relativeDay(day) {
                    Text(relative.text)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(relative.urgent ? EduTheme.fasoRed : EduTheme.muted)
                }
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.muted.opacity(0.6))
                    .accessibilityHidden(true)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Self.softFill))
        .accessibilityElement(children: .combine)
    }

    private func dateBlock(_ iso: String?, color: Color) -> some View {
        let parts = iso?.split(separator: "-") ?? []
        let dayNum = parts.count == 3 ? String(Int(parts[2]) ?? 0) : "—"
        let month: String = {
            guard parts.count == 3, let m = Int(parts[1]), (1...12).contains(m) else { return "" }
            return Self.monthAbbr[m - 1]
        }()
        return VStack(spacing: 0) {
            Text(month)
                .font(.system(size: 9, weight: .heavy))
                .tracking(0.5)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 3)
                .background(color)
            Text(dayNum)
                .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(EduTheme.ink)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.white)
        }
        .frame(width: 46, height: 50)
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(color.opacity(0.3), lineWidth: 1)
        )
        .accessibilityHidden(true)
    }

    // MARK: Résultats

    private func trimesterAverage(_ n: Int) -> Double? {
        home?.annual?.trimesters?
            .first { $0.periodLabel?.trimmingCharacters(in: .whitespaces) == "Trimestre \(n)" }?
            .generalAverage
    }

    private var passLabel: String {
        if let passed = home?.annual?.passed { return passed ? "Admis" : "Ajourné" }
        if let avg = home?.annual?.annualAverage { return avg >= 10 ? "Admis" : "Ajourné" }
        return "/ 20"
    }

    private func resultsCard(_ child: ChildSummary) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Résultats", subtitle: "Moyennes et dernières notes") {
                NavigationLink {
                    BulletinBoard(studentId: child.id, title: "Bulletin")
                } label: {
                    Text("Bulletin")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }

            HStack(spacing: 8) {
                ForEach(1...3, id: \.self) { n in
                    averageChip(label: "T\(n)", value: trimesterAverage(n), footer: "/ 20", highlight: false)
                }
                averageChip(label: "ANNÉE", value: home?.annual?.annualAverage, footer: passLabel, highlight: true)
            }
            .redacted(reason: home == nil ? .placeholder : [])

            if home == nil {
                cardLoading
            } else if let grades = home?.recentGrades, !grades.isEmpty {
                VStack(spacing: 8) {
                    ForEach(grades.prefix(3)) { grade in
                        NavigationLink { StudentGradesView(studentIdOverride: child.id) } label: {
                            gradeRow(grade)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                HomePanelEmpty(message: "Les notes publiées apparaîtront ici.")
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func averageChip(label: String, value: Double?, footer: String, highlight: Bool) -> some View {
        let tone = Self.tone(value)
        return VStack(spacing: 4) {
            Text(label)
                .font(.caption2.weight(.bold))
                .tracking(0.4)
                .foregroundStyle(highlight ? EduTheme.teal : EduTheme.muted)
            Text(value.map { Self.format($0, digits: 1) } ?? "—")
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(value == nil ? EduTheme.muted : tone)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(footer)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(highlight && value != nil ? tone : EduTheme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(highlight ? EduTheme.brand50 : Self.softFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(highlight ? EduTheme.teal.opacity(0.2) : Color.clear, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    private func gradeRow(_ grade: GradeRow) -> some View {
        let on20 = ParentHomeLoader.scoreOn20(grade)
        let swatch = SubjectPalette.swatch(for: grade.matieres?.name)
        let tint = grade.isAbsent == true ? Color.orange : Self.tone(on20)

        return HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(swatch.border)
                .frame(width: 4, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(grade.matieres?.name ?? "Matière")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                Text(gradeCaption(grade))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if grade.isAbsent == true {
                Text("Absent")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(tint.opacity(0.12), in: Capsule())
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(on20.map { Self.format($0, digits: 1) } ?? "—")
                        .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(tint)
                    Text("/20")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(EduTheme.muted)
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Self.softFill))
        .accessibilityElement(children: .combine)
    }

    private func gradeCaption(_ grade: GradeRow) -> String {
        let date = grade.createdAt.map { Self.shortDate(String($0.prefix(10))) }
        return [grade.evaluations?.title, date]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    // MARK: Assiduité

    private func attendanceCard(_ child: ChildSummary) -> some View {
        let totals = home?.attendance
        return VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Assiduité", subtitle: trimester?.label ?? "Trimestre en cours") {
                NavigationLink {
                    StudentAttendanceView(studentIdOverride: child.id)
                } label: {
                    Text("Détails")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }

            if home == nil {
                cardLoading
            } else {
                HStack(spacing: 14) {
                    attendanceRing(totals?.ratePercent)
                    VStack(spacing: 8) {
                        attendanceFigure(totals?.absent, label: "Absences", color: EduTheme.fasoRed)
                        attendanceFigure(totals?.late, label: "Retards", color: Color.orange)
                        attendanceFigure(totals?.excused, label: "Justifiées", color: Self.sky)
                    }
                }

                if let strip = home?.strip, !strip.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("4 DERNIÈRES SEMAINES")
                            .font(.caption2.weight(.bold))
                            .tracking(0.5)
                            .foregroundStyle(EduTheme.muted)
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 10), spacing: 5) {
                            ForEach(strip) { day in
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .fill(Self.statusColor(day.status))
                                    .frame(height: 18)
                                    .accessibilityLabel("\(Self.shortDate(day.date)) \(Self.statusLabel(day.status))")
                            }
                        }
                        HStack(spacing: 12) {
                            legendDot("Présent", color: Self.statusColor("present"))
                            legendDot("Absent", color: Self.statusColor("absent"))
                            legendDot("Retard", color: Self.statusColor("late"))
                            legendDot("Justifié", color: Self.statusColor("excused"))
                        }
                        .accessibilityHidden(true)
                    }
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func attendanceRing(_ rate: Int?) -> some View {
        let value = Double(rate ?? 0) / 100
        let tint: Color = {
            guard let rate else { return EduTheme.muted }
            if rate >= 95 { return EduTheme.fasoGreen }
            if rate >= 85 { return Color.orange }
            return EduTheme.fasoRed
        }()
        return ZStack {
            Circle()
                .stroke(Self.softFill, lineWidth: 10)
            Circle()
                .trim(from: 0, to: value)
                .stroke(tint, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(rate.map { "\($0)%" } ?? "—")
                    .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(EduTheme.ink)
                Text("présence")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
            }
        }
        .frame(width: 104, height: 104)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rate.map { "Présence \($0) pour cent" } ?? "Présence inconnue")
    }

    private func attendanceFigure(_ value: Int?, label: String, color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(EduTheme.ink)
            Spacer()
            Text(value.map(String.init) ?? "—")
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(EduTheme.ink)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 30)
        .background(Self.softFill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func legendDot(_ label: String, color: Color) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(label)
                .font(.caption2)
                .foregroundStyle(EduTheme.muted)
        }
    }

    // MARK: Mes enfants

    private var childrenOverview: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "Mes enfants", subtitle: "Touchez un enfant pour afficher son suivi") { EmptyView() }
            VStack(spacing: 8) {
                ForEach(children) { child in
                    childRow(child)
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func childRow(_ child: ChildSummary) -> some View {
        let data = homes[child.id]
        let isOn = child.id == selected?.id
        return HStack(spacing: 12) {
            Button {
                withAnimation(.snappy(duration: 0.28)) { selectedChildId = child.id }
            } label: {
                HStack(spacing: 12) {
                    Text(Self.initials(child.fullName))
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 42, height: 42)
                        .background(color(for: child), in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(child.fullName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.ink)
                            .lineLimit(1)
                        Text(isOn ? "Affiché" : (data?.className ?? child.className ?? "Classe non renseignée"))
                            .font(.caption.weight(isOn ? .bold : .regular))
                            .foregroundStyle(isOn ? color(for: child) : EduTheme.muted)
                    }
                    Spacer(minLength: 4)
                    miniStat(data?.annual?.annualAverage.map { Self.format($0, digits: 1) } ?? "—", label: "moy.")
                    miniStat(data?.attendance?.ratePercent.map { "\($0)%" } ?? "—", label: "prés.")
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? .isSelected : [])

            Button {
                detailChild = child
            } label: {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .frame(width: 32, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ouvrir la fiche de \(firstName(child))")
        }
        .padding(.leading, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(isOn ? color(for: child).opacity(0.08) : Self.softFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(isOn ? color(for: child).opacity(0.35) : .clear, lineWidth: 1)
        )
    }

    private func miniStat(_ value: String, label: String) -> some View {
        VStack(spacing: 0) {
            Text(value)
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(EduTheme.ink)
            Text(label)
                .font(.caption2)
                .foregroundStyle(EduTheme.muted)
        }
        .frame(minWidth: 40)
    }

    // MARK: Accès rapide

    private func quickActions(_ child: ChildSummary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "Accès rapide · \(firstName(child))", subtitle: nil) { EmptyView() }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                actionLink("Notes", systemImage: "chart.bar.fill", color: EduTheme.navy) {
                    StudentGradesView(studentIdOverride: child.id)
                }
                actionLink("Présences", systemImage: "checkmark.circle.fill", color: EduTheme.fasoGreen) {
                    StudentAttendanceView(studentIdOverride: child.id)
                }
                actionLink("Interrogations", systemImage: "questionmark.circle.fill", color: Self.sky) {
                    EvaluationsBrowser(studentId: child.id, type: "interrogation", title: "Interrogations")
                }
                actionLink("Devoirs", systemImage: "doc.text.fill", color: Self.sky) {
                    EvaluationsBrowser(studentId: child.id, type: "examen", confirmedOnly: true, title: "Devoirs")
                }
                actionLink("Compositions", systemImage: "doc.on.doc.fill", color: EduTheme.teal) {
                    StudentCompositionsView(studentIdOverride: child.id)
                }
                actionLink("Bulletin", systemImage: "chart.bar.doc.horizontal.fill", color: Color.orange) {
                    BulletinBoard(studentId: child.id, title: "Bulletin")
                }
                actionLink("Emploi du temps", systemImage: "calendar", color: EduTheme.navy) {
                    TimetableView(mode: .student, studentIdOverride: child.id)
                }
                actionLink("Cahier de textes", systemImage: "book.closed.fill", color: EduTheme.teal) {
                    CahierFeedView(studentId: child.id)
                }
                actionLink("Messages", systemImage: "envelope.fill", color: EduTheme.fasoGreen, badge: unreadMessages) {
                    MessagesView()
                }
            }
        }
    }

    private func actionLink<Destination: View>(
        _ title: String,
        systemImage: String,
        color: Color,
        badge: Int = 0,
        @ViewBuilder destination: () -> Destination
    ) -> some View {
        NavigationLink(destination: destination) {
            VStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(
                        LinearGradient(colors: [color.opacity(0.85), color], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                    .shadow(color: color.opacity(0.3), radius: 6, y: 3)
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Text(badge > 99 ? "99+" : "\(badge)")
                                .font(.caption2.weight(.heavy).monospacedDigit())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 20, minHeight: 20)
                                .background(EduTheme.fasoRed, in: Capsule())
                                .overlay(Capsule().stroke(.white, lineWidth: 2))
                                .offset(x: 8, y: -8)
                        }
                    }
                    .accessibilityHidden(true)
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, minHeight: 104)
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
            .modifier(HomeCardStyle(cornerRadius: 18))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(badge > 0 ? "\(title), \(badge) non lus" : title)
            .accessibilityAddTraits(.isButton)
        }
        .buttonStyle(.plain)
    }

    // MARK: Shared pieces

    private func sectionHeader<Trailing: View>(
        title: String,
        subtitle: String?,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(EduTheme.muted)
                }
            }
            Spacer()
            trailing()
        }
    }

    private var cardLoading: some View {
        HStack {
            Spacer()
            ProgressView()
            Spacer()
        }
        .frame(minHeight: 60)
    }

    private var noChildrenCard: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.2.slash")
                .font(.largeTitle)
                .foregroundStyle(EduTheme.muted)
                .accessibilityHidden(true)
            Text("Aucun enfant lié à ce compte pour le moment.")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(EduTheme.ink)
                .multilineTextAlignment(.center)
            Text("Demandez à l’école de rattacher votre enfant à votre compte.")
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .modifier(HomeCardStyle())
    }

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 18) {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(EduTheme.navy.opacity(0.15))
                .frame(maxWidth: .infinity, minHeight: 210)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 22, style: .continuous)
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
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Color.orange)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text("Certaines données n’ont pas pu être chargées.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("Vérifiez votre connexion puis réessayez.")
                    .font(.footnote)
                    .foregroundStyle(EduTheme.muted)
                Button("Réessayer") {
                    Task { await load() }
                }
                .font(.subheadline.weight(.bold))
                .foregroundStyle(EduTheme.teal)
                .frame(minHeight: 44, alignment: .leading)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.orange.opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: Helpers

    private static let monthAbbr = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"]
    private static let monthShort = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

    static func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    private static func todayCaption(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "EEEE d MMMM"
        return formatter.string(from: date)
    }

    /// "2026-05-22" → "22 mai"
    private static func shortDate(_ iso: String) -> String {
        let parts = iso.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), (1...12).contains(m), let d = Int(parts[2]) else { return iso }
        return "\(d) \(monthShort[m - 1])"
    }

    private static func tone(_ value: Double?) -> Color {
        guard let value else { return EduTheme.muted }
        if value >= 12 { return EduTheme.fasoGreen }
        if value >= 10 { return sky }
        return EduTheme.fasoRed
    }

    private static func statusColor(_ status: String) -> Color {
        switch status {
        case "absent": return EduTheme.fasoRed
        case "late": return EduTheme.fasoYellow
        case "excused": return sky
        default: return EduTheme.fasoGreen.opacity(0.75)
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

    private static func relativeDay(_ iso: String) -> (text: String, urgent: Bool)? {
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        guard let date = df.date(from: iso), let todayDate = df.date(from: EduDates.day()) else { return nil }
        let days = Calendar.current.dateComponents([.day], from: todayDate, to: date).day ?? 0
        switch days {
        case ..<0: return ("En cours", false)
        case 0: return ("Aujourd’hui", true)
        case 1: return ("Demain", true)
        default: return ("Dans \(days) j", days <= 3)
        }
    }

    // MARK: Guided tour

    /// First visit: once the selected child's cards are on screen, run the tour by itself.
    private func scheduleFirstTour() {
        guard !tourDone, !tourScheduled, !showTour else { return }
        tourScheduled = true
        Task {
            try? await Task.sleep(for: .milliseconds(900))
            startTour()
        }
    }

    private func startTour() {
        let steps = coach.steps(Self.tour)
        guard !steps.isEmpty else { return }
        tourSteps = steps
        tourIndex = 0
        // the overlay fades itself in; no slide-up sheet animation
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { showTour = true }
    }

    private func endTour() {
        tourDone = true
        var transaction = Transaction()
        transaction.disablesAnimations = true
        // tourIndex is left as is: resetting it here briefly showed step 1 again
        // while the overlay was closing (startTour resets it for the next run)
        withTransaction(transaction) { showTour = false }
    }

    // MARK: Loading

    private func load() async {
        let api = EduAPI()
        var failed = false

        async let childrenTask = api.fetchChildren()
        async let periodTask = api.fetchAttendancePeriodContext()

        if let uid = auth.userId, let inbox = try? await api.fetchInbox(userId: uid, kind: .all, limit: 80) {
            unreadMessages = inbox.filter { $0.readAt == nil && $0.isAnnouncement != true }.count
            unreadAnnouncements = inbox.filter { $0.readAt == nil && $0.isAnnouncement == true }.count
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
                            .font(.headline.weight(.bold))
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
                    NavigationLink("Notes") { StudentGradesView(studentIdOverride: child.id) }
                    NavigationLink("Présences") { StudentAttendanceView(studentIdOverride: child.id) }
                    NavigationLink("Devoirs") {
                        EvaluationsBrowser(studentId: child.id, type: "examen", confirmedOnly: true, title: "Devoirs")
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
