import SwiftUI

struct TimetableView: View {
    enum Mode { case student, teacher, classSection(String) }
    private enum Scope: String, CaseIterable { case day = "Jour", week = "Semaine" }

    let mode: Mode
    var studentIdOverride: String? = nil

    @EnvironmentObject private var auth: AuthViewModel
    @State private var slots: [TimetableSlot] = []
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?
    @State private var scope: Scope = .day
    @State private var selectedDay: Int = Self.defaultSelectedDay()
    /// 0 = current calendar week; ±1 previous/next, etc.
    @State private var weekOffset: Int = 0

    private let pauseGapMin = 90
    private let weekPickerRange = -2...2

    private var titleText: String {
        switch mode {
        case .student, .teacher: return "Mon emploi du temps"
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
        selectedDay == todayWeekday && todayWeekday != 7
    }

    private var daySlots: [TimetableSlot] {
        slots.filter { $0.dayOfWeek == selectedDay }.sorted { $0.startTime < $1.startTime }
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
                    TimelineView(.periodic(from: .now, by: 30)) { context in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 16) {
                                scopePicker
                                if scope == .day {
                                    dayStrip
                                    daySummaryCard(at: context.date)
                                    dayTimeline(at: context.date)
                                } else {
                                    weekStrip
                                    weekSummaryCard
                                    weekList(at: context.date)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        }
                        .refreshable { await load(isRefresh: true) }
                    }
                }
            }
        }
        .premiumTitle(titleText)
        .task { await load(isRefresh: false) }
        .onAppear { snapToNow() }
    }

    private func snapToNow() {
        weekOffset = 0
        selectedDay = Self.defaultSelectedDay()
        scope = .day
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
            ForEach(WeekCalendar.week(containing: Date())) { day in
                let selected = selectedDay == day.dayOfWeek
                let isToday = day.dayOfWeek == todayIndex
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        weekOffset = 0
                        selectedDay = day.dayOfWeek
                        scope = .day
                    }
                } label: {
                    VStack(spacing: 4) {
                        Text(day.shortName)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(isToday ? EduTheme.fasoGreen : (selected ? EduTheme.navy : EduTheme.muted))
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
                            Circle()
                                .fill(day.hasSlots(in: slots) ? (selected ? EduTheme.navy : EduTheme.teal) : Color.clear)
                                .frame(width: 5, height: 5)
                                .padding(.vertical, 3)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(
                                selected
                                ? Color.white
                                : (isToday ? EduTheme.fasoGreen.opacity(0.12) : Color.clear)
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
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
            RoundedRectangle(cornerRadius: 16, style: .continuous)
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
                        .foregroundStyle(weekOffset == option.offset ? EduTheme.navy : EduTheme.muted)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
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
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
        )
    }

    private var weekSummaryCard: some View {
        let total = slots.filter { slot in weekDays.contains(where: { $0.dayOfWeek == slot.dayOfWeek }) }.count
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
        let live = nowSlot(at: date)
        let upcoming = nextSlot(at: date)
        let clockLabel = Self.clockStatic(minutesNow(date))

        return HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill((live != nil ? EduTheme.fasoGreen : EduTheme.navy).opacity(0.12))
                Image(systemName: live != nil ? "clock.fill" : "calendar")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(live != nil ? EduTheme.fasoGreen : EduTheme.navy)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(selectedDaySubtitle.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(EduTheme.muted)
                        .tracking(0.5)
                        .lineLimit(1)
                    if isViewingToday {
                        Text(clockLabel)
                            .font(.caption2.weight(.bold).monospacedDigit())
                            .foregroundStyle(EduTheme.navy)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(EduTheme.navy.opacity(0.08), in: Capsule())
                    }
                }

                if dayCourseCount == 0 {
                    Text(isViewingToday ? "Aucun cours aujourd’hui" : "Aucun cours")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                } else if let live {
                    Text("En cours · \(live.matieres?.name ?? "Cours")")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    Text("\(blockStart(live)) – \(clock(minutes(live.endTime)))")
                        .font(.caption)
                        .foregroundStyle(EduTheme.fasoGreen)
                } else if let upcoming {
                    Text("Prochain · \(upcoming.matieres?.name ?? "Cours")")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    Text("À \(blockStart(upcoming))")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                } else if isViewingToday {
                    Text("Journée terminée")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    if let dayWindowLabel {
                        Text("\(dayCourseCount) cours · \(dayWindowLabel)")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                } else {
                    Text("\(dayCourseCount) cours")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    if let dayWindowLabel {
                        Text(dayWindowLabel)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(cardBackground)
    }

    private var selectedDaySubtitle: String {
        let days = WeekCalendar.week(containing: Date())
        if let item = days.first(where: { $0.dayOfWeek == selectedDay }) {
            return item.isToday ? "\(item.longLabel) · aujourd’hui" : item.longLabel
        }
        return dayName(selectedDay)
    }

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
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(liveCourse || livePause ? EduTheme.fasoGreen.opacity(0.08) : Color.clear)
        )
    }

    private func courseRow(_ slot: TimetableSlot, isLive: Bool, isNext: Bool) -> some View {
        let swatch = SubjectPalette.swatch(for: slot.matieres?.name)
        return HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(isLive ? EduTheme.fasoGreen : swatch.border)
                .frame(width: 4)
                .padding(.vertical, 2)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(slot.matieres?.name ?? "Cours")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if isLive {
                        Text("EN COURS")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(EduTheme.fasoGreen, in: Capsule())
                    } else if isNext {
                        Text("PROCHAIN")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.navy)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(EduTheme.navy.opacity(0.1), in: Capsule())
                    }
                }

                HStack(spacing: 8) {
                    if let teacher = slot.teacherName {
                        Label(teacher, systemImage: "person.fill")
                    }
                    if let room = formatRoom(slot.room) {
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
            Text(isLive ? "Pause en cours" : "Pause")
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
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }

    private var emptyDayCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "sun.haze.fill")
                .font(.title2)
                .foregroundStyle(EduTheme.teal)
            Text("Pas de cours ce jour")
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
                let dayItems = slots.filter { $0.dayOfWeek == day.dayOfWeek }.sorted { $0.startTime < $1.startTime }
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
                            Text(dayItems.isEmpty ? "Libre" : "\(dayItems.count) cours")
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
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                            )
                        }
                    }
                    .padding(14)
                    .background(cardBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(
                                day.isToday && weekOffset == 0
                                ? EduTheme.fasoGreen.opacity(0.45)
                                : (day.dayOfWeek == selectedDay ? EduTheme.navy.opacity(0.28) : Color.clear),
                                lineWidth: 1.5
                            )
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func isSlotLive(_ slot: TimetableSlot, at date: Date) -> Bool {
        let now = minutesNow(date)
        return minutes(slot.startTime) <= now && now < minutes(slot.endTime)
    }

    private func isSlotNext(_ slot: TimetableSlot, at date: Date) -> Bool {
        guard !isSlotLive(slot, at: date) else { return false }
        let now = minutesNow(date)
        guard let next = slots
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
                    if isLive {
                        Text("EN COURS")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.fasoGreen)
                    } else if isNext {
                        Text("PROCHAIN")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.navy)
                    }
                }
                Text([
                    "\(blockStart(slot))–\(clock(minutes(slot.endTime)))",
                    slot.teacherName,
                    formatRoom(slot.room),
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
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.white)
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
                slots = try await api.fetchTeacherTimetable(teacherId: tid)
            case .classSection(let classId):
                slots = try await api.fetchTimetable(classSectionId: classId)
            case .student:
                let sid = studentIdOverride ?? auth.userId
                guard let sid, let classId = try await api.activeEnrollment(studentId: sid)?.classId else {
                    slots = []; loading = false; ready = true; return
                }
                slots = try await api.fetchTimetable(classSectionId: classId)
            }
            if !isRefresh {
                weekOffset = 0
                selectedDay = Self.defaultSelectedDay()
            }
        } catch {
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
