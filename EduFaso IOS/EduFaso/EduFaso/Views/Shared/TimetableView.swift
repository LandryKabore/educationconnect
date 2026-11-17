import SwiftUI

struct TimetableView: View {
    enum Mode { case student, teacher, classSection(String) }
    private enum Scope: String, CaseIterable { case day = "Jour", week = "Semaine" }

    let mode: Mode
    var studentIdOverride: String? = nil
    /// Parent view: the child's first name, shown in the title.
    var childName: String? = nil

    // guided tour (shares targets with ChildGate's child switcher when there is one)
    @State private var tour = TabTour(key: "emploi-du-temps.v4")
    @State private var ownCoach = CoachMarkRegistry()
    @Environment(CoachMarkRegistry.self) private var outerCoach: CoachMarkRegistry?
    private var coach: CoachMarkRegistry { outerCoach ?? ownCoach }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(
                id: "child.switcher", icon: "arrow.left.arrow.right",
                title: "Changer d’enfant",
                message: "Vous avez plusieurs enfants. Essayez maintenant : touchez le prénom d’un autre enfant dans la barre en haut.",
                requiresAction: true,
                doneMessage: "Voilà ! La page affiche maintenant l’emploi du temps de cet enfant."
            ),
            CoachMarkStep(
                id: "edt.scope", icon: "calendar",
                title: "Jour ou semaine",
                message: (isStudent ? "Vois ta journée heure par heure, ou toute la semaine d’un coup." : "Voyez la journée heure par heure, ou toute la semaine d’un coup.")
            ),
            CoachMarkStep(
                id: "edt.days", icon: "calendar.day.timeline.left",
                title: "Choisir un jour",
                message: (isStudent ? "Touche un jour, ou glisse la journée vers la gauche ou la droite. Les points montrent combien de cours il y a." : "Touchez un jour, ou glissez la journée vers la gauche ou la droite. Les points montrent combien de cours il y a.")
            ),
            CoachMarkStep(
                id: "edt.summary", icon: "clock.fill",
                title: "En ce moment",
                message: "Suit la journée en direct : le cours en cours et le temps qui reste, la récréation et la reprise, ou le premier cours de demain."
            ),
            CoachMarkStep(
                id: "edt.timeline", icon: "list.bullet",
                title: "La journée heure par heure",
                message: (isStudent ? "Chaque cours avec son heure, ton professeur et la salle. Le cours en cours et le prochain sont signalés ; les cours passés sont grisés. Pendant les compositions, tes épreuves remplacent les cours." : "Chaque cours avec son heure, son professeur et sa salle. Le cours en cours et le prochain sont signalés ; les cours passés sont grisés, les récréations et la pause déjeuner sont nommées.")
            ),
            CoachMarkStep(
                id: "edt.pdf", icon: "arrow.down.doc.fill",
                title: "Télécharger",
                message: (isStudent ? "Télécharge ou partage ton emploi du temps de la semaine en PDF." : "Téléchargez ou partagez l’emploi du temps de la semaine en PDF.")
            ),
            CoachMarkStep(
                id: "edt.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: (isStudent ? "Touche ce bouton à tout moment pour relancer la visite." : "Touchez ce bouton à tout moment pour relancer la visite.")
            ),
        ]
    }

    @EnvironmentObject private var auth: AuthViewModel
    /// The student's own screen: the tour speaks to them as "tu".
    private var isStudent: Bool { auth.primaryRole == .student && childName == nil }

    @State private var slots: [TimetableSlot] = []
    /// Composition sessions of the class: on their days the papers replace the lessons.
    @State private var compositions: [StudentCompositionSession] = []
    /// Teacher mode: sessions per class (each class composes on its own days).
    @State private var teacherCompositions: [String: [StudentCompositionSession]] = [:]
    @State private var className: String?
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?
    @State private var exporting = false
    @State private var exportError: String?
    @State private var scope: Scope = .day
    @State private var selectedDay: Int = Self.defaultSelectedDay()
    /// 0 = current calendar week; ±1 previous/next, etc.
    @State private var weekOffset: Int = 0

    /// Every gap of 10 minutes or more between two lessons is shown (récréation, déjeuner…).
    private let pauseGapMin = 10
    private let weekPickerRange = -2...2

    private var titleText: String {
        if let childName { return "Emploi du temps \(ParentHomeView.de(childName))" }
        switch mode {
        case .student: return "Mon emploi du temps"
        case .teacher: return "Emploi du temps"
        case .classSection: return "Emploi du temps"
        }
    }

    private var referenceDate: Date {
        Calendar.current.date(byAdding: .weekOfYear, value: weekOffset, to: Date()) ?? Date()
    }

    private var weekDays: [WeekDayItem] {
        WeekCalendar.week(containing: referenceDate)
    }

    private var weekOptions: [WeekOption] {
        weekPickerRange.map { WeekCalendar.weekOption(offset: $0, from: Date()) }
    }

    private var todayWeekday: Int { EduDates.weekday() }

    private var isViewingToday: Bool {
        weekOffset == 0 && selectedDay == todayWeekday && todayWeekday != 7
    }

    /// The viewed week, with composition days showing their papers instead of the lessons.
    private var isTeacherMode: Bool {
        if case .teacher = mode { return true }
        return false
    }

    private var weekSlots: [TimetableSlot] { slotsForWeek(weekOffset) }

    private func slotsForWeek(_ offset: Int) -> [TimetableSlot] {
        if case .teacher = mode {
            return CompositionSchedule.teacherWeek(slots: slots, byClass: teacherCompositions, weekOffset: offset)
        }
        return CompositionSchedule.week(slots: slots, sessions: compositions, weekOffset: offset)
    }

    /// The composition session touching the viewed week, if any.
    private var weekComposition: StudentCompositionSession? {
        if case .teacher = mode {
            return (1...6).lazy.compactMap { day -> StudentCompositionSession? in
                let iso = CompositionSchedule.isoDate(weekday: day, weekOffset: weekOffset)
                return teacherCompositions.values.lazy.compactMap { CompositionSchedule.session(on: iso, in: $0) }.first
            }.first
        }
        return (1...6).lazy.compactMap { day in
            CompositionSchedule.session(on: CompositionSchedule.isoDate(weekday: day, weekOffset: weekOffset), in: compositions)
        }.first
    }

    private var selectedDayIsComposition: Bool {
        CompositionSchedule.session(on: CompositionSchedule.isoDate(weekday: selectedDay, weekOffset: weekOffset), in: compositions) != nil
    }

    private var unitLabel: String { selectedDayIsComposition ? "épreuve" : "cours" }

    private var daySlots: [TimetableSlot] {
        weekSlots.filter { $0.dayOfWeek == selectedDay }.sorted { $0.startTime < $1.startTime }
    }

    private var timeline: [TimelineBlock] {
        Self.buildTimeline(from: daySlots, pauseGapMin: pauseGapMin)
    }

    private var dayCourseCount: Int { daySlots.count }

    private var dayWindowLabel: String? {
        guard let first = daySlots.first, let last = daySlots.last else { return nil }
        return "\(blockStart(first)) – \(clock(minutes(last.endTime)))"
    }

    private func minutesNow(_ date: Date = Date()) -> Int {
        let cal = Calendar.current
        return cal.component(.hour, from: date) * 60 + cal.component(.minute, from: date)
    }

    private func nowSlot(at date: Date) -> TimetableSlot? {
        guard isViewingToday else { return nil }
        let now = minutesNow(date)
        return daySlots.first { minutes($0.startTime) <= now && now < minutes($0.endTime) }
    }

    private func nextSlot(at date: Date) -> TimetableSlot? {
        guard isViewingToday else { return nil }
        let now = minutesNow(date)
        return daySlots.first { minutes($0.startTime) > now }
    }

    private func isLivePause(start: Int, end: Int, at date: Date) -> Bool {
        guard isViewingToday else { return false }
        let now = minutesNow(date)
        return start <= now && now < end
    }

    private static func defaultSelectedDay(now: Date = Date()) -> Int {
        let day = EduDates.weekday(now)
        // Sunday has no school strip day — land on Monday
        return day == 7 ? 1 : day
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if !ready || loading {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else if slots.isEmpty {
                    PremiumEmpty(
                        title: "Aucun créneau",
                        systemImage: "calendar",
                        message: "L’emploi du temps n’est pas encore publié."
                    )
                } else {
                    ScrollViewReader { proxy in
                    TimelineView(.periodic(from: .now, by: 30)) { context in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 16) {
                                header
                                scopePicker.coachMarkTarget("edt.scope")
                                if let compo = weekComposition { compositionBanner(compo) }
                                if scope == .day {
                                    dayStrip.coachMarkTarget("edt.days")
                                    daySummaryCard(at: context.date).coachMarkTarget("edt.summary")
                                    dayTimeline(at: context.date)
                                        .coachMarkTarget("edt.timeline")
                                        .simultaneousGesture(daySwipe)
                                } else {
                                    weekStrip.coachMarkTarget("edt.days")
                                    weekSummaryCard.coachMarkTarget("edt.summary")
                                    weekList(at: context.date).coachMarkTarget("edt.timeline")
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        }
                        .refreshable { await load(isRefresh: true) }
                        .tabTour(tour, registry: coach, scroller: proxy)
                    }
                    .onChange(of: scope) { _, newScope in
                        guard newScope == .week else { return }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            withAnimation { proxy.scrollTo("week-day-\(selectedDay)", anchor: .top) }
                        }
                    }
                    }
                    .onAppear { tour.autoStartOnce({ tourSteps }, registry: coach) }
                }
            }
        }
        .environment(coach)
        .premiumTitle(titleText)
        .alert("Export impossible", isPresented: Binding(
            get: { exportError != nil },
            set: { if !$0 { exportError = nil } }
        )) {
            Button("OK", role: .cancel) { exportError = nil }
        } message: {
            Text(exportError ?? "")
        }
        .task(id: studentIdOverride) { await load(isRefresh: ready) }
        .onChange(of: studentIdOverride) { _, _ in
            guard tour.showing, tour.steps.indices.contains(tour.index),
                  tour.steps[tour.index].requiresAction else { return }
            tour.steps[tour.index].doneMessage = "Voilà ! La page affiche maintenant l’emploi du temps \(childName.map { ParentHomeView.de($0) } ?? "de cet enfant"). Le bouton plein, en haut, montre toujours l’enfant affiché."
            tour.actionDone = true
        }
        .onAppear { snapToNow() }
    }

    private func exportPdf() async {
        guard !slots.isEmpty else {
            exportError = "Aucun créneau à exporter."
            return
        }
        exporting = true
        defer { exporting = false }

        let schoolName = auth.schools.first?.name ?? "École"
        let resolvedClass = className ?? "Classe"
        let studentName: String? = {
            switch mode {
            case .student:
                return auth.profile?.fullName
            case .teacher:
                return nil
            case .classSection:
                return nil
            }
        }()
        let extra: String? = {
            if case .teacher = mode {
                return auth.profile.map { "Enseignant : \($0.fullName)" }
            }
            return nil
        }()

        let data = EmploiDuTempsPdf.make(
            .init(
                schoolName: schoolName,
                className: resolvedClass,
                studentName: studentName,
                extraLine: extra,
                slots: slots
            )
        )
        let safe = resolvedClass
            .replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "[^A-Za-z0-9\\-_àâäéèêëïîôùûüç]", with: "", options: .regularExpression)
        let fileName = "emploi-du-temps-\(safe.isEmpty ? "classe" : safe).pdf"
        PdfShare.present(data: data, fileName: fileName)
    }

    private func snapToNow() {
        let start = smartStart()
        weekOffset = start.weekOffset
        selectedDay = start.day
        scope = .day
    }

    /// The day worth showing now: today while lessons are still ahead, else the next school day
    /// (tomorrow, or Monday of next week after Saturday's last lesson and on Sunday).
    private func smartStart(now: Date = Date()) -> (weekOffset: Int, day: Int) {
        let today = EduDates.weekday(now)
        let nowMin = minutesNow(now)
        let schoolDays = Set(slots.map(\.dayOfWeek)).filter { (1...6).contains($0) }
        guard !schoolDays.isEmpty else { return (0, today == 7 ? 1 : today) }
        if today != 7 {
            let lastEnd = slotsForWeek(0).filter { $0.dayOfWeek == today }.map { minutes($0.endTime) }.max()
            if let lastEnd, nowMin < lastEnd { return (0, today) }
            if let next = (today + 1...6).first(where: { schoolDays.contains($0) }) { return (0, next) }
        }
        return (1, (1...6).first(where: { schoolDays.contains($0) }) ?? 1)
    }

    /// First lesson of the next school day after the selected one (for « Journée terminée »).
    private func nextSchoolDayFirst() -> (label: String, slot: TimetableSlot)? {
        let order = Array(selectedDay + 1...max(selectedDay + 1, 6)) + Array(1...6)
        for day in order where day != selectedDay && (1...6).contains(day) {
            if let first = weekSlots.filter({ $0.dayOfWeek == day }).min(by: { $0.startTime < $1.startTime }) {
                let label = (day == selectedDay + 1) ? "Demain" : dayName(day)
                return (label, first)
            }
        }
        return nil
    }

    /// « dans 12 min », « dans 1 h 05 »
    private static func inMinutes(_ m: Int) -> String {
        if m <= 0 { return "maintenant" }
        if m < 60 { return "dans \(m) min" }
        let h = m / 60, r = m % 60
        return r == 0 ? "dans \(h) h" : "dans \(h) h \(String(format: "%02d", r))"
    }

    /// Name of a break from its length and time of day.
    static func pauseName(start: Int, end: Int) -> String {
        let length = end - start
        if length >= 60 && start >= 11 * 60 && start <= 14 * 60 + 30 { return "Pause déjeuner" }
        if length <= 30 { return "Récréation" }
        return "Pause"
    }

    // MARK: - Header controls

    private var scopePicker: some View {
        EduPeriodSegmentPicker(
            options: Scope.allCases.map { ($0, $0.rawValue) },
            selection: $scope
        )
    }

    private var dayStrip: some View {
        let todayIndex = EduDates.weekday()
        return HStack(spacing: 6) {
            ForEach(WeekCalendar.week(containing: referenceDate)) { day in
                let selected = selectedDay == day.dayOfWeek
                let isToday = weekOffset == 0 && day.dayOfWeek == todayIndex
                let count = weekSlots.filter { $0.dayOfWeek == day.dayOfWeek }.count
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        selectedDay = day.dayOfWeek
                        scope = .day
                    }
                } label: {
                    VStack(spacing: 4) {
                        Text(day.shortName)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(isToday ? EduTheme.fasoGreen : (selected ? EduTheme.teal : EduTheme.muted))
                        Text("\(day.dayNumber)")
                            .font(.body.weight(.bold).monospacedDigit())
                            .foregroundStyle(selected || isToday ? EduTheme.ink : EduTheme.muted)
                        if isToday {
                            Text("AUJ")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(EduTheme.fasoGreen, in: Capsule())
                        } else {
                            // one dot per lesson (up to 4): a quick idea of how busy the day is
                            HStack(spacing: 2) {
                                ForEach(0..<min(count, 4), id: \.self) { _ in
                                    Circle().fill(EduTheme.teal.opacity(selected ? 1 : 0.6)).frame(width: 4, height: 4)
                                }
                            }
                            .frame(height: 11)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                            .fill(
                                selected
                                ? Color.white
                                : (isToday ? EduTheme.fasoGreen.opacity(0.12) : Color.clear)
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                            .stroke(
                                isToday ? EduTheme.fasoGreen : Color.clear,
                                lineWidth: isToday ? 1.5 : 0
                            )
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .fill(Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
        )
    }

    private var weekStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(weekOptions) { option in
                    Button {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            weekOffset = option.offset
                        }
                    } label: {
                        VStack(spacing: 4) {
                            Text(option.badge)
                                .font(.caption2.weight(.bold))
                            Text(option.rangeLabel)
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .foregroundStyle(weekOffset == option.offset ? EduTheme.teal : EduTheme.muted)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                                .fill(weekOffset == option.offset ? Color.white : Color.clear)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
        }
        .background(
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .fill(Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
        )
    }

    private var weekSummaryCard: some View {
        let total = weekSlots.filter { slot in weekDays.contains(where: { $0.dayOfWeek == slot.dayOfWeek }) }.count
        let selected = weekOptions.first(where: { $0.offset == weekOffset })
        return HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(EduTheme.teal.opacity(0.12))
                Image(systemName: "calendar.badge.clock")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(EduTheme.teal)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 4) {
                Text((selected?.badge ?? "Semaine").uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.5)
                Text(selected?.rangeLabel ?? "")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("\(total) cours sur la semaine")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(cardBackground)
    }

    private func daySummaryCard(at date: Date) -> some View {
        let now = minutesNow(date)
        let live = nowSlot(at: date)
        let upcoming = nextSlot(at: date)
        let first = daySlots.first
        let clockLabel = Self.clockStatic(now)
        let accent: Color = live != nil ? EduTheme.fasoGreen : EduTheme.teal

        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(selectedDaySubtitle.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.5)
                    .lineLimit(1)
                if isViewingToday {
                    Text(clockLabel)
                        .font(.caption2.weight(.bold).monospacedDigit())
                        .foregroundStyle(EduTheme.teal)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(EduTheme.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 4))
                }
                Spacer(minLength: 0)
                if dayCourseCount > 0 {
                    Text("\(dayCourseCount) \(unitLabel)\(selectedDayIsComposition && dayCourseCount > 1 ? "s" : "")")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(EduTheme.muted)
                }
            }

            if dayCourseCount == 0 {
                summaryLine(icon: "sun.max.fill", color: EduTheme.teal,
                            title: selectedDayIsComposition
                                ? (isViewingToday ? "Pas d’épreuve aujourd’hui" : "Pas d’épreuve ce jour")
                                : (isViewingToday ? "Pas de cours aujourd’hui" : "Pas de cours ce jour"),
                            detail: nextSchoolDayFirst().map { "\($0.label) : \($0.slot.matieres?.name ?? "Cours") à \(blockStart($0.slot))" })
            } else if !isViewingToday {
                summaryLine(icon: "calendar", color: EduTheme.teal,
                            title: "\(dayCourseCount) \(unitLabel)\(selectedDayIsComposition && dayCourseCount > 1 ? "s" : "")" + (dayWindowLabel.map { " · \($0)" } ?? ""),
                            detail: first.map { "\(selectedDayIsComposition ? "Première épreuve" : "Premier cours") : \($0.matieres?.name ?? "Cours") à \(blockStart($0))" })
            } else if let live {
                let start = minutes(live.startTime), end = minutes(live.endTime)
                summaryLine(icon: "clock.fill", color: EduTheme.fasoGreen,
                            title: live.matieres?.name ?? "Cours",
                            detail: "En cours · se termine \(Self.inMinutes(end - now))" + ((isTeacherMode ? live.classes?.name : formatRoom(live.room)).map { " · \($0)" } ?? ""))
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2).fill(EduTheme.fasoGreen.opacity(0.15))
                        RoundedRectangle(cornerRadius: 2).fill(EduTheme.fasoGreen)
                            .frame(width: geo.size.width * CGFloat(Double(now - start) / Double(max(end - start, 1))))
                    }
                }
                .frame(height: 6)
                if let upcoming {
                    Text("Ensuite : \(upcoming.matieres?.name ?? "Cours") à \(blockStart(upcoming))")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                }
            } else if let upcoming, let first, now < minutes(first.startTime) {
                summaryLine(icon: "sunrise.fill", color: EduTheme.teal,
                            title: "\(selectedDayIsComposition ? "Les épreuves commencent" : "Les cours commencent") à \(blockStart(first))",
                            detail: "\(first.matieres?.name ?? "Cours") · \(Self.inMinutes(minutes(upcoming.startTime) - now))")
            } else if let upcoming {
                let prevEnd = daySlots.filter { minutes($0.endTime) <= now }.map { minutes($0.endTime) }.max() ?? now
                summaryLine(icon: "cup.and.saucer.fill", color: EduTheme.teal,
                            title: "\(Self.pauseName(start: prevEnd, end: minutes(upcoming.startTime))) · reprise à \(blockStart(upcoming))",
                            detail: "\(upcoming.matieres?.name ?? "Cours") · \(Self.inMinutes(minutes(upcoming.startTime) - now))")
            } else {
                summaryLine(icon: "checkmark.circle.fill", color: EduTheme.teal,
                            title: "Journée terminée",
                            detail: nextSchoolDayFirst().map { "\($0.label) : \($0.slot.matieres?.name ?? "Cours") à \(blockStart($0.slot))" })
            }
        }
        .padding(16)
        .background(cardBackground)
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2).fill(accent).frame(width: 4).padding(.vertical, 12)
        }
    }

    private func summaryLine(icon: String, color: Color, title: String, detail: String?) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
                .frame(width: 40, height: 40)
                .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail {
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(color == EduTheme.fasoGreen ? EduTheme.fasoGreen : EduTheme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var selectedDaySubtitle: String {
        let days = WeekCalendar.week(containing: Date())
        if let item = days.first(where: { $0.dayOfWeek == selectedDay }) {
            return item.isToday ? "\(item.longLabel) · aujourd’hui" : item.longLabel
        }
        return dayName(selectedDay)
    }

    // MARK: - Day swipe

    /// Swipe left / right on the day to go to the next / previous school day.
    private var daySwipe: some Gesture {
        DragGesture(minimumDistance: 30)
            .onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) * 1.5,
                      abs(value.translation.width) > 60 else { return }
                withAnimation(.easeInOut(duration: 0.2)) {
                    if value.translation.width < 0 {
                        if selectedDay >= 6 { selectedDay = 1; weekOffset += 1 } else { selectedDay += 1 }
                    } else {
                        if selectedDay <= 1 { selectedDay = 6; weekOffset -= 1 } else { selectedDay -= 1 }
                    }
                }
            }
    }

    @ViewBuilder
    // MARK: - Day timeline

    private func dayTimeline(at date: Date) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if timeline.isEmpty {
                emptyDayCard
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(timeline.enumerated()), id: \.element.id) { index, block in
                        if index > 0 {
                            Divider().padding(.leading, 70)
                        }
                        timelineRow(block, at: date)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .background(cardBackground)
            }
        }
    }

    private func timelineRow(_ block: TimelineBlock, at date: Date) -> some View {
        let liveCourse: Bool = {
            if case .course(let slot) = block.kind { return nowSlot(at: date)?.id == slot.id }
            return false
        }()
        let livePause: Bool = {
            if case .pause(let start, let end) = block.kind { return isLivePause(start: start, end: end, at: date) }
            return false
        }()

        let finished: Bool = {
            guard isViewingToday, !liveCourse, !livePause else { return false }
            switch block.kind {
            case .course(let slot): return minutes(slot.endTime) <= minutesNow(date)
            case .pause(_, let end): return end <= minutesNow(date)
            }
        }()

        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(block.startLabel)
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(liveCourse || livePause ? EduTheme.fasoGreen : EduTheme.ink)
                Text(block.endLabel)
                    .font(.caption2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(EduTheme.muted)
            }
            .frame(width: 44, alignment: .trailing)
            .padding(.top, 2)

            Group {
                switch block.kind {
                case .course(let slot):
                    courseRow(slot, isLive: liveCourse, isNext: nextSlot(at: date)?.id == slot.id && !liveCourse)
                case .pause(let start, let end):
                    pauseRow(start: start, end: end, isLive: livePause)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(liveCourse || livePause ? EduTheme.fasoGreen.opacity(0.08) : Color.clear)
        .opacity(finished ? 0.45 : 1)
    }

    private func courseRow(_ slot: TimetableSlot, isLive: Bool, isNext: Bool) -> some View {
        let swatch = SubjectPalette.swatch(for: slot.matieres?.name)
        return HStack(alignment: .top, spacing: 10) {
            Rectangle()
                .fill(isLive ? EduTheme.fasoGreen : swatch.border)
                .frame(width: 4)
                .padding(.vertical, 2)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(slot.matieres?.name ?? "Cours")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if CompositionSchedule.isComposition(slot) && !isLive {
                        Text("COMPOSITION")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Self.compoText)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Self.compoBg, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                    }
                    if isLive {
                        Text("EN COURS")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(EduTheme.fasoGreen, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                    } else if isNext {
                        Text("PROCHAIN")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.teal)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(EduTheme.teal.opacity(0.1), in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                    }
                }

                HStack(spacing: 8) {
                    if CompositionSchedule.isComposition(slot) {
                        Label("Épreuve · \(blockStart(slot))–\(clock(minutes(slot.endTime)))", systemImage: "pencil.and.list.clipboard")
                    }
                    if isTeacherMode {
                        if let cls = slot.classes?.name, !cls.isEmpty {
                            Label(cls, systemImage: "person.3.fill")
                        }
                    } else if let teacher = slot.teacherName {
                        Label(teacher, systemImage: "person.fill")
                    }
                    if !isTeacherMode, let room = formatRoom(slot.room) {
                        Label(room, systemImage: "mappin.and.ellipse")
                    }
                }
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
                .labelStyle(.titleAndIcon)
                .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }

    private func pauseRow(start: Int, end: Int, isLive: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "cup.and.saucer.fill")
                .font(.caption)
                .foregroundStyle(isLive ? EduTheme.fasoGreen : EduTheme.muted)
            Text(Self.pauseName(start: start, end: end) + (isLive ? " en cours" : ""))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isLive ? EduTheme.fasoGreen : EduTheme.muted)
            Text("· \(clock(start)) – \(clock(end))")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(EduTheme.muted)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 10)
        .background(
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                .overlay(
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .stroke(EduTheme.border, lineWidth: 1)
                )
        )
    }

    static let compoText = Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255)
    static let compoBg = Color(red: 254 / 255, green: 243 / 255, blue: 199 / 255)
    static let compoEdge = Color(red: 217 / 255, green: 119 / 255, blue: 6 / 255)

    /// Shown while the viewed week has compositions: the lessons are replaced by the papers.
    private func compositionBanner(_ s: StudentCompositionSession) -> some View {
        let range = [s.startsOn, s.endsOn].compactMap { $0.map { Self.shortFrDate(String($0.prefix(10))) } }.joined(separator: " au ")
        let running = s.statusLabel == "En cours"
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: "pencil.and.list.clipboard")
                .font(.headline)
                .foregroundStyle(Self.compoEdge)
                .frame(width: 34, height: 34)
                .background(Self.compoBg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(running ? "COMPOSITIONS EN COURS" : "SEMAINE DE COMPOSITIONS")
                    .font(.caption2.weight(.bold))
                    .tracking(0.5)
                    .foregroundStyle(Self.compoText)
                Text(s.title?.isEmpty == false ? s.title! : (s.periodLabel ?? "Compositions"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text((range.isEmpty ? "" : "Du \(range) · ") + "les épreuves remplacent les cours.")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(cardBackground)
        .overlay(alignment: .leading) { Rectangle().fill(Self.compoEdge).frame(width: 4) }
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private static func shortFrDate(_ iso: String) -> String {
        let inF = DateFormatter()
        inF.locale = Locale(identifier: "en_US_POSIX")
        inF.dateFormat = "yyyy-MM-dd"
        guard let d = inF.date(from: iso) else { return iso }
        let out = DateFormatter()
        out.locale = Locale(identifier: "fr_FR")
        out.dateFormat = "d MMMM"
        return out.string(from: d)
    }

    private var emptyDayCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "sun.haze.fill")
                .font(.title2)
                .foregroundStyle(EduTheme.teal)
            Text(selectedDayIsComposition ? "Pas d’épreuve ce jour" : "Pas de cours ce jour")
                .font(.headline)
                .foregroundStyle(EduTheme.ink)
            Text("Choisis un autre jour ou regarde la semaine.")
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 16)
        .background(cardBackground)
    }

    // MARK: - Week list

    private func weekList(at date: Date) -> some View {
        VStack(spacing: 12) {
            ForEach(weekDays) { day in
                let dayItems = weekSlots.filter { $0.dayOfWeek == day.dayOfWeek }.sorted { $0.startTime < $1.startTime }
                weekDayButton(day, dayItems, at: date).id("week-day-\(day.dayOfWeek)")
            }
        }
    }

    private func weekDayButton(_ day: WeekDayItem, _ dayItems: [TimetableSlot], at date: Date) -> some View {
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        selectedDay = day.dayOfWeek
                        if day.isToday { weekOffset = 0 }
                        scope = .day
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(day.longLabel)
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(EduTheme.ink)
                            if day.isToday {
                                Text("AUJ.")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(EduTheme.fasoGreen, in: Capsule())
                            }
                            Spacer()
                            Text(dayItems.isEmpty ? "Libre" : (dayItems.contains(where: CompositionSchedule.isComposition)
                                ? "\(dayItems.count) épreuve\(dayItems.count > 1 ? "s" : "")"
                                : "\(dayItems.count) cours"))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(EduTheme.muted)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(EduTheme.muted)
                        }

                        if dayItems.isEmpty {
                            Text("Aucun cours")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        } else {
                            VStack(spacing: 0) {
                                ForEach(Array(dayItems.enumerated()), id: \.element.id) { index, slot in
                                    if index > 0 { Divider() }
                                    weekCourseRow(
                                        slot,
                                        isLive: day.isToday && weekOffset == 0 && isSlotLive(slot, at: date),
                                        isNext: day.isToday && weekOffset == 0 && isSlotNext(slot, at: date)
                                    )
                                }
                            }
                            .background(
                                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                                    .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                            )
                        }
                    }
                    .padding(14)
                    .background(cardBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                            .stroke(
                                day.isToday && weekOffset == 0
                                ? EduTheme.fasoGreen.opacity(0.45)
                                : (day.dayOfWeek == selectedDay ? EduTheme.teal.opacity(0.28) : Color.clear),
                                lineWidth: 1.5
                            )
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
    }

    private func isSlotLive(_ slot: TimetableSlot, at date: Date) -> Bool {
        let now = minutesNow(date)
        return minutes(slot.startTime) <= now && now < minutes(slot.endTime)
    }

    private func isSlotNext(_ slot: TimetableSlot, at date: Date) -> Bool {
        guard !isSlotLive(slot, at: date) else { return false }
        let now = minutesNow(date)
        guard let next = slotsForWeek(0)
            .filter({ $0.dayOfWeek == todayWeekday })
            .sorted(by: { $0.startTime < $1.startTime })
            .first(where: { minutes($0.startTime) > now })
        else { return false }
        return next.id == slot.id
    }

    private func weekCourseRow(_ slot: TimetableSlot, isLive: Bool, isNext: Bool) -> some View {
        let swatch = SubjectPalette.swatch(for: slot.matieres?.name)
        return HStack(spacing: 10) {
            Capsule()
                .fill(isLive ? EduTheme.fasoGreen : swatch.border)
                .frame(width: 4, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(slot.matieres?.name ?? "Cours")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    if CompositionSchedule.isComposition(slot) && !isLive {
                        Text("COMPOSITION")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Self.compoText)
                    }
                    if isLive {
                        Text("EN COURS")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.fasoGreen)
                    } else if isNext {
                        Text("PROCHAIN")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.teal)
                    }
                }
                Text([
                    "\(blockStart(slot))–\(clock(minutes(slot.endTime)))",
                    isTeacherMode ? slot.classes?.name : slot.teacherName,
                    isTeacherMode ? nil : formatRoom(slot.room),
                ].compactMap { $0 }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
                .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(isLive ? EduTheme.fasoGreen.opacity(0.08) : Color.clear)
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
            .fill(.white)
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    /// Same header as the web page: title, class and « du lundi au samedi », PDF button.
    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(titleText)
                        .font(.system(size: 24, weight: .bold))
                        .tracking(-0.3)
                        .foregroundStyle(EduTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(({ if case .student = mode, let c = className { return "Classe \(c) · " } else { return "" } }()) + "du lundi au samedi · mis à jour en direct")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                }
                Spacer(minLength: 0)
                TourHelpButton(onDark: false) { tour.start(tourSteps, registry: coach) }
                    .coachMarkTarget("edt.help")
            }
            Button {
                Task { await exportPdf() }
            } label: {
                HStack(spacing: 8) {
                    if exporting { ProgressView().tint(.white) } else { Image(systemName: "arrow.down.doc") }
                    Text(exporting ? "Export…" : "Télécharger le PDF")
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(exporting || slots.isEmpty || !ready)
            .coachMarkTarget("edt.pdf")
        }
    }

    // MARK: - Data

    private func load(isRefresh: Bool) async {
        if !isRefresh && !ready { loading = true }
        error = nil
        do {
            let api = EduAPI()
            switch mode {
            case .teacher:
                guard let tid = auth.userId else {
                    slots = []; loading = false; ready = true; return
                }
                className = "Mes classes"
                slots = try await api.fetchTeacherTimetable(teacherId: tid)
                let classIds = Array(Set(slots.compactMap(\.classSectionId)))
                teacherCompositions = (try? await api.fetchCompositionSessions(classSectionIds: classIds)) ?? [:]
            case .classSection(let classId):
                className = nil
                async let compoTask = api.fetchCompositionSessions(classSectionId: classId)
                slots = try await api.fetchTimetable(classSectionId: classId)
                compositions = (try? await compoTask) ?? []
            case .student:
                let sid = studentIdOverride ?? auth.userId
                guard let sid, let enrollment = try await api.activeEnrollment(studentId: sid) else {
                    slots = []; loading = false; ready = true; return
                }
                async let compoTask = api.fetchCompositionSessions(classSectionId: enrollment.classId)
                let fetched = try await api.fetchTimetable(classSectionId: enrollment.classId)
                let compos = (try? await compoTask) ?? []
                if Task.isCancelled { return }
                className = enrollment.className
                slots = fetched
                compositions = compos
            }
            if !isRefresh {
                let start = smartStart()
                weekOffset = start.weekOffset
                selectedDay = start.day
            }
        } catch {
            if Task.isCancelled || error.isCancellation { return }
            self.error = error.localizedDescription
        }
        loading = false
        ready = true
    }

    // MARK: - Helpers

    private static func buildTimeline(from items: [TimetableSlot], pauseGapMin: Int) -> [TimelineBlock] {
        guard !items.isEmpty else { return [] }
        var blocks: [TimelineBlock] = []
        for (index, slot) in items.enumerated() {
            let start = Self.minutesStatic(slot.startTime)
            let end = Self.minutesStatic(slot.endTime)
            if index > 0 {
                let prevEnd = Self.minutesStatic(items[index - 1].endTime)
                if start - prevEnd >= pauseGapMin {
                    blocks.append(
                        TimelineBlock(
                            id: "pause-\(prevEnd)-\(start)",
                            kind: .pause(start: prevEnd, end: start),
                            startLabel: Self.clockStatic(prevEnd),
                            endLabel: Self.clockStatic(start)
                        )
                    )
                }
            }
            blocks.append(
                TimelineBlock(
                    id: slot.id,
                    kind: .course(slot),
                    startLabel: Self.clockStatic(start),
                    endLabel: Self.clockStatic(end)
                )
            )
        }
        return blocks
    }

    private func blockStart(_ slot: TimetableSlot) -> String {
        clock(minutes(slot.startTime))
    }

    private func minutes(_ time: String) -> Int { Self.minutesStatic(time) }
    private func clock(_ minutes: Int) -> String { Self.clockStatic(minutes) }

    private static func minutesStatic(_ time: String) -> Int {
        let parts = time.split(separator: ":")
        let h = Int(parts.first ?? "0") ?? 0
        let m = parts.count > 1 ? (Int(parts[1]) ?? 0) : 0
        return h * 60 + m
    }

    private static func clockStatic(_ minutes: Int) -> String {
        let h = minutes / 60
        let m = minutes % 60
        return m == 0 ? "\(h)h" : String(format: "%dh%02d", h, m)
    }

    private func formatRoom(_ room: String?) -> String? {
        guard let trimmed = room?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        if trimmed.lowercased().hasPrefix("salle") { return trimmed }
        if trimmed.first?.isNumber == true { return "Salle \(trimmed)" }
        return trimmed
    }

    private func dayName(_ day: Int) -> String {
        let names = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        return (day >= 1 && day <= 7) ? names[day] : "Jour"
    }
}

// MARK: - Timeline model

private struct TimelineBlock: Identifiable {
    enum Kind {
        case course(TimetableSlot)
        case pause(start: Int, end: Int)
    }
    let id: String
    let kind: Kind
    let startLabel: String
    let endLabel: String
}

// MARK: - Week calendar + colors

private struct WeekDayItem: Identifiable {
    var id: Int { dayOfWeek }
    let dayOfWeek: Int
    let dayNumber: Int
    let shortName: String
    let longLabel: String
    let isToday: Bool

    func hasSlots(in slots: [TimetableSlot]) -> Bool {
        slots.contains { $0.dayOfWeek == dayOfWeek }
    }
}

private struct WeekOption: Identifiable {
    var id: Int { offset }
    let offset: Int
    let badge: String
    let rangeLabel: String
}

private enum WeekCalendar {
    static func week(containing reference: Date) -> [WeekDayItem] {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        cal.locale = Locale(identifier: "fr_FR")
        let today = cal.startOfDay(for: Date())
        let ref = cal.startOfDay(for: reference)
        let weekday = cal.component(.weekday, from: ref)
        let mondayOffset = (weekday + 5) % 7
        guard let monday = cal.date(byAdding: .day, value: -mondayOffset, to: ref) else { return [] }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "EEEE d MMM"
        let short = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
        return (0..<6).compactMap { offset in
            guard let date = cal.date(byAdding: .day, value: offset, to: monday) else { return nil }
            return WeekDayItem(
                dayOfWeek: offset + 1,
                dayNumber: cal.component(.day, from: date),
                shortName: short[offset],
                longLabel: formatter.string(from: date).capitalized,
                isToday: cal.isDate(date, inSameDayAs: today)
            )
        }
    }

    static func weekOption(offset: Int, from today: Date) -> WeekOption {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        cal.locale = Locale(identifier: "fr_FR")
        let base = cal.startOfDay(for: today)
        let weekday = cal.component(.weekday, from: base)
        let mondayOffset = (weekday + 5) % 7
        let thisMonday = cal.date(byAdding: .day, value: -mondayOffset, to: base) ?? base
        let monday = cal.date(byAdding: .weekOfYear, value: offset, to: thisMonday) ?? thisMonday
        let saturday = cal.date(byAdding: .day, value: 5, to: monday) ?? monday

        let dayFormatter = DateFormatter()
        dayFormatter.locale = Locale(identifier: "fr_FR")
        dayFormatter.dateFormat = "d"

        let monthFormatter = DateFormatter()
        monthFormatter.locale = Locale(identifier: "fr_FR")
        monthFormatter.dateFormat = "MMM"

        let startDay = dayFormatter.string(from: monday)
        let endDay = dayFormatter.string(from: saturday)
        let endMonth = monthFormatter.string(from: saturday)
        let startMonth = monthFormatter.string(from: monday)
        let range: String
        if startMonth == endMonth {
            range = "\(startDay)–\(endDay) \(endMonth)"
        } else {
            range = "\(startDay) \(startMonth) – \(endDay) \(endMonth)"
        }

        let badge: String
        switch offset {
        case 0: badge = "Cette sem."
        case -1: badge = "Sem. passée"
        case 1: badge = "Sem. proch."
        case let n where n < 0: badge = "Il y a \(-n) sem."
        default: badge = "Dans \(offset) sem."
        }

        return WeekOption(offset: offset, badge: badge, rangeLabel: range)
    }
}
