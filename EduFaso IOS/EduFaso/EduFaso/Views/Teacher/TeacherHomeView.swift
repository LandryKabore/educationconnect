import SwiftUI

/// Teacher « Ma journée », like the web TeacherDay: teal banner with today's figures and the lesson
/// happening now, today's lessons with their two jobs (roll call, cahier de textes), late jobs from
/// the previous days, grades still to enter and shortcuts.
struct TeacherHomeView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.scenePhase) private var scenePhase

    @State private var snapshot = TeacherLessons.Snapshot()
    @State private var unreadMessages = 0
    @State private var ready = false
    @State private var loadFailed = false

    @State private var tour = TabTour(key: "accueil-enseignant")
    @State private var coach = CoachMarkRegistry()

    static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)
    static let brand50 = Color(red: 240 / 255, green: 253 / 255, blue: 250 / 255)
    static let emerald = Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)
    static let emerald50 = Color(red: 236 / 255, green: 253 / 255, blue: 245 / 255)
    static let amber = Color(red: 180 / 255, green: 83 / 255, blue: 9 / 255)
    static let amber50 = Color(red: 255 / 255, green: 251 / 255, blue: 235 / 255)
    static let amberDot = Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)
    static let sky = Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)
    static let sky100 = Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255)
    static let slate100 = Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255)

    private var name: String { auth.profile?.fullName.trimmingCharacters(in: .whitespaces) ?? "" }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(
                id: "teacher.stats", icon: "chart.bar.fill",
                title: "Votre journée en chiffres",
                message: "Vos cours du jour, les tâches du jour faites (appels et cahiers) et ce qui est en retard. Touchez « En retard » pour ouvrir la liste À faire."
            ),
            CoachMarkStep(
                id: "teacher.now", icon: "clock.fill",
                title: "Maintenant",
                message: "Le cours en cours ou le prochain, avec le bon bouton : faire l’appel, puis remplir le cahier de textes."
            ),
            CoachMarkStep(
                id: "teacher.compo", icon: "pencil.and.list.clipboard",
                title: "Compositions",
                message: "Quand une de vos classes compose, ses épreuves s’affichent ici. Vos cours dans cette classe sont suspendus : pas d’appel ni de cahier à remplir ces jours-là."
            ),
            CoachMarkStep(
                id: "teacher.today", icon: "calendar",
                title: "Aujourd’hui",
                message: "Chaque cours du jour avec son appel et son cahier. Vert : c’est fait. Orange : c’est à faire. Touchez un cours pour le compléter."
            ),
            CoachMarkStep(
                id: "teacher.late", icon: "exclamationmark.triangle.fill",
                title: "Jours précédents",
                message: "Les appels et cahiers oubliés des 7 derniers jours. Vous pouvez encore les rattraper."
            ),
            CoachMarkStep(
                id: "teacher.grades", icon: "pencil.and.list.clipboard",
                title: "Notes à saisir",
                message: "Les interrogations et examens passés dont il manque des notes."
            ),
            CoachMarkStep(
                id: "teacher.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: "Touchez ce bouton à tout moment pour relancer la visite."
            ),
        ]
    }

    // MARK: - Body

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if ready {
                        TimelineView(.everyMinute) { context in
                            content(now: context.date)
                        }
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

    @ViewBuilder
    private func content(now: Date) -> some View {
        let lessons = TeacherLessons.lessons(snapshot, now: now)
        let today = TeacherLessons.today(lessons, now: now)
        let late = TeacherLessons.late(lessons, now: now)
        let todayIso = EduDates.day(now)
        let previous = late.filter { $0.date != todayIso }
        let lateCount = late.filter { $0.appelDue && $0.appel != .done }.count
            + late.filter { $0.cahierDue && $0.cahier != .done }.count

        VStack(alignment: .leading, spacing: 16) {
            banner(now: now, today: today, lateCount: lateCount)
            if loadFailed { errorBanner }
            let compos = CompositionSchedule.teacherCurrent(byClass: snapshot.compositions, now: now)
            if !compos.isEmpty {
                compositionCard(compos, now: now).coachMarkTarget("teacher.compo")
            }
            todaySection(today, now: now).coachMarkTarget("teacher.today")
            previousCard(previous).coachMarkTarget("teacher.late")
            gradesCard.coachMarkTarget("teacher.grades")
            shortcuts(todo: lateCount + snapshot.ungraded.count)
        }
    }

    // MARK: - Banner

    private func dueCounts(_ today: [TeacherLessons.Lesson]) -> (done: Int, total: Int) {
        today.reduce(into: (done: 0, total: 0)) { acc, l in
            if l.appelDue { acc.total += 1; if l.appel == .done { acc.done += 1 } }
            if l.cahierDue { acc.total += 1; if l.cahier == .done { acc.done += 1 } }
        }
    }

    private func banner(now: Date, today: [TeacherLessons.Lesson], lateCount: Int) -> some View {
        let due = dueCounts(today)
        let pending = max(0, due.total - due.done)
        let over = today.filter { $0.timing == .over }.count
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(TimeGreeting.current(at: now)) · \(Self.dayLong(now))")
                            .font(.caption.weight(.semibold))
                            .tracking(1.2)
                            .textCase(.uppercase)
                            .foregroundStyle(.white.opacity(0.7))
                        Text("\(name.isEmpty ? "Ma journée" : name) 👋")
                            .font(.system(size: 28, weight: .bold))
                            .tracking(-0.4)
                            .foregroundStyle(.white)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        Text(today.isEmpty
                             ? "Pas de cours aujourd’hui."
                             : "\(today.count) cours aujourd’hui · \(pending) tâche\(pending > 1 ? "s" : "") en attente")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer(minLength: 0)
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("teacher.help")
                }

                HStack(spacing: 8) {
                    bannerTile(
                        label: "Cours aujourd’hui",
                        value: "\(today.count)",
                        hint: today.isEmpty ? "journée libre" : "\(over) terminé\(over > 1 ? "s" : "")"
                    )
                    bannerTile(
                        label: "Tâches du jour",
                        value: due.total > 0 ? "\(due.done)/\(due.total)" : "—",
                        hint: due.total == 0 ? "rien pour l’instant" : (due.done == due.total ? "tout est fait" : "appels et cahiers")
                    )
                    NavigationLink { TeacherTodoView() } label: {
                        bannerTile(label: "En retard", value: "\(lateCount)", hint: lateCount > 0 ? "voir la liste" : "rien en retard")
                    }
                    .buttonStyle(.plain)
                }
                .coachMarkTarget("teacher.stats")

                nowCard(now: now, today: today, due: due).coachMarkTarget("teacher.now")
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
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .shadow(color: Self.brand800.opacity(0.25), radius: 14, y: 8)
    }

    private func bannerTile(label: String, value: String, hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(hint)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    // MARK: - Now card (white card inside the banner)

    /// What the teacher should do next for a lesson (web `nextAction`).
    private func nextAction(_ l: TeacherLessons.Lesson) -> (label: String, cahier: Bool, primary: Bool)? {
        if l.timing == .upcoming { return ("Préparer", false, false) }
        if l.appel != .done && l.studentCount > 0 { return ("Faire l’appel", false, true) }
        if l.cahier != .done { return ("Remplir le cahier", true, l.timing == .over) }
        return nil
    }

    @ViewBuilder
    private func lessonDestination(_ l: TeacherLessons.Lesson, cahier: Bool?) -> some View {
        if cahier == true {
            TeacherCahierView(initialClassId: l.classId, initialSubjectId: l.subjectId, initialDate: l.date)
        } else if cahier == false {
            TeacherAttendanceView(initialClassId: l.classId, initialSubjectId: l.subjectId, initialDate: l.date)
        } else {
            ClassHubView(classId: l.classId, className: l.className)
        }
    }

    @ViewBuilder
    private func nowCard(now: Date, today: [TeacherLessons.Lesson], due: (done: Int, total: Int)) -> some View {
        let nowMin = TeacherLessons.minutes(of: now)
        let live = today.first { $0.timing == .live }
        let upcoming = today.first { $0.timing == .upcoming }
        VStack(alignment: .leading, spacing: 0) {
            if let lesson = live ?? upcoming {
                let action = nextAction(lesson)
                let start = TeacherLessons.minutes(lesson.start)
                let end = TeacherLessons.minutes(lesson.end)
                let inMin = start - nowMin
                HStack {
                    tag(live != nil ? "En cours" : "Prochain cours", icon: "clock",
                        fg: live != nil ? Self.emerald : Self.sky, bg: live != nil ? Self.emerald50 : Self.sky100)
                    Spacer()
                    Text(live != nil ? "fin à \(lesson.end.prefix(5))" : (inMin < 60 ? "dans \(inMin) min" : "à \(lesson.start.prefix(5))"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(EduTheme.muted)
                }
                Text("\(lesson.subjectName) · \(lesson.className)")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                    .padding(.top, 12)
                Text(Self.meta(lesson))
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .padding(.top, 2)
                if live != nil {
                    let progress = end > start ? min(1, max(0, Double(nowMin - start) / Double(end - start))) : 0
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Rectangle().fill(Self.slate100)
                            Rectangle().fill(Self.emerald).frame(width: geo.size.width * progress)
                        }
                    }
                    .frame(height: 6)
                    .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
                    .padding(.top, 12)
                }
                NavigationLink { lessonDestination(lesson, cahier: action?.cahier ?? false) } label: {
                    Label(live != nil ? (action?.label ?? "Ouvrir le cours") : "Préparer le cours",
                          systemImage: action?.cahier == true ? "book" : "checklist")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(.white)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.top, 16)
            } else if !today.isEmpty {
                tag("Journée terminée", icon: "checkmark", fg: Self.emerald, bg: Self.emerald50)
                Text(due.done == due.total ? "Tout est fait. Bravo !" : "\(due.total - due.done) tâche\(due.total - due.done > 1 ? "s" : "") à terminer")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .padding(.top, 12)
                Text("\(due.done) sur \(due.total) appels et cahiers remplis aujourd’hui.")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .padding(.top, 2)
            } else {
                tag("Pas de cours aujourd’hui", icon: "calendar", fg: Self.sky, bg: Self.sky100)
                if let next = TeacherLessons.nextDay(snapshot.slots, compositions: snapshot.compositions, now: now) {
                    Text("\(Self.weekdayName(next.date)) à \(next.first.startTime.prefix(5))")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                        .padding(.top, 12)
                    Text("\(next.first.matieres?.name ?? "") · \(next.first.classes?.name ?? "") — \(next.count) cours ce jour-là")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                        .padding(.top, 2)
                } else {
                    Text("Aucun cours prévu cette semaine.")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                        .padding(.top, 12)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .shadow(color: Self.brand800.opacity(0.25), radius: 12, y: 6)
    }

    private func tag(_ text: String, icon: String, fg: Color, bg: Color) -> some View {
        Label(text.uppercased(), systemImage: icon)
            .font(.system(size: 11, weight: .bold))
            .tracking(0.6)
            .foregroundStyle(fg)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    // MARK: - Compositions

    /// Classes composing today (or within a week): their papers replace the lessons.
    private func compositionCard(_ items: [(classId: String, session: StudentCompositionSession)], now: Date) -> some View {
        let todayIso = EduDates.day(now)
        let nowMin = TeacherLessons.minutes(of: now)
        let mySubjects = Set(snapshot.slots.compactMap { $0.matieres?.name })
        return VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(items.enumerated()), id: \.element.session.id) { index, item in
                if index > 0 { Divider() }
                let s = item.session
                let running = (s.startsOn.map { String($0.prefix(10)) <= todayIso } ?? false)
                let className = snapshot.slots.first { $0.classSectionId == item.classId }?.classes?.name ?? "Classe"
                let papers = s.papers
                    .filter { $0.evalDate.map { String($0.prefix(10)) } == (running ? todayIso : $0.evalDate.map { String($0.prefix(10)) }) }
                    .sorted { (($0.evalDate ?? "") + ($0.startTime ?? "")) < (($1.evalDate ?? "") + ($1.startTime ?? "")) }
                let shown = running ? papers : Array(papers.prefix(3))
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(running ? "COMPOSITIONS EN COURS · \(className)" : "COMPOSITIONS À VENIR · \(className)")
                                .font(.caption2.weight(.bold))
                                .tracking(0.5)
                                .foregroundStyle(TimetableView.compoText)
                            Text(s.title?.isEmpty == false ? s.title! : (s.periodLabel ?? "Compositions"))
                                .font(.headline)
                                .foregroundStyle(EduTheme.ink)
                            Text(running
                                 ? "Vos cours en \(className) sont suspendus jusqu’au \(Self.shortDate(s.endsOn))."
                                 : "À partir du \(Self.shortDate(s.startsOn)) : vos cours en \(className) seront suspendus.")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    if running && shown.isEmpty {
                        Text("Pas d’épreuve aujourd’hui.")
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                    }
                    ForEach(shown) { p in
                        let start = p.startTime.map { TeacherLessons.minutes($0) } ?? 0
                        let end = p.endTime.map { TeacherLessons.minutes($0) } ?? 0
                        let isToday = p.evalDate.map { String($0.prefix(10)) } == todayIso
                        let live = isToday && nowMin >= start && nowMin < end
                        let done = isToday && nowMin >= end
                        let mine = mySubjects.contains(p.matieres?.name ?? "")
                        HStack(spacing: 10) {
                            Text(running ? "\(p.startTime?.prefix(5) ?? "")" : Self.shortDay(p.evalDate ?? ""))
                                .font(.caption.weight(.bold).monospacedDigit())
                                .foregroundStyle(live ? Self.emerald : EduTheme.ink)
                                .frame(width: 46, alignment: .leading)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(p.matieres?.name ?? "Épreuve")
                                    .font(.subheadline.weight(mine ? .bold : .semibold))
                                    .foregroundStyle(done ? EduTheme.muted : EduTheme.ink)
                                    .strikethrough(done)
                                Text("\(p.startTime?.prefix(5) ?? "") – \(p.endTime?.prefix(5) ?? "")" + (mine ? " · votre matière" : ""))
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            Spacer(minLength: 4)
                            if live {
                                Text("EN COURS")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(Self.emerald, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(live ? Self.emerald50 : TimetableView.compoBg.opacity(0.45), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
            }
            NavigationLink { TimetableView(mode: .teacher) } label: {
                Text("Voir l’emploi du temps")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .foregroundStyle(.white)
                    .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .padding(.leading, 4)
        .background(.white)
        .overlay(alignment: .leading) { Rectangle().fill(TimetableView.compoEdge).frame(width: 4) }
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1))
    }

    private static func shortDate(_ iso: String?) -> String {
        guard let iso, let d = EduDates.parseDay(iso) else { return "—" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d MMMM"
        return f.string(from: d)
    }

    // MARK: - Today

    private func todaySection(_ today: [TeacherLessons.Lesson], now: Date) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Aujourd’hui")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                Spacer()
                NavigationLink { TimetableView(mode: .teacher) } label: {
                    Text("Emploi du temps")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.teal)
                }
            }
            if today.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "calendar")
                        .font(.title2)
                        .foregroundStyle(EduTheme.teal)
                        .frame(width: 48, height: 48)
                        .background(Self.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    Text("Pas de cours aujourd’hui")
                        .font(.headline)
                        .foregroundStyle(EduTheme.ink)
                    Text(noLessonText(now: now))
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
                .padding(.horizontal, 16)
                .modifier(HomeCardStyle())
            } else {
                VStack(spacing: 10) {
                    ForEach(today) { l in lessonRow(l, now: now) }
                }
            }
        }
    }

    private func noLessonText(now: Date) -> String {
        if snapshot.slots.isEmpty { return "Votre emploi du temps n’est pas encore saisi par l’établissement." }
        guard let next = TeacherLessons.nextDay(snapshot.slots, compositions: snapshot.compositions, now: now) else { return "Aucun cours cette semaine." }
        return "Prochain cours : \(Self.dayLong(EduDates.parseDay(next.date) ?? now).lowercased()) à \(next.first.startTime.prefix(5)) — \(next.first.matieres?.name ?? "") · \(next.first.classes?.name ?? "")"
    }

    private func lessonRow(_ l: TeacherLessons.Lesson, now: Date) -> some View {
        let action = nextAction(l)
        let complete = action == nil && l.timing != .upcoming
        let live = l.timing == .live
        let inMin = TeacherLessons.minutes(l.start) - TeacherLessons.minutes(of: now)
        return HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(l.start.prefix(5))
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(live ? Self.emerald : EduTheme.ink)
                    .lineLimit(1)
                    .fixedSize()
                Text(l.end.prefix(5))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(1)
                    .fixedSize()
            }
            .frame(minWidth: 48, alignment: .trailing)
            .padding(.top, 14)

            Circle()
                .fill(complete || live ? Self.emerald : (l.timing == .over ? Self.amberDot : .white))
                .overlay(Circle().stroke(complete || live || l.timing == .over ? .clear : EduTheme.borderStrong, lineWidth: 2))
                .frame(width: 12, height: 12)
                .padding(.top, 18)

            NavigationLink { lessonDestination(l, cahier: action?.cahier) } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Text("\(l.subjectName) · \(l.className)")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(EduTheme.ink)
                            .lineLimit(1)
                        if live {
                            Text("EN COURS")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Self.emerald, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                        }
                    }
                    Text(Self.roomAndStudents(l) + (l.timing == .upcoming && inMin <= 90 ? " · dans \(inMin) min" : ""))
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                    HStack(spacing: 6) {
                        jobChip("Appel", state: l.appel, due: l.appelDue)
                        jobChip("Cahier", state: l.cahier, due: l.cahierDue)
                    }
                    if let action {
                        Label(action.label, systemImage: "arrow.right")
                            .labelStyle(TrailingIconLabelStyle())
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 34)
                            .foregroundStyle(action.primary ? .white : EduTheme.ink)
                            .background(action.primary ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(action.primary ? .clear : EduTheme.borderStrong, lineWidth: 1))
                    } else {
                        Label("Complet", systemImage: "checkmark")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 34)
                            .foregroundStyle(Self.emerald)
                            .background(Self.emerald50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                        .stroke(live ? Self.emerald.opacity(0.6) : EduTheme.borderStrong.opacity(0.7), lineWidth: live ? 2 : 1)
                )
                .opacity(l.timing == .over && complete ? 0.75 : 1)
            }
            .buttonStyle(.plain)
        }
    }

    private func jobChip(_ label: String, state: TeacherLessons.Job, due: Bool) -> some View {
        let fg: Color = state == .done ? Self.emerald : (due ? Self.amber : EduTheme.muted)
        let bg: Color = state == .done ? Self.emerald50 : (due ? Self.amber50 : Self.slate100)
        let suffix = state == .done ? "" : (state == .partial ? " commencé" : (due ? " à faire" : ""))
        return HStack(spacing: 3) {
            if state == .done { Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)) }
            Text(label + suffix)
        }
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(fg)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    // MARK: - Previous days

    private func previousCard(_ previous: [TeacherLessons.Lesson]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            cardHeader(
                icon: previous.isEmpty ? "checkmark" : "exclamationmark.triangle",
                tint: previous.isEmpty ? Self.emerald : Self.amber,
                bg: previous.isEmpty ? Self.emerald50 : Self.amber50,
                title: "Jours précédents",
                subtitle: "Appels et cahiers des 7 derniers jours"
            ) { EmptyView() }
            if previous.isEmpty {
                Text("Tout est à jour.")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(previous.prefix(5).enumerated()), id: \.element.id) { index, l in
                        if index > 0 { Divider() }
                        NavigationLink { lessonDestination(l, cahier: l.appel == .done) } label: {
                            HStack(spacing: 10) {
                                Text(Self.shortDay(l.date))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(EduTheme.muted)
                                    .frame(width: 52, alignment: .leading)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(l.subjectName) · \(l.className)")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(EduTheme.ink)
                                        .lineLimit(1)
                                    Text([l.appel != .done ? "appel" : nil, l.cahier != .done ? "cahier" : nil].compactMap { $0 }.joined(separator: " et ") + " à faire")
                                        .font(.caption)
                                        .foregroundStyle(Self.amber)
                                }
                                Spacer(minLength: 4)
                                Image(systemName: "arrow.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(EduTheme.muted)
                            }
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                if previous.count > 5 {
                    NavigationLink { TeacherTodoView() } label: {
                        Text("Voir les \(previous.count)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.teal)
                    }
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    // MARK: - Grades to enter

    private var gradesCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            cardHeader(
                icon: "pencil.and.list.clipboard", tint: EduTheme.teal, bg: Self.brand50,
                title: "Notes à saisir",
                subtitle: "Évaluations passées sans toutes les notes"
            ) {
                Text("\(snapshot.ungraded.count)")
                    .font(.title2.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.ink)
            }
            ForEach(snapshot.ungraded.prefix(3)) { u in
                NavigationLink { GradeEntryView(evaluation: u.evaluation, recordedBy: auth.userId) } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(u.evaluation.title?.isEmpty == false ? u.evaluation.title! : u.evaluation.typeLabel)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.ink)
                                .lineLimit(1)
                            Text("\(u.evaluation.classes?.name ?? "Classe") · \(u.missing) note\(u.missing > 1 ? "s" : "") manquante\(u.missing > 1 ? "s" : "")")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(EduTheme.muted)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Self.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            if snapshot.ungraded.count > 3 {
                NavigationLink { TeacherTodoView() } label: {
                    Text("Tout voir")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.teal)
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func cardHeader<Trailing: View>(
        icon: String, tint: Color, bg: Color, title: String, subtitle: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(EduTheme.ink)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
            }
            Spacer(minLength: 4)
            trailing()
        }
    }

    // MARK: - Shortcuts

    private func shortcuts(todo: Int) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            NavigationLink { TeacherTodoView() } label: { shortcut("À faire", icon: "checklist.unchecked", badge: todo) }
                .buttonStyle(.plain)
            NavigationLink { MessagesView() } label: { shortcut("Messages", icon: "message", badge: unreadMessages) }
                .buttonStyle(.plain)
            NavigationLink { TeacherClassesView() } label: { shortcut("Mes classes", icon: "person.2", badge: 0) }
                .buttonStyle(.plain)
            NavigationLink { TeacherCahierView() } label: { shortcut("Cahier de textes", icon: "book", badge: 0) }
                .buttonStyle(.plain)
        }
    }

    private func shortcut(_ title: String, icon: String, badge: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(EduTheme.teal)
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(EduTheme.ink)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .overlay(alignment: .topTrailing) {
            if badge > 0 {
                Text("\(badge)")
                    .font(.caption2.weight(.bold).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(EduTheme.fasoRed, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    .padding(10)
            }
        }
        .modifier(HomeCardStyle())
    }

    // MARK: - Loading & error

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 16) {
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .fill(EduTheme.teal.opacity(0.15))
                .frame(maxWidth: .infinity, minHeight: 300)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(.white)
                    .frame(maxWidth: .infinity, minHeight: 96)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityLabel("Chargement en cours")
    }

    private var errorBanner: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color.orange)
            VStack(alignment: .leading, spacing: 6) {
                Text("Certaines données n’ont pas pu être chargées.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Button("Réessayer") { Task { await load() } }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(EduTheme.teal)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    // MARK: - Text helpers

    private static func dayLong(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEEE d MMMM"
        let s = f.string(from: date)
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    private static func weekdayName(_ iso: String) -> String {
        guard let d = EduDates.parseDay(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEEE"
        let s = f.string(from: d)
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    static func shortDay(_ iso: String) -> String {
        guard let d = EduDates.parseDay(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEE d"
        return f.string(from: d).replacingOccurrences(of: ".", with: "")
    }

    static func room(_ raw: String?) -> String? {
        guard let r = raw?.trimmingCharacters(in: .whitespaces), !r.isEmpty else { return nil }
        let bare = r.replacingOccurrences(of: "^salle\\s*", with: "", options: [.regularExpression, .caseInsensitive])
        return "Salle \(bare)"
    }

    private static func roomAndStudents(_ l: TeacherLessons.Lesson) -> String {
        [room(l.room), "\(l.studentCount) élèves"].compactMap { $0 }.joined(separator: " · ")
    }

    private static func meta(_ l: TeacherLessons.Lesson) -> String {
        ["\(l.start.prefix(5)) – \(l.end.prefix(5))", room(l.room), "\(l.studentCount) élèves"].compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: - Loading

    private func load() async {
        guard let tid = auth.userId else {
            ready = true
            auth.markPortalReady()
            return
        }
        async let snap = Self.capture { try await TeacherLessons.load(teacherId: tid) }
        async let inbox = Self.capture { try await EduAPI().fetchInbox(userId: tid, kind: .all, limit: 80) }
        var failed = false
        switch await snap {
        case .success(let value): snapshot = value
        case .failure: failed = true
        }
        if case .success(let rows) = await inbox {
            unreadMessages = rows.filter { $0.readAt == nil && $0.isAnnouncement != true }.count
        }
        loadFailed = failed
        ready = true
        auth.markPortalReady()
    }

    private static func capture<T>(_ work: @escaping () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await work()) } catch { return .failure(error) }
    }
}

/// White card, thin slate border, small radius (redesign). The radius argument is
/// kept so existing call sites compile; every card now uses the shared radius.
struct HomeCardStyle: ViewModifier {
    var cornerRadius: CGFloat = EduTheme.radius

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.06), radius: 3, y: 1)
    }
}

struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.title
            configuration.icon
        }
    }
}
