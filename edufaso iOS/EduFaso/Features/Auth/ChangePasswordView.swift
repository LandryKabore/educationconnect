import SwiftUI

struct ChangePasswordView: View {
  @Environment(AuthStore.self) private var auth
  @State private var password = ""
  @State private var confirm = ""

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text("Pour sécuriser votre compte, choisissez un nouveau mot de passe.")
            .foregroundStyle(Brand.muted)
        }

        Section("Nouveau mot de passe") {
          SecureField("Mot de passe", text: $password)
          SecureField("Confirmation", text: $confirm)
        }

        Section("Exigences") {
          ForEach(
            [
              "Au moins 8 caractères",
              "Au moins une majuscule (A–Z)",
              "Au moins un chiffre (0–9)",
              "Au moins un caractère spécial (!@#$…)",
            ],
            id: \.self
          ) { rule in
            Label(rule, systemImage: "checkmark.circle")
              .foregroundStyle(Brand.muted)
          }
        }

        if let error = auth.errorMessage {
          Section {
            Text(error).foregroundStyle(Brand.fasoRed)
          }
        }

        Section {
          Button("Enregistrer") {
            Task {
              guard password == confirm else {
                auth.errorMessage = "Les mots de passe ne correspondent pas."
                return
              }
              _ = await auth.completePasswordChange(password)
            }
          }
          .disabled(password.isEmpty || confirm.isEmpty)

          Button("Se déconnecter", role: .destructive) {
            Task { await auth.signOut() }
          }
        }
      }
      .navigationTitle("Première connexion")
    }
  }
}
