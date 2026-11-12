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
                EduTheme.loginBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    ScrollView {
                        VStack(spacing: 28) {
                            header
                            formCard
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 28)
                        .padding(.bottom, 24)
                    }
                    .scrollDismissesKeyboard(.interactively)

                    marketingStrip
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
        VStack(spacing: 10) {
            Image("EduFasoLogo")
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 168)
                .accessibilityLabel("EduFaso")

            Text("Système de gestion scolaire")
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var formCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !saved.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("COMPTES ENREGISTRÉS")
                        .font(.caption2.weight(.semibold))
                        .tracking(0.6)
                        .foregroundStyle(EduTheme.muted)
                    ForEach(saved) { entry in
                        HStack(spacing: 8) {
                            Button {
                                pickSaved(entry)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "person.fill")
                                        .foregroundStyle(EduTheme.navy)
                                        .frame(width: 36, height: 36)
                                        .background(EduTheme.brand50, in: Circle())
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(entry.identifiant)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(EduTheme.ink)
                                            .lineLimit(1)
                                        Text(SavedLoginsStore.password(for: entry.identifiant) == nil
                                             ? "Appuyer pour remplir"
                                             : "Appuyer pour se connecter")
                                            .font(.caption)
                                            .foregroundStyle(EduTheme.muted)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(10)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                SavedLoginsStore.remove(identifiant: entry.identifiant)
                                saved = SavedLoginsStore.list()
                            } label: {
                                Image(systemName: "trash")
                                    .foregroundStyle(EduTheme.fasoRed)
                                    .frame(width: 36, height: 36)
                            }
                            .accessibilityLabel("Supprimer ce compte enregistré")
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Identifiant ou e-mail")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)

                TextField("ex. prenom.nom", text: $identifiant)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .foregroundStyle(EduTheme.ink)
                    .tint(EduTheme.navy)
                    .focused($focusedField, equals: .identifiant)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 13)
                    .background(fieldBackground)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Mot de passe")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    Spacer(minLength: 8)
                    NavigationLink {
                        ForgotPasswordView()
                    } label: {
                        Text("Mot de passe oublié ?")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.navy)
                            .underline()
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
                    .tint(EduTheme.navy)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { signIn() }

                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .font(.body.weight(.medium))
                            .foregroundStyle(EduTheme.muted)
                            .frame(width: 28, height: 28)
                    }
                    .accessibilityLabel(showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(fieldBackground)
            }

            if let err = auth.authError {
                Text(err)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Color(red: 0.72, green: 0.11, blue: 0.11))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button(action: signIn) {
                HStack(spacing: 10) {
                    if auth.busy {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(auth.busy ? "Connexion…" : "Se connecter")
                        .font(.body.weight(.bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(canSubmit ? EduTheme.navy : EduTheme.navy.opacity(0.45))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .disabled(!canSubmit)
            .padding(.top, 4)

            Text("Compte créé par votre établissement.")
                .font(.footnote)
                .foregroundStyle(EduTheme.muted)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .padding(.top, 2)

            NavigationLink {
                VerifyDocumentView()
            } label: {
                Text("Vérifier un bulletin")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(EduTheme.navy)
                    .underline()
            }
            .frame(maxWidth: .infinity)
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.white)
                .shadow(color: Color.black.opacity(0.08), radius: 24, y: 10)
        )
        .overlay(alignment: .top) {
            UnevenRoundedRectangle(
                topLeadingRadius: 22,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 22,
                style: .continuous
            )
            .fill(EduTheme.navy)
            .frame(height: 4)
        }
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(EduTheme.fieldBorder.opacity(0.85), lineWidth: 1)
            )
    }

    private var marketingStrip: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Notes, présences et devoirs, au même endroit.")
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

            Text("Pour élèves, parents, enseignants et directions.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.82))

            HStack(spacing: 8) {
                Capsule().fill(EduTheme.fasoRed).frame(width: 36, height: 5)
                Capsule().fill(EduTheme.fasoYellow).frame(width: 36, height: 5)
                Capsule().fill(EduTheme.fasoGreen).frame(width: 36, height: 5)
            }
            .padding(.top, 4)
            .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 22)
        .padding(.bottom, 28)
        .background(EduTheme.navy.ignoresSafeArea(edges: .bottom))
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
