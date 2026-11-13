import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class AuthStore {
  private(set) var session: Session?
  private(set) var profile: Profile?
  private(set) var roles: [UserRoleRow] = []
  private(set) var schools: [School] = []
  private(set) var loading = true
  private(set) var bootstrapped = false
  var errorMessage: String?

  private var authTask: Task<Void, Never>?

  var userId: String? {
    session?.user.id.uuidString.lowercased()
  }

  var primaryRole: AppRole? {
    for role in AppRole.priority where roles.contains(where: { $0.role == role }) {
      return role
    }
    return nil
  }

  var schoolId: String? {
    roles.first(where: { $0.schoolId != nil })?.schoolId ?? schools.first?.id
  }

  var currentSchool: School? {
    guard let schoolId else { return schools.first }
    return schools.first(where: { $0.id == schoolId })
  }

  func start() {
    guard authTask == nil else { return }
    authTask = Task {
      do {
        session = try await SupabaseManager.client.auth.session
        if let uid = userId {
          await loadUserData(userId: uid)
        }
      } catch {
        session = nil
        clearUserState()
      }
      loading = false
      bootstrapped = true

      for await (event, nextSession) in SupabaseManager.client.auth.authStateChanges {
        guard !Task.isCancelled else { break }
        switch event {
        case .initialSession:
          continue
        case .signedIn, .tokenRefreshed, .userUpdated:
          session = nextSession
          if let uid = nextSession?.user.id.uuidString.lowercased() {
            await loadUserData(userId: uid)
          }
          loading = false
        case .signedOut:
          session = nil
          clearUserState()
          loading = false
        default:
          break
        }
      }
    }
  }

  func signIn(identifiant: String, password: String) async {
    errorMessage = nil
    loading = true
    defer { loading = false }
    do {
      let email = AuthHelpers.toAuthEmail(identifiant)
      let next = try await SupabaseManager.client.auth.signIn(
        email: email,
        password: password
      )
      session = next
      let uid = next.user.id.uuidString.lowercased()
      struct LoginPatch: Encodable {
        let lastLoginAt: String
        enum CodingKeys: String, CodingKey { case lastLoginAt = "last_login_at" }
      }
      try? await SupabaseManager.client
        .from("profils")
        .update(LoginPatch(lastLoginAt: ISO8601DateFormatter().string(from: Date())))
        .eq("id", value: uid)
        .execute()
      await loadUserData(userId: uid)
    } catch {
      errorMessage = friendlyError(error)
    }
  }

  func signOut() async {
    errorMessage = nil
    do {
      try await SupabaseManager.client.auth.signOut()
    } catch {
      errorMessage = friendlyError(error)
    }
    session = nil
    clearUserState()
  }

  func completePasswordChange(_ newPassword: String) async -> Bool {
    errorMessage = nil
    if let message = AuthHelpers.passwordStrengthError(newPassword) {
      errorMessage = message
      return false
    }
    do {
      try await SupabaseManager.client.auth.update(user: UserAttributes(password: newPassword))
      if let uid = userId {
        struct FlagPatch: Encodable {
          let mustChangePassword: Bool
          enum CodingKeys: String, CodingKey { case mustChangePassword = "must_change_password" }
        }
        try await SupabaseManager.client
          .from("profils")
          .update(FlagPatch(mustChangePassword: false))
          .eq("id", value: uid)
          .execute()
        await loadUserData(userId: uid)
      }
      return true
    } catch {
      errorMessage = friendlyError(error)
      return false
    }
  }

  func updateProfileFields(_ fields: [String: String]) async -> Bool {
    errorMessage = nil
    guard let uid = userId else { return false }
    do {
      try await SupabaseManager.client
        .from("profils")
        .update(fields)
        .eq("id", value: uid)
        .execute()
      await loadUserData(userId: uid)
      return true
    } catch {
      errorMessage = friendlyError(error)
      return false
    }
  }

  func refreshProfile() async {
    guard let uid = userId else { return }
    await loadUserData(userId: uid)
  }

  private func loadUserData(userId: String) async {
    do {
      let profile: Profile? = try await SupabaseManager.client
        .from("profils")
        .select()
        .eq("id", value: userId)
        .maybeSingle()
        .execute()
        .value
      self.profile = profile

      let roleRows: [UserRoleRow] = try await SupabaseManager.client
        .from("roles_utilisateurs")
        .select()
        .eq("user_id", value: userId)
        .eq("active", value: true)
        .execute()
        .value
      roles = roleRows

      let schoolIds = Array(Set(roleRows.compactMap(\.schoolId)))
      if !schoolIds.isEmpty {
        let schoolRows: [School] = try await SupabaseManager.client
          .from("ecoles")
          .select("id,name,code,city,active")
          .in("id", values: schoolIds)
          .execute()
          .value
        schools = schoolRows
      } else if roleRows.contains(where: { $0.role == .superAdmin }) {
        let schoolRows: [School] = try await SupabaseManager.client
          .from("ecoles")
          .select("id,name,code,city,active")
          .eq("active", value: true)
          .execute()
          .value
        schools = schoolRows
      } else {
        schools = []
      }
    } catch {
      errorMessage = friendlyError(error)
    }
  }

  private func clearUserState() {
    profile = nil
    roles = []
    schools = []
  }

  private func friendlyError(_ error: Error) -> String {
    let text = error.localizedDescription
    if text.localizedCaseInsensitiveContains("invalid login")
      || text.localizedCaseInsensitiveContains("invalid credentials")
    {
      return "Identifiant ou mot de passe incorrect."
    }
    return text
  }
}
