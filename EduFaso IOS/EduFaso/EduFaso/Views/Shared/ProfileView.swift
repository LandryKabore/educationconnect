import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        PremiumScreenChrome {
            List {
                Section {
                    HStack(spacing: 14) {
                        Text(initials)
                            .font(.title3.bold())
                            .foregroundStyle(.white)
                            .frame(width: 64, height: 64)
                            .background(
                                LinearGradient(
                                    colors: [EduTheme.teal, EduTheme.navy],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                in: Circle()
                            )

                        VStack(alignment: .leading, spacing: 4) {
                            Text(auth.profile?.fullName ?? "Utilisateur")
                                .font(.title3.weight(.bold))
                                .foregroundStyle(EduTheme.ink)
                            if let role = auth.primaryRole {
                                Text(role.label)
                                    .font(.subheadline)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            if let school = auth.schools.first?.name {
                                Text(school)
                                    .font(.footnote)
                                    .foregroundStyle(EduTheme.muted)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 8)
                    .listRowBackground(Color.clear)
                }

                Section("Compte") {
                    LabeledContent("Prénom", value: auth.profile?.firstName ?? "—")
                    LabeledContent("Nom", value: auth.profile?.lastName ?? "—")
                    LabeledContent("Téléphone", value: auth.profile?.phone ?? "—")
                    LabeledContent("E-mail", value: auth.profile?.email ?? "—")
                    if let m = auth.profile?.matricule, !m.isEmpty {
                        LabeledContent("Matricule", value: m)
                    }
                    if let dob = auth.profile?.dateOfBirth, !dob.isEmpty {
                        LabeledContent("Naissance", value: dob)
                    }
                    if let g = auth.profile?.gender, !g.isEmpty {
                        LabeledContent("Sexe", value: genderLabel(g))
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task { await auth.signOut() }
                    } label: {
                        HStack {
                            if auth.busy { ProgressView() }
                            Text("Se déconnecter")
                                .fontWeight(.semibold)
                        }
                    }
                }
            }
        }
        .premiumTitle("Profil")
    }

    private var initials: String {
        let f = auth.profile?.firstName.prefix(1) ?? "?"
        let l = auth.profile?.lastName.prefix(1) ?? ""
        return "\(f)\(l)".uppercased()
    }

    private func genderLabel(_ value: String) -> String {
        switch value {
        case "M": return "Masculin"
        case "F": return "Féminin"
        default: return value
        }
    }
}
