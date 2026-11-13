import SwiftUI
import PhotosUI

struct ProfileView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var pickerItem: PhotosPickerItem?
    @State private var cropSource: UIImage?
    @State private var localPreview: UIImage?
    @State private var photoBusy = false
    @State private var photoError: String?
    @State private var confirmRemove = false
    @State private var toast: String?

    var body: some View {
        PremiumScreenChrome {
            ScrollView {
                VStack(spacing: 18) {
                    heroCard
                    identityCard
                    contactCard
                    extrasCard
                    signOutCard
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .premiumTitle("Profil")
        .alert("Supprimer la photo ?", isPresented: $confirmRemove) {
            Button("Annuler", role: .cancel) {}
            Button("Supprimer", role: .destructive) {
                Task { await removePhoto() }
            }
        } message: {
            Text("Votre photo de profil sera retirée.")
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await handlePick(item) }
        }
        .fullScreenCover(isPresented: Binding(
            get: { cropSource != nil },
            set: { if !$0 { cropSource = nil } }
        )) {
            if let cropSource {
                AvatarCropView(
                    image: cropSource,
                    onCancel: { self.cropSource = nil },
                    onCrop: { cropped in
                        self.cropSource = nil
                        Task { await uploadCropped(cropped) }
                    }
                )
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(EduTheme.navy.opacity(0.92), in: Capsule())
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.86), value: toast)
    }

    // MARK: - Hero

    private var heroCard: some View {
        VStack(spacing: 14) {
            PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                UserAvatarView(
                    url: auth.profile?.avatarUrl,
                    firstName: auth.profile?.firstName,
                    lastName: auth.profile?.lastName,
                    size: 104,
                    preview: localPreview,
                    showCameraBadge: true,
                    busy: photoBusy
                )
            }
            .buttonStyle(.plain)
            .disabled(photoBusy)
            .accessibilityLabel("Changer la photo de profil")

            VStack(spacing: 6) {
                Text(auth.profile?.fullName ?? "Utilisateur")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .multilineTextAlignment(.center)

                if let role = auth.primaryRole {
                    Text(role.label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(EduTheme.teal)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(EduTheme.teal.opacity(0.12), in: Capsule())
                }

                if let school = auth.schools.first?.name {
                    Label(school, systemImage: "building.2")
                        .font(.footnote)
                        .foregroundStyle(EduTheme.muted)
                        .padding(.top, 2)
                }
            }

            HStack(spacing: 10) {
                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    Label(hasPhoto ? "Changer" : "Ajouter une photo", systemImage: "photo.on.rectangle.angled")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.navy)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .disabled(photoBusy)

                if hasPhoto {
                    Button {
                        confirmRemove = true
                    } label: {
                        Label("Retirer", systemImage: "trash")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.fasoRed)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(EduTheme.fasoRed.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .disabled(photoBusy)
                }
            }

            if let photoError {
                Text(photoError)
                    .font(.caption)
                    .foregroundStyle(EduTheme.fasoRed)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Text("La photo est redimensionnée automatiquement (environ 512 px) pour rester légère.")
                .font(.caption2)
                .foregroundStyle(EduTheme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(cardBackground)
    }

    // MARK: - Cards

    private var identityCard: some View {
        profileSection(title: "Identité", systemImage: "person.text.rectangle") {
            row("Prénom", auth.profile?.firstName)
            row("Nom", auth.profile?.lastName)
            if let m = auth.profile?.matricule, !m.isEmpty {
                row("Matricule", m)
            }
            if let dob = auth.profile?.dateOfBirth, !dob.isEmpty {
                row("Naissance", friendlyDate(dob))
            }
            if let g = auth.profile?.gender, !g.isEmpty {
                row("Sexe", genderLabel(g))
            }
        }
    }

    private var contactCard: some View {
        profileSection(title: "Coordonnées", systemImage: "phone.fill") {
            row("Téléphone", auth.profile?.phone)
            row("E-mail", displayEmail(auth.profile?.email))
            if let address = auth.profile?.address, !address.isEmpty {
                row("Adresse", address)
            }
        }
    }

    @ViewBuilder
    private var extrasCard: some View {
        if auth.schools.count > 1 || auth.roles.count > 1 {
            profileSection(title: "École & rôle", systemImage: "building.columns") {
                ForEach(auth.schools) { school in
                    row("École", school.name)
                }
                ForEach(auth.roles, id: \.id) { role in
                    row("Rôle", role.role.label)
                }
            }
        }
    }

    private var signOutCard: some View {
        Button {
            Task { await auth.signOut() }
        } label: {
            HStack {
                if auth.busy && !photoBusy { ProgressView() }
                Image(systemName: "rectangle.portrait.and.arrow.right")
                Text("Se déconnecter")
                    .fontWeight(.semibold)
            }
            .font(.body)
            .foregroundStyle(EduTheme.fasoRed)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.white)
                    .shadow(color: EduTheme.ink.opacity(0.05), radius: 8, y: 2)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(EduTheme.fasoRed.opacity(0.18), lineWidth: 1)
            )
        }
        .disabled(auth.busy)
        .padding(.top, 4)
    }

    // MARK: - Building blocks

    private func profileSection<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(EduTheme.navy)
            VStack(spacing: 0) {
                content()
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
    }

    private func row(_ label: String, _ value: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
            Spacer(minLength: 12)
            Text((value?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? "—")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(EduTheme.ink)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255))
                .frame(height: 1)
                .opacity(0.9)
        }
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(.white)
            .shadow(color: EduTheme.ink.opacity(0.06), radius: 12, y: 4)
    }

    private var hasPhoto: Bool {
        localPreview != nil || !(auth.profile?.avatarUrl?.isEmpty ?? true)
    }

    // MARK: - Photo actions

    private func handlePick(_ item: PhotosPickerItem) async {
        photoError = nil
        defer { pickerItem = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                photoError = "Image illisible."
                return
            }
            cropSource = image
        } catch {
            photoError = error.localizedDescription
        }
    }

    private func uploadCropped(_ image: UIImage) async {
        photoError = nil
        photoBusy = true
        localPreview = image
        defer { photoBusy = false }
        let ok = await auth.uploadAvatar(image)
        if ok {
            flash("Photo enregistrée")
        } else {
            photoError = auth.authError ?? "Upload impossible."
            localPreview = nil
        }
    }

    private func removePhoto() async {
        photoError = nil
        photoBusy = true
        defer { photoBusy = false }
        let ok = await auth.removeAvatar()
        if ok {
            localPreview = nil
            flash("Photo supprimée")
        } else {
            photoError = auth.authError ?? "Suppression impossible."
        }
    }

    private func flash(_ message: String) {
        toast = message
        Task {
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            if toast == message { toast = nil }
        }
    }

    // MARK: - Format

    private func genderLabel(_ value: String) -> String {
        switch value.uppercased() {
        case "M", "H", "G", "MASCULIN": return "Masculin"
        case "F", "FEMININ", "FÉMININ": return "Féminin"
        default: return value
        }
    }

    private func friendlyDate(_ iso: String) -> String {
        guard let match = iso.range(of: #"^\d{4}-\d{2}-\d{2}"#, options: .regularExpression) else {
            return iso
        }
        let parts = iso[match].split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return iso }
        let months = ["janvier", "février", "mars", "avril", "mai", "juin",
                      "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
        return "\(parts[2]) \(months[parts[1] - 1]) \(parts[0])"
    }

    private func displayEmail(_ email: String?) -> String? {
        guard let email, !email.isEmpty else { return nil }
        if email.lowercased().hasSuffix("@edufaso.local") {
            return String(email.dropLast("@edufaso.local".count))
        }
        return email
    }
}
