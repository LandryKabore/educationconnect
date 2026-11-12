import Foundation
import Security

struct SavedLogin: Identifiable, Codable, Hashable {
    var id: String { identifiant.lowercased() }
    let identifiant: String
    let updatedAt: Date
}

enum SavedLoginsStore {
    private static let listKey = "edufaso.savedLogins"
    private static let service = "bf.edufaso.app.saved-logins"

    static func list() -> [SavedLogin] {
        guard let data = UserDefaults.standard.data(forKey: listKey),
              let rows = try? JSONDecoder().decode([SavedLogin].self, from: data) else {
            return []
        }
        return rows.sorted { $0.updatedAt > $1.updatedAt }
    }

    static func password(for identifiant: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: identifiant.lowercased(),
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(identifiant: String, password: String) {
        let trimmed = identifiant.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var rows = list().filter { $0.identifiant.lowercased() != trimmed.lowercased() }
        rows.insert(SavedLogin(identifiant: trimmed, updatedAt: Date()), at: 0)
        if let data = try? JSONEncoder().encode(rows) {
            UserDefaults.standard.set(data, forKey: listKey)
        }
        let account = trimmed.lowercased()
        let payload = password.data(using: .utf8) ?? Data()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = payload
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func remove(identifiant: String) {
        let key = identifiant.lowercased()
        let rows = list().filter { $0.identifiant.lowercased() != key }
        if let data = try? JSONEncoder().encode(rows) {
            UserDefaults.standard.set(data, forKey: listKey)
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
