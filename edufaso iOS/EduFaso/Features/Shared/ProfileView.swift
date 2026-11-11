import SwiftUI

struct ProfileView: View {
  @Environment(AuthStore.self) private var auth

  var body: some View {
    List {
      Section {
        HStack(spacing: 14) {
          ZStack {
            Circle().fill(Brand.teal.opacity(0.15))
            Text(initials)
              .font(.title2.bold())
              .foregroundStyle(Brand.teal)
          }
          .frame(width: 56, height: 56)

          VStack(alignment: .leading, spacing: 4) {
            Text(auth.profile?.fullName ?? "Utilisateur")
              .font(.headline)
            if let role = auth.primaryRole {
              Text(role.title)
                .font(.subheadline)
                .foregroundStyle(Brand.muted)
            }
            if let school = auth.currentSchool {
              Text(school.name)
                .font(.caption)
                .foregroundStyle(Brand.muted)
            }
          }
        }
        .padding(.vertical, 4)
      }

      Section("Compte") {
        LabeledContent("Identifiant", value: AuthHelpers.fromAuthEmail(auth.profile?.email ?? auth.session?.user.email))
        if let phone = auth.profile?.phone, !phone.isEmpty {
          LabeledContent("Téléphone", value: phone)
        }
        if let matricule = auth.profile?.matricule, !matricule.isEmpty {
          LabeledContent("Matricule", value: matricule)
        }
      }

      Section {
        Button("Se déconnecter", role: .destructive) {
          Task { await auth.signOut() }
        }
      }
    }
    .navigationTitle("Profil")
  }

  private var initials: String {
    let first = auth.profile?.firstName.first.map(String.init) ?? ""
    let last = auth.profile?.lastName.first.map(String.init) ?? ""
    let value = (first + last).uppercased()
    return value.isEmpty ? "?" : value
  }
}
