import SwiftUI
import UIKit

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
    var initialCode: String? = nil

    @State private var code = ""
    @State private var average = ""
    @State private var result: VerifyPayload?
    @State private var error: String?
    @State private var loading = false

    private var canVerify: Bool {
        !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && parseAverage(average) != nil
    }

    var body: some View {
        AuthChrome {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Vérifier un bulletin")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                    Text("Saisissez le code et la moyenne générale exactement comme imprimés sur le bulletin (2 décimales).")
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
                .onAppear {
                    if code.isEmpty, let initialCode, !initialCode.isEmpty {
                        code = initialCode.uppercased()
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    AuthTextField(
                        title: "Moyenne générale",
                        placeholder: "ex. 11,01",
                        text: $average,
                        keyboard: .decimalPad,
                        submitLabel: .go,
                        onSubmit: { Task { await verify() } }
                    )
                    Text("Obligatoire · même valeur que sur le papier (11,01 ≠ 11,1).")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                }

                AuthPrimaryButton(
                    title: "Vérifier",
                    busyTitle: "Vérification…",
                    busy: loading,
                    enabled: canVerify
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
                Text("La moyenne saisie ne correspond pas. Reprenez les 2 décimales du bulletin.")
                    .foregroundStyle(.orange)
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

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }

    /// Accepts `11,01` / `11.01` and rounds to 2 decimals like the server hash.
    private func parseAverage(_ raw: String) -> Double? {
        let cleaned = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: ",", with: ".")
        guard let n = Double(cleaned), n >= 0, n <= 20 else { return nil }
        return (n * 100).rounded() / 100
    }

    private func verify() async {
        dismissKeyboard()
        guard let avg = parseAverage(average) else {
            error = "Indiquez la moyenne générale imprimée (ex. 11,01)."
            return
        }
        let cleanCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCode.isEmpty else { return }

        loading = true
        defer { loading = false }
        error = nil
        result = nil
        do {
            result = try await EduAPI().verifyDocument(
                code: cleanCode,
                average: String(format: "%.2f", avg)
            )
        } catch {
            self.error = error.localizedDescription
        }
    }
}
