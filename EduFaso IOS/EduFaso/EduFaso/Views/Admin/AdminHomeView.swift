import SwiftUI

struct AdminHomeView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Administration") {
                    Text("L’app iOS native couvre pour l’instant le suivi quotidien (élèves, parents, enseignants).")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                    Text("La configuration complète de l’école reste disponible sur le web / desktop EduFaso.")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                }
                Section("Écoles") {
                    ForEach(auth.schools) { school in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(school.name).font(.headline)
                            if let city = school.city { Text(city).font(.caption).foregroundStyle(EduTheme.muted) }
                        }
                    }
                }
            }
            .navigationTitle(auth.primaryRole == .superAdmin ? "Plateforme" : "Mon école")
        }
    }
}
