import Foundation

enum AppConfig {
  static var supabaseURL: URL {
    guard let raw = string(for: "SUPABASE_URL"),
          let url = URL(string: raw),
          !raw.contains("YOUR_PROJECT")
    else {
      fatalError(missingSecretsMessage)
    }
    return url
  }

  static var supabaseAnonKey: String {
    guard let key = string(for: "SUPABASE_ANON_KEY"),
          !key.isEmpty,
          !key.contains("your_anon")
    else {
      fatalError(missingSecretsMessage)
    }
    return key
  }

  private static let missingSecretsMessage = """
  Configure Supabase for EduFaso iOS:
  1. Open edufaso iOS/EduFaso/Config/Secrets.xcconfig
  2. Set SUPABASE_URL and SUPABASE_ANON_KEY (same values as the web .env)
  3. Rebuild in Xcode
  """

  private static func string(for key: String) -> String? {
    if let value = Bundle.main.object(forInfoDictionaryKey: key) as? String {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty { return trimmed }
    }
    return nil
  }
}
