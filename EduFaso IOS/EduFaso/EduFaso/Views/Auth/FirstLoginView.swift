import SwiftUI

struct FirstLoginView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var password = ""
    @State private var confirm = ""
    @State private var showMismatch = false

    private var rules: [(String, Bool)] {
        [
            ("Au moins 8 caractères", password.count >= 8),
            ("Au moins une majuscule (A–Z)", password.rangeOfCharacter(from: .uppercaseLetters) != nil),
            ("Au moins un chiffre (0–9)", password.rangeOfCharacter(from: .decimalDigits) != nil),
            ("Au moins un caractère spécial (!@#$…)", password.rangeOfCharacter(from: CharacterSet.alphanumerics.inverted) != nil),
        ]
    }

    private var displayName: String {
        auth.profile?.fullName.trimmingCharacters(in: .whitespaces) ?? ""
    }

    private var identifiant: String {
        guard let email = auth.session?.user.email else { return "" }
        if email.hasSuffix("@edufaso.local") {
            return String(email.dropLast("@edufaso.local".count))
        }
        return email
    }

    private var canSubmit: Bool {
        PasswordRules.isStrong(password) && !confirm.isEmpty
    }

    var body: some View {
        NavigationStack {
            AuthChrome {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Première connexion")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(EduTheme.ink)
                        Text("Choisissez un nouveau mot de passe sécurisé")
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                    }

                    if !displayName.isEmpty || !identifiant.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            if !displayName.isEmpty {
                                Text(displayName)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                            }
                            if !identifiant.isEmpty {
                                HStack(spacing: 8) {
                                    Text("Identifiant")
                                        .font(.footnote)
                                        .foregroundStyle(EduTheme.muted)
                                    Text(identifiant)
                                        .font(.footnote.weight(.semibold))
                                        .foregroundStyle(EduTheme.navy)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(EduTheme.brand50, in: Capsule())
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(EduTheme.fieldBorder.opacity(0.55), lineWidth: 1)
                                )
                        )
                    }

                    AuthTextField(
                        title: "Nouveau mot de passe",
                        text: $password,
                        isSecure: true,
                        showSecureToggle: true,
                        contentType: .newPassword,
                        submitLabel: .next
                    )

                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(rules, id: \.0) { rule in
                            HStack(spacing: 8) {
                                Image(systemName: rule.1 ? "checkmark.circle.fill" : "xmark.circle")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(rule.1 ? EduTheme.fasoGreen : EduTheme.muted)
                                Text(rule.0)
                                    .font(.caption)
                                    .foregroundStyle(rule.1 ? EduTheme.fasoGreen : EduTheme.muted)
                            }
                        }
                    }

                    AuthTextField(
                        title: "Confirmer le mot de passe",
                        text: $confirm,
                        isSecure: true,
                        showSecureToggle: true,
                        contentType: .newPassword,
                        submitLabel: .go,
                        onSubmit: submit
                    )

                    if showMismatch {
                        Text("Les mots de passe ne correspondent pas")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(Color(red: 0.72, green: 0.11, blue: 0.11))
                    }

                    if let err = auth.authError {
                        Text(err)
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(Color(red: 0.72, green: 0.11, blue: 0.11))
                    }

                    AuthPrimaryButton(
                        title: "Valider et continuer",
                        busy: auth.busy,
                        enabled: canSubmit,
                        action: submit
                    )
                    .padding(.top, 4)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private func submit() {
        showMismatch = false
        auth.authError = nil
        guard password == confirm else {
            showMismatch = true
            return
        }
        if let msg = PasswordRules.errorMessage(password) {
            auth.authError = msg
            return
        }
        Task {
            _ = await auth.completePasswordChange(password)
        }
    }
}
