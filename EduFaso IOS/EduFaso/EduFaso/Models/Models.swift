import Foundation

enum AppRole: String, Codable, CaseIterable, Identifiable {
    case superAdmin = "super_admin"
    case schoolAdmin = "school_admin"
    case teacher
    case student
    case parent

    var id: String { rawValue }

    var label: String {
        switch self {
        case .superAdmin: return "Super administrateur"
        case .schoolAdmin: return "Administrateur d'école"
        case .teacher: return "Enseignant"
        case .student: return "Élève"
        case .parent: return "Parent"
        }
    }

    static let priority: [AppRole] = [.superAdmin, .schoolAdmin, .teacher, .student, .parent]
}

struct Profile: Codable, Identifiable, Hashable {
    let id: String
    var firstName: String
    var lastName: String
    var email: String?
    var phone: String?
    var avatarUrl: String?
    var dateOfBirth: String?
    var gender: String?
    var address: String?
    var matricule: String?
    var mustChangePassword: Bool
    var familyManaged: Bool?
    var lastLoginAt: String?
    var active: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case firstName = "first_name"
        case lastName = "last_name"
        case email, phone
        case avatarUrl = "avatar_url"
        case dateOfBirth = "date_of_birth"
        case gender, address, matricule
        case mustChangePassword = "must_change_password"
        case familyManaged = "family_managed"
        case lastLoginAt = "last_login_at"
        case active
    }

    var fullName: String {
        "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)
    }
}

struct UserRoleRow: Codable, Identifiable, Hashable {
    var id: String { "\(userId)-\(role.rawValue)-\(schoolId ?? "none")" }
    let userId: String
    let role: AppRole
    let schoolId: String?
    let active: Bool

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case role
        case schoolId = "school_id"
        case active
    }
}

struct School: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let code: String?
    let city: String?
    var address: String?
    var phone: String?
    var email: String?
    var region: String?
    var schoolType: String?
    var plan: String?
    var billingStatus: String?
    var active: Bool?

    enum CodingKeys: String, CodingKey {
        case id, name, code, city, address, phone, email, region, plan, active
        case schoolType = "school_type"
        case billingStatus = "billing_status"
    }
}

struct EvaluationBrief: Codable, Hashable {
    let type: String?
    let title: String?
    let evalDate: String?

    enum CodingKeys: String, CodingKey {
        case type, title
        case evalDate = "eval_date"
    }
}

struct GradeRow: Codable, Identifiable, Hashable {
    let id: String
    let score: Double?
    let maxScore: Double?
    let periodLabel: String?
    let subjectId: String?
    let createdAt: String?
    let isAbsent: Bool?
    let matieres: NamedEntity?
    let evaluations: EvaluationBrief?
    let evaluationId: String?

    enum CodingKeys: String, CodingKey {
        case id, score
        case maxScore = "max_score"
        case periodLabel = "period_label"
        case subjectId = "subject_id"
        case createdAt = "created_at"
        case isAbsent = "is_absent"
        case matieres, evaluations
        case evaluationId = "evaluation_id"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        periodLabel = try c.decodeIfPresent(String.self, forKey: .periodLabel)
        subjectId = try c.decodeIfPresent(String.self, forKey: .subjectId)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        isAbsent = try c.decodeIfPresent(Bool.self, forKey: .isAbsent)
        matieres = try c.decodeIfPresent(NamedEntity.self, forKey: .matieres)
        evaluations = try c.decodeIfPresent(EvaluationBrief.self, forKey: .evaluations)
        evaluationId = try c.decodeIfPresent(String.self, forKey: .evaluationId)
        score = Self.flexDouble(c, for: .score)
        maxScore = Self.flexDouble(c, for: .maxScore)
    }

    private static func flexDouble(_ c: KeyedDecodingContainer<CodingKeys>, for key: CodingKeys) -> Double? {
        if let d = try? c.decodeIfPresent(Double.self, forKey: key) { return d }
        if let i = try? c.decodeIfPresent(Int.self, forKey: key) { return Double(i) }
        if let s = try? c.decodeIfPresent(String.self, forKey: key), let d = Double(s) { return d }
        return nil
    }
}

nonisolated struct NamedEntity: Codable, Hashable {
    let id: String?
    let name: String

    init(id: String? = nil, name: String) {
        self.id = id
        self.name = name
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
    }

    enum CodingKeys: String, CodingKey { case id, name }
}

struct EvaluationRow: Codable, Identifiable, Hashable {
    let id: String
    let title: String?
    let dueDate: String?
    let evalDate: String?
    let startTime: String?
    let endTime: String?
    let type: String?
    let matieres: NamedEntity?
    let classes: NamedEntity?
    let periodLabel: String?
    let maxScore: Double?
    let adminConfirmed: Bool?
    let subjectId: String?
    let classSectionId: String?
    let teacherId: String?
    let details: String?

    enum CodingKeys: String, CodingKey {
        case id, title, type, matieres, classes
        case dueDate = "due_date"
        case evalDate = "eval_date"
        case startTime = "start_time"
        case endTime = "end_time"
        case periodLabel = "period_label"
        case maxScore = "max_score"
        case adminConfirmed = "admin_confirmed"
        case subjectId = "subject_id"
        case classSectionId = "class_section_id"
        case teacherId = "teacher_id"
        case details = "description"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        dueDate = try c.decodeIfPresent(String.self, forKey: .dueDate)
        evalDate = try c.decodeIfPresent(String.self, forKey: .evalDate)
        startTime = try c.decodeIfPresent(String.self, forKey: .startTime)
        endTime = try c.decodeIfPresent(String.self, forKey: .endTime)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        matieres = try c.decodeIfPresent(NamedEntity.self, forKey: .matieres)
        classes = try c.decodeIfPresent(NamedEntity.self, forKey: .classes)
        periodLabel = try c.decodeIfPresent(String.self, forKey: .periodLabel)
        adminConfirmed = try c.decodeIfPresent(Bool.self, forKey: .adminConfirmed)
        subjectId = try c.decodeIfPresent(String.self, forKey: .subjectId)
        classSectionId = try c.decodeIfPresent(String.self, forKey: .classSectionId)
        teacherId = try c.decodeIfPresent(String.self, forKey: .teacherId)
        details = try c.decodeIfPresent(String.self, forKey: .details)
        if let d = try? c.decodeIfPresent(Double.self, forKey: .maxScore) {
            maxScore = d
        } else if let i = try? c.decodeIfPresent(Int.self, forKey: .maxScore) {
            maxScore = Double(i)
        } else if let s = try? c.decodeIfPresent(String.self, forKey: .maxScore), let d = Double(s) {
            maxScore = d
        } else {
            maxScore = nil
        }
    }

    var typeLabel: String {
        switch type {
        case "interrogation": return "Interrogation"
        case "devoir": return "Exercice de maison"
        case "composition": return "Composition"
        case "examen": return "Devoir"
        default: return type ?? "Évaluation"
        }
    }

    var whenLabel: String {
        let day = evalDate ?? dueDate ?? ""
        let start = startTime.map { String($0.prefix(5)) } ?? ""
        let end = endTime.map { String($0.prefix(5)) } ?? ""
        if start.isEmpty { return day }
        if end.isEmpty { return "\(day) · \(start)" }
        return "\(day) · \(start)–\(end)"
    }
}

struct AttendanceRow: Codable, Identifiable, Hashable {
    let id: String
    let date: String
    let status: String
    let subjectId: String?
    let note: String?
    let matieres: NamedEntity?

    enum CodingKeys: String, CodingKey {
        case id, date, status, note, matieres
        case subjectId = "subject_id"
    }
}

struct TimetableSlot: Codable, Identifiable, Hashable {
    let id: String
    let dayOfWeek: Int
    let startTime: String
    let endTime: String
    let room: String?
    let matieres: NamedEntity?
    let profils: PersonName?

    enum CodingKeys: String, CodingKey {
        case id, room, matieres, profils
        case dayOfWeek = "day_of_week"
        case startTime = "start_time"
        case endTime = "end_time"
    }

    var dayLabel: String {
        let days = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        return (dayOfWeek >= 1 && dayOfWeek <= 7) ? days[dayOfWeek] : "Jour \(dayOfWeek)"
    }

    var teacherName: String? {
        let name = profils?.fullName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return name.isEmpty ? nil : name
    }
}

struct MessageRow: Codable, Identifiable, Hashable {
    let id: String
    let subject: String?
    let body: String?
    let createdAt: String?
    let readAt: String?
    let isAnnouncement: Bool?
    let sender: PersonName?

    enum CodingKeys: String, CodingKey {
        case id, subject, body, sender
        case createdAt = "created_at"
        case readAt = "read_at"
        case isAnnouncement = "is_announcement"
    }
}

nonisolated struct PersonName: Codable, Hashable {
    let firstName: String?
    let lastName: String?

    enum CodingKeys: String, CodingKey {
        case firstName = "first_name"
        case lastName = "last_name"
    }

    var fullName: String {
        "\(firstName ?? "") \(lastName ?? "")".trimmingCharacters(in: .whitespaces)
    }
}

nonisolated struct ChildSummary: Decodable, Identifiable, Hashable {
    let id: String
    let firstName: String?
    let lastName: String?
    let className: String?

    enum CodingKeys: String, CodingKey {
        case id
        case firstName = "first_name"
        case lastName = "last_name"
        case className
        case classNameSnake = "class_name"
    }

    init(id: String, firstName: String?, lastName: String?, className: String?) {
        self.id = id
        self.firstName = firstName
        self.lastName = lastName
        self.className = className
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        firstName = try c.decodeIfPresent(String.self, forKey: .firstName)
        lastName = try c.decodeIfPresent(String.self, forKey: .lastName)
        let camel = try c.decodeIfPresent(String.self, forKey: .className)
        let snake = try c.decodeIfPresent(String.self, forKey: .classNameSnake)
        className = camel ?? snake
    }

    var fullName: String {
        "\(firstName ?? "") \(lastName ?? "")".trimmingCharacters(in: .whitespaces)
    }
}

struct TeachingAssignment: Codable, Identifiable, Hashable {
    let id: String
    let classSectionId: String
    let subjectId: String?
    let classes: ClassLite?
    let matieres: NamedEntity?
    let teacher: PersonName?

    enum CodingKeys: String, CodingKey {
        case id, classes, matieres
        case classSectionId = "class_section_id"
        case subjectId = "subject_id"
        case teacher = "profils"
    }
}

struct ClassLite: Codable, Hashable {
    let id: String?
    let name: String?
    let gradeLevel: String?

    enum CodingKeys: String, CodingKey {
        case id, name
        case gradeLevel = "grade_level"
    }
}

nonisolated struct ClassRow: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let gradeLevel: String?
    let academicYearId: String?

    enum CodingKeys: String, CodingKey {
        case id, name
        case gradeLevel = "grade_level"
        case academicYearId = "academic_year_id"
    }
}

nonisolated struct YearRow: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let startDate: String
    let endDate: String
    let isCurrent: Bool

    enum CodingKeys: String, CodingKey {
        case id, label
        case startDate = "start_date"
        case endDate = "end_date"
        case isCurrent = "is_current"
    }
}

nonisolated struct SubjectRow: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let code: String?
    let coefficient: Double?
}

nonisolated struct PeriodRow: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let status: String
    let startDate: String?
    let endDate: String?

    enum CodingKeys: String, CodingKey {
        case id, label, status
        case startDate = "start_date"
        case endDate = "end_date"
    }

    var statusLabel: String { status == "cloturee" ? "Clôturée" : "Ouverte" }
}

nonisolated struct ProgrammeRow: Decodable, Identifiable, Hashable {
    let id: String
    let coefficient: Double?
    let classes: NamedEntity?
    let matieres: NamedEntity?
}

nonisolated struct PeoplePage: Decodable {
    let total: Int
    let rows: [PersonRow]
}

nonisolated struct PersonRow: Decodable, Identifiable, Hashable {
    let id: String
    let firstName: String?
    let lastName: String?
    let phone: String?
    let email: String?
    let matricule: String?
    let className: String?
    let classSectionId: String?
    let children: [String]?

    enum CodingKeys: String, CodingKey {
        case id, phone, email, matricule, children
        case firstName = "first_name"
        case lastName = "last_name"
        case className, classSectionId
    }

    var fullName: String {
        "\(firstName ?? "") \(lastName ?? "")".trimmingCharacters(in: .whitespaces)
    }
}

nonisolated struct RolePerson: Decodable, Identifiable, Hashable {
    var id: String { "\(userId)-\(role)-\(schoolId ?? "")" }
    let userId: String
    let role: String
    let schoolId: String?
    let profils: PersonName?

    enum CodingKeys: String, CodingKey {
        case role, profils
        case userId = "user_id"
        case schoolId = "school_id"
    }
}

nonisolated struct InviteRow: Decodable, Identifiable, Hashable {
    let id: String
    let email: String
    let firstName: String?
    let lastName: String?
    let role: String?
    let expiresAt: String?
    let acceptedAt: String?
    let cancelledAt: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, email, role
        case firstName = "first_name"
        case lastName = "last_name"
        case expiresAt = "expires_at"
        case acceptedAt = "accepted_at"
        case cancelledAt = "cancelled_at"
        case createdAt = "created_at"
    }

    var fullName: String {
        "\(firstName ?? "") \(lastName ?? "")".trimmingCharacters(in: .whitespaces)
    }
}

nonisolated struct AuditRow: Decodable, Identifiable, Hashable {
    let id: String
    let action: String
    let entityType: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, action
        case entityType = "entity_type"
        case createdAt = "created_at"
    }
}

nonisolated struct SignalRow: Decodable, Identifiable, Hashable {
    let id: String
    let message: String
    let status: String?
    let route: String?
    let role: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, message, status, route, role
        case createdAt = "created_at"
    }
}

nonisolated struct PlatformSettingsRow: Decodable, Hashable {
    let id: Int?
    let appName: String?
    let supportEmail: String?
    let inviteSiteUrl: String?
    let defaultYearLabel: String?

    enum CodingKeys: String, CodingKey {
        case id
        case appName = "app_name"
        case supportEmail = "support_email"
        case inviteSiteUrl = "invite_site_url"
        case defaultYearLabel = "default_year_label"
    }
}

nonisolated struct SessionRow: Decodable, Identifiable, Hashable {
    let id: String
    let title: String?
    let periodLabel: String?
    let startsOn: String?
    let endsOn: String?
    let classes: NamedEntity?

    enum CodingKeys: String, CodingKey {
        case id, title, classes
        case periodLabel = "period_label"
        case startsOn = "starts_on"
        case endsOn = "ends_on"
    }
}

nonisolated struct CahierEntry: Decodable, Identifiable, Hashable {
    let id: String
    let entryDate: String
    let content: String?
    let homework: String?
    let homeworkDue: String?
    let matieres: NamedEntity?
    let classes: NamedEntity?
    let teacher: PersonName?

    enum CodingKeys: String, CodingKey {
        case id, content, homework, matieres, classes
        case entryDate = "entry_date"
        case homeworkDue = "homework_due"
        case teacher = "profils"
    }
}

nonisolated struct PresenceLog: Decodable, Identifiable, Hashable {
    let id: String
    let date: String
    let status: String
    let profils: PersonName?
    let matieres: NamedEntity?
    let classes: NamedEntity?
}

nonisolated struct GradeNote: Decodable, Identifiable, Hashable {
    let id: String
    let studentId: String
    let score: Double?
    let isAbsent: Bool?
    let comment: String?

    enum CodingKeys: String, CodingKey {
        case id, score, comment
        case studentId = "student_id"
        case isAbsent = "is_absent"
    }
}

nonisolated struct AttendanceSummary: Decodable, Hashable {
    let present: Int?
    let absent: Int?
    let late: Int?
    let excused: Int?
    let total: Int?
}

nonisolated struct StudentAttendanceCounts: Decodable, Hashable {
    let present: Int?
    let absent: Int?
    let late: Int?
    let excused: Int?
    let total: Int?
    let bySubject: [SubjectAttendanceCount]?

    /// Same convention as web: justified absences and late arrivals count as present.
    var ratePercent: Int? {
        let denom = total ?? ((present ?? 0) + (absent ?? 0) + (late ?? 0) + (excused ?? 0))
        guard denom > 0 else { return nil }
        return Int(round(Double(denom - (absent ?? 0)) / Double(denom) * 100))
    }
}

nonisolated struct AttendanceTotals: Hashable {
    let total: Int
    let present: Int
    let absent: Int
    let late: Int
    let excused: Int

    var ratePercent: Int? {
        guard total > 0 else { return nil }
        return Int(round(Double(total - absent) / Double(total) * 100))
    }

    var absencesTotal: Int { absent + excused }
    var exceptionsTotal: Int { absent + late + excused }
}

enum AttendancePeriodKey: String, CaseIterable, Identifiable, Hashable {
    case t1
    case t2
    case t3
    case all

    var id: String { rawValue }
}

struct AttendancePeriod: Identifiable, Hashable {
    var id: String { key.rawValue }
    let key: AttendancePeriodKey
    let label: String
    let from: String?
    let to: String?
}

enum AttendanceStatusFilter: String, CaseIterable, Identifiable, Hashable {
    case all = ""
    case absent
    case late
    case excused

    var id: String { rawValue.isEmpty ? "all" : rawValue }

    var label: String {
        switch self {
        case .all: return "Tout"
        case .absent: return "Absences"
        case .late: return "Retards"
        case .excused: return "Justifiées"
        }
    }
}

enum AttendancePeriodBuilder {
    /// Tabs: Trimestre 1 / 2 / 3 / Tout
    static func build(today: Date = Date(), yearStart: String? = nil, yearEnd: String? = nil, custom: [(label: String, from: String?, to: String?)] = []) -> [AttendancePeriod] {
        let bounds = resolvedYearBounds(today: today, yearStart: yearStart, yearEnd: yearEnd)
        let ranges = trimesterRanges(start: bounds.start, end: bounds.end, custom: custom)
        let keys: [AttendancePeriodKey] = [.t1, .t2, .t3]
        var out: [AttendancePeriod] = zip(keys, ranges).map { key, range in
            AttendancePeriod(key: key, label: range.label, from: range.from, to: range.to)
        }
        out.append(AttendancePeriod(key: .all, label: "Tout", from: nil, to: nil))
        return out
    }

    static func currentKey(today: Date = Date(), periods: [AttendancePeriod]) -> AttendancePeriodKey {
        let t = iso(today)
        if let match = periods.first(where: { period in
            guard period.key != .all, let from = period.from, let to = period.to else { return false }
            return t >= from && t <= to
        }) {
            return match.key
        }
        return periods.first(where: { $0.key != .all })?.key ?? .all
    }

    private static func resolvedYearBounds(today: Date, yearStart: String?, yearEnd: String?) -> (start: Date, end: Date) {
        if let yearStart, let yearEnd, let start = parseDay(yearStart), let end = parseDay(yearEnd) {
            return (start, end)
        }
        // Fallback academic year: 1 Sep → 30 Jun
        let cal = Calendar.current
        let y = cal.component(.year, from: today)
        let m = cal.component(.month, from: today)
        let startYear = m >= 9 ? y : y - 1
        let start = cal.date(from: DateComponents(year: startYear, month: 9, day: 1))!
        let end = cal.date(from: DateComponents(year: startYear + 1, month: 6, day: 30))!
        return (start, end)
    }

    private static func trimesterRanges(start: Date, end: Date, custom: [(label: String, from: String?, to: String?)]) -> [(label: String, from: String, to: String)] {
        let len = Int(round(end.timeIntervalSince(start) / 86_400)) + 1
        let cal = Calendar.current
        return [1, 2, 3].map { n in
            let label = "Trimestre \(n)"
            if let own = custom.first(where: { $0.label.trimmingCharacters(in: .whitespaces) == label }),
               let from = own.from, let to = own.to {
                return (label, from, to)
            }
            let from = cal.date(byAdding: .day, value: ((n - 1) * len) / 3, to: start)!
            let to = n == 3 ? end : cal.date(byAdding: .day, value: (n * len) / 3 - 1, to: start)!
            return (label, iso(from), iso(to))
        }
    }

    private static func iso(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    private static func parseDay(_ s: String) -> Date? {
        let parts = s.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}

nonisolated struct SubjectAttendanceCount: Decodable, Hashable, Identifiable {
    var id: String { subjectId ?? name }
    let subjectId: String?
    let name: String
    let present: Int?
    let absent: Int?
    let late: Int?
    let excused: Int?
}

nonisolated struct AnnualAverageResult: Decodable, Hashable {
    let annualAverage: Double?
    let trimesterCount: Int?
    let complete: Bool?
    let passed: Bool?
    let trimesters: [TrimesterAverage]?

    enum CodingKeys: String, CodingKey {
        case trimesters, complete, passed
        case annualAverage = "annual_average"
        case trimesterCount = "trimester_count"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        annualAverage = Self.flexDouble(c, for: .annualAverage)
        trimesterCount = try c.decodeIfPresent(Int.self, forKey: .trimesterCount)
        complete = try c.decodeIfPresent(Bool.self, forKey: .complete)
        passed = try c.decodeIfPresent(Bool.self, forKey: .passed)
        trimesters = try c.decodeIfPresent([TrimesterAverage].self, forKey: .trimesters)
    }

    private static func flexDouble(_ c: KeyedDecodingContainer<CodingKeys>, for key: CodingKeys) -> Double? {
        if let d = try? c.decodeIfPresent(Double.self, forKey: key) { return d }
        if let i = try? c.decodeIfPresent(Int.self, forKey: key) { return Double(i) }
        if let s = try? c.decodeIfPresent(String.self, forKey: key), let d = Double(s) { return d }
        return nil
    }
}

nonisolated struct TrimesterAverage: Decodable, Hashable {
    let periodLabel: String?
    let generalAverage: Double?

    enum CodingKeys: String, CodingKey {
        case periodLabel = "period_label"
        case generalAverage = "general_average"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        periodLabel = try c.decodeIfPresent(String.self, forKey: .periodLabel)
        if let d = try? c.decodeIfPresent(Double.self, forKey: .generalAverage) {
            generalAverage = d
        } else if let i = try? c.decodeIfPresent(Int.self, forKey: .generalAverage) {
            generalAverage = Double(i)
        } else {
            generalAverage = nil
        }
    }
}

nonisolated struct BulletinClassStats: Decodable, Hashable {
    let className: String?
    let yearLabel: String?
    let classSize: Int?
    let periodLabel: String?
    let isAnnual: Bool?
    let subjects: [BulletinSubjectStat]?
    let general: BulletinGeneralStat?
    let attendance: BulletinAttendance?

    enum CodingKeys: String, CodingKey {
        case subjects, general, attendance
        case className = "class_name"
        case yearLabel = "year_label"
        case classSize = "class_size"
        case periodLabel = "period_label"
        case isAnnual = "is_annual"
    }
}

nonisolated struct BulletinSubjectStat: Decodable, Hashable, Identifiable {
    var id: String { subjectId ?? subjectName ?? UUID().uuidString }
    let subjectId: String?
    let subjectName: String?
    let coefficient: Double?
    let teacherName: String?
    let studentAvg: Double?
    let classAvg: Double?
    let rank: Int?
    let rankedCount: Int?

    enum CodingKeys: String, CodingKey {
        case coefficient
        case subjectId = "subject_id"
        case subjectName = "subject_name"
        case teacherName = "teacher_name"
        case studentAvg = "student_avg"
        case classAvg = "class_avg"
        case rank
        case rankedCount = "ranked_count"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        subjectId = try c.decodeIfPresent(String.self, forKey: .subjectId)
        subjectName = try c.decodeIfPresent(String.self, forKey: .subjectName)
        teacherName = try c.decodeIfPresent(String.self, forKey: .teacherName)
        rank = try c.decodeIfPresent(Int.self, forKey: .rank)
        rankedCount = try c.decodeIfPresent(Int.self, forKey: .rankedCount)
        coefficient = Self.num(c, .coefficient)
        studentAvg = Self.num(c, .studentAvg)
        classAvg = Self.num(c, .classAvg)
    }

    private static func num(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Double? {
        if let d = try? c.decodeIfPresent(Double.self, forKey: key) { return d }
        if let i = try? c.decodeIfPresent(Int.self, forKey: key) { return Double(i) }
        return nil
    }
}

nonisolated struct BulletinGeneralStat: Decodable, Hashable {
    let studentAvg: Double?
    let classAvg: Double?
    let rank: Int?
    let rankedCount: Int?

    enum CodingKeys: String, CodingKey {
        case rank
        case studentAvg = "student_avg"
        case classAvg = "class_avg"
        case rankedCount = "ranked_count"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        rank = try c.decodeIfPresent(Int.self, forKey: .rank)
        rankedCount = try c.decodeIfPresent(Int.self, forKey: .rankedCount)
        if let d = try? c.decodeIfPresent(Double.self, forKey: .studentAvg) { studentAvg = d }
        else if let i = try? c.decodeIfPresent(Int.self, forKey: .studentAvg) { studentAvg = Double(i) }
        else { studentAvg = nil }
        if let d = try? c.decodeIfPresent(Double.self, forKey: .classAvg) { classAvg = d }
        else if let i = try? c.decodeIfPresent(Int.self, forKey: .classAvg) { classAvg = Double(i) }
        else { classAvg = nil }
    }
}

nonisolated struct BulletinAttendance: Decodable, Hashable {
    let absences: Int?
    let lates: Int?
}

nonisolated struct CompositionPaper: Decodable, Identifiable, Hashable {
    let id: String
    let sessionId: String?
    let evalDate: String?
    let startTime: String?
    let endTime: String?
    let matieres: NamedEntity?

    enum CodingKeys: String, CodingKey {
        case id, matieres
        case sessionId = "session_id"
        case evalDate = "eval_date"
        case startTime = "start_time"
        case endTime = "end_time"
    }
}

nonisolated struct StudentCompositionSession: Identifiable, Hashable {
    let id: String
    let title: String?
    let periodLabel: String?
    let startsOn: String?
    let endsOn: String?
    let papers: [CompositionPaper]

    var statusLabel: String {
        guard let startsOn, let endsOn else { return "Programmée" }
        let today = EduDates.day()
        if today >= startsOn && today <= endsOn { return "En cours" }
        if today > endsOn { return "Terminée" }
        return "À venir"
    }
}

nonisolated struct SetupCounts: Decodable, Hashable {
    let classesWithProgramme: Int?
    let enrollments: Int?
    let assignments: Int?
    let timetableSlots: Int?
}

nonisolated struct SchoolHomeStats: Decodable, Hashable {
    let absent: Int?
    let late: Int?
    let excused: Int?
    let classesWithEdt: Int?
    let todaySlotCount: Int?
}

nonisolated struct CountOnly: Decodable {
    let count: Int?
}

nonisolated struct SchoolStatistics: Decodable {
    nonisolated struct YearInfo: Decodable {
        let label: String?
        let isCurrent: Bool?
    }
    nonisolated struct Totals: Decodable {
        let students: Int?
        let male: Int?
        let female: Int?
        let unknownSex: Int?
        let classes: Int?
    }
    nonisolated struct ClassStat: Decodable, Identifiable {
        var id: String { classId ?? name ?? "classe" }
        let classId: String?
        let name: String?
        let total: Int?
        let male: Int?
        let female: Int?
        let absent: Int?
        let average: Double?
    }
    let year: YearInfo?
    let totals: Totals?
    let byClass: [ClassStat]?
}

nonisolated struct VerifyPayload: Decodable {
    let status: String
    let docType: String?
    let periodLabel: String?
    let yearLabel: String?
    let schoolName: String?
    let schoolCity: String?
    let holderInitials: String?
    let issuedOn: String?
    let superseded: Bool?
    let gradeCheck: String?
    let revokedOn: String?

    enum CodingKeys: String, CodingKey {
        case status
        case docType = "doc_type"
        case periodLabel = "period_label"
        case yearLabel = "year_label"
        case schoolName = "school_name"
        case schoolCity = "school_city"
        case holderInitials = "holder_initials"
        case issuedOn = "issued_on"
        case superseded
        case gradeCheck = "grade_check"
        case revokedOn = "revoked_on"
    }
}

struct PresenceDraft: Identifiable, Hashable {
    let id: String
    let studentId: String
    let firstName: String
    let lastName: String
    var status: String

    var fullName: String { "\(firstName) \(lastName)" }
}
