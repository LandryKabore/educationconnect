import Foundation
import Supabase

actor EduAPI {
    let client = SupabaseManager.client

    enum InboxKind {
        case personal
        case announcements
        case all
    }

    func fetchGrades(studentId: String, limit: Int = 400) async throws -> [GradeRow] {
        try await client
            .from("notes")
            .select("id, score, max_score, period_label, subject_id, evaluation_id, created_at, is_absent, matieres(id, name), evaluations(type, title, eval_date)")
            .eq("student_id", value: studentId)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    func fetchAttendance(studentId: String, limit: Int = 200) async throws -> [AttendanceRow] {
        try await client
            .from("presences")
            .select("id, date, status, subject_id, note, matieres(name)")
            .eq("student_id", value: studentId)
            .order("date", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    func fetchAttendanceCounts(studentId: String) async throws -> StudentAttendanceCounts {
        try await client
            .rpc("ef_attendance_counts", params: ["p_student": studentId])
            .execute()
            .value
    }

    /// Exact period/subject totals via 4 HEAD count queries (same as web useAttendanceOverview).
    func fetchAttendanceTotals(
        studentId: String,
        from: String?,
        to: String?,
        subjectId: String?
    ) async throws -> AttendanceTotals {
        async let total = countPresences(studentId: studentId, from: from, to: to, subjectId: subjectId, status: nil)
        async let absent = countPresences(studentId: studentId, from: from, to: to, subjectId: subjectId, status: "absent")
        async let late = countPresences(studentId: studentId, from: from, to: to, subjectId: subjectId, status: "late")
        async let excused = countPresences(studentId: studentId, from: from, to: to, subjectId: subjectId, status: "excused")
        let t = try await total
        let a = try await absent
        let l = try await late
        let e = try await excused
        return AttendanceTotals(
            total: t,
            present: max(t - a - l - e, 0),
            absent: a,
            late: l,
            excused: e
        )
    }

    func fetchAttendanceExceptions(
        studentId: String,
        from: String?,
        to: String?,
        subjectId: String?,
        status: String?,
        offset: Int,
        limit: Int = 30
    ) async throws -> [AttendanceRow] {
        var query = client
            .from("presences")
            .select("id, date, status, subject_id, note, matieres(name)")
            .eq("student_id", value: studentId)
            .neq("status", value: "present")
        if let from { query = query.gte("date", value: from) }
        if let to { query = query.lte("date", value: to) }
        if let subjectId, !subjectId.isEmpty { query = query.eq("subject_id", value: subjectId) }
        if let status, !status.isEmpty { query = query.eq("status", value: status) }
        return try await query
            .order("date", ascending: false)
            .order("id", ascending: true)
            .range(from: offset, to: offset + limit - 1)
            .execute()
            .value
    }

    /// Current school year + custom trimester dates (RLS-scoped, same as web useAttendancePeriods).
    func fetchAttendancePeriodContext() async throws -> (start: String?, end: String?, custom: [(label: String, from: String?, to: String?)]) {
        struct YearSlice: Decodable {
            let id: String
            let start_date: String
            let end_date: String
        }
        struct CustomSlice: Decodable {
            let label: String
            let start_date: String?
            let end_date: String?
        }
        let years: [YearSlice] = try await client
            .from("annees_scolaires")
            .select("id, start_date, end_date")
            .eq("is_current", value: true)
            .order("start_date", ascending: false)
            .limit(1)
            .execute()
            .value
        guard let year = years.first else {
            return (nil, nil, [])
        }
        let custom: [CustomSlice] = (try? await client
            .from("periodes_scolaires")
            .select("label, start_date, end_date")
            .eq("academic_year_id", value: year.id)
            .execute()
            .value) ?? []
        return (
            year.start_date,
            year.end_date,
            custom.map { ($0.label, $0.start_date, $0.end_date) }
        )
    }

    private func countPresences(
        studentId: String,
        from: String?,
        to: String?,
        subjectId: String?,
        status: String?
    ) async throws -> Int {
        var query = client
            .from("presences")
            .select("id", head: true, count: .exact)
            .eq("student_id", value: studentId)
        if let from { query = query.gte("date", value: from) }
        if let to { query = query.lte("date", value: to) }
        if let subjectId, !subjectId.isEmpty { query = query.eq("subject_id", value: subjectId) }
        if let status { query = query.eq("status", value: status) }
        let response = try await query.execute()
        return response.count ?? 0
    }

    func fetchStudentClassId(studentId: String) async throws -> String? {
        try await activeEnrollment(studentId: studentId)?.classId
    }

    func fetchTimetable(classSectionId: String) async throws -> [TimetableSlot] {
        try await client
            .from("creneaux_edt")
            .select("id, day_of_week, start_time, end_time, room, matieres(name), profils(first_name, last_name)")
            .eq("class_section_id", value: classSectionId)
            .order("day_of_week", ascending: true)
            .order("start_time", ascending: true)
            .execute()
            .value
    }

    func fetchUpcomingEvaluations(classSectionId: String, limit: Int = 20) async throws -> [EvaluationRow] {
        try await client
            .from("evaluations")
            .select("id, title, eval_date, start_time, end_time, type, matieres(name)")
            .eq("class_section_id", value: classSectionId)
            .order("eval_date", ascending: true)
            .limit(limit)
            .execute()
            .value
    }

    func fetchInbox(userId: String, announcementsOnly: Bool = false, kind: InboxKind? = nil, limit: Int = 80) async throws -> [MessageRow] {
        let rows: [MessageRow] = try await client
            .from("messages")
            .select("id, subject, body, created_at, read_at, is_announcement, sender:sender_id(first_name, last_name)")
            .eq("recipient_id", value: userId)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
        let mode = kind ?? (announcementsOnly ? .announcements : .personal)
        switch mode {
        case .all: return rows
        case .announcements: return rows.filter { $0.isAnnouncement == true }
        case .personal: return rows.filter { $0.isAnnouncement != true }
        }
    }

    func markMessageRead(id: String) async throws {
        try await client
            .from("messages")
            .update(["read_at": ISO8601DateFormatter().string(from: Date())])
            .eq("id", value: id)
            .execute()
    }

    func fetchChildren() async throws -> [ChildSummary] {
        do {
            let rows: [ChildSummary] = try await client
                .rpc("ef_my_children_summary")
                .execute()
                .value
            return rows
        } catch {
            struct Link: Decodable { let student_id: String }
            let links: [Link] = try await client
                .from("liens_parent_eleve")
                .select("student_id")
                .execute()
                .value
            var children: [ChildSummary] = []
            for link in links {
                let profiles: [Profile] = try await client
                    .from("profils")
                    .select("id, first_name, last_name, email, phone, avatar_url, date_of_birth, gender, address, matricule, must_change_password, family_managed, last_login_at, active")
                    .eq("id", value: link.student_id)
                    .limit(1)
                    .execute()
                    .value
                if let p = profiles.first {
                    children.append(ChildSummary(id: p.id, firstName: p.firstName, lastName: p.lastName, className: nil))
                }
            }
            return children
        }
    }

    func fetchTeachingAssignments(teacherId: String) async throws -> [TeachingAssignment] {
        try await client
            .from("affectations_enseignement")
            .select("id, class_section_id, subject_id, classes:class_section_id(id, name, grade_level), matieres(name)")
            .eq("teacher_id", value: teacherId)
            .execute()
            .value
    }

    func fetchTeacherTimetable(teacherId: String) async throws -> [TimetableSlot] {
        try await client
            .from("creneaux_edt")
            .select("id, day_of_week, start_time, end_time, room, matieres(name), profils(first_name, last_name)")
            .eq("teacher_id", value: teacherId)
            .order("day_of_week", ascending: true)
            .order("start_time", ascending: true)
            .execute()
            .value
    }

    func fetchStudentsInClass(classSectionId: String) async throws -> [PresenceDraft] {
        struct Row: Decodable {
            let student_id: String
            let profils: PersonName?
        }
        let rows: [Row] = try await client
            .from("inscriptions")
            .select("student_id, profils:student_id(first_name, last_name)")
            .eq("class_section_id", value: classSectionId)
            .eq("status", value: "active")
            .execute()
            .value
        return rows.map {
            PresenceDraft(
                id: $0.student_id,
                studentId: $0.student_id,
                firstName: $0.profils?.firstName ?? "",
                lastName: $0.profils?.lastName ?? "",
                status: "present"
            )
        }
        .sorted { $0.lastName.localizedCaseInsensitiveCompare($1.lastName) == .orderedAscending }
    }

    func saveAttendance(schoolId: String, classSectionId: String, subjectId: String?, date: String, drafts: [PresenceDraft], recordedBy: String) async throws {
        struct Payload: Encodable {
            let school_id: String
            let class_section_id: String
            let subject_id: String?
            let student_id: String
            let date: String
            let status: String
            let recorded_by: String
        }
        let payload = drafts.map {
            Payload(
                school_id: schoolId,
                class_section_id: classSectionId,
                subject_id: subjectId,
                student_id: $0.studentId,
                date: date,
                status: $0.status,
                recorded_by: recordedBy
            )
        }
        try await client
            .from("presences")
            .upsert(payload, onConflict: "student_id,class_section_id,date,subject_id")
            .execute()
    }

    func fetchAnnualAverage(studentId: String, classSectionId: String) async -> AnnualAverageResult? {
        do {
            return try await client
                .rpc(
                    "ef_student_annual_average",
                    params: [
                        "p_student_id": studentId,
                        "p_class_section_id": classSectionId,
                    ]
                )
                .execute()
                .value
        } catch {
            return nil
        }
    }

    func annualAverage(studentId: String, classSectionId: String) async -> Double? {
        await fetchAnnualAverage(studentId: studentId, classSectionId: classSectionId)?.annualAverage
    }

    /// Backward-compatible helper used by older call sites — resolves class then averages.
    func annualAverage(studentId: String) async -> Double? {
        guard let classId = try? await activeEnrollment(studentId: studentId)?.classId else { return nil }
        return await annualAverage(studentId: studentId, classSectionId: classId)
    }

    func fetchBulletinStats(studentId: String, classSectionId: String, periodLabel: String) async throws -> BulletinClassStats {
        try await client
            .rpc(
                "ef_bulletin_class_stats",
                params: [
                    "p_student_id": studentId,
                    "p_class_section_id": classSectionId,
                    "p_period_label": periodLabel,
                ]
            )
            .execute()
            .value
    }

    func fetchCompositionSessions(classSectionId: String) async throws -> [StudentCompositionSession] {
        struct SessionLite: Decodable, Identifiable {
            let id: String
            let title: String?
            let period_label: String?
            let starts_on: String?
            let ends_on: String?
        }
        let sessions: [SessionLite] = try await client
            .from("composition_sessions")
            .select("id, title, period_label, starts_on, ends_on")
            .eq("class_section_id", value: classSectionId)
            .order("starts_on", ascending: false)
            .execute()
            .value
        guard !sessions.isEmpty else { return [] }
        let papers: [CompositionPaper] = try await client
            .from("evaluations")
            .select("id, session_id, eval_date, start_time, end_time, matieres(name)")
            .in("session_id", values: sessions.map(\.id))
            .eq("type", value: "composition")
            .order("eval_date", ascending: true)
            .execute()
            .value
        let bySession = Dictionary(grouping: papers, by: { $0.sessionId ?? "" })
        return sessions.map {
            StudentCompositionSession(
                id: $0.id,
                title: $0.title,
                periodLabel: $0.period_label,
                startsOn: $0.starts_on,
                endsOn: $0.ends_on,
                papers: bySession[$0.id] ?? []
            )
        }
    }
}
