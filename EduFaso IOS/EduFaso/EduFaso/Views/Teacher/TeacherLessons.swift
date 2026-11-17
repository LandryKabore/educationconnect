import Foundation
import Supabase

/// Like the web `useTeacherLessons` / `useTeacherTodo`: the teacher's day is made of LESSONS
/// (one timetable slot on one date). Each lesson has two jobs: the roll call (presences for
/// class + subject + date) and the cahier de textes (an entry for that slot and date).
/// Jobs not done once the lesson is over are late; late jobs are kept for `lateDays` days.
enum TeacherLessons {
    static let lateDays = 7
    static let gradingDays = 45

    enum Job: Equatable { case done, partial, todo }
    enum Timing: Equatable { case upcoming, live, over }

    struct Lesson: Identifiable, Hashable {
        var id: String { "\(slotId)|\(date)" }
        let slotId: String
        let date: String
        let classId: String
        let className: String
        let subjectId: String
        let subjectName: String
        let start: String
        let end: String
        let room: String?
        let timing: Timing
        let studentCount: Int
        let appel: Job
        let cahier: Job
        var appelDue: Bool { timing != .upcoming && studentCount > 0 }
        var cahierDue: Bool { timing == .over }
        var isLate: Bool { (appelDue && appel != .done) || (cahierDue && cahier != .done) }

        static func == (a: Lesson, b: Lesson) -> Bool { a.id == b.id && a.appel == b.appel && a.cahier == b.cahier && a.timing == b.timing }
        func hash(into h: inout Hasher) { h.combine(id) }
    }

    struct Ungraded: Identifiable, Hashable {
        let evaluation: EvaluationRow
        let missing: Int
        let studentCount: Int
        var id: String { evaluation.id }
    }

    /// Raw rows read once; lessons are rebuilt from them every minute.
    struct Snapshot {
        var slots: [TimetableSlot] = []
        var students: [String: Int] = [:]
        var presences: [PresenceMark] = []
        var entries: [CahierMark] = []
        var ungraded: [Ungraded] = []
        var pendingExams: [EvaluationRow] = []
        /// Composition sessions per class: on those days the class has papers, not lessons.
        var compositions: [String: [StudentCompositionSession]] = [:]
    }

    struct PresenceMark: Decodable {
        let class_section_id: String
        let subject_id: String?
        let date: String
    }

    struct CahierMark: Decodable {
        let id: String
        let creneau_id: String?
        let class_section_id: String?
        let subject_id: String?
        let entry_date: String
    }

    // MARK: - Building lessons

    static func minutes(_ hhmm: String) -> Int {
        let p = hhmm.split(separator: ":")
        guard p.count >= 2, let h = Int(p[0]), let m = Int(p[1]) else { return 0 }
        return h * 60 + m
    }

    static func minutes(of date: Date) -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    /// Lessons from `lateDays` days ago to today (Sunday has none).
    static func lessons(_ s: Snapshot, now: Date) -> [Lesson] {
        var roll: [String: Int] = [:]
        for p in s.presences { roll["\(p.class_section_id)|\(p.subject_id ?? "")|\(p.date)", default: 0] += 1 }
        let today = EduDates.day(now)
        let nowMin = minutes(of: now)
        var out: [Lesson] = []
        for back in stride(from: lateDays, through: 0, by: -1) {
            guard let d = Calendar.current.date(byAdding: .day, value: -back, to: now) else { continue }
            let dow = EduDates.weekday(d)
            if dow == 7 { continue }
            let date = EduDates.day(d)
            for slot in s.slots where slot.dayOfWeek == dow {
                guard let classId = slot.classSectionId else { continue }
                if CompositionSchedule.session(of: classId, on: date, in: s.compositions) != nil { continue }
                let subjectId = slot.subjectId ?? ""
                let timing: Timing = date < today || nowMin >= minutes(slot.endTime)
                    ? .over
                    : (nowMin >= minutes(slot.startTime) ? .live : .upcoming)
                let recorded = roll["\(classId)|\(subjectId)|\(date)"] ?? 0
                let count = s.students[classId] ?? 0
                let appel: Job = count > 0 && recorded >= count ? .done : (recorded > 0 ? .partial : .todo)
                let entry = s.entries.first { $0.creneau_id == slot.id && $0.entry_date.prefix(10) == date }
                    ?? s.entries.first {
                        $0.creneau_id == nil && $0.class_section_id == classId && $0.subject_id == subjectId && $0.entry_date.prefix(10) == date
                    }
                out.append(Lesson(
                    slotId: slot.id, date: date, classId: classId,
                    className: slot.classes?.name ?? "Classe",
                    subjectId: subjectId, subjectName: slot.matieres?.name ?? "Cours",
                    start: slot.startTime, end: slot.endTime, room: slot.room,
                    timing: timing, studentCount: count,
                    appel: appel, cahier: entry != nil ? .done : .todo
                ))
            }
        }
        return out
    }

    static func today(_ lessons: [Lesson], now: Date) -> [Lesson] {
        let today = EduDates.day(now)
        return lessons.filter { $0.date == today }.sorted { $0.start < $1.start }
    }

    /// Late lessons, newest day first.
    static func late(_ lessons: [Lesson], now: Date) -> [Lesson] {
        let today = EduDates.day(now)
        return lessons
            .filter { $0.isLate && ($0.date < today || $0.timing == .over) }
            .sorted { $0.date != $1.date ? $0.date > $1.date : $0.start < $1.start }
    }

    /// Next day after today with lessons (for « no class today » days).
    static func nextDay(_ slots: [TimetableSlot], compositions: [String: [StudentCompositionSession]] = [:], now: Date) -> (date: String, first: TimetableSlot, count: Int)? {
        for i in 1...7 {
            guard let d = Calendar.current.date(byAdding: .day, value: i, to: now) else { continue }
            let dow = EduDates.weekday(d)
            if dow == 7 { continue }
            let iso = EduDates.day(d)
            let day = slots
                .filter { $0.dayOfWeek == dow && CompositionSchedule.session(of: $0.classSectionId, on: iso, in: compositions) == nil }
                .sorted { $0.startTime < $1.startTime }
            if let first = day.first { return (EduDates.day(d), first, day.count) }
        }
        return nil
    }

    // MARK: - Loading

    static func load(teacherId: String, now: Date = Date()) async throws -> Snapshot {
        let api = EduAPI()
        var snap = Snapshot()
        snap.slots = try await api.fetchTeacherTimetable(teacherId: teacherId)
        let classIds = Array(Set(snap.slots.compactMap(\.classSectionId))).sorted()
        let today = EduDates.day(now)
        let from = EduDates.day(Calendar.current.date(byAdding: .day, value: -lateDays, to: now) ?? now)
        let since = EduDates.day(Calendar.current.date(byAdding: .day, value: -gradingDays, to: now) ?? now)

        async let presences = api.fetchPresenceMarks(classIds: classIds, from: from, to: today)
        async let entries = api.fetchCahierMarks(teacherId: teacherId, from: from, to: today)
        async let evals = api.fetchTeacherTodoEvaluations(teacherId: teacherId, since: since)
        async let compos = api.fetchCompositionSessions(classSectionIds: classIds)
        snap.presences = try await presences
        snap.entries = try await entries
        let rows = try await evals
        snap.compositions = (try? await compos) ?? [:]

        snap.pendingExams = rows.filter {
            $0.type == "examen" && $0.adminConfirmed != true && ($0.evalDate.map { String($0.prefix(10)) >= today } ?? true)
        }
        let past = rows.filter { r in
            guard let d = r.evalDate?.prefix(10), String(d) <= today else { return false }
            return r.type == "interrogation" || r.adminConfirmed == true
        }
        let allClassIds = Array(Set(classIds + past.compactMap(\.classSectionId)))
        snap.students = try await api.fetchTeacherClassStats(classIds: allClassIds).counts
        if !past.isEmpty {
            let graded = try await api.fetchGradeCounts(evaluationIds: past.map(\.id))
            snap.ungraded = past.compactMap { r in
                let count = snap.students[r.classSectionId ?? ""] ?? 0
                let missing = max(0, count - (graded[r.id] ?? 0))
                return missing > 0 && count > 0 ? Ungraded(evaluation: r, missing: missing, studentCount: count) : nil
            }
            .sorted { ($0.evaluation.evalDate ?? "") > ($1.evaluation.evalDate ?? "") }
        }
        return snap
    }
}

extension EduAPI {
    /// Supabase returns at most 1 000 rows per request: read in pages.
    private func readAll<T: Decodable>(_ page: (Int, Int) async throws -> [T]) async throws -> [T] {
        var out: [T] = []
        var start = 0
        while true {
            let rows = try await page(start, start + 999)
            out.append(contentsOf: rows)
            if rows.count < 1000 { break }
            start += 1000
        }
        return out
    }

    func fetchPresenceMarks(classIds: [String], from: String, to: String) async throws -> [TeacherLessons.PresenceMark] {
        guard !classIds.isEmpty else { return [] }
        return try await readAll { a, b in
            try await client.from("presences")
                .select("class_section_id, subject_id, date")
                .in("class_section_id", values: classIds)
                .gte("date", value: from)
                .lte("date", value: to)
                .range(from: a, to: b)
                .execute()
                .value
        }
    }

    func fetchCahierMarks(teacherId: String, from: String, to: String) async throws -> [TeacherLessons.CahierMark] {
        try await readAll { a, b in
            try await client.from("cahier_entrees")
                .select("id, creneau_id, class_section_id, subject_id, entry_date")
                .eq("teacher_id", value: teacherId)
                .gte("entry_date", value: from)
                .lte("entry_date", value: to)
                .range(from: a, to: b)
                .execute()
                .value
        }
    }

    /// Quizzes and exams of the last `gradingDays` days (or undated), newest first.
    func fetchTeacherTodoEvaluations(teacherId: String, since: String) async throws -> [EvaluationRow] {
        try await client.from("evaluations")
            .select("id, title, eval_date, start_time, end_time, type, period_label, max_score, admin_confirmed, subject_id, class_section_id, teacher_id, description, matieres(name), classes(name)")
            .eq("teacher_id", value: teacherId)
            .in("type", values: ["interrogation", "examen"])
            .or("eval_date.gte.\(since),eval_date.is.null")
            .order("eval_date", ascending: false)
            .execute()
            .value
    }

    /// Number of grades entered per evaluation.
    func fetchGradeCounts(evaluationIds: [String]) async throws -> [String: Int] {
        struct Row: Decodable { let evaluation_id: String }
        let rows: [Row] = try await readAll { a, b in
            try await client.from("notes")
                .select("evaluation_id")
                .in("evaluation_id", values: evaluationIds)
                .range(from: a, to: b)
                .execute()
                .value
        }
        var out: [String: Int] = [:]
        for r in rows { out[r.evaluation_id, default: 0] += 1 }
        return out
    }
}
