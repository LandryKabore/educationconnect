import Foundation
import UIKit
import Supabase
import Combine

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var session: Session?
    @Published var profile: Profile?
    @Published var roles: [UserRoleRow] = []
    @Published var schools: [School] = []
    @Published var loading = true
    /// False until the role home/portal has finished its first data load.
    @Published var portalReady = false
    @Published var authError: String?
    @Published var busy = false

    func markPortalReady() {
        guard !portalReady else { return }
        portalReady = true
    }

    func resetPortalReady() {
        portalReady = false
    }

    private let client = SupabaseManager.client
    private var authTask: Task<Void, Never>?

    var userId: String? { session?.user.id.uuidString.lowercased() }

    var primaryRole: AppRole? {
        for role in AppRole.priority {
            if roles.contains(where: { $0.role == role }) { return role }
        }
        return nil
    }

    var schoolId: String? {
        roles.first(where: { $0.schoolId != nil })?.schoolId ?? schools.first?.id
    }

    var needsPasswordChange: Bool {
        profile?.mustChangePassword == true
    }

    var needsProfileCompletion: Bool {
        ProfileCompletion.needsCompletion(profile: profile, role: primaryRole)
    }

    init() {
        authTask = Task { await listen() }
    }

    deinit {
        authTask?.cancel()
    }

    private func listen() async {
        do {
            let current = try await client.auth.session
            session = current
            await loadUserData(userId: current.user.id.uuidString.lowercased())
        } catch {
            session = nil
            profile = nil
            roles = []
            schools = []
            portalReady = false
        }
        loading = false

        for await (event, session) in client.auth.authStateChanges {
            switch event {
            case .initialSession:
                continue
            case .signedIn, .signedOut, .userUpdated, .tokenRefreshed:
                if event == .signedIn || event == .signedOut {
                    portalReady = false
                }
                self.session = session
                if let session {
                    await loadUserData(userId: session.user.id.uuidString.lowercased())
                } else {
                    profile = nil
                    roles = []
                    schools = []
                    portalReady = false
                }
                loading = false
            default:
                break
            }
        }
    }

    func loadUserData(userId: String) async {
        do {
            let profils: [Profile] = try await client
                .from("profils")
                .select()
                .eq("id", value: userId)
                .limit(1)
                .execute()
                .value
            profile = profils.first

            let roleRows: [UserRoleRow] = try await client
                .from("roles_utilisateurs")
                .select("user_id, role, school_id, active")
                .eq("user_id", value: userId)
                .eq("active", value: true)
                .execute()
                .value
            roles = roleRows

            let schoolIds = Array(Set(roleRows.compactMap(\.schoolId)))
            if !schoolIds.isEmpty {
                let schoolRows: [School] = try await client
                    .from("ecoles")
                    .select("id, name, code, city")
                    .in("id", values: schoolIds)
                    .execute()
                    .value
                schools = schoolRows
            } else if roleRows.contains(where: { $0.role == .superAdmin }) {
                let schoolRows: [School] = try await client
                    .from("ecoles")
                    .select("id, name, code, city")
                    .eq("active", value: true)
                    .execute()
                    .value
                schools = schoolRows
            } else {
                schools = []
            }
        } catch {
            authError = error.localizedDescription
        }
    }

    func signIn(identifiant: String, password: String) async {
        authError = nil
        busy = true
        portalReady = false
        defer { busy = false }
        do {
            let email = toAuthEmail(identifiant)
            let session = try await client.auth.signIn(email: email, password: password)
            self.session = session
            let uid = session.user.id.uuidString.lowercased()
            _ = try? await client
                .from("profils")
                .update(["last_login_at": ISO8601DateFormatter().string(from: Date())])
                .eq("id", value: uid)
                .execute()
            await loadUserData(userId: uid)
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    func signOut() async {
        busy = true
        defer { busy = false }
        do {
            try await client.auth.signOut()
            session = nil
            profile = nil
            roles = []
            schools = []
            portalReady = false
        } catch {
            authError = error.localizedDescription
        }
    }

    func completePasswordChange(_ newPassword: String) async -> Bool {
        authError = nil
        if let msg = PasswordRules.errorMessage(newPassword) {
            authError = msg
            return false
        }
        busy = true
        defer { busy = false }
        do {
            try await client.auth.update(user: UserAttributes(password: newPassword))
            if let uid = userId {
                try await client
                    .from("profils")
                    .update(["must_change_password": false])
                    .eq("id", value: uid)
                    .execute()
                await loadUserData(userId: uid)
            }
            return true
        } catch {
            authError = error.localizedDescription
            return false
        }
    }

    func saveProfile(_ updates: [String: String]) async -> Bool {
        authError = nil
        guard let uid = userId else { return false }
        busy = true
        defer { busy = false }
        do {
            try await client
                .from("profils")
                .update(updates)
                .eq("id", value: uid)
                .execute()
            await loadUserData(userId: uid)
            return true
        } catch {
            authError = error.localizedDescription
            return false
        }
    }

    /// Upload a compressed avatar (512px JPEG) then store the public URL on `profils`.
    func uploadAvatar(_ image: UIImage) async -> Bool {
        authError = nil
        guard let uid = userId else {
            authError = AvatarError.notSignedIn.localizedDescription
            return false
        }
        busy = true
        defer { busy = false }
        do {
            let url = try await AvatarService.upload(userId: uid, image: image)
            try await client
                .from("profils")
                .update(["avatar_url": url])
                .eq("id", value: uid)
                .execute()
            await loadUserData(userId: uid)
            return true
        } catch {
            authError = error.localizedDescription
            return false
        }
    }

    func removeAvatar() async -> Bool {
        authError = nil
        guard let uid = userId else {
            authError = AvatarError.notSignedIn.localizedDescription
            return false
        }
        busy = true
        defer { busy = false }
        do {
            try await AvatarService.remove(userId: uid)
            struct ClearAvatar: Encodable { let avatar_url: String? }
            try await client
                .from("profils")
                .update(ClearAvatar(avatar_url: nil))
                .eq("id", value: uid)
                .execute()
            await loadUserData(userId: uid)
            return true
        } catch {
            authError = error.localizedDescription
            return false
        }
    }

    /// Sends a recovery email. School logins (`@edufaso.local`) have no mailbox.
    func sendPasswordReset(identifiant: String) async -> String {
        let email = toAuthEmail(identifiant)
        if email.hasSuffix("@edufaso.local") {
            return "Cet identifiant est géré par l’école et n’a pas de boîte mail. Demandez un nouveau mot de passe à l’administration."
        }
        do {
            try await client.auth.resetPasswordForEmail(email)
            return "Si un compte correspond à cet e-mail, un lien de réinitialisation a été envoyé."
        } catch {
            return error.localizedDescription
        }
    }

    private func friendlyAuthError(_ error: Error) -> String {
        let text = error.localizedDescription.lowercased()
        if text.contains("invalid login") || text.contains("invalid credentials") {
            return "Identifiant ou mot de passe incorrect."
        }
        return error.localizedDescription
    }
}
