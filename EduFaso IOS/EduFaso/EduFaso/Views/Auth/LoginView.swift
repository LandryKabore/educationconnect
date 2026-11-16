import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @FocusState private var focusedField: Field?

    @State private var identifiant = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var saved: [SavedLogin] = SavedLoginsStore.list()
    @State private var pendingSave: (identifiant: String, password: String)?

    private enum Field {
        case identifiant, password
    }

    var body: some View {
        NavigationStack {
            ZStack {
                EduTheme.page.ignoresSafeArea()

                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 28) {
                            AuthBrand()
                            header
                            if !saved.isEmpty { savedAccounts }
                            form
                            footer
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, 24)
                        .padding(.bottom, 28)
                    }
                    .scrollDismissesKeyboard(.interactively)

                    bottomBand
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .preferredColorScheme(.light)
            .alert(
                "Enregistrer cette connexion ?",
                isPresented: Binding(
                    get: { pendingSave != nil },
                    set: { if !$0 { pendingSave = nil } }
                )
            ) {
                Button("Oui, enregistrer") {
                    if let pending = pendingSave {
                        SavedLoginsStore.save(identifiant: pending.identifiant, password: pending.password)
                        saved = SavedLoginsStore.list()
                    }
                    pendingSave = nil
                }
                Button("Non, merci", role: .cancel) { pendingSave = nil }
            } message: {
                if let pending = pendingSave {
                    Text("Souhaitez-vous enregistrer « \(pending.identifiant) » sur cet appareil pour vous connecter plus rapidement ?")
                }
            }
            .onAppear { saved = SavedLoginsStore.list() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Connexion")
                .font(.system(size: 34, weight: .regular))
                .tracking(-0.5)
                .foregroundStyle(EduTheme.ink)
            Text("Système de gestion scolaire")
                .font(.body.weight(.light))
                .foregroundStyle(EduTheme.muted)
        }
    }

    /// Teal band at the bottom: the product in one line, with the flag colours.
    private var bottomBand: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Notes, présences et devoirs, au même endroit.")
                .font(.title3.weight(.regular))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            Text("Pour élèves, parents, enseignants et directions.")
                .font(.subheadline.weight(.light))
                .foregroundStyle(.white.opacity(0.8))
            EduFlagStripe(width: 26)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 20)
        .padding(.bottom, 24)
        .background(EduTheme.accent.ignoresSafeArea(edges: .bottom))
    }

    private var savedAccounts: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Comptes enregistrés")
                .font(.footnote)
                .foregroundStyle(EduTheme.muted)
            VStack(spacing: 0) {
                ForEach(Array(saved.enumerated()), id: \.element.id) { index, entry in
                    HStack(spacing: 12) {
                        Button {
                            pickSaved(entry)
                        } label: {
                            HStack(spacing: 12) {
                                Text(String(entry.identifiant.prefix(1)).uppercased())
                                    .font(.subheadline)
                                    .foregroundStyle(EduTheme.accent)
                                    .frame(width: 32, height: 32)
                                    .background(
                                        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                                            .fill(EduTheme.brand50)
                                    )
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(entry.identifiant)
                                        .font(.subheadline)
                                        .foregroundStyle(EduTheme.ink)
                                        .lineLimit(1)
                                    Text(SavedLoginsStore.password(for: entry.identifiant) == nil
                                         ? "Appuyer pour remplir"
                                         : "Appuyer pour se connecter")
                                        .font(.caption)
                                        .foregroundStyle(EduTheme.muted)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.subtle)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        Button {
                            SavedLoginsStore.remove(identifiant: entry.identifiant)
                            saved = SavedLoginsStore.list()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption)
                                .foregroundStyle(EduTheme.subtle)
                                .frame(width: 28, height: 28)
                        }
                        .accessibilityLabel("Supprimer ce compte enregistré")
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .overlay(alignment: .top) {
                        if index > 0 {
                            Rectangle().fill(EduTheme.border).frame(height: 1)
                        }
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).fill(.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(EduTheme.border, lineWidth: 1)
            )
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Identifiant ou e-mail")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.ink)

                TextField("ex. prenom.nom", text: $identifiant)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .foregroundStyle(EduTheme.ink)
                    .tint(EduTheme.accent)
                    .focused($focusedField, equals: .identifiant)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .modifier(AuthFieldBox(focused: focusedField == .identifiant))
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Mot de passe")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.ink)
                    Spacer(minLength: 8)
                    NavigationLink {
                        ForgotPasswordView()
                    } label: {
                        Text("Mot de passe oublié ?")
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.accent)
                    }
                }

                HStack(spacing: 10) {
                    Group {
                        if showPassword {
                            TextField("Mot de passe", text: $password)
                        } else {
                            SecureField("Mot de passe", text: $password)
                        }
                    }
                    .textContentType(.password)
                    .foregroundStyle(EduTheme.ink)
                    .tint(EduTheme.accent)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { signIn() }

                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(EduTheme.subtle)
                            .frame(width: 28, height: 28)
                    }
                    .accessibilityLabel(showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe")
                }
                .modifier(AuthFieldBox(focused: focusedField == .password))
            }

            if let err = auth.authError {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.circle")
                    Text(err)
                }
                .font(.footnote)
                .foregroundStyle(Color(red: 0.72, green: 0.11, blue: 0.11))
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            AuthPrimaryButton(
                title: "Se connecter",
                busyTitle: "Connexion…",
                busy: auth.busy,
                enabled: canSubmit,
                action: signIn
            )
            .padding(.top, 4)
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 14) {
            Rectangle().fill(EduTheme.border).frame(height: 1)
            Text("Votre compte est créé par votre établissement.")
                .font(.footnote)
                .foregroundStyle(EduTheme.muted)
                .fixedSize(horizontal: false, vertical: true)
            NavigationLink {
                VerifyDocumentView()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "qrcode.viewfinder")
                    Text("Vérifier un bulletin")
                }
                .font(.footnote)
                .foregroundStyle(EduTheme.accent)
            }
        }
    }

    private var canSubmit: Bool {
        !auth.busy
            && !identifiant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
    }

    private func signIn() {
        focusedField = nil
        let id = identifiant
        let pwd = password
        Task {
            await auth.signIn(identifiant: id, password: pwd)
            if auth.session != nil, auth.authError == nil {
                if SavedLoginsStore.list().contains(where: { $0.identifiant.lowercased() == id.lowercased() }) {
                    SavedLoginsStore.save(identifiant: id, password: pwd)
                    saved = SavedLoginsStore.list()
                } else {
                    pendingSave = (id, pwd)
                }
            }
        }
    }

    private func pickSaved(_ entry: SavedLogin) {
        identifiant = entry.identifiant
        if let pwd = SavedLoginsStore.password(for: entry.identifiant), !pwd.isEmpty {
            password = pwd
            signIn()
        } else {
            focusedField = .password
        }
    }
}
