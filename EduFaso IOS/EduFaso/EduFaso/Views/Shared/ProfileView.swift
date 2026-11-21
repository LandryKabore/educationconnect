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

    // parent profile (web-style editable form)
    @State private var form = ProfileForm()
    @State private var baseline = ProfileForm()
    @State private var saving = false
    @State private var formError: String?
    @State private var tour = TabTour(key: "profil-parent")
    @State private var coach = CoachMarkRegistry()

    struct ProfileForm: Equatable {
        var firstName = ""
        var lastName = ""
        var phone = ""
        var gender = ""
        /// yyyy-MM-dd (students only, as on the web)
        var dateOfBirth = ""
    }

    @State private var className: String?

    private var isParent: Bool { auth.primaryRole == .parent }
    /// Students get the same page as parents, in "tu", with their class and date of birth (web `formal`).
    private var isStudent: Bool { auth.primaryRole == .student }
    /// Teachers get the parents' page too (web: same Profil page, « Enseignant », Sexe required).
    private var isTeacher: Bool { auth.primaryRole == .teacher }
    /// School admins too (web: same page; shown as « Administration », never by name).
    private var isAdmin: Bool { auth.primaryRole == .schoolAdmin }
    private var usesNewProfile: Bool { isParent || isStudent || isTeacher || isAdmin }
    private func t(_ vous: String, _ tu: String) -> String { isStudent ? tu : vous }

    var body: some View {
        PremiumScreenChrome {
            if usesNewProfile {
                ScrollViewReader { proxy in
                    ScrollView {
                        parentContent
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .padding(.bottom, 28)
                    }
                    .tabTour(tour, registry: coach, scroller: proxy)
                }
                .onAppear {
                    resetForm()
                    tour.autoStartOnce({ parentTourSteps }, registry: coach)
                }
                .onChange(of: auth.profile) { _, _ in
                    if form == baseline { resetForm() } else { baseline = Self.formFrom(auth.profile) }
                }
                .task {
                    guard isStudent, let uid = auth.userId else { return }
                    className = (try? await EduAPI().activeEnrollment(studentId: uid))??.className
                }
            } else {
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
        }
        .environment(coach)
        .premiumTitle("Profil")
        .eduConfirm(isPresented: $confirmRemove, title: "Supprimer la photo ?", message: "Votre photo de profil sera retirée.",
                    confirm: "Supprimer") { Task { await removePhoto() } }
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

// MARK: - Parent profile (like the web « Mon profil »)

extension ProfileView {
    fileprivate static func formFrom(_ p: Profile?) -> ProfileForm {
        ProfileForm(
            firstName: p?.firstName ?? "",
            lastName: p?.lastName ?? "",
            phone: p?.phone ?? "",
            gender: p?.gender ?? "",
            dateOfBirth: String((p?.dateOfBirth ?? "").prefix(10))
        )
    }
}

private extension ProfileView {
    var parentTourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(
                id: "prof.hero", icon: "person.crop.square.fill",
                title: t("Votre profil", "Ton profil"),
                message: t("Votre nom, votre école et votre identifiant de connexion. Touchez la photo pour la changer.", "Ton nom, ta classe, ton école et ton identifiant de connexion. Touche la photo pour la changer.")
            ),
            CoachMarkStep(
                id: "prof.progress", icon: "chart.bar.fill",
                title: "Profil complété",
                message: t("Ce qu’il manque encore à votre profil. Un profil complet permet à l’école de vous joindre facilement.", "Ce qu’il manque encore à ton profil. Ces informations apparaissent sur ton bulletin.")
            ),
            CoachMarkStep(
                id: "prof.form", icon: "square.and.pencil",
                title: t("Vos informations", "Tes informations"),
                message: t("Modifiez votre prénom, votre nom, votre téléphone et votre sexe, puis touchez « Enregistrer ».", "Modifie ton prénom, ton nom, ta date de naissance, ton sexe et ton téléphone, puis touche « Enregistrer ».")
            ),
            CoachMarkStep(
                id: "prof.account", icon: "person.text.rectangle",
                title: "Mon compte",
                message: t("Votre identifiant pour vous connecter et votre école.", "Ton identifiant pour te connecter, ta classe et ton école.")
            ),
            CoachMarkStep(
                id: "prof.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: t("Touchez ce bouton à tout moment pour relancer la visite.", "Touche ce bouton à tout moment pour relancer la visite.")
            ),
        ]
    }

    func resetForm() {
        baseline = Self.formFrom(auth.profile)
        form = baseline
    }

    var schoolName: String { auth.schools.first?.name ?? "—" }
    var identifiant: String { displayEmail(auth.profile?.email) ?? "—" }

    var missing: [String] {
        var out: [String] = []
        if baseline.firstName.trimmingCharacters(in: .whitespaces).isEmpty { out.append("Prénom") }
        if baseline.lastName.trimmingCharacters(in: .whitespaces).isEmpty { out.append("Nom") }
        if isStudent && baseline.dateOfBirth.isEmpty { out.append("Date de naissance") }
        if baseline.phone.trimmingCharacters(in: .whitespaces).isEmpty { out.append("Téléphone") }
        if baseline.gender.trimmingCharacters(in: .whitespaces).isEmpty { out.append("Sexe") }
        if !hasPhoto { out.append("Photo") }
        return out
    }

    var percent: Int {
        let total = isStudent ? 6.0 : 5.0
        return Int(((total - Double(missing.count)) / total * 100).rounded())
    }

    var dirty: Bool { form != baseline }

    var squareCard: some View {
        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
            .fill(.white)
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    var parentContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            parentHero
            if !heroOnDark {
                progressCard
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1))
                    .coachMarkTarget("prof.progress")
            }
            infoCard.coachMarkTarget("prof.form")
            photoCard
            accountCard.coachMarkTarget("prof.account")
            if isStudent { PushPrefsCard() }
            parentSignOut
        }
    }

    // MARK: Hero

    /// Students: plain white header (no teal block); parents keep the teal banner.
    var heroOnDark: Bool { isParent }

    var parentHero: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    UserAvatarView(
                        url: auth.profile?.avatarUrl,
                        firstName: auth.profile?.firstName,
                        lastName: auth.profile?.lastName,
                        size: 84,
                        preview: localPreview,
                        showCameraBadge: true,
                        busy: photoBusy,
                        cornerRadius: EduTheme.radius
                    )
                }
                .buttonStyle(.plain)
                .disabled(photoBusy)
                .accessibilityLabel("Changer la photo de profil")

                VStack(alignment: .leading, spacing: 4) {
                    Text("MON PROFIL")
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(heroOnDark ? .white.opacity(0.7) : EduTheme.muted)
                    Text(isAdmin ? "Administration" : (auth.profile?.fullName.isEmpty == false ? auth.profile!.fullName : "—"))
                        .font(.system(size: 24, weight: .bold))
                        .tracking(-0.3)
                        .foregroundStyle(heroOnDark ? .white : EduTheme.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    Text((isStudent ? ["Élève", className.map { "Classe \($0)" }, schoolName] : [isAdmin ? "Administrateur" : (isTeacher ? "Enseignant" : "Parent"), schoolName]).compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(heroOnDark ? .white.opacity(0.85) : EduTheme.muted)
                        .lineLimit(1)
                    Label(identifiant, systemImage: "at")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(heroOnDark ? .white : EduTheme.teal)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(heroOnDark ? Color.white.opacity(0.12) : EduTheme.brand50, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                        .padding(.top, 4)
                }
                Spacer(minLength: 0)
                TourHelpButton(onDark: heroOnDark) { tour.start(parentTourSteps, registry: coach) }
                    .coachMarkTarget("prof.help")
            }
            .coachMarkTarget("prof.hero")

            if let photoError {
                Text(photoError)
                    .font(.caption)
                    .foregroundStyle(heroOnDark ? .white : EduTheme.fasoRed)
            }

            if heroOnDark { progressCard.coachMarkTarget("prof.progress") }
        }
        .padding(18)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            if heroOnDark {
                LinearGradient(
                    colors: [EduTheme.tealDark, EduTheme.teal, Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            } else {
                squareCard
            }
        }
        .overlay(alignment: .bottom) {
            if heroOnDark {
                HStack(spacing: 0) {
                    EduTheme.fasoRed
                    EduTheme.fasoYellow
                    EduTheme.fasoGreen
                }
                .frame(height: 3)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    var progressCard: some View {
        let complete = percent == 100
        let green = Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("PROFIL COMPLÉTÉ")
                    .font(.caption2.weight(.bold))
                    .tracking(0.6)
                    .foregroundStyle(EduTheme.muted)
                Spacer()
                Text("\(percent) %")
                    .font(.title2.weight(.bold).monospacedDigit())
                    .foregroundStyle(complete ? green : EduTheme.ink)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(EduTheme.border)
                    Rectangle()
                        .fill(complete ? green : EduTheme.teal)
                        .frame(width: geo.size.width * CGFloat(percent) / 100)
                }
            }
            .frame(height: 8)
            .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
            if missing.isEmpty {
                Label("Tout est à jour.", systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(green)
            } else {
                Text("À compléter : \(missing.joined(separator: ", "))")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            }
        }
        .padding(14)
        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    // MARK: Form

    var infoCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Informations personnelles")
                    .font(.headline)
                    .foregroundStyle(EduTheme.ink)
                Text(t("Elles permettent à l’école de vous joindre.", "Elles apparaissent sur ton bulletin et pour l’école."))
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            }
            field("Prénom", required: true, text: $form.firstName, content: .givenName)
            field("Nom", required: true, text: $form.lastName, content: .familyName)
            if isStudent { birthField } else {
                field("Téléphone", required: true, text: $form.phone, content: .telephoneNumber, keyboard: .phonePad)
            }

            VStack(alignment: .leading, spacing: 6) {
                (Text("Sexe").foregroundStyle(EduTheme.ink) + (isStudent || isTeacher ? Text(" *").foregroundStyle(EduTheme.fasoRed) : Text("")))
                    .font(.subheadline.weight(.semibold))
                HStack(spacing: 0) {
                    ForEach([("M", "Masculin"), ("F", "Féminin")], id: \.0) { value, label in
                        let selected = form.gender.uppercased() == value.uppercased()
                        Button {
                            form.gender = value
                        } label: {
                            Text(label)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(selected ? .white : EduTheme.muted)
                                .frame(maxWidth: .infinity, minHeight: 36)
                                .background(
                                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                                        .fill(selected ? EduTheme.teal : Color.clear)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(2)
                .background(
                    RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                        .fill(Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255))
                )
            }

            if isStudent {
                field("Téléphone", required: true, text: $form.phone, content: .telephoneNumber, keyboard: .phonePad)
            }

            if let formError {
                Text(formError).font(.caption).foregroundStyle(EduTheme.fasoRed)
            }

            Divider()

            HStack(spacing: 12) {
                Button {
                    Task { await saveParentProfile() }
                } label: {
                    HStack(spacing: 8) {
                        if saving { ProgressView().tint(.white) }
                        Text(saving ? "Enregistrement…" : "Enregistrer")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(minHeight: 42)
                    .background(
                        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                            .fill(dirty && !saving ? EduTheme.teal : EduTheme.subtle)
                    )
                }
                .buttonStyle(.plain)
                .disabled(!dirty || saving)

                Text(dirty ? "Modifications non enregistrées" : "Aucune modification")
                    .font(.caption)
                    .foregroundStyle(dirty ? Color(red: 180 / 255, green: 83 / 255, blue: 9 / 255) : EduTheme.muted)
                Spacer(minLength: 0)
            }
        }
        .padding(16)
        .background(squareCard)
    }

    /// Date of birth (student): French date picker; empty until chosen.
    var birthField: some View {
        let iso = DateFormatter()
        iso.locale = Locale(identifier: "en_US_POSIX")
        iso.dateFormat = "yyyy-MM-dd"
        let cal = Calendar(identifier: .gregorian)
        let now = Date()
        let minDate = cal.date(byAdding: .year, value: -100, to: now) ?? now
        let binding = Binding<Date>(
            get: { iso.date(from: form.dateOfBirth) ?? (cal.date(byAdding: .year, value: -12, to: now) ?? now) },
            set: { form.dateOfBirth = iso.string(from: $0) }
        )
        return VStack(alignment: .leading, spacing: 6) {
            (Text("Date de naissance").foregroundStyle(EduTheme.ink) + Text(" *").foregroundStyle(EduTheme.fasoRed))
                .font(.subheadline.weight(.semibold))
            HStack {
                if form.dateOfBirth.isEmpty {
                    Button {
                        form.dateOfBirth = iso.string(from: binding.wrappedValue)
                    } label: {
                        Text("Choisir une date")
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                } else {
                    DatePicker("Date de naissance", selection: binding, in: minDate...now, displayedComponents: .date)
                        .labelsHidden()
                        .environment(\.locale, Locale(identifier: "fr_FR"))
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 42)
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                    .overlay(
                        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                            .stroke(EduTheme.borderStrong, lineWidth: 1)
                    )
            )
        }
    }

    func field(
        _ label: String,
        required: Bool,
        text: Binding<String>,
        content: UITextContentType,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            (Text(label).foregroundStyle(EduTheme.ink) + (required ? Text(" *").foregroundStyle(EduTheme.fasoRed) : Text("")))
                .font(.subheadline.weight(.semibold))
            TextField(label, text: text)
                .textContentType(content)
                .keyboardType(keyboard)
                .padding(.horizontal, 12)
                .frame(minHeight: 42)
                .background(
                    RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                        .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                        .overlay(
                            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                                .stroke(EduTheme.borderStrong, lineWidth: 1)
                        )
                )
        }
    }

    func saveParentProfile() async {
        formError = nil
        let trimmed = ProfileForm(
            firstName: form.firstName.trimmingCharacters(in: .whitespacesAndNewlines),
            lastName: form.lastName.trimmingCharacters(in: .whitespacesAndNewlines),
            phone: form.phone.trimmingCharacters(in: .whitespacesAndNewlines),
            gender: form.gender,
            dateOfBirth: form.dateOfBirth
        )
        var required = [("Prénom", trimmed.firstName), ("Nom", trimmed.lastName)]
        if isStudent { required += [("Date de naissance", trimmed.dateOfBirth), ("Sexe", trimmed.gender)] }
        if isTeacher { required.append(("Sexe", trimmed.gender)) }
        required.append(("Téléphone", trimmed.phone))
        for (label, value) in required where value.isEmpty {
            formError = "Le champ « \(label) » est obligatoire."
            return
        }
        var updates = ["first_name": trimmed.firstName, "last_name": trimmed.lastName, "phone": trimmed.phone]
        if !trimmed.gender.isEmpty { updates["gender"] = trimmed.gender }
        if isStudent && !trimmed.dateOfBirth.isEmpty { updates["date_of_birth"] = trimmed.dateOfBirth }
        saving = true
        let ok = await auth.saveProfile(updates)
        saving = false
        if ok {
            resetForm()
            flash("Profil enregistré")
        } else {
            formError = auth.authError ?? "Enregistrement impossible."
        }
    }

    // MARK: Photo & account

    var photoCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Photo de profil")
                    .font(.headline)
                    .foregroundStyle(EduTheme.ink)
                Text(isTeacher ? "Visible par vos élèves, leurs parents et l’école." : (isStudent ? "Visible par tes professeurs et l’école." : "Visible par l’école et les professeurs."))
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            }
            HStack(spacing: 10) {
                PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                    Label(hasPhoto ? "Changer la photo" : "Ajouter une photo", systemImage: "photo.on.rectangle.angled")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .disabled(photoBusy)
                if hasPhoto {
                    Button {
                        confirmRemove = true
                    } label: {
                        Label("Retirer", systemImage: "trash")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.fasoRed)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 42)
                            .background(
                                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                                    .stroke(EduTheme.fasoRed.opacity(0.35), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(photoBusy)
                }
            }
        }
        .padding(16)
        .background(squareCard)
    }

    var accountCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Mon compte")
                .font(.headline)
                .foregroundStyle(EduTheme.ink)
                .padding(.bottom, 6)
            accountRow("at", "Identifiant", identifiant)
            if isStudent {
                Divider()
                accountRow("graduationcap", "Classe", className ?? "—")
            }
            Divider()
            accountRow("building.2", "École", schoolName)
        }
        .padding(16)
        .background(squareCard)
    }

    func accountRow(_ icon: String, _ label: String, _ value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(EduTheme.subtle)
                .frame(width: 18)
            Text(label)
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
                .frame(width: 90, alignment: .leading)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(EduTheme.ink)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
    }

    var parentSignOut: some View {
        Button {
            Task { await auth.signOut() }
        } label: {
            HStack(spacing: 8) {
                if auth.busy && !photoBusy && !saving { ProgressView() }
                Image(systemName: "rectangle.portrait.and.arrow.right")
                Text("Se déconnecter").fontWeight(.semibold)
            }
            .font(.subheadline)
            .foregroundStyle(EduTheme.fasoRed)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                            .stroke(EduTheme.fasoRed.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .disabled(auth.busy)
    }
}
