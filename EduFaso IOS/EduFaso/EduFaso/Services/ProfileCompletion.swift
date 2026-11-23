import Foundation

struct ProfileFieldDef: Identifiable {
    let id: String
    let key: String
    let label: String
    let required: Bool
    let kind: Kind

    enum Kind { case text, tel, date, gender }
}

enum ProfileCompletion {
    static func fields(for role: AppRole) -> [ProfileFieldDef] {
        switch role {
        case .teacher:
            return [
                .init(id: "first_name", key: "first_name", label: "Prénom", required: true, kind: .text),
                .init(id: "last_name", key: "last_name", label: "Nom", required: true, kind: .text),
                .init(id: "phone", key: "phone", label: "Téléphone", required: true, kind: .tel),
                .init(id: "gender", key: "gender", label: "Sexe", required: true, kind: .gender),
            ]
        case .student:
            return [
                .init(id: "first_name", key: "first_name", label: "Prénom", required: true, kind: .text),
                .init(id: "last_name", key: "last_name", label: "Nom", required: true, kind: .text),
                .init(id: "date_of_birth", key: "date_of_birth", label: "Date de naissance", required: true, kind: .date),
                .init(id: "gender", key: "gender", label: "Sexe", required: true, kind: .gender),
                .init(id: "phone", key: "phone", label: "Téléphone", required: true, kind: .tel),
            ]
        case .parent:
            return [
                .init(id: "first_name", key: "first_name", label: "Prénom", required: true, kind: .text),
                .init(id: "last_name", key: "last_name", label: "Nom", required: true, kind: .text),
                .init(id: "phone", key: "phone", label: "Téléphone", required: true, kind: .tel),
                .init(id: "gender", key: "gender", label: "Sexe", required: false, kind: .gender),
            ]
        default:
            return []
        }
    }

    static func value(_ profile: Profile, key: String) -> String {
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

    static func needsCompletion(profile: Profile?, role: AppRole?) -> Bool {
        guard let profile, let role else { return false }
        if profile.familyManaged == true { return false }
        guard [.teacher, .student, .parent].contains(role) else { return false }
        return fields(for: role).contains { $0.required && value(profile, key: $0.key).trimmingCharacters(in: .whitespaces).isEmpty }
    }

    static func fieldsToPrompt(profile: Profile?, role: AppRole?) -> [ProfileFieldDef] {
        guard let profile, let role else { return [] }
        return fields(for: role).filter { value(profile, key: $0.key).trimmingCharacters(in: .whitespaces).isEmpty }
    }
}
