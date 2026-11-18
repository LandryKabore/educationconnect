import SwiftUI

/// School admin « Paramètres de l’école », like the web ParametresEcole: identity, location and
/// contact (all shown on bulletins), with what is still missing, and the subscription.
struct SchoolSettingsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var school: School?
    @State private var name = ""
    @State private var code = ""
    @State private var schoolType = "primaire"
    @State private var region = ""
    @State private var city = ""
    @State private var address = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var saving = false
    @State private var message: String?
    @State private var error: String?
    @State private var ready = false

    @State private var tour = TabTour(key: "parametres-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    static let types: [(String, String)] = [("primaire", "Primaire"), ("secondaire", "Secondaire"), ("mixte", "Primaire + Secondaire"), ("technique", "Technique / Professionnel"), ("autre", "Autre")]
    static let billing: [String: String] = ["trial": "Période d’essai", "trialing": "Période d’essai", "active": "Actif", "past_due": "Paiement en retard", "canceled": "Annulé", "cancelled": "Annulé", "suspended": "Suspendu"]

    private func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespaces) }
    private func missing(_ fields: [String]) -> Int { fields.filter { trimmed($0).isEmpty }.count }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "pr.identity", icon: "building.2", title: "Identité",
                          message: "Le nom, le code et le type d’établissement figurent sur chaque bulletin."),
            CoachMarkStep(id: "pr.save", icon: "checkmark.circle", title: "Enregistrer",
                          message: "Tous les champs marqués * sont nécessaires pour que l’étape « Profil de l’école » soit faite."),
            CoachMarkStep(id: "pr.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        section("Identité", icon: "building.2", hint: "Le nom et le code figurent sur chaque bulletin.", missing: missing([name, code])) {
                            field("Nom de l’établissement", "ex. Lycée Privé Saint-Joseph", $name)
                            field("Code école", "ex. LP-SJ-OUA", $code)
                            HStack {
                                (Text("Type d’établissement") + Text(" *").foregroundColor(EduTheme.fasoRed)).font(.subheadline.weight(.semibold))
                                Spacer()
                                Picker("Type", selection: $schoolType) { ForEach(Self.types, id: \.0) { Text($0.1).tag($0.0) } }.labelsHidden().tint(EduTheme.teal)
                            }
                        }
                        .coachMarkTarget("pr.identity")
                        section("Localisation", icon: "mappin.and.ellipse", hint: "Où se trouve l’établissement.", missing: missing([region, city, address])) {
                            field("Région / province", "ex. Centre", $region)
                            field("Ville / commune", "ex. Ouagadougou", $city)
                            field("Adresse complète", "Quartier, rue, repère…", $address)
                        }
                        section("Contact", icon: "phone", hint: "Pour que les familles puissent joindre l’école.", missing: missing([phone, email])) {
                            field("Téléphone", "ex. +226 70 00 00 00", $phone, keyboard: .phonePad)
                            field("E-mail de contact", "ex. contact@ecole.bf", $email, keyboard: .emailAddress)
                        }
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        if let message { Text(message).font(.subheadline).foregroundStyle(H.emerald) }
                        Button { Task { await save() } } label: {
                            HStack(spacing: 8) {
                                if saving { ProgressView().tint(.white) }
                                Text(saving ? "Enregistrement…" : "Enregistrer")
                            }
                            .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(saving || trimmed(name).isEmpty)
                        .coachMarkTarget("pr.save")
                        if let s = school, s.plan != nil || s.billingStatus != nil { subscription(s) }
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Paramètres école")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Paramètres de l’école").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                        Text("Ces informations apparaissent sur les bulletins et les documents de l’établissement.")
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("pr.help")
                }
                HStack(spacing: 8) {
                    stat("Code école", school?.code?.isEmpty == false ? school!.code! : "—", nil)
                    stat("Type", Self.types.first { $0.0 == school?.schoolType }?.1 ?? "—", nil)
                    stat("Localité", school?.city?.isEmpty == false ? school!.city! : "—", school?.region)
                }
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, _ hint: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.6).foregroundStyle(.white.opacity(0.7))
            Text(value).font(.subheadline.weight(.bold)).foregroundStyle(.white).lineLimit(2).minimumScaleFactor(0.8)
            if let hint { Text(hint).font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    private func section<Content: View>(_ title: String, icon: String, hint: String, missing: Int, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                    .frame(width: 36, height: 36).background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(EduTheme.ink)
                    Text(hint).font(.caption).foregroundStyle(EduTheme.muted)
                }
                Spacer()
                Text(missing == 0 ? "Complet" : "\(missing) à remplir")
                    .font(.caption.weight(.bold)).foregroundStyle(missing == 0 ? H.emerald : H.amber)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(missing == 0 ? H.emerald50 : H.amber50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            content()
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func field(_ label: String, _ placeholder: String, _ text: Binding<String>, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            (Text(label) + Text(" *").foregroundColor(EduTheme.fasoRed)).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
            TextField(placeholder, text: text)
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .emailAddress ? .never : .sentences)
                .font(.subheadline)
                .padding(.horizontal, 12).frame(minHeight: 42)
                .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(trimmed(text.wrappedValue).isEmpty ? H.amberDot.opacity(0.6) : EduTheme.border, lineWidth: 1))
        }
    }

    private func subscription(_ s: School) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Abonnement", systemImage: "creditcard").font(.headline).foregroundStyle(EduTheme.ink)
            HStack { Text("Plan").foregroundStyle(EduTheme.muted); Spacer(); Text((s.plan ?? "—").capitalized).foregroundStyle(EduTheme.ink).fontWeight(.semibold) }
            HStack { Text("Statut").foregroundStyle(EduTheme.muted); Spacer(); Text(Self.billing[s.billingStatus ?? ""] ?? (s.billingStatus ?? "—").capitalized).foregroundStyle(EduTheme.ink).fontWeight(.semibold) }
            Text("L’abonnement est géré par EduFaso. Contactez le support pour toute modification.").font(.caption).foregroundStyle(EduTheme.muted)
        }
        .font(.subheadline)
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func load() async {
        guard let sid = auth.schoolId, let s = try? await EduAPI().fetchSchool(id: sid) else { ready = true; return }
        school = s
        name = s.name
        code = s.code ?? ""
        schoolType = s.schoolType?.isEmpty == false ? s.schoolType! : "primaire"
        region = s.region ?? ""
        city = s.city ?? ""
        address = s.address ?? ""
        phone = s.phone ?? ""
        email = s.email ?? ""
        ready = true
    }

    private func save() async {
        guard let school else { return }
        saving = true
        message = nil
        error = nil
        defer { saving = false }
        do {
            try await EduAPI().saveSchool(school, fields: SchoolFields(
                name: trimmed(name), code: trimmed(code), school_type: schoolType, region: trimmed(region), city: trimmed(city),
                address: trimmed(address), phone: trimmed(phone), email: trimmed(email).lowercased()))
            if let uid = auth.userId { await auth.loadUserData(userId: uid) }
            message = "Profil de l’école mis à jour."
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}
