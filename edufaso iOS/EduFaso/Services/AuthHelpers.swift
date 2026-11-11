import Foundation

enum AuthHelpers {
  /// Identifiant local → email technique Auth (`alice` → `alice@edufaso.local`).
  static func toAuthEmail(_ identifiant: String) -> String {
    let value = identifiant.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if value.contains("@") { return value }
    return "\(value)@edufaso.local"
  }

  static func fromAuthEmail(_ email: String?) -> String {
    guard let email, !email.isEmpty else { return "" }
    if email.hasSuffix("@edufaso.local") {
      return String(email.dropLast("@edufaso.local".count))
    }
    return email
  }

  static let passwordMinLength = 8

  static func isPasswordStrong(_ password: String) -> Bool {
    failedPasswordRules(password).isEmpty
  }

  static func failedPasswordRules(_ password: String) -> [String] {
    var failed: [String] = []
    if password.count < passwordMinLength {
      failed.append("au moins \(passwordMinLength) caractères")
    }
    if password.range(of: "[A-Z]", options: .regularExpression) == nil {
      failed.append("une majuscule (A–Z)")
    }
    if password.range(of: "[0-9]", options: .regularExpression) == nil {
      failed.append("un chiffre (0–9)")
    }
    if password.range(of: "[^A-Za-z0-9]", options: .regularExpression) == nil {
      failed.append("un caractère spécial (!@#$…)")
    }
    return failed
  }

  static func passwordStrengthError(_ password: String) -> String? {
    let failed = failedPasswordRules(password)
    guard !failed.isEmpty else { return nil }
    return "Mot de passe trop faible : \(failed.joined(separator: ", "))."
  }
}

enum ProfileCompletion {
  struct Field: Identifiable {
    let key: String
    let label: String
    let required: Bool
    let kind: Kind

    var id: String { key }

    enum Kind {
      case text, phone, date, gender
    }
  }

  static func fields(for role: AppRole) -> [Field] {
    switch role {
    case .teacher:
      return [
        .init(key: "first_name", label: "Prénom", required: true, kind: .text),
        .init(key: "last_name", label: "Nom", required: true, kind: .text),
        .init(key: "phone", label: "Téléphone", required: true, kind: .phone),
        .init(key: "gender", label: "Sexe", required: true, kind: .gender),
      ]
    case .student:
      return [
        .init(key: "first_name", label: "Prénom", required: true, kind: .text),
        .init(key: "last_name", label: "Nom", required: true, kind: .text),
        .init(key: "date_of_birth", label: "Date de naissance", required: true, kind: .date),
        .init(key: "gender", label: "Sexe", required: true, kind: .gender),
        .init(key: "phone", label: "Téléphone", required: true, kind: .phone),
      ]
    case .parent:
      return [
        .init(key: "first_name", label: "Prénom", required: true, kind: .text),
        .init(key: "last_name", label: "Nom", required: true, kind: .text),
        .init(key: "phone", label: "Téléphone", required: true, kind: .phone),
        .init(key: "gender", label: "Sexe", required: false, kind: .gender),
      ]
    default:
      return []
    }
  }

  static func value(for key: String, in profile: Profile) -> String {
    switch key {
    case "first_name": return profile.firstName
    case "last_name": return profile.lastName
    case "phone": return profile.phone ?? ""
    case "date_of_birth": return profile.dateOfBirth ?? ""
    case "gender": return profile.gender ?? ""
    case "address": return profile.address ?? ""
    default: return ""
    }
  }

  static func missingFields(profile: Profile?, role: AppRole?) -> [Field] {
    guard let profile, let role else { return [] }
    if profile.familyManaged == true { return [] }
    guard [.teacher, .student, .parent].contains(role) else { return [] }
    return fields(for: role).filter { field in
      field.required && value(for: field.key, in: profile)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .isEmpty
    }
  }

  static func needsCompletion(profile: Profile?, role: AppRole?) -> Bool {
    !missingFields(profile: profile, role: role).isEmpty
  }
}

enum WeekdayLabel {
  /// `day_of_week` is ISO 1–7 (Mon–Sun), matching the web app.
  static func name(for dayOfWeek: Int) -> String {
    switch dayOfWeek {
    case 1: return "Lundi"
    case 2: return "Mardi"
    case 3: return "Mercredi"
    case 4: return "Jeudi"
    case 5: return "Vendredi"
    case 6: return "Samedi"
    case 7: return "Dimanche"
    default: return "Jour \(dayOfWeek)"
    }
  }

  static var todayISO: Int {
    // Calendar weekday: 1=Sunday … 7=Saturday → ISO Mon=1 … Sun=7
    let weekday = Calendar.current.component(.weekday, from: Date())
    return weekday == 1 ? 7 : weekday - 1
  }
}
