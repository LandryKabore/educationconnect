import Foundation

enum PasswordRules {
    static let minLength = 8

    static func failed(_ password: String) -> [String] {
        var fails: [String] = []
        if password.count < minLength { fails.append("au moins \(minLength) caractères") }
        if password.rangeOfCharacter(from: .uppercaseLetters) == nil { fails.append("une majuscule") }
        if password.rangeOfCharacter(from: .decimalDigits) == nil { fails.append("un chiffre") }
        let special = CharacterSet.alphanumerics.inverted
        if password.rangeOfCharacter(from: special) == nil { fails.append("un caractère spécial") }
        return fails
    }

    static func isStrong(_ password: String) -> Bool {
        failed(password).isEmpty
    }

    static func errorMessage(_ password: String) -> String? {
        let f = failed(password)
        guard !f.isEmpty else { return nil }
        return "Mot de passe trop faible : \(f.joined(separator: ", "))."
    }
}
