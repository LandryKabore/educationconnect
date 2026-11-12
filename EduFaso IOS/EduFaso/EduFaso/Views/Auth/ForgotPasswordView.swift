import SwiftUI

struct ForgotPasswordView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var identifiant = ""
    @State private var message: String?
    @State private var sending = false

    var body: some View {
        AuthChrome {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Mot de passe oublié")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                    Text("Indiquez l’e-mail du compte. Les identifiants créés par l’école se réinitialisent auprès de l’administration.")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                AuthTextField(
                    title: "E-mail ou identifiant",
                    placeholder: "ex. prenom.nom",
                    text: $identifiant,
                    keyboard: .emailAddress,
                    contentType: .username,
                    submitLabel: .go,
                    onSubmit: { Task { await send() } }
                )

                AuthPrimaryButton(
                    title: "Envoyer le lien",
                    busy: sending,
                    enabled: !identifiant.trimmingCharacters(in: .whitespaces).isEmpty
                ) {
                    Task { await send() }
                }

                if let message {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(EduTheme.muted)
                }
            }
        }
        .premiumTitle("Mot de passe")
    }

    private func send() async {
        sending = true
        defer { sending = false }
        message = await auth.sendPasswordReset(identifiant: identifiant)
    }
}

struct VerifyDocumentView: View {
    @State private var code = ""
    @State private var average = ""
    @State private var result: VerifyPayload?
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        AuthChrome {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Vérifier un bulletin")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                    Text("Saisissez le code imprimé sur le document. La moyenne sert à confirmer qu’il s’agit bien de cette édition.")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                AuthTextField(
                    title: "Code",
                    text: $code,
                    contentType: .oneTimeCode,
                    submitLabel: .next
                )
                AuthTextField(
                    title: "Moyenne (facultatif)",
                    text: $average,
                    keyboard: .decimalPad,
                    submitLabel: .go,
                    onSubmit: { Task { await verify() } }
                )

                AuthPrimaryButton(
                    title: "Vérifier",
                    busy: loading,
                    enabled: !code.trimmingCharacters(in: .whitespaces).isEmpty
                ) {
                    Task { await verify() }
                }

                if let error {
                    Text(error)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(EduTheme.fasoRed)
                }
                if let result {
                    resultCard(result)
                }
            }
        }
        .premiumTitle("Vérification")
    }

    @ViewBuilder
    private func resultCard(_ result: VerifyPayload) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(headline(result.status))
                .font(.headline)
                .foregroundStyle(EduTheme.ink)
            if let school = result.schoolName { LabeledContent("École", value: school) }
            if let city = result.schoolCity, !city.isEmpty { LabeledContent("Ville", value: city) }
            if let period = result.periodLabel { LabeledContent("Période", value: period) }
            if let year = result.yearLabel { LabeledContent("Année", value: year) }
            if let initials = result.holderInitials { LabeledContent("Élève", value: initials) }
            if let issued = result.issuedOn { LabeledContent("Émis le", value: issued) }
            if result.superseded == true {
                Text("Une version plus récente a été émise.").foregroundStyle(.orange)
            }
            if result.gradeCheck == "mismatch" {
                Text("La moyenne saisie ne correspond pas.").foregroundStyle(.orange)
            } else if result.gradeCheck == "match" {
                Text("La moyenne correspond.").foregroundStyle(EduTheme.teal)
            }
            if let revoked = result.revokedOn {
                LabeledContent("Révoqué le", value: revoked)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }

    private func headline(_ status: String) -> String {
        switch status {
        case "valid": return "Document authentique"
        case "revoked": return "Document révoqué"
        default: return "Document inconnu"
        }
    }

    private func verify() async {
        loading = true
        defer { loading = false }
        error = nil
        result = nil
        let trimmedAverage = average.trimmingCharacters(in: .whitespaces)
        do {
            result = try await EduAPI().verifyDocument(
                code: code.trimmingCharacters(in: .whitespaces),
                average: trimmedAverage.isEmpty ? nil : trimmedAverage
            )
        } catch {
            self.error = error.localizedDescription
        }
    }
}
