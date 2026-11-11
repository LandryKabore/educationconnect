import Foundation

enum AppRole: String, Codable, CaseIterable, Identifiable {
  case superAdmin = "super_admin"
  case schoolAdmin = "school_admin"
  case teacher
  case student
  case parent

  var id: String { rawValue }

  var title: String {
    switch self {
    case .superAdmin: return "Super admin"
    case .schoolAdmin: return "Admin école"
    case .teacher: return "Enseignant"
    case .student: return "Élève"
    case .parent: return "Parent"
    }
  }

  static let priority: [AppRole] = [
    .superAdmin, .schoolAdmin, .teacher, .student, .parent,
  ]
}

enum AttendanceStatus: String, Codable, CaseIterable, Identifiable {
  case present
  case absent
  case late
  case excused

  var id: String { rawValue }

  var title: String {
    switch self {
    case .present: return "Présent"
    case .absent: return "Absent"
    case .late: return "Retard"
    case .excused: return "Excusé"
    }
  }
}

struct Profile: Codable, Identifiable, Hashable {
  let id: String
  var firstName: String
  var lastName: String
  var email: String?
  var phone: String?
  var avatarURL: String?
  var dateOfBirth: String?
  var gender: String?
  var address: String?
  var matricule: String?
  var mustChangePassword: Bool
  var familyManaged: Bool?
  var lastLoginAt: String?
  var active: Bool
  var createdAt: String?

  enum CodingKeys: String, CodingKey {
    case id
    case firstName = "first_name"
    case lastName = "last_name"
    case email
    case phone
    case avatarURL = "avatar_url"
    case dateOfBirth = "date_of_birth"
    case gender
    case address
    case matricule
    case mustChangePassword = "must_change_password"
    case familyManaged = "family_managed"
    case lastLoginAt = "last_login_at"
    case active
    case createdAt = "created_at"
  }

  var fullName: String {
    let name = [firstName, lastName].filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.joined(separator: " ")
    return name.isEmpty ? "Utilisateur" : name
  }
}

struct UserRoleRow: Codable, Identifiable, Hashable {
  let id: String
  let userId: String
  let role: AppRole
  let schoolId: String?
  let active: Bool

  enum CodingKeys: String, CodingKey {
    case id
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
  let active: Bool

  enum CodingKeys: String, CodingKey {
    case id, name, code, city, active
  }
}

struct ClassSection: Codable, Identifiable, Hashable {
  let id: String
  let schoolId: String
  let academicYearId: String
  let name: String
  let gradeLevel: String?
  let capacity: Int?

  enum CodingKeys: String, CodingKey {
    case id
    case schoolId = "school_id"
    case academicYearId = "academic_year_id"
    case name
    case gradeLevel = "grade_level"
    case capacity
  }
}

struct Subject: Codable, Identifiable, Hashable {
  let id: String
  let schoolId: String
  let name: String
  let code: String?
  let coefficient: Double?

  enum CodingKeys: String, CodingKey {
    case id
    case schoolId = "school_id"
    case name
    case code
    case coefficient
  }
}

struct Enrollment: Codable, Identifiable, Hashable {
  let id: String
  let studentId: String
  let classSectionId: String
  let academicYearId: String
  let status: String?

  enum CodingKeys: String, CodingKey {
    case id
    case studentId = "student_id"
    case classSectionId = "class_section_id"
    case academicYearId = "academic_year_id"
    case status
  }
}

struct TeachingAssignment: Codable, Identifiable, Hashable {
  let id: String
  let teacherId: String
  let classSectionId: String
  let subjectId: String

  enum CodingKeys: String, CodingKey {
    case id
    case teacherId = "teacher_id"
    case classSectionId = "class_section_id"
    case subjectId = "subject_id"
  }
}

struct ParentStudentLink: Codable, Identifiable, Hashable {
  let id: String
  let parentId: String
  let studentId: String
  let relationship: String?

  enum CodingKeys: String, CodingKey {
    case id
    case parentId = "parent_id"
    case studentId = "student_id"
    case relationship
  }
}

struct AttendanceRow: Codable, Identifiable, Hashable {
  let id: String
  let classSectionId: String
  let studentId: String
  let subjectId: String?
  let date: String
  let status: AttendanceStatus
  let note: String?

  enum CodingKeys: String, CodingKey {
    case id
    case classSectionId = "class_section_id"
    case studentId = "student_id"
    case subjectId = "subject_id"
    case date
    case status
    case note
  }
}

struct GradeRow: Codable, Identifiable, Hashable {
  let id: String
  let studentId: String
  let subjectId: String
  let classSectionId: String?
  let periodLabel: String?
  let score: Double?
  let maxScore: Double?
  let evaluationId: String?
  let isAbsent: Bool?
  let comment: String?

  enum CodingKeys: String, CodingKey {
    case id
    case studentId = "student_id"
    case subjectId = "subject_id"
    case classSectionId = "class_section_id"
    case periodLabel = "period_label"
    case score
    case maxScore = "max_score"
    case evaluationId = "evaluation_id"
    case isAbsent = "is_absent"
    case comment
  }
}

struct Evaluation: Codable, Identifiable, Hashable {
  let id: String
  let title: String
  let type: String?
  let maxScore: Double?
  let evalDate: String?
  let classSectionId: String?
  let subjectId: String?

  enum CodingKeys: String, CodingKey {
    case id
    case title
    case type
    case maxScore = "max_score"
    case evalDate = "eval_date"
    case classSectionId = "class_section_id"
    case subjectId = "subject_id"
  }
}

struct TimetableSlot: Codable, Identifiable, Hashable {
  let id: String
  let classSectionId: String?
  let subjectId: String?
  let teacherId: String?
  let dayOfWeek: Int
  let startTime: String
  let endTime: String
  let room: String?

  enum CodingKeys: String, CodingKey {
    case id
    case classSectionId = "class_section_id"
    case subjectId = "subject_id"
    case teacherId = "teacher_id"
    case dayOfWeek = "day_of_week"
    case startTime = "start_time"
    case endTime = "end_time"
    case room
  }
}

struct MessageRow: Codable, Identifiable, Hashable {
  let id: String
  let schoolId: String?
  let senderId: String?
  let recipientId: String?
  let subject: String?
  let body: String?
  let readAt: String?
  let createdAt: String?
  let isAnnouncement: Bool?

  enum CodingKeys: String, CodingKey {
    case id
    case schoolId = "school_id"
    case senderId = "sender_id"
    case recipientId = "recipient_id"
    case subject
    case body
    case readAt = "read_at"
    case createdAt = "created_at"
    case isAnnouncement = "is_announcement"
  }
}

struct NamedRef: Codable, Hashable {
  let id: String?
  let name: String?
  let gradeLevel: String?

  enum CodingKeys: String, CodingKey {
    case id, name
    case gradeLevel = "grade_level"
  }

  init(id: String? = nil, name: String? = nil, gradeLevel: String? = nil) {
    self.id = id
    self.name = name
    self.gradeLevel = gradeLevel
  }

  init(from decoder: Decoder) throws {
    if let object = try? decoder.container(keyedBy: CodingKeys.self) {
      id = try object.decodeIfPresent(String.self, forKey: .id)
      name = try object.decodeIfPresent(String.self, forKey: .name)
      gradeLevel = try object.decodeIfPresent(String.self, forKey: .gradeLevel)
      return
    }
    var array = try decoder.unkeyedContainer()
    if let first = try? array.decode(NamedRef.self) {
      id = first.id
      name = first.name
      gradeLevel = first.gradeLevel
    } else {
      id = nil
      name = nil
      gradeLevel = nil
    }
  }
}
