import Foundation
import Supabase

struct AssignmentDetail: Identifiable, Hashable {
  let id: String
  let classSectionId: String
  let subjectId: String
  let className: String
  let subjectName: String
  let gradeLevel: String?
}

struct GradeDisplay: Identifiable, Hashable {
  let id: String
  let subjectName: String
  let score: Double?
  let maxScore: Double?
  let periodLabel: String?
  let comment: String?
  let isAbsent: Bool
}

struct AttendanceDisplay: Identifiable, Hashable {
  let id: String
  let date: String
  let status: AttendanceStatus
  let subjectName: String
  let note: String?
}

struct SlotDisplay: Identifiable, Hashable {
  let id: String
  let dayOfWeek: Int
  let startTime: String
  let endTime: String
  let subjectName: String
  let room: String?
  let className: String?
}

enum SchoolDataService {
  static func children(for parentId: String) async throws -> [Profile] {
    struct LinkWithStudent: Decodable {
      let studentId: String
      enum CodingKeys: String, CodingKey { case studentId = "student_id" }
    }

    let links: [LinkWithStudent] = try await SupabaseManager.client
      .from("liens_parent_eleve")
      .select("student_id")
      .eq("parent_id", value: parentId)
      .execute()
      .value

    let ids = links.map(\.studentId)
    guard !ids.isEmpty else { return [] }

    return try await SupabaseManager.client
      .from("profils")
      .select()
      .in("id", values: ids)
      .order("last_name", ascending: true)
      .execute()
      .value
  }

  static func enrollment(for studentId: String) async throws -> Enrollment? {
    try await SupabaseManager.client
      .from("inscriptions")
      .select()
      .eq("student_id", value: studentId)
      .eq("status", value: "active")
      .order("created_at", ascending: false)
      .limit(1)
      .maybeSingle()
      .execute()
      .value
  }

  static func classSection(id: String) async throws -> ClassSection? {
    try await SupabaseManager.client
      .from("classes")
      .select()
      .eq("id", value: id)
      .maybeSingle()
      .execute()
      .value
  }

  static func teacherAssignments(teacherId: String) async throws -> [AssignmentDetail] {
    struct Row: Decodable {
      let id: String
      let classSectionId: String
      let subjectId: String
      let classes: NamedRef?
      let matieres: NamedRef?

      enum CodingKeys: String, CodingKey {
        case id
        case classSectionId = "class_section_id"
        case subjectId = "subject_id"
        case classes
        case matieres
      }
    }

    let rows: [Row] = try await SupabaseManager.client
      .from("affectations_enseignement")
      .select("id,class_section_id,subject_id,classes(id,name,grade_level),matieres(id,name)")
      .eq("teacher_id", value: teacherId)
      .execute()
      .value

    return rows.map {
      AssignmentDetail(
        id: $0.id,
        classSectionId: $0.classSectionId,
        subjectId: $0.subjectId,
        className: $0.classes?.name ?? "Classe",
        subjectName: $0.matieres?.name ?? "Matière",
        gradeLevel: $0.classes?.gradeLevel
      )
    }
  }

  static func grades(for studentId: String) async throws -> [GradeDisplay] {
    struct Row: Decodable {
      let id: String
      let score: Double?
      let maxScore: Double?
      let periodLabel: String?
      let comment: String?
      let isAbsent: Bool?
      let matieres: NamedRef?

      enum CodingKeys: String, CodingKey {
        case id, score, comment
        case maxScore = "max_score"
        case periodLabel = "period_label"
        case isAbsent = "is_absent"
        case matieres
      }
    }

    let rows: [Row] = try await SupabaseManager.client
      .from("notes")
      .select("id,score,max_score,period_label,comment,is_absent,matieres(id,name)")
      .eq("student_id", value: studentId)
      .order("created_at", ascending: false)
      .limit(50)
      .execute()
      .value

    return rows.map {
      GradeDisplay(
        id: $0.id,
        subjectName: $0.matieres?.name ?? "Matière",
        score: $0.score,
        maxScore: $0.maxScore,
        periodLabel: $0.periodLabel,
        comment: $0.comment,
        isAbsent: $0.isAbsent ?? false
      )
    }
  }

  static func attendance(for studentId: String) async throws -> [AttendanceDisplay] {
    struct Row: Decodable {
      let id: String
      let date: String
      let status: AttendanceStatus
      let note: String?
      let matieres: NamedRef?

      enum CodingKeys: String, CodingKey {
        case id, date, status, note, matieres
      }
    }

    let rows: [Row] = try await SupabaseManager.client
      .from("presences")
      .select("id,date,status,note,matieres(id,name)")
      .eq("student_id", value: studentId)
      .order("date", ascending: false)
      .limit(40)
      .execute()
      .value

    return rows.map {
      AttendanceDisplay(
        id: $0.id,
        date: $0.date,
        status: $0.status,
        subjectName: $0.matieres?.name ?? "Matière",
        note: $0.note
      )
    }
  }

  static func timetable(classSectionId: String) async throws -> [SlotDisplay] {
    struct Row: Decodable {
      let id: String
      let dayOfWeek: Int
      let startTime: String
      let endTime: String
      let room: String?
      let matieres: NamedRef?
      let classes: NamedRef?

      enum CodingKeys: String, CodingKey {
        case id, room, matieres, classes
        case dayOfWeek = "day_of_week"
        case startTime = "start_time"
        case endTime = "end_time"
      }
    }

    let rows: [Row] = try await SupabaseManager.client
      .from("creneaux_edt")
      .select("id,day_of_week,start_time,end_time,room,matieres(id,name),classes(id,name)")
      .eq("class_section_id", value: classSectionId)
      .order("day_of_week", ascending: true)
      .order("start_time", ascending: true)
      .execute()
      .value

    return rows.map {
      SlotDisplay(
        id: $0.id,
        dayOfWeek: $0.dayOfWeek,
        startTime: String($0.startTime.prefix(5)),
        endTime: String($0.endTime.prefix(5)),
        subjectName: $0.matieres?.name ?? "Matière",
        room: $0.room,
        className: $0.classes?.name
      )
    }
  }

  static func teacherTimetable(teacherId: String) async throws -> [SlotDisplay] {
    struct Row: Decodable {
      let id: String
      let dayOfWeek: Int
      let startTime: String
      let endTime: String
      let room: String?
      let matieres: NamedRef?
      let classes: NamedRef?

      enum CodingKeys: String, CodingKey {
        case id, room, matieres, classes
        case dayOfWeek = "day_of_week"
        case startTime = "start_time"
        case endTime = "end_time"
      }
    }

    let rows: [Row] = try await SupabaseManager.client
      .from("creneaux_edt")
      .select("id,day_of_week,start_time,end_time,room,matieres(id,name),classes(id,name)")
      .eq("teacher_id", value: teacherId)
      .order("day_of_week", ascending: true)
      .order("start_time", ascending: true)
      .execute()
      .value

    return rows.map {
      SlotDisplay(
        id: $0.id,
        dayOfWeek: $0.dayOfWeek,
        startTime: String($0.startTime.prefix(5)),
        endTime: String($0.endTime.prefix(5)),
        subjectName: $0.matieres?.name ?? "Matière",
        room: $0.room,
        className: $0.classes?.name
      )
    }
  }

  static func students(in classSectionId: String) async throws -> [Profile] {
    struct Row: Decodable {
      let studentId: String
      enum CodingKeys: String, CodingKey { case studentId = "student_id" }
    }

    let enrollments: [Row] = try await SupabaseManager.client
      .from("inscriptions")
      .select("student_id")
      .eq("class_section_id", value: classSectionId)
      .eq("status", value: "active")
      .execute()
      .value

    let ids = enrollments.map(\.studentId)
    guard !ids.isEmpty else { return [] }

    return try await SupabaseManager.client
      .from("profils")
      .select()
      .in("id", values: ids)
      .order("last_name", ascending: true)
      .execute()
      .value
  }

  static func upsertAttendance(
    classSectionId: String,
    studentId: String,
    subjectId: String,
    date: String,
    status: AttendanceStatus,
    recordedBy: String
  ) async throws {
    struct Payload: Encodable {
      let classSectionId: String
      let studentId: String
      let subjectId: String
      let date: String
      let status: String
      let recordedBy: String

      enum CodingKeys: String, CodingKey {
        case classSectionId = "class_section_id"
        case studentId = "student_id"
        case subjectId = "subject_id"
        case date
        case status
        case recordedBy = "recorded_by"
      }
    }

    try await SupabaseManager.client
      .from("presences")
      .upsert(
        Payload(
          classSectionId: classSectionId,
          studentId: studentId,
          subjectId: subjectId,
          date: date,
          status: status.rawValue,
          recordedBy: recordedBy
        ),
        onConflict: "class_section_id,student_id,date,subject_id"
      )
      .execute()
  }

  static func inbox(for userId: String) async throws -> [MessageRow] {
    try await SupabaseManager.client
      .from("messages")
      .select()
      .eq("recipient_id", value: userId)
      .order("created_at", ascending: false)
      .limit(30)
      .execute()
      .value
  }
}
