import Foundation

/// During a composition session the class timetable is replaced by the papers (épreuves):
/// on every day between `starts_on` and `ends_on` the regular lessons give way to that day's papers.
enum CompositionSchedule {
    static let idPrefix = "compo-"

    static func isComposition(_ slot: TimetableSlot) -> Bool { slot.id.hasPrefix(idPrefix) }

    /// The session running on this ISO day (yyyy-MM-dd), if any.
    static func session(on iso: String, in sessions: [StudentCompositionSession]) -> StudentCompositionSession? {
        sessions.first { s in
            guard let start = s.startsOn?.prefix(10), let end = s.endsOn?.prefix(10) else { return false }
            return iso >= String(start) && iso <= String(end)
        }
    }

    /// The session running today, or the next one starting within `withinDays`.
    static func current(in sessions: [StudentCompositionSession], withinDays: Int = 7, now: Date = Date()) -> StudentCompositionSession? {
        let today = EduDates.day(now)
        if let running = session(on: today, in: sessions) { return running }
        let limit = EduDates.day(Calendar.current.date(byAdding: .day, value: withinDays, to: now) ?? now)
        func start(_ s: StudentCompositionSession) -> String { String((s.startsOn ?? "").prefix(10)) }
        let soon = sessions.filter { s in
            let d = start(s)
            return d > today && d <= limit
        }
        return soon.min { start($0) < start($1) }
    }

    /// Papers of a session on one day, as timetable slots.
    static func slots(of session: StudentCompositionSession, on iso: String, dayOfWeek: Int) -> [TimetableSlot] {
        session.papers
            .filter { $0.evalDate.map { String($0.prefix(10)) } == iso }
            .compactMap { p in
                guard let start = p.startTime, let end = p.endTime else { return nil }
                return TimetableSlot(
                    id: idPrefix + p.id,
                    dayOfWeek: dayOfWeek,
                    startTime: start,
                    endTime: end,
                    room: nil,
                    classSectionId: nil,
                    subjectId: nil,
                    matieres: p.matieres,
                    classes: nil,
                    profils: nil
                )
            }
            .sorted { $0.startTime < $1.startTime }
    }

    /// ISO date of a weekday (1 = Monday … 7 = Sunday) in the week `weekOffset` weeks from now.
    static func isoDate(weekday: Int, weekOffset: Int, now: Date = Date()) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        let today = cal.startOfDay(for: now)
        let monday = cal.date(byAdding: .day, value: -(EduDates.weekday(today) - 1), to: today) ?? today
        let date = cal.date(byAdding: .day, value: weekOffset * 7 + weekday - 1, to: monday) ?? today
        return EduDates.day(date)
    }

    /// The week's timetable with composition days swapped for their papers.
    static func week(slots: [TimetableSlot], sessions: [StudentCompositionSession], weekOffset: Int, now: Date = Date()) -> [TimetableSlot] {
        guard !sessions.isEmpty else { return slots }
        return (1...7).flatMap { day -> [TimetableSlot] in
            let iso = isoDate(weekday: day, weekOffset: weekOffset, now: now)
            if let s = session(on: iso, in: sessions) {
                return self.slots(of: s, on: iso, dayOfWeek: day)
            }
            return slots.filter { $0.dayOfWeek == day }
        }
    }
}
