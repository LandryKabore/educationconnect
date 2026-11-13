import SwiftUI

struct LoginView: View {
  @Environment(AuthStore.self) private var auth
  @State private var identifiant = ""
  @State private var password = ""
  @State private var showPassword = false

  var body: some View {
    ScrollView {
      VStack(spacing: 28) {
        VStack(spacing: 12) {
          Image("BrandLogo")
            .resizable()
            .scaledToFit()
            .frame(maxWidth: 180)
            .padding(.top, 48)

          Text(Brand.name)
            .font(.largeTitle.bold())
            .foregroundStyle(Brand.navy)

          Text(Brand.tagline)
            .font(.subheadline)
            .foregroundStyle(Brand.muted)
        }

        VStack(alignment: .leading, spacing: 14) {
          labeledField("Identifiant ou e-mail") {
            TextField("ex. marie.ouedraogo", text: $identifiant)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .keyboardType(.emailAddress)
          }

          labeledField("Mot de passe") {
            HStack {
              Group {
                if showPassword {
                  TextField("••••••••", text: $password)
                } else {
                  SecureField("••••••••", text: $password)
                }
              }
              Button {
                showPassword.toggle()
              } label: {
                Image(systemName: showPassword ? "eye.slash" : "eye")
                  .foregroundStyle(Brand.muted)
              }
            }
          }

          if let error = auth.errorMessage {
            Text(error)
              .font(.footnote)
              .foregroundStyle(Brand.fasoRed)
          }

          Button {
            Task {
              await auth.signIn(identifiant: identifiant, password: password)
            }
          } label: {
            HStack {
              if auth.loading {
                ProgressView().tint(.white)
              }
              Text("Se connecter")
                .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
          }
          .buttonStyle(.borderedProminent)
          .tint(Brand.teal)
          .disabled(identifiant.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty || auth.loading)
        }
        .padding(20)
        .background(
          RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(.white)
            .shadow(color: .black.opacity(0.06), radius: 16, y: 8)
        )
        .padding(.horizontal)

        Text("Compte créé par votre école — utilisez l’identifiant fourni.")
          .font(.caption)
          .foregroundStyle(Brand.muted)
          .multilineTextAlignment(.center)
          .padding(.horizontal, 32)
      }
      .padding(.bottom, 40)
    }
    .background(
      LinearGradient(
        colors: [Brand.teal.opacity(0.12), Brand.background, Brand.fasoYellow.opacity(0.08)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()
    )
  }

  private func labeledField<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(Brand.ink)
      content()
        .padding(12)
        .background(Brand.background)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(Brand.border, lineWidth: 1)
        )
    }
  }
}
