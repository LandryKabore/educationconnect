import SwiftUI

struct CompleteProfileView: View {
  @Environment(AuthStore.self) private var auth
  @State private var values: [String: String] = [:]
  @State private var saving = false

  private var fields: [ProfileCompletion.Field] {
    guard let role = auth.primaryRole, let profile = auth.profile else { return [] }
    return ProfileCompletion.fields(for: role).filter {
      ProfileCompletion.value(for: $0.key, in: profile)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .isEmpty
    }
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text("Complétez votre profil pour continuer.")
            .foregroundStyle(Brand.muted)
        }

        Section("Informations") {
          ForEach(fields) { field in
            switch field.kind {
            case .gender:
              Picker(field.label, selection: binding(for: field.key)) {
                Text("Choisir").tag("")
                Text("Masculin").tag("M")
                Text("Féminin").tag("F")
                Text("Autre").tag("other")
              }
            case .date:
              TextField(field.label + " (AAAA-MM-JJ)", text: binding(for: field.key))
                .keyboardType(.numbersAndPunctuation)
            case .phone:
              TextField(field.label, text: binding(for: field.key))
                .keyboardType(.phonePad)
            case .text:
              TextField(field.label, text: binding(for: field.key))
            }
          }
        }

        if let error = auth.errorMessage {
          Section { Text(error).foregroundStyle(Brand.fasoRed) }
        }

        Section {
          Button {
            Task { await save() }
          } label: {
            if saving {
              ProgressView()
            } else {
              Text("Enregistrer")
            }
          }
          .disabled(saving || fields.isEmpty)

          Button("Se déconnecter", role: .destructive) {
            Task { await auth.signOut() }
          }
        }
      }
      .navigationTitle("Compléter le profil")
      .onAppear { seedValues() }
    }
  }

  private func binding(for key: String) -> Binding<String> {
    Binding(
      get: { values[key] ?? "" },
      set: { values[key] = $0 }
    )
  }

  private func seedValues() {
    guard let profile = auth.profile else { return }
    for field in fields {
      values[field.key] = ProfileCompletion.value(for: field.key, in: profile)
    }
  }

  private func save() async {
    saving = true
    defer { saving = false }

    for field in fields where field.required {
      if (values[field.key] ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
        auth.errorMessage = "Le champ « \(field.label) » est obligatoire."
        return
      }
    }

    var patch: [String: String] = [:]
    for (key, value) in values {
      patch[key] = value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    _ = await auth.updateProfileFields(patch)
  }
}
