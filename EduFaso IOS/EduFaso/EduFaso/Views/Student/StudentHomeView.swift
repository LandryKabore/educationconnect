import SwiftUI

/// Student « Accueil », like the web StudentHome: teal banner with three key figures and the next class,
/// homework for tomorrow, bulletin averages, latest grades, today's classes, homework, exams,
/// compositions, announcements, messages and quick links.
struct StudentHomeView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.scenePhase) private var scenePhase

    @State private var className: String?
    @State private var classId: String?
    @State private var annual: AnnualAverageResult?
    @State private var recentGrades: [GradeRow] = []
    @State private var attendanceRate: Int?
    @State private var absencesCount = 0
    @State private var pendingHomework: [HomeworkItem] = []
    @State private var upcomingExams: [EvaluationRow] = []
    @State private var upcomingCompositions: [StudentCompositionSession] = []
    /// Every composition session of the class (the running one swaps the timetable for its papers).
    @State private var compositions: [StudentCompositionSession] = []
    @State private var weekSlots: [TimetableSlot] = []
    @State private var latestMessages: [MessageRow] = []
    @State private var latestAnnouncements: [MessageRow] = []
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0
    @State private var ready = false
    @State private var loadFailed = false

    @State private var tour = TabTour(key: "accueil-eleve")
    @State private var coach = CoachMarkRegistry()

    private static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    private static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)
    private static let brand50 = Color(red: 240 / 255, green: 253 / 255, blue: 250 / 255)
    private static let softFill = Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)
    private static let amber = Color(red: 217 / 255, green: 119 / 255, blue: 6 / 255)
    private static let emerald = Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)

    struct HomeworkItem: Identifiable, Hashable {
        let id: String
        let title: String
        let subject: String?
        let due: String?
    }

    // MARK: - Derived

    private var firstName: String {
        if let first = auth.profile?.firstName.trimmingCharacters(in: .whitespaces), !first.isEmpty { return first }
        return auth.profile?.fullName.split(separator: " ").first.map(String.init) ?? ""
    }

    private var toPrepare: Int { pendingHomework.count + upcomingExams.count + upcomingCompositions.count }

    /// Session running today, or starting within a week: shown first on the Accueil.
    private var activeComposition: StudentCompositionSession? { CompositionSchedule.current(in: compositions) }

    private var tourSteps: [CoachMarkStep] {
        let compoStep = CoachMarkStep(
            id: "home.compo", icon: "pencil.and.list.clipboard",
            title: "Compositions",
            message: "Pendant les compositions, tes épreuves du jour s’affichent ici avec l’heure. Ton emploi du temps montre les épreuves à la place des cours."
        )
        let steps: [CoachMarkStep] = [
            CoachMarkStep(
                id: "home.stats", icon: "chart.bar.fill",
                title: "Tes chiffres clés",
                message: "Ta moyenne de l’année, ton taux de présence et ce qu’il te reste à préparer. Touche un chiffre pour voir le détail."
            ),
            CoachMarkStep(
                id: "home.next", icon: "clock.fill",
                title: "Maintenant",
                message: "Le cours en cours et le temps qui reste, ou ton prochain cours."
            ),
            CoachMarkStep(
                id: "home.tomorrow", icon: "list.clipboard.fill",
                title: "Devoirs pour demain",
                message: "Tes exercices de maison à rendre demain, puis ceux des jours suivants. Le bouton ouvre tous tes exercices."
            ),
            CoachMarkStep(
                id: "home.bulletin", icon: "doc.text.fill",
                title: "Bulletin",
                message: "Ta moyenne de chaque trimestre et de l’année."
            ),
            CoachMarkStep(
                id: "home.today", icon: "calendar",
                title: "Aujourd’hui",
                message: "Tes cours du jour : ceux qui sont finis sont cochés, le cours en cours est en vert."
            ),
            CoachMarkStep(
                id: "home.work", icon: "checklist",
                title: "À préparer",
                message: "Les examens confirmés et les compositions qui arrivent."
            ),
            CoachMarkStep(
                id: "home.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: "Touche ce bouton à tout moment pour relancer la visite."
            ),
        ]
        guard activeComposition != nil else { return steps }
        var withCompo = steps
        withCompo.insert(compoStep, at: min(2, withCompo.count))
        return withCompo
    }

    // MARK: - Body

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if ready {
                        TimelineView(.everyMinute) { context in
                            banner(now: context.date)
                        }
                        if loadFailed { errorBanner }
                        if let compo = activeComposition {
                            TimelineView(.everyMinute) { context in
                                compositionCard(compo, now: context.date)
                            }
                            .coachMarkTarget("home.compo")
                        }
                        tomorrowPanel.coachMarkTarget("home.tomorrow")
                        bulletinPanel.coachMarkTarget("home.bulletin")
                        gradesPanel
                        TimelineView(.everyMinute) { context in
                            todayPanel(now: context.date)
                        }
                        .coachMarkTarget("home.today")
                        examsPanel.coachMarkTarget("home.work")
                        compositionsPanel
                        announcementsPanel
                        messagesPanel
                        quickLinks
                    } else {
                        loadingSkeleton
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
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
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && ready { Task { await load() } }
        }
    }

    // MARK: - Banner

    private func banner(now: Date) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Self.todayCaption(now))
                            .font(.caption.weight(.semibold))
                            .tracking(1.4)
                            .textCase(.uppercase)
                            .foregroundStyle(.white.opacity(0.7))
                        Text("\(TimeGreeting.current(at: now))\(firstName.isEmpty ? "" : ", \(firstName)") 👋")
                            .font(.system(size: 28, weight: .bold))
                            .tracking(-0.4)
                            .foregroundStyle(.white)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        Label(className ?? "Sans classe", systemImage: "graduationcap.fill")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer(minLength: 0)
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("home.help")
                }

                if unreadMessages > 0 || unreadAnnouncements > 0 {
                    HStack(spacing: 8) {
                        if unreadMessages > 0 {
                            NavigationLink { MessagesView() } label: {
                                bannerPill(
                                    "\(unreadMessages) message\(unreadMessages > 1 ? "s" : "") non lu\(unreadMessages > 1 ? "s" : "")",
                                    icon: "message.fill", yellow: false
                                )
                            }
                            .buttonStyle(.plain)
                        }
                        if unreadAnnouncements > 0 {
                            NavigationLink { MessagesView(announcementsOnly: true) } label: {
                                bannerPill(
                                    "\(unreadAnnouncements) annonce\(unreadAnnouncements > 1 ? "s" : "")",
                                    icon: "bell.fill", yellow: true
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                HStack(spacing: 8) {
                    NavigationLink { BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin") } label: {
                        bannerStat(
                            label: "Moyenne",
                            value: annual?.annualAverage.map { Self.format($0, digits: 1) } ?? "—",
                            hint: annual?.annualAverage != nil
                                ? Self.passDecision(annual) + (annual?.complete == false ? " · provisoire" : "")
                                : "Pas de notes"
                        )
                    }
                    .buttonStyle(.plain)
                    NavigationLink { StudentAttendanceView() } label: {
                        bannerStat(
                            label: "Présence",
                            value: attendanceRate.map { "\($0)%" } ?? "—",
                            hint: attendanceRate != nil ? "\(absencesCount) absence\(absencesCount > 1 ? "s" : "")" : "Aucune saisie"
                        )
                    }
                    .buttonStyle(.plain)
                    NavigationLink { ExercisesBoardView() } label: {
                        bannerStat(label: "À préparer", value: "\(toPrepare)", hint: toPrepare > 0 ? "à venir" : "Rien à rendre")
                    }
                    .buttonStyle(.plain)
                }
                .coachMarkTarget("home.stats")

                nextClassCard(now: now).coachMarkTarget("home.next")
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

    private func bannerPill(_ text: String, icon: String, yellow: Bool) -> some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                (yellow ? EduTheme.fasoYellow.opacity(0.25) : Color.white.opacity(0.15)),
                in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(yellow ? EduTheme.fasoYellow.opacity(0.4) : .white.opacity(0.2), lineWidth: 1)
            )
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
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(hint)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    // MARK: Next class (web NextClassCard)

    private struct Focus {
        let slot: TimetableSlot
        let current: Bool
        let dayLabel: String
        let laterDay: Bool
    }

    private func scheduleFocus(now: Date) -> Focus? {
        guard !weekSlots.isEmpty else { return nil }
        let nowMin = Self.minutes(of: now)
        let todayDow = EduDates.weekday(now)
        let todayList = weekSlots.filter { $0.dayOfWeek == todayDow }.sorted { $0.startTime < $1.startTime }
        if let current = todayList.first(where: { Self.minutes($0.startTime) <= nowMin && nowMin < Self.minutes($0.endTime) }) {
            return Focus(slot: current, current: true, dayLabel: Self.weekdayName(todayDow), laterDay: false)
        }
        if let next = todayList.first(where: { Self.minutes($0.startTime) > nowMin }) {
            return Focus(slot: next, current: false, dayLabel: Self.weekdayName(todayDow), laterDay: false)
        }
        for offset in 1...7 {
            let day = ((todayDow - 1 + offset) % 7) + 1
            if let first = weekSlots.filter({ $0.dayOfWeek == day }).min(by: { $0.startTime < $1.startTime }) {
                return Focus(slot: first, current: false, dayLabel: Self.weekdayName(day), laterDay: true)
            }
        }
        return nil
    }

    private func nextClassCard(now: Date) -> some View {
        let focus = scheduleFocus(now: now)
        let nowMin = Self.minutes(of: now)
        return NavigationLink { TimetableView(mode: .student) } label: {
            VStack(alignment: .leading, spacing: 8) {
                if let focus {
                    HStack {
                        Text(focus.current ? "MAINTENANT" : (CompositionSchedule.isComposition(focus.slot) ? "PROCHAINE ÉPREUVE" : "PROCHAIN COURS") + (focus.laterDay ? " · \(focus.dayLabel.uppercased())" : ""))
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(0.8)
                            .foregroundStyle(.white.opacity(0.7))
                        Spacer()
                        if focus.current {
                            Text("EN COURS")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Self.emerald, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                        }
                    }
                    Text(focus.slot.matieres?.name ?? "Cours")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text([Self.timeRange(focus.slot), Self.formatRoom(focus.slot.room)].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                    if focus.current {
                        let start = Self.minutes(focus.slot.startTime), end = Self.minutes(focus.slot.endTime)
                        let fraction = end > start ? Double(nowMin - start) / Double(end - start) : 0
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Rectangle().fill(.white.opacity(0.2))
                                Rectangle().fill(.white).frame(width: geo.size.width * min(max(fraction, 0), 1))
                            }
                        }
                        .frame(height: 5)
                        .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
                        Text("Il reste \(Self.duration(end - nowMin))")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.85))
                    } else if !focus.laterDay {
                        Text("Dans \(Self.duration(Self.minutes(focus.slot.startTime) - nowMin))")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                } else {
                    Text("MAINTENANT")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(0.8)
                        .foregroundStyle(.white.opacity(0.7))
                    Text("Pas de cours prévu cette semaine")
                        .font(.headline)
                        .foregroundStyle(.white)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Panels

    /// Homework due tomorrow, then later: everything from Exercices de maison
    /// (exercises created by teachers + the "exercice de maison" written in a lesson).
    @ViewBuilder private var tomorrowPanel: some View {
        let tomorrow = Self.dayOffset(1)
        let forTomorrow = pendingHomework.filter { $0.due == tomorrow }
        let later = pendingHomework.filter { $0.due != tomorrow }
        panel(
            icon: "list.clipboard",
            title: "Mes devoirs pour demain",
            subtitle: "Exercices de maison",
            actionTitle: "Voir les exercices",
            destination: { ExercisesBoardView() }
        ) {
            if pendingHomework.isEmpty {
                panelEmpty("Aucun exercice à rendre pour le moment.")
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    if forTomorrow.isEmpty {
                        Text("Rien à rendre pour demain.")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    } else {
                        homeworkSection("Pour demain", forTomorrow, tone: Self.amber)
                    }
                    if !later.isEmpty { homeworkSection("Plus tard", Array(later.prefix(3)), tone: EduTheme.muted) }
                }
            }
        }
    }

    private func homeworkSection(_ title: String, _ items: [HomeworkItem], tone: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(title).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Text("\(items.count)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(tone)
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(tone.opacity(0.12), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.subject ?? "Matière")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    Text(item.title)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(2)
                    if let due = item.due, due != Self.dayOffset(1) {
                        Text("Pour le \(Self.longDate(due))")
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

    private var bulletinPanel: some View {
        let trimesters = annual?.trimesters ?? []
        let labels = ["Trimestre 1", "Trimestre 2", "Trimestre 3"]
        return panel(
            icon: "doc.text",
            title: "Bulletin · moyennes",
            subtitle: "Trimestres et moyenne annuelle",
            actionTitle: "Voir mon bulletin",
            destination: { BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin") }
        ) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(0..<3, id: \.self) { i in
                    let value = trimesters.first { $0.periodLabel == labels[i] }?.generalAverage
                        ?? (trimesters.indices.contains(i) ? trimesters[i].generalAverage : nil)
                    averageTile(labels[i], value: value, footer: "/ 20", highlight: false)
                }
                averageTile(
                    "Année",
                    value: annual?.annualAverage,
                    footer: annual?.annualAverage != nil ? Self.passDecision(annual) : "/ 20",
                    highlight: true
                )
            }
        }
    }

    private func averageTile(_ label: String, value: Double?, footer: String, highlight: Bool) -> some View {
        VStack(spacing: 2) {
            Text(label.uppercased())
                .font(.caption2.weight(.semibold))
                .tracking(0.5)
                .foregroundStyle(highlight ? EduTheme.teal : EduTheme.muted)
            Text(value.map { Self.format($0, digits: 1) } ?? "—")
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(Self.averageColor(value))
            Text(footer)
                .font(.caption2)
                .foregroundStyle(highlight ? EduTheme.teal.opacity(0.8) : EduTheme.subtle)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(highlight ? Self.brand50 : Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .stroke(highlight ? EduTheme.teal.opacity(0.2) : .clear, lineWidth: 1)
        )
    }

    private var gradesPanel: some View {
        panel(
            icon: "chart.line.uptrend.xyaxis",
            title: "Dernières notes",
            subtitle: "Tes résultats les plus récents",
            actionTitle: "Voir toutes les notes",
            destination: { StudentGradesView() }
        ) {
            if recentGrades.isEmpty {
                panelEmpty("Aucune note disponible pour le moment.")
            } else {
                VStack(spacing: 8) {
                    ForEach(recentGrades.prefix(4)) { g in
                        let v = Self.scoreOn20(g)
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(g.matieres?.name ?? "Matière")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                    .lineLimit(1)
                                Text(g.periodLabel ?? "")
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            Spacer(minLength: 8)
                            if g.isAbsent == true {
                                Text("Absent").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.muted)
                            } else {
                                (Text(v.map { Self.format($0, digits: 1) } ?? "—")
                                    .font(.title3.weight(.bold).monospacedDigit())
                                    .foregroundStyle(Self.gradeColor(v))
                                 + Text(" / 20").font(.caption.weight(.medium)).foregroundStyle(EduTheme.subtle))
                            }
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
            }
        }
    }

    private func todayPanel(now: Date) -> some View {
        let todayDow = EduDates.weekday(now)
        let todaySlots = weekSlots.filter { $0.dayOfWeek == todayDow }.sorted { $0.startTime < $1.startTime }
        let focus = scheduleFocus(now: now)
        let nowMin = Self.minutes(of: now)
        let subtitle: String = {
            if focus?.current == true { return "Cours en cours mis en avant" }
            if let focus, focus.laterDay { return "Pas de cours aujourd’hui · prochain : \(focus.dayLabel)" }
            if focus != nil { return "Prochain cours mis en avant" }
            return "Tes cours du jour"
        }()
        return panel(
            icon: "calendar",
            title: "Aujourd’hui · \(Self.weekdayName(todayDow))",
            subtitle: subtitle,
            actionTitle: "Emploi du temps",
            destination: { TimetableView(mode: .student) }
        ) {
            if todaySlots.isEmpty && focus == nil {
                panelEmpty("Pas de cours prévu cette semaine.")
            } else if todaySlots.isEmpty, let focus {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Aucun cours aujourd’hui — voici le prochain.")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(EduTheme.muted)
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(focus.slot.matieres?.name ?? "Cours")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.ink)
                            Text("\(focus.dayLabel) · \(Self.timeRange(focus.slot))")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                        Spacer()
                    }
                    .padding(12)
                    .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(todaySlots.enumerated()), id: \.element.id) { index, s in
                        let start = Self.minutes(s.startTime), end = Self.minutes(s.endTime)
                        let done = end <= nowMin
                        let current = start <= nowMin && nowMin < end
                        let last = index == todaySlots.count - 1
                        HStack(alignment: .top, spacing: 14) {
                            ZStack(alignment: .top) {
                                if !last {
                                    Rectangle()
                                        .fill(done ? Self.emerald.opacity(0.3) : EduTheme.border)
                                        .frame(width: 2)
                                        .padding(.top, 24)
                                }
                                ZStack {
                                    if done {
                                        Circle().fill(Self.emerald.opacity(0.15))
                                        Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Self.emerald)
                                    } else if current {
                                        Circle().fill(Self.emerald)
                                        Circle().fill(.white).frame(width: 8, height: 8)
                                    } else {
                                        Circle().fill(.white)
                                        Circle().stroke(EduTheme.borderStrong, lineWidth: 2)
                                    }
                                }
                                .frame(width: 24, height: 24)
                            }
                            .frame(width: 24)
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(s.matieres?.name ?? "Cours")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(done ? EduTheme.subtle : EduTheme.ink)
                                            .lineLimit(1)
                                        if current {
                                            Text("EN COURS")
                                                .font(.system(size: 9, weight: .bold))
                                                .foregroundStyle(.white)
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .background(Self.emerald, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                                        }
                                    }
                                    if let room = Self.formatRoom(s.room) {
                                        Text(room).font(.caption).foregroundStyle(done ? EduTheme.subtle : EduTheme.muted)
                                    }
                                }
                                Spacer(minLength: 8)
                                Text(Self.timeRange(s))
                                    .font(.caption.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(done ? EduTheme.subtle : EduTheme.ink.opacity(0.75))
                            }
                            .padding(.bottom, last ? 0 : 18)
                        }
                    }
                }
            }
        }
    }


    private var examsPanel: some View {
        panel(
            icon: "doc.text.magnifyingglass",
            title: "Prochains examens",
            subtitle: "Confirmés par l’administration",
            actionTitle: "Voir les examens",
            destination: { ExamsBoardView() }
        ) {
            if upcomingExams.isEmpty {
                panelEmpty("Aucun examen confirmé pour le moment.")
            } else {
                VStack(spacing: 8) {
                    ForEach(upcomingExams) { e in
                        let time = [e.startTime, e.endTime].compactMap { $0.map { String($0.prefix(5)) } }.joined(separator: "–")
                        workRow(
                            title: e.title?.isEmpty == false ? e.title! : (e.matieres?.name ?? "Examen"),
                            subject: e.matieres?.name,
                            day: (e.evalDate ?? e.dueDate).map { String($0.prefix(10)) },
                            detail: time.isEmpty ? nil : time
                        )
                    }
                }
            }
        }
    }

    // MARK: - Composition (main widget while it runs)

    private static let compoText = Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255)
    private static let compoBg = Color(red: 254 / 255, green: 243 / 255, blue: 199 / 255)

    private func compositionCard(_ s: StudentCompositionSession, now: Date) -> some View {
        let today = EduDates.day(now)
        let nowMin = Self.minutes(of: now)
        let running = CompositionSchedule.session(on: today, in: [s]) != nil
        let start = String((s.startsOn ?? "").prefix(10))
        let daysLeft = Self.daysBetween(today, start)
        let dated = s.papers.filter { $0.evalDate != nil }
            .sorted { (($0.evalDate ?? "") + ($0.startTime ?? "")) < (($1.evalDate ?? "") + ($1.startTime ?? "")) }
        let todays = dated.filter { String(($0.evalDate ?? "").prefix(10)) == today }
        let later = dated.filter { String(($0.evalDate ?? "").prefix(10)) > today }
        let range = [s.startsOn, s.endsOn].compactMap { $0.map { Self.shortDate(String($0.prefix(10))) } }.joined(separator: " – ")

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "pencil.and.list.clipboard")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Self.amber)
                    .frame(width: 34, height: 34)
                    .background(Self.compoBg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(running ? "COMPOSITIONS EN COURS" : (daysLeft <= 1 ? "COMPOSITIONS DEMAIN" : "COMPOSITIONS DANS \(daysLeft) JOURS"))
                        .font(.caption2.weight(.bold))
                        .tracking(0.5)
                        .foregroundStyle(Self.compoText)
                    Text(s.title?.isEmpty == false ? s.title! : (s.periodLabel ?? "Compositions"))
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    if !range.isEmpty {
                        Text("\(range) · \(s.papers.count) épreuve\(s.papers.count > 1 ? "s" : "")")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                }
                Spacer(minLength: 0)
            }

            if running {
                Text("AUJOURD’HUI")
                    .font(.caption2.weight(.bold))
                    .tracking(0.5)
                    .foregroundStyle(EduTheme.muted)
                if todays.isEmpty {
                    Text("Pas d’épreuve aujourd’hui. Révise les prochaines.")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(todays.enumerated()), id: \.element.id) { i, p in
                            if i > 0 { Divider() }
                            paperRow(p, nowMin: nowMin, isToday: true)
                        }
                    }
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
                }
            }

            let coming = running ? Array(later.prefix(3)) : Array(dated.prefix(4))
            if !coming.isEmpty {
                Text(running ? "PROCHAINES ÉPREUVES" : "PREMIÈRES ÉPREUVES")
                    .font(.caption2.weight(.bold))
                    .tracking(0.5)
                    .foregroundStyle(EduTheme.muted)
                VStack(spacing: 0) {
                    ForEach(Array(coming.enumerated()), id: \.element.id) { i, p in
                        if i > 0 { Divider() }
                        paperRow(p, nowMin: nowMin, isToday: false)
                    }
                }
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
            }

            NavigationLink { StudentCompositionsView() } label: {
                Text("Voir le programme complet")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .modifier(HomeCardStyle())
        .overlay(alignment: .leading) {
            Rectangle().fill(Self.amber).frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func paperRow(_ p: CompositionPaper, nowMin: Int, isToday: Bool) -> some View {
        let startText = String((p.startTime ?? "").prefix(5))
        let endText = String((p.endTime ?? "").prefix(5))
        let start = p.startTime.map { Self.minutes($0) } ?? 0
        let end = p.endTime.map { Self.minutes($0) } ?? 0
        let live = isToday && start <= nowMin && nowMin < end
        let done = isToday && end > 0 && nowMin >= end
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(startText.isEmpty ? "—" : startText)
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(done ? EduTheme.subtle : EduTheme.ink)
                if !endText.isEmpty {
                    Text(endText)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(EduTheme.subtle)
                }
            }
            .frame(width: 48, alignment: .leading)
            Rectangle()
                .fill(live ? Self.emerald : (done ? EduTheme.border : SubjectPalette.swatch(for: p.matieres?.name).border))
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text(p.matieres?.name ?? "Épreuve")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(done ? EduTheme.muted : EduTheme.ink)
                    .strikethrough(done, color: EduTheme.subtle)
                if !isToday, let d = p.evalDate {
                    Text(Self.longDate(String(d.prefix(10))))
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                } else if live {
                    Text("Il reste \(Self.durationText(end - nowMin))")
                        .font(.caption)
                        .foregroundStyle(Self.emerald)
                } else if !done && start > nowMin {
                    Text("Dans \(Self.durationText(start - nowMin))")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                }
            }
            Spacer(minLength: 0)
            if live {
                Text("EN COURS")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Self.emerald, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
            } else if done {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(EduTheme.subtle)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(live ? Self.emerald.opacity(0.07) : Color.clear)
    }

    private static func durationText(_ m: Int) -> String {
        if m < 60 { return "\(m) min" }
        let h = m / 60, r = m % 60
        return r == 0 ? "\(h) h" : "\(h) h \(String(format: "%02d", r))"
    }

    private static func daysBetween(_ fromIso: String, _ toIso: String) -> Int {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        guard let a = f.date(from: fromIso), let b = f.date(from: toIso) else { return 0 }
        return Calendar.current.dateComponents([.day], from: a, to: b).day ?? 0
    }

    private var compositionsPanel: some View {
        panel(
            icon: "graduationcap",
            title: "Compositions",
            subtitle: "Programme planifié par l’école",
            actionTitle: "Voir le programme",
            destination: { StudentCompositionsView() }
        ) {
            if upcomingCompositions.isEmpty {
                panelEmpty("Aucune composition programmée pour le moment.")
            } else {
                VStack(spacing: 8) {
                    ForEach(upcomingCompositions) { c in
                        let range = [c.startsOn, c.endsOn].compactMap { $0.map { Self.shortDate(String($0.prefix(10))) } }.joined(separator: " – ")
                        workRow(
                            title: c.title?.isEmpty == false ? c.title! : "Composition",
                            subject: [c.periodLabel, c.papers.isEmpty ? nil : "\(c.papers.count) épreuve\(c.papers.count > 1 ? "s" : "")"].compactMap { $0 }.joined(separator: " · "),
                            day: c.startsOn.map { String($0.prefix(10)) },
                            detail: range.isEmpty ? nil : range
                        )
                    }
                }
            }
        }
    }

    private func workRow(title: String, subject: String?, day: String?, detail: String?) -> some View {
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(day.map { Self.dayNumber($0) } ?? "—")
                    .font(.headline.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.teal)
                Text(day.map { Self.monthAbbr($0) } ?? "")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(EduTheme.teal.opacity(0.8))
            }
            .frame(width: 42, height: 42)
            .background(Self.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                Text([subject, detail].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            if let day, let rel = Self.relativeDay(day) {
                Text(rel.text)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(rel.urgent ? Self.amber : EduTheme.muted)
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background((rel.urgent ? Self.amber : EduTheme.muted).opacity(0.12), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
        }
        .padding(10)
        .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
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
                                    .lineLimit(1)
                                if m.readAt == nil { Circle().fill(EduTheme.teal).frame(width: 7, height: 7) }
                                Spacer(minLength: 8)
                                Text(Self.relative(m.createdAt))
                                    .font(.caption2)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            Text(Self.snippet(m.body, 110))
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                                .lineLimit(2)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
            }
        }
    }

    private var messagesPanel: some View {
        panel(
            icon: "message",
            title: "Messages récents",
            subtitle: "Échanges avec tes professeurs et l’école",
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
                            Text(Self.snippet(m.body, 70))
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

    private var quickLinks: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ACCÈS RAPIDE")
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(EduTheme.muted)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                quickLink("Mes notes", icon: "book") { StudentGradesView() }
                quickLink("Exercices", icon: "square.and.pencil") { ExercisesBoardView() }
                quickLink("Examens", icon: "list.clipboard") { ExamsBoardView() }
                quickLink("Compositions", icon: "graduationcap") { StudentCompositionsView() }
                quickLink("Présences", icon: "calendar.badge.checkmark") { StudentAttendanceView() }
                quickLink("Mes profs", icon: "person.2") { MyTeachersView() }
                quickLink("Mon bulletin", icon: "doc.text") { BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin") }
                quickLink("Emploi du temps", icon: "calendar") { TimetableView(mode: .student) }
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

    // MARK: - Building blocks

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

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 16) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(EduTheme.teal.opacity(0.2))
                .frame(maxWidth: .infinity, minHeight: 300)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(.white)
                    .frame(maxWidth: .infinity, minHeight: 140)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Chargement en cours")
    }

    private var errorBanner: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Self.amber)
            VStack(alignment: .leading, spacing: 6) {
                Text("Certaines données n’ont pas pu être chargées.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("Vérifie ta connexion puis réessaie.")
                    .font(.footnote)
                    .foregroundStyle(EduTheme.muted)
                Button("Réessayer") { Task { await load() } }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(EduTheme.teal)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Self.amber.opacity(0.08), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(Self.amber.opacity(0.35), lineWidth: 1))
    }

    // MARK: - Helpers

    private static func passDecision(_ a: AnnualAverageResult?) -> String {
        guard let a, a.annualAverage != nil, let passed = a.passed else { return "—" }
        if a.complete != true { return passed ? "En cours (≥ 10)" : "En cours (< 10)" }
        return passed ? "Admis" : "Ajourné"
    }

    private static let weekdays = [1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi", 7: "Dimanche"]
    private static func weekdayName(_ dow: Int) -> String { weekdays[dow] ?? "Aujourd’hui" }

    private static func todayCaption(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEEE d MMMM"
        return f.string(from: date)
    }

    private static func parseDay(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: String(iso.prefix(10)))
    }

    private static func dayOffset(_ days: Int) -> String {
        EduDates.day(Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date())
    }

    private static func longDate(_ iso: String) -> String {
        guard let d = parseDay(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEEE d MMMM"
        return f.string(from: d)
    }

    private static func shortDate(_ iso: String) -> String {
        guard let d = parseDay(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d MMM"
        return f.string(from: d)
    }

    private static func dayNumber(_ iso: String) -> String {
        guard let d = parseDay(iso) else { return "—" }
        return "\(Calendar.current.component(.day, from: d))"
    }

    private static let months = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"]
    private static func monthAbbr(_ iso: String) -> String {
        guard let d = parseDay(iso) else { return "" }
        return months[Calendar.current.component(.month, from: d) - 1]
    }

    private static func relativeDay(_ iso: String) -> (text: String, urgent: Bool)? {
        guard let date = parseDay(iso), let today = parseDay(EduDates.day()) else { return nil }
        let days = Calendar.current.dateComponents([.day], from: today, to: date).day ?? 0
        switch days {
        case ..<0: return ("En cours", false)
        case 0: return ("Aujourd’hui", true)
        case 1: return ("Demain", true)
        default: return ("Dans \(days) j", days <= 3)
        }
    }

    private static func relative(_ iso: String?) -> String {
        guard let iso else { return "" }
        let parsers: [ISO8601DateFormatter] = {
            let a = ISO8601DateFormatter(); a.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let b = ISO8601DateFormatter(); b.formatOptions = [.withInternetDateTime]
            return [a, b]
        }()
        guard let d = parsers.lazy.compactMap({ $0.date(from: iso) }).first else { return "" }
        let r = RelativeDateTimeFormatter()
        r.locale = Locale(identifier: "fr_FR")
        r.unitsStyle = .short
        return r.localizedString(for: d, relativeTo: Date())
    }

    private static func snippet(_ text: String?, _ max: Int) -> String {
        let t = (text ?? "").replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespaces)
        return t.count > max ? String(t.prefix(max)) + "…" : t
    }

    private static func format(_ value: Double, digits: Int) -> String {
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "fr_FR")
        nf.minimumFractionDigits = digits
        nf.maximumFractionDigits = digits
        return nf.string(from: NSNumber(value: value)) ?? String(format: "%.\(digits)f", value)
    }

    private static func scoreOn20(_ grade: GradeRow) -> Double? {
        if grade.isAbsent == true { return nil }
        guard let score = grade.score, let max = grade.maxScore, max > 0 else { return nil }
        return score / max * 20
    }

    /// Same gentle rule as the parent portal: only under 6/20 is flagged (amber).
    private static func gradeColor(_ v: Double?) -> Color {
        guard let v else { return EduTheme.subtle }
        return v < 6 ? amber : EduTheme.teal
    }

    private static func averageColor(_ v: Double?) -> Color {
        guard let v else { return EduTheme.subtle }
        return v >= 10 ? EduTheme.teal : amber
    }

    private static func timeRange(_ slot: TimetableSlot) -> String {
        "\(String(slot.startTime.prefix(5)))–\(String(slot.endTime.prefix(5)))"
    }

    private static func formatRoom(_ room: String?) -> String? {
        guard let t = room?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        if t.lowercased().hasPrefix("salle") { return t }
        return "Salle \(t)"
    }

    private static func minutes(_ hhmm: String) -> Int {
        let parts = hhmm.split(separator: ":")
        guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return 0 }
        return h * 60 + m
    }

    private static func minutes(of date: Date) -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    private static func duration(_ minutes: Int) -> String {
        let m = max(minutes, 1)
        if m < 60 { return "\(m) min" }
        let h = m / 60, r = m % 60
        return r == 0 ? "\(h) h" : "\(h) h \(String(format: "%02d", r))"
    }

    // MARK: - Loading

    private func load() async {
        guard let sid = auth.userId else {
            ready = true
            auth.markPortalReady()
            return
        }
        let api = EduAPI()
        let today = EduDates.day()
        var failed = false
        do {
            if let enrollment = try await api.activeEnrollment(studentId: sid) {
                classId = enrollment.classId
                className = enrollment.className
            }

            async let gradesTask = api.fetchGrades(studentId: sid, limit: 300)
            async let attendanceCountsTask = api.fetchAttendanceCounts(studentId: sid)
            async let inboxTask = api.fetchInbox(userId: sid, kind: .all, limit: 80)

            let grades = try await gradesTask
            if Task.isCancelled { return }
            recentGrades = Array(grades.prefix(4))
            let gradedEvalIds = Set(grades.compactMap(\.evaluationId))

            if let classId {
                async let annualTask = api.fetchAnnualAverage(studentId: sid, classSectionId: classId)
                async let slotsTask = api.fetchTimetable(classSectionId: classId)
                async let examsTask = api.fetchEvaluations(classId: classId, type: "examen", confirmedOnly: true)
                async let devoirsTask = api.fetchEvaluations(classId: classId, type: "devoir")
                async let compositionsTask = api.fetchCompositionSessions(classSectionId: classId)
                async let cahierTask = api.fetchCahier(classId: classId)

                annual = await annualTask
                let allCompositions = (try? await compositionsTask) ?? []
                compositions = allCompositions
                weekSlots = CompositionSchedule.week(slots: (try? await slotsTask) ?? [], sessions: allCompositions, weekOffset: 0)

                func day(_ e: EvaluationRow) -> String? { (e.evalDate ?? e.dueDate).map { String($0.prefix(10)) } }

                upcomingExams = Array(((try? await examsTask) ?? [])
                    .filter { !gradedEvalIds.contains($0.id) && (day($0).map { $0 >= today } ?? true) }
                    .sorted { (day($0) ?? "9999") < (day($1) ?? "9999") }
                    .prefix(4))

                let cahier = (try? await cahierTask) ?? []
                let devoirs = ((try? await devoirsTask) ?? [])
                    .filter { !gradedEvalIds.contains($0.id) && (day($0).map { $0 >= today } ?? true) }
                    .map { HomeworkItem(id: "dv-\($0.id)", title: $0.title?.isEmpty == false ? $0.title! : ($0.matieres?.name ?? "Exercice"), subject: $0.matieres?.name, due: day($0)) }
                let lessonHomework = cahier
                    .filter { ($0.homework?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false) }
                    .filter { ($0.homeworkDue.map { String($0.prefix(10)) } ?? "9999") >= today }
                    .map { HomeworkItem(id: "ch-\($0.id)", title: $0.homework ?? "", subject: $0.matieres?.name, due: $0.homeworkDue.map { String($0.prefix(10)) }) }
                pendingHomework = (devoirs + lessonHomework).sorted { ($0.due ?? "9999") < ($1.due ?? "9999") }


                upcomingCompositions = Array(allCompositions
                    .filter { ($0.endsOn ?? "") >= today }
                    .sorted { ($0.startsOn ?? "") < ($1.startsOn ?? "") }
                    .prefix(4))
            } else {
                annual = nil
                weekSlots = []
                upcomingExams = []
                pendingHomework = []
                upcomingCompositions = []
                compositions = []
            }

            if let counts = try? await attendanceCountsTask {
                absencesCount = counts.absent ?? 0
                attendanceRate = counts.ratePercent
            }

            let inbox = try await inboxTask
            latestMessages = Array(inbox.filter { $0.isAnnouncement != true }.prefix(3))
            latestAnnouncements = Array(inbox.filter { $0.isAnnouncement == true }.prefix(3))
            unreadMessages = inbox.filter { $0.readAt == nil && $0.isAnnouncement != true }.count
            unreadAnnouncements = inbox.filter { $0.readAt == nil && $0.isAnnouncement == true }.count
        } catch {
            if Task.isCancelled || error.isCancellation { return }
            failed = true
        }
        loadFailed = failed
        ready = true
        auth.markPortalReady()
    }
}
