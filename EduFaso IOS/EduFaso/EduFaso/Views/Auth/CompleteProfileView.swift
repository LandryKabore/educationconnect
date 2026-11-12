import SwiftUI

struct CompleteProfileView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var values: [String: String] = [:]
    @State private var birthDate = Date()
    @State private var hasBirthDate = false

    private var fields: [ProfileFieldDef] {
        ProfileCompletion.fieldsToPrompt(profile: auth.profile, role: auth.primaryRole)
    }

    private var canSubmit: Bool {
        fields.filter(\.required).allSatisfy { field in
            !(values[field.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    var body: some View {
        NavigationStack {
            AuthChrome {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Complétez votre profil")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(EduTheme.ink)
                        Text("Première connexion : renseignez les informations manquantes pour continuer.")
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if let name = auth.profile?.fullName, !name.trimmingCharacters(in: .whitespaces).isEmpty {
                        HStack(spacing: 12) {
                            Text(initials(from: name))
                                .font(.headline.weight(.bold))
                                .foregroundStyle(.white)
                                .frame(width: 52, height: 52)
                                .background(EduTheme.navy, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                if let role = auth.primaryRole {
                                    Text(role.label)
                                        .font(.caption)
                                        .foregroundStyle(EduTheme.muted)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                        )
                    }

                    ForEach(fields) { field in
                        fieldView(field)
                    }

                    if let err = auth.authError {
                        Text(err)
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(Color(red: 0.72, green: 0.11, blue: 0.11))
                    }

                    AuthPrimaryButton(
                        title: "Continuer",
                        busy: auth.busy,
                        enabled: canSubmit,
                        action: save
                    )
                    .padding(.top, 4)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .onAppear(perform: seedValues)
            .onChange(of: auth.profile?.id) { _, _ in seedValues() }
        }
    }

    @ViewBuilder
    private func fieldView(_ field: ProfileFieldDef) -> some View {
        switch field.kind {
        case .gender:
            VStack(alignment: .leading, spacing: 8) {
                label(for: field)
                Picker(field.label, selection: binding(field.key)) {
                    Text("Choisir…").tag("")
                    Text("Masculin").tag("M")
                    Text("Féminin").tag("F")
                    Text("Autre").tag("other")
                }
                .pickerStyle(.segmented)
            }

        case .date:
            VStack(alignment: .leading, spacing: 8) {
                label(for: field)
                DatePicker(
                    "",
                    selection: $birthDate,
                    in: Calendar.current.date(byAdding: .year, value: -100, to: Date())! ... Date(),
                    displayedComponents: .date
                )
                .labelsHidden()
                .datePickerStyle(.compact)
                .tint(EduTheme.navy)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(fieldChrome)
                .onChange(of: birthDate) { _, newValue in
                    hasBirthDate = true
                    values[field.key] = isoDate(newValue)
                }
            }

        case .tel:
            AuthTextField(
                title: field.required ? "\(field.label) *" : "\(field.label) (optionnel)",
                text: binding(field.key),
                keyboard: .phonePad,
                contentType: .telephoneNumber,
                submitLabel: .next
            )

        case .text:
            AuthTextField(
                title: field.required ? "\(field.label) *" : "\(field.label) (optionnel)",
                text: binding(field.key),
                contentType: contentType(for: field.key),
                submitLabel: .next
            )
        }
    }

    private func label(for field: ProfileFieldDef) -> some View {
        HStack(spacing: 4) {
            Text(field.label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(EduTheme.ink)
            if field.required {
                Text("*")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(EduTheme.fasoRed)
            } else {
                Text("(optionnel)")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            }
        }
    }

    private var fieldChrome: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(EduTheme.fieldBorder.opacity(0.85), lineWidth: 1)
            )
    }

    private func binding(_ key: String) -> Binding<String> {
        Binding(
            get: { values[key] ?? "" },
            set: { values[key] = $0 }
        )
    }

    private func seedValues() {
        guard let profile = auth.profile else { return }
        var next: [String: String] = [:]
        for field in fields {
            let existing = ProfileCompletion.value(profile, key: field.key)
            next[field.key] = existing
            if field.kind == .date, let parsed = parseISO(existing) {
                birthDate = parsed
                hasBirthDate = true
            }
        }
        values = next
    }

    private func save() {
        auth.authError = nil
        for field in fields where field.required {
            if (values[field.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                auth.authError = "Le champ « \(field.label) » est obligatoire"
                return
            }
        }

        Task {
            var payload = values
            if let profile = auth.profile, let role = auth.primaryRole {
                for field in ProfileCompletion.fields(for: role) where !payload.keys.contains(field.key) {
                    let v = ProfileCompletion.value(profile, key: field.key)
                    if !v.isEmpty { payload[field.key] = v }
                }
            }
            if fields.contains(where: { $0.kind == .date }), hasBirthDate,
               let key = fields.first(where: { $0.kind == .date })?.key {
                payload[key] = isoDate(birthDate)
            }
            _ = await auth.saveProfile(payload)
        }
    }

    private func contentType(for key: String) -> UITextContentType? {
        switch key {
        case "first_name": return .givenName
        case "last_name": return .familyName
        case "address": return .fullStreetAddress
        default: return nil
        }
    }

    private func initials(from name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first.map(String.init) }
        return letters.joined().uppercased()
    }

    private func isoDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private func parseISO(_ value: String) -> Date? {
        guard !value.isEmpty else { return nil }
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: value)
    }
}
