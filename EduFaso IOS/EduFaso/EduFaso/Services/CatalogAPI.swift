import Foundation
import Supabase

enum EduDates {
    static func day(_ date: Date = Date()) -> String {
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = .current
        df.dateFormat = "yyyy-MM-dd"
        return df.string(from: date)
    }

    /// EduFaso week: Monday = 1 … Sunday = 7.
    static func weekday(_ date: Date = Date()) -> Int {
        let weekday = Calendar.current.component(.weekday, from: date)
        return weekday == 1 ? 7 : weekday - 1
    }
}

extension EduAPI {
    func call<T: Decodable>(_ fn: String, params: some Encodable) async throws -> T {
        try await client.rpc(fn, params: params).execute().value
    }

    func activeEnrollment(studentId: String) async throws -> (classId: String, className: String?)? {
        struct Row: Decodable {
            let class_section_id: String
            let classes: NamedEntity?
        }
        let rows: [Row] = try await client
            .from("inscriptions")
            .select("class_section_id, classes(name)")
            .eq("student_id", value: studentId)
            .eq("status", value: "active")
            .limit(1)
            .execute()
            .value
        guard let row = rows.first else { return nil }
        return (row.class_section_id, row.classes?.name)
    }

    func fetchClassAssignments(classId: String) async throws -> [TeachingAssignment] {
        try await client
            .from("affectations_enseignement")
            .select("id, class_section_id, subject_id, classes:class_section_id(id, name, grade_level), matieres(name), profils:teacher_id(first_name, last_name)")
            .eq("class_section_id", value: classId)
            .execute()
            .value
    }

    func fetchClasses(schoolId: String) async throws -> [ClassRow] {
        try await client
            .from("classes")
            .select("id, name, grade_level, academic_year_id")
            .eq("school_id", value: schoolId)
            .order("name", ascending: true)
            .execute()
            .value
    }

    func fetchYears(schoolId: String) async throws -> [YearRow] {
        try await client
            .from("annees_scolaires")
            .select("id, label, start_date, end_date, is_current")
            .eq("school_id", value: schoolId)
            .order("start_date", ascending: false)
            .execute()
            .value
    }

    func fetchSubjects(schoolId: String) async throws -> [SubjectRow] {
        try await client
            .from("matieres")
            .select("id, name, code, coefficient")
            .eq("school_id", value: schoolId)
            .order("name", ascending: true)
            .execute()
            .value
    }

    func fetchPeriods(schoolId: String) async throws -> [PeriodRow] {
        try await client
            .from("periodes_scolaires")
            .select("id, label, status, start_date, end_date")
            .eq("school_id", value: schoolId)
            .order("label", ascending: true)
            .execute()
            .value
    }

    func fetchProgramme(schoolId: String) async throws -> [ProgrammeRow] {
        try await client
            .from("programme_classe")
            .select("id, coefficient, classes!inner(name, school_id), matieres(name)")
            .eq("classes.school_id", value: schoolId)
            .execute()
            .value
    }

    func fetchStudentsPage(schoolId: String, search: String, offset: Int) async throws -> PeoplePage {
        try await call("ef_students_page", params: StudentsPageParams(
            p_school: schoolId, p_class: "", p_search: search, p_limit: 80, p_offset: offset
        ))
    }

    func fetchParentsPage(schoolId: String, search: String, offset: Int) async throws -> PeoplePage {
        try await call("ef_parents_page", params: ParentsPageParams(
            p_school: schoolId, p_search: search, p_limit: 80, p_offset: offset
        ))
    }

    func fetchRolePeople(role: String, schoolId: String?) async throws -> [RolePerson] {
        var query = client
            .from("roles_utilisateurs")
            .select("user_id, role, school_id, profils:user_id(first_name, last_name)")
            .eq("role", value: role)
            .eq("active", value: true)
        if let schoolId {
            query = query.eq("school_id", value: schoolId)
        }
        return try await query.limit(300).execute().value
    }

    func fetchAllRolePeople() async throws -> [RolePerson] {
        try await client
            .from("roles_utilisateurs")
            .select("user_id, role, school_id, profils:user_id(first_name, last_name)")
            .eq("active", value: true)
            .limit(300)
            .execute()
            .value
    }

    func fetchSchools() async throws -> [School] {
        try await client
            .from("ecoles")
            .select("id, name, code, city, address, phone, email, region, school_type, plan, billing_status, active")
            .order("name", ascending: true)
            .execute()
            .value
    }

    func fetchSchool(id: String) async throws -> School? {
        let rows: [School] = try await client
            .from("ecoles")
            .select("id, name, code, city, address, phone, email, region, school_type, plan, billing_status, active")
            .eq("id", value: id)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    func saveSchool(_ school: School, fields: SchoolFields) async throws {
        try await client
            .from("ecoles")
            .update(fields)
            .eq("id", value: school.id)
            .execute()
    }

    func setSchoolActive(id: String, active: Bool) async throws {
        try await client
            .from("ecoles")
            .update(ActiveFlag(active: active))
            .eq("id", value: id)
            .execute()
    }

    func fetchInvites() async throws -> [InviteRow] {
        try await client
            .from("invitations")
            .select("id, email, first_name, last_name, role, expires_at, accepted_at, cancelled_at, created_at")
            .order("created_at", ascending: false)
            .limit(100)
            .execute()
            .value
    }

    func fetchAudit() async throws -> [AuditRow] {
        try await client
            .from("audit_logs")
            .select("id, action, entity_type, created_at")
            .order("created_at", ascending: false)
            .limit(80)
            .execute()
            .value
    }

    func fetchSignals(schoolId: String?) async throws -> [SignalRow] {
        var query = client
            .from("signalements")
            .select("id, message, status, route, role, created_at")
        if let schoolId {
            query = query.eq("school_id", value: schoolId)
        }
        return try await query.order("created_at", ascending: false).limit(80).execute().value
    }

    func fetchPlatformSettings() async throws -> PlatformSettingsRow? {
        let rows: [PlatformSettingsRow] = try await client
            .from("platform_settings")
            .select("app_name, support_email, invite_site_url, default_year_label")
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// Teachers create interrogations (graded). Exercices de maison go in the cahier.
    @discardableResult
    func createEvaluation(_ row: EvaluationInsert) async throws -> String {
        struct Created: Decodable { let id: String }
        let created: Created = try await client
            .from("evaluations")
            .insert(row)
            .select("id")
            .single()
            .execute()
            .value
        return created.id
    }

    func fetchEvaluations(
        classId: String? = nil,
        classIds: [String]? = nil,
        teacherId: String? = nil,
        type: String? = nil,
        confirmedOnly: Bool = false
    ) async throws -> [EvaluationRow] {
        if let classIds, classIds.isEmpty { return [] }
        // Keep select close to web (`*, matieres(name)`): avoid fragile FK embeds that
        // can 400 / fail decode for students.
        let columns = "id, title, eval_date, start_time, end_time, type, period_label, max_score, admin_confirmed, subject_id, class_section_id, teacher_id, description, matieres(name), classes(name)"
        var query = client.from("evaluations").select(columns)
        if let classId { query = query.eq("class_section_id", value: classId) }
        if let classIds { query = query.in("class_section_id", values: classIds) }
        if let teacherId { query = query.eq("teacher_id", value: teacherId) }
        if let type { query = query.eq("type", value: type) }
        // Students/parents are RLS-limited to admin_confirmed=true; filtering here
        // matches web MesDevoirs and avoids empty "ghost" queries.
        if confirmedOnly { query = query.eq("admin_confirmed", value: true) }
        return try await query
            .order("eval_date", ascending: true)
            .limit(200)
            .execute()
            .value
    }

    func fetchGradedEvaluationIds(studentId: String, evaluationIds: [String]) async throws -> Set<String> {
        if evaluationIds.isEmpty { return [] }
        struct Row: Decodable { let evaluation_id: String? }
        let rows: [Row] = try await client
            .from("notes")
            .select("evaluation_id")
            .eq("student_id", value: studentId)
            .in("evaluation_id", values: evaluationIds)
            .execute()
            .value
        return Set(rows.compactMap(\.evaluation_id))
    }

    func fetchCahier(classId: String) async throws -> [CahierEntry] {
        try await client
            .from("cahier_entrees")
            .select("id, entry_date, content, homework, homework_due, matieres(name), profils:teacher_id(first_name, last_name)")
            .eq("class_section_id", value: classId)
            .order("entry_date", ascending: false)
            .limit(80)
            .execute()
            .value
    }

    func fetchCahierForTeacher(teacherId: String) async throws -> [CahierEntry] {
        try await client
            .from("cahier_entrees")
            .select("id, entry_date, content, homework, homework_due, matieres(name), classes(name)")
            .eq("teacher_id", value: teacherId)
            .order("entry_date", ascending: false)
            .limit(60)
            .execute()
            .value
    }

    func fetchCahierForClasses(_ classIds: [String]) async throws -> [CahierEntry] {
        if classIds.isEmpty { return [] }
        return try await client
            .from("cahier_entrees")
            .select("id, entry_date, content, homework, homework_due, matieres(name), classes(name), profils:teacher_id(first_name, last_name)")
            .in("class_section_id", values: classIds)
            .order("entry_date", ascending: false)
            .limit(80)
            .execute()
            .value
    }

    func insertCahier(_ row: CahierInsert) async throws {
        try await client.from("cahier_entrees").insert(row).execute()
    }

    func fetchSessions(schoolId: String) async throws -> [SessionRow] {
        try await client
            .from("composition_sessions")
            .select("id, title, period_label, starts_on, ends_on, classes!inner(name, school_id)")
            .eq("classes.school_id", value: schoolId)
            .order("starts_on", ascending: false)
            .limit(80)
            .execute()
            .value
    }

    func fetchPresenceLog(classIds: [String], day: String? = nil) async throws -> [PresenceLog] {
        if classIds.isEmpty { return [] }
        var query = client
            .from("presences")
            .select("id, date, status, profils:student_id(first_name, last_name), matieres(name), classes:class_section_id(name)")
            .in("class_section_id", values: classIds)
        if let day { query = query.eq("date", value: day) }
        return try await query.order("date", ascending: false).limit(150).execute().value
    }

    func fetchGradesForEvaluation(_ evaluationId: String) async throws -> [GradeNote] {
        try await client
            .from("notes")
            .select("id, student_id, score, is_absent, comment")
            .eq("evaluation_id", value: evaluationId)
            .execute()
            .value
    }

    func saveGrades(inserts: [GradeInsert], updates: [GradeUpdate]) async throws {
        if !inserts.isEmpty {
            try await client.from("notes").insert(inserts).execute()
        }
        if !updates.isEmpty {
            try await client.from("notes").upsert(updates).execute()
        }
    }

    func insertYear(_ row: YearInsert) async throws {
        try await client.from("annees_scolaires").insert(row).execute()
    }

    func makeYearCurrent(schoolId: String, yearId: String) async throws {
        try await client
            .from("annees_scolaires")
            .update(CurrentFlag(is_current: false))
            .eq("school_id", value: schoolId)
            .execute()
        try await client
            .from("annees_scolaires")
            .update(CurrentFlag(is_current: true))
            .eq("id", value: yearId)
            .execute()
    }

    func insertSubject(_ row: SubjectInsert) async throws {
        try await client.from("matieres").insert(row).execute()
    }

    func insertClass(_ row: ClassInsert) async throws {
        try await client.from("classes").insert(row).execute()
    }

    func countRows(table: String, schoolId: String) async throws -> Int {
        struct IdRow: Decodable { let id: String }
        let rows: [IdRow] = try await client
            .from(table)
            .select("id")
            .eq("school_id", value: schoolId)
            .limit(1000)
            .execute()
            .value
        return rows.count
    }

    func homeStats(schoolId: String) async throws -> SchoolHomeStats {
        try await call("ef_school_home_stats", params: HomeStatsParams(
            p_school: schoolId, p_date: EduDates.day(), p_dow: EduDates.weekday()
        ))
    }

    func setupCounts(schoolId: String) async throws -> SetupCounts {
        try await call("ef_school_setup_counts", params: SchoolIdParams(p_school: schoolId))
    }

    func studentsWithoutClass(schoolId: String) async throws -> Int {
        let row: CountOnly = try await call(
            "ef_students_without_class",
            params: WithoutClassParams(p_school: schoolId, p_sample: 0)
        )
        return row.count ?? 0
    }

    func attendanceDay(schoolId: String, day: String) async throws -> AttendanceSummary {
        try await call("ef_attendance_day_summary", params: AttendanceDayParams(
            p_school: schoolId, p_date: day, p_class: nil
        ))
    }

    func schoolStatistics(schoolId: String) async throws -> SchoolStatistics {
        try await call("ef_school_statistics", params: SchoolIdParams(p_school: schoolId))
    }

    func verifyDocument(code: String, average: String?) async throws -> VerifyPayload {
        try await client.functions.invoke(
            "verifier-document",
            options: FunctionInvokeOptions(body: VerifyBody(code: code, average: average))
        )
    }
}

nonisolated struct StudentsPageParams: Encodable {
    let p_school: String
    let p_class: String
    let p_search: String
    let p_limit: Int
    let p_offset: Int
}

nonisolated struct ParentsPageParams: Encodable {
    let p_school: String
    let p_search: String
    let p_limit: Int
    let p_offset: Int
}

nonisolated struct SchoolIdParams: Encodable { let p_school: String }

nonisolated struct HomeStatsParams: Encodable {
    let p_school: String
    let p_date: String
    let p_dow: Int
}

nonisolated struct WithoutClassParams: Encodable {
    let p_school: String
    let p_sample: Int
}

nonisolated struct AttendanceDayParams: Encodable {
    let p_school: String
    let p_date: String
    let p_class: String?
}

nonisolated struct SchoolFields: Encodable {
    let name: String
    let code: String
    let school_type: String
    let region: String
    let city: String
    let address: String
    let phone: String
    let email: String
}

nonisolated struct ActiveFlag: Encodable { let active: Bool }
nonisolated struct CurrentFlag: Encodable { let is_current: Bool }

nonisolated struct YearInsert: Encodable {
    let school_id: String
    let label: String
    let start_date: String
    let end_date: String
    let is_current: Bool
}

nonisolated struct SubjectInsert: Encodable {
    let school_id: String
    let name: String
    let coefficient: Double
}

nonisolated struct ClassInsert: Encodable {
    let school_id: String
    let academic_year_id: String
    let name: String
    let grade_level: String
}

nonisolated struct CahierInsert: Encodable {
    let class_section_id: String
    let subject_id: String
    let entry_date: String
    let content: String
    let homework: String?
    let homework_due: String?
}

nonisolated struct EvaluationInsert: Encodable {
    let class_section_id: String
    let subject_id: String
    let teacher_id: String
    let period_label: String
    let type: String
    let title: String
    let description: String?
    let max_score: Double
    let eval_date: String?
    let start_time: String?
    let end_time: String?
    let admin_confirmed: Bool
}

nonisolated struct GradeInsert: Encodable {
    let student_id: String
    let subject_id: String
    let class_section_id: String
    let period_label: String
    let evaluation_id: String
    let score: Double
    let max_score: Double
    let is_absent: Bool
    let comment: String?
    let recorded_by: String
}

nonisolated struct GradeUpdate: Encodable {
    let id: String
    let student_id: String
    let subject_id: String
    let class_section_id: String
    let period_label: String
    let evaluation_id: String
    let score: Double
    let max_score: Double
    let is_absent: Bool
    let comment: String?
    let recorded_by: String
}

nonisolated struct VerifyBody: Encodable {
    let code: String
    let average: String?
}
