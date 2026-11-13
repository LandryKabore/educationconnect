import Foundation
import Supabase

actor EduAPI {
    let client = SupabaseManager.client

    enum InboxKind {
        case personal
        case announcements
        case all
    }

    func fetchGrades(
        studentId: String,
        subjectIds: [String]? = nil,
        limit: Int = 400
    ) async throws -> [GradeRow] {
        var query = client
            .from("notes")
            .select("id, score, max_score, period_label, subject_id, evaluation_id, created_at, is_absent, matieres(id, name), evaluations(type, title, eval_date)")
            .eq("student_id", value: studentId)
        if let subjectIds, !subjectIds.isEmpty {
            query = query.in("subject_id", values: subjectIds)
        }
        return try await query
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
            .select("""
                id, subject, body, created_at, read_at, is_announcement, allow_replies,
                sender_id, recipient_id, school_id, thread_id,
                sender:sender_id(first_name, last_name)
                """)
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

    func markMessagesRead(ids: [String], recipientId: String) async throws {
        guard !ids.isEmpty else { return }
        try await client
            .from("messages")
            .update(["read_at": ISO8601DateFormatter().string(from: Date())])
            .in("id", values: ids)
            .eq("recipient_id", value: recipientId)
            .is("read_at", value: nil)
            .execute()
    }

    /// Personal messages I sent (used to build conversation threads like the web).
    func fetchSentPersonalMessages(userId: String, limit: Int = 1000) async throws -> [MessageRow] {
        try await client
            .from("messages")
            .select("""
                id, subject, body, created_at, read_at, is_announcement, allow_replies,
                sender_id, recipient_id, school_id, thread_id,
                recipient:recipient_id(first_name, last_name)
                """)
            .eq("sender_id", value: userId)
            .eq("is_announcement", value: false)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    /// Chat reply in an open conversation (matches web `handleSendChat`).
    func sendChatMessage(
        schoolId: String,
        senderId: String,
        recipientId: String,
        body: String
    ) async throws {
        try await sendMessages([
            MessageDraft(
                school_id: schoolId,
                sender_id: senderId,
                recipient_id: recipientId,
                subject: nil,
                body: body,
                allow_replies: true,
                is_announcement: false,
                is_cc: false,
                thread_id: nil,
                announcement_id: nil
            )
        ])
    }

    func fetchMessagingContacts(schoolId: String, role: AppRole, userId: String) async throws -> [MessageContact] {
        switch role {
        case .schoolAdmin, .superAdmin, .teacher:
            struct Params: Encodable {
                let p_school: String
                let p_role: String
            }
            return try await call(
                "ef_message_contacts",
                params: Params(p_school: schoolId, p_role: role.rawValue)
            )
        case .student:
            return try await fetchStudentMessagingContacts(schoolId: schoolId, userId: userId)
        case .parent:
            return try await fetchParentMessagingContacts(schoolId: schoolId, userId: userId)
        }
    }

    private func fetchStudentMessagingContacts(schoolId: String, userId: String) async throws -> [MessageContact] {
        var map: [String: MessageContact] = [:]

        if let enrollment = try await activeEnrollment(studentId: userId) {
            struct Aff: Decodable {
                let teacher_id: String?
                let profils: PersonName?
            }
            let aff: [Aff] = try await client
                .from("affectations_enseignement")
                .select("teacher_id, profils:profils!affectations_enseignement_teacher_id_fkey(first_name, last_name)")
                .eq("class_section_id", value: enrollment.classId)
                .execute()
                .value
            for row in aff {
                guard let tid = row.teacher_id, tid != userId, map[tid] == nil else { continue }
                map[tid] = MessageContact(
                    id: tid,
                    firstName: row.profils?.firstName,
                    lastName: row.profils?.lastName,
                    role: "teacher",
                    className: nil,
                    dateOfBirth: nil
                )
            }
        }

        try await appendSchoolAdmins(into: &map, schoolId: schoolId, excluding: userId)
        return map.values.sorted { $0.fullName.localizedCaseInsensitiveCompare($1.fullName) == .orderedAscending }
    }

    private func fetchParentMessagingContacts(schoolId: String, userId: String) async throws -> [MessageContact] {
        var map: [String: MessageContact] = [:]

        struct Link: Decodable { let student_id: String }
        let links: [Link] = try await client
            .from("liens_parent_eleve")
            .select("student_id")
            .eq("parent_id", value: userId)
            .execute()
            .value
        let childIds = links.map(\.student_id)

        if !childIds.isEmpty {
            struct Enroll: Decodable { let class_section_id: String? }
            let enrollments: [Enroll] = try await client
                .from("inscriptions")
                .select("class_section_id")
                .in("student_id", values: childIds)
                .eq("status", value: "active")
                .execute()
                .value
            let classIds = Array(Set(enrollments.compactMap(\.class_section_id)))
            if !classIds.isEmpty {
                struct Aff: Decodable {
                    let teacher_id: String?
                    let profils: PersonName?
                }
                let aff: [Aff] = try await client
                    .from("affectations_enseignement")
                    .select("teacher_id, profils:profils!affectations_enseignement_teacher_id_fkey(first_name, last_name)")
                    .in("class_section_id", values: classIds)
                    .execute()
                    .value
                for row in aff {
                    guard let tid = row.teacher_id, tid != userId, map[tid] == nil else { continue }
                    map[tid] = MessageContact(
                        id: tid,
                        firstName: row.profils?.firstName,
                        lastName: row.profils?.lastName,
                        role: "teacher",
                        className: nil,
                        dateOfBirth: nil
                    )
                }
            }
        }

        try await appendSchoolAdmins(into: &map, schoolId: schoolId, excluding: userId)
        return map.values.sorted { $0.fullName.localizedCaseInsensitiveCompare($1.fullName) == .orderedAscending }
    }

    private func appendSchoolAdmins(into map: inout [String: MessageContact], schoolId: String, excluding userId: String) async throws {
        struct AdminRow: Decodable {
            let user_id: String
            let profils: PersonName?
        }
        let admins: [AdminRow] = try await client
            .from("roles_utilisateurs")
            .select("user_id, profils(first_name, last_name)")
            .eq("school_id", value: schoolId)
            .eq("role", value: "school_admin")
            .eq("active", value: true)
            .execute()
            .value
        for row in admins {
            guard row.user_id != userId, map[row.user_id] == nil else { continue }
            map[row.user_id] = MessageContact(
                id: row.user_id,
                firstName: row.profils?.firstName,
                lastName: row.profils?.lastName,
                role: "school_admin",
                className: nil,
                dateOfBirth: nil
            )
        }
    }

    struct MessageDraft: Encodable {
        let school_id: String
        let sender_id: String
        let recipient_id: String
        let subject: String?
        let body: String
        let allow_replies: Bool
        let is_announcement: Bool
        let is_cc: Bool
        let thread_id: String?
        let announcement_id: String?
    }

    func sendMessages(_ drafts: [MessageDraft]) async throws {
        guard !drafts.isEmpty else { return }
        let batchSize = 40
        var index = 0
        while index < drafts.count {
            let end = min(index + batchSize, drafts.count)
            let batch = Array(drafts[index..<end])
            try await client.from("messages").insert(batch).execute()
            index = end
        }
    }

    func sendPersonalMessage(
        schoolId: String,
        senderId: String,
        recipientIds: [String],
        ccIds: [String] = [],
        subject: String?,
        body: String,
        allowReplies: Bool = true
    ) async throws {
        let threadId = UUID().uuidString.lowercased()
        let toDrafts = recipientIds.map {
            MessageDraft(
                school_id: schoolId,
                sender_id: senderId,
                recipient_id: $0,
                subject: subject,
                body: body,
                allow_replies: allowReplies,
                is_announcement: false,
                is_cc: false,
                thread_id: threadId,
                announcement_id: nil
            )
        }
        let ccDrafts = ccIds
            .filter { !recipientIds.contains($0) }
            .map {
                MessageDraft(
                    school_id: schoolId,
                    sender_id: senderId,
                    recipient_id: $0,
                    subject: subject,
                    body: body,
                    allow_replies: allowReplies,
                    is_announcement: false,
                    is_cc: true,
                    thread_id: threadId,
                    announcement_id: nil
                )
            }
        try await sendMessages(toDrafts + ccDrafts)
    }

    func sendAnnouncement(
        schoolId: String,
        senderId: String,
        recipientIds: [String],
        subject: String,
        body: String,
        allowReplies: Bool = false
    ) async throws {
        let announcementId = UUID().uuidString.lowercased()
        let drafts = recipientIds.map {
            MessageDraft(
                school_id: schoolId,
                sender_id: senderId,
                recipient_id: $0,
                subject: subject,
                body: body,
                allow_replies: allowReplies,
                is_announcement: true,
                is_cc: false,
                thread_id: nil,
                announcement_id: announcementId
            )
        }
        try await sendMessages(drafts)
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
            .select("id, class_section_id, subject_id, classes:class_section_id(id, name, grade_level), matieres(id, name)")
            .eq("teacher_id", value: teacherId)
            .execute()
            .value
    }

    /// Student counts + per-class/subject averages (/20), same as web `ef_teacher_class_stats`.
    func fetchTeacherClassStats(classIds: [String]) async throws -> TeacherClassStatsPayload {
        guard !classIds.isEmpty else {
            return TeacherClassStatsPayload(counts: [:], averages: [])
        }
        struct Params: Encodable { let p_class_ids: [String] }
        return try await call("ef_teacher_class_stats", params: Params(p_class_ids: classIds))
    }

    func fetchTeacherTimetable(teacherId: String) async throws -> [TimetableSlot] {
        try await client
            .from("creneaux_edt")
            .select("id, day_of_week, start_time, end_time, room, class_section_id, subject_id, matieres(id, name), classes:class_section_id(id, name, grade_level), profils(first_name, last_name)")
            .eq("teacher_id", value: teacherId)
            .order("day_of_week", ascending: true)
            .order("start_time", ascending: true)
            .execute()
            .value
    }

    func fetchStudentsInClass(classSectionId: String) async throws -> [PresenceDraft] {
        struct ProfileLite: Decodable {
            let first_name: String?
            let last_name: String?
            let avatar_url: String?
        }
        struct Row: Decodable {
            let student_id: String
            let profils: ProfileLite?
        }
        let rows: [Row] = try await client
            .from("inscriptions")
            .select("student_id, profils:student_id(first_name, last_name, avatar_url)")
            .eq("class_section_id", value: classSectionId)
            .eq("status", value: "active")
            .execute()
            .value
        return rows.map {
            PresenceDraft(
                id: $0.student_id,
                studentId: $0.student_id,
                firstName: $0.profils?.first_name ?? "",
                lastName: $0.profils?.last_name ?? "",
                avatarUrl: $0.profils?.avatar_url,
                status: "present"
            )
        }
        .sorted { $0.lastName.localizedCaseInsensitiveCompare($1.lastName) == .orderedAscending }
    }

    /// Same payload as web `Presences.tsx` — `presences` has no `school_id` column.
    func saveAttendance(
        classSectionId: String,
        subjectId: String,
        date: String,
        drafts: [PresenceDraft],
        recordedBy: String
    ) async throws {
        struct Payload: Encodable {
            let class_section_id: String
            let subject_id: String
            let student_id: String
            let date: String
            let status: String
            let note: String?
            let recorded_by: String
        }
        let payload = drafts.map {
            Payload(
                class_section_id: classSectionId,
                subject_id: subjectId,
                student_id: $0.studentId,
                date: date,
                status: $0.status,
                note: nil,
                recorded_by: recordedBy
            )
        }
        try await client
            .from("presences")
            .upsert(payload, onConflict: "class_section_id,student_id,date,subject_id")
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

    /// Registers an official bulletin and returns its public verification code (nil if RPC unavailable).
    func issueBulletinCode(studentId: String, classSectionId: String, periodLabel: String) async -> String? {
        struct Item: Encodable {
            let student_id: String
            let class_section_id: String
            let doc_type: String
            let period_label: String
        }
        struct Params: Encodable {
            let p_items: [Item]
        }
        struct Issued: Decodable {
            let code: String?
        }
        do {
            let rows: [Issued] = try await call(
                "ef_issue_documents",
                params: Params(p_items: [
                    Item(
                        student_id: studentId,
                        class_section_id: classSectionId,
                        doc_type: "bulletin",
                        period_label: periodLabel
                    ),
                ])
            )
            return rows.first?.code
        } catch {
            return nil
        }
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
