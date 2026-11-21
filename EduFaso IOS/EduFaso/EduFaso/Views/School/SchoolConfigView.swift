import SwiftUI
import Supabase

/// School admin « Configuration de l’école », like the web ConfigurationEcole: the ten setup steps
/// in order (two optional), the required progress, and a button to continue with the next step.
struct SchoolConfigView: View {
    var open: (AppScreen) -> Void
    @EnvironmentObject private var auth: AuthViewModel

    @State private var counts: Counts?
    @State private var ready = false

    @State private var tour = TabTour(key: "configuration-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct Counts {
        var profileComplete = false
        var years = 0
        var currentYear = false
        var subjects = 0
        var classes = 0
        var classesWithProgramme = 0
        var teachers = 0
        var assignments = 0
        var students = 0
        var enrollments = 0
        var parents = 0
        var timetableSlots = 0
    }

    enum Status { case done, todo, optional }

    struct Step: Identifiable {
        let id: String
        let order: Int
        let title: String
        let description: String
        let screen: AppScreen
        var optional = false
    }

    /// Same steps, texts and order as the web `SCHOOL_SETUP_STEPS`.
    static let steps: [Step] = [
        Step(id: "profil", order: 1, title: "Profil de l’école", description: "Vérifiez le nom, l’adresse, le téléphone et le type d’établissement.", screen: .schoolSettings),
        Step(id: "annee", order: 2, title: "Année scolaire", description: "Créez l’année en cours et marquez-la comme courante.", screen: .years),
        Step(id: "matieres", order: 3, title: "Matières", description: "Cochez les matières du catalogue de l’école.", screen: .subjects),
        Step(id: "classes", order: 4, title: "Classes", description: "Cochez les classes de l’année scolaire.", screen: .classes),
        Step(id: "programmes", order: 5, title: "Programme par classe", description: "Appliquez les matières à une ou plusieurs classes (coefs ajustables ensuite).", screen: .programmes),
        Step(id: "enseignants", order: 6, title: "Enseignants", description: "Créez les comptes enseignants et communiquez leurs identifiants.", screen: .teachers),
        Step(id: "affectations", order: 7, title: "Affectations", description: "Associez chaque enseignant à une classe et une matière.", screen: .teachers),
        Step(id: "eleves", order: 8, title: "Élèves", description: "Inscrivez les élèves et rattachez-les à leur classe.", screen: .students),
        Step(id: "parents", order: 9, title: "Parents", description: "Créez les comptes parents et liez-les à leurs enfants.", screen: .parents, optional: true),
        Step(id: "emploi", order: 10, title: "Emploi du temps", description: "Planifiez les créneaux (jour, horaire, salle).", screen: .schoolTimetable, optional: true),
    ]

    static func status(_ id: String, _ c: Counts) -> Status {
        switch id {
        case "profil": return c.profileComplete ? .done : .todo
        case "annee": return c.years > 0 && c.currentYear ? .done : .todo
        case "matieres": return c.subjects > 0 ? .done : .todo
        case "classes": return c.classes > 0 ? .done : .todo
        case "programmes": return c.classes > 0 && c.classesWithProgramme >= c.classes ? .done : .todo
        case "enseignants": return c.teachers > 0 ? .done : .todo
        case "affectations": return c.assignments > 0 ? .done : .todo
        case "eleves": return c.students > 0 && c.enrollments > 0 ? .done : .todo
        case "parents": return c.parents > 0 ? .done : .optional
        case "emploi": return c.timetableSlots > 0 ? .done : .optional
        default: return .todo
        }
    }

    private var required: [Step] { Self.steps.filter { !$0.optional } }
    private var doneRequired: Int { counts.map { c in required.filter { Self.status($0.id, c) == .done }.count } ?? 0 }
    private var percent: Int { required.isEmpty ? 0 : Int((Double(doneRequired) / Double(required.count) * 100).rounded()) }
    private var complete: Bool { doneRequired == required.count }
    private var nextStep: Step? { counts.flatMap { c in Self.steps.first { Self.status($0.id, c) == .todo } } }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "config.progress", icon: "chart.bar.fill", title: "Progression",
                          message: "Les étapes obligatoires déjà faites. « Continuer » ouvre la prochaine étape à faire."),
            CoachMarkStep(id: "config.steps", icon: "list.number", title: "Les étapes",
                          message: "À suivre dans l’ordre pour préparer l’année. Touchez une étape pour l’ouvrir ; elle passe à « Fait » toute seule."),
            CoachMarkStep(id: "config.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 16) {
                        banner
                        if counts == nil {
                            Text("Aucune école associée à votre compte.")
                                .font(.subheadline).foregroundStyle(EduTheme.muted)
                                .frame(maxWidth: .infinity).padding(24).modifier(HomeCardStyle())
                        } else {
                            progressCard.coachMarkTarget("config.progress")
                            if complete { doneCard }
                            stepsList.coachMarkTarget("config.steps")
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await load() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Configuration")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Configuration de l’école")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                    Text("Suivez ces étapes dans l’ordre pour préparer l’année scolaire.")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                    .coachMarkTarget("config.help")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }
                .frame(height: 4)
                .accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var progressCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Progression obligatoire").font(.subheadline.weight(.medium)).foregroundStyle(EduTheme.muted)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(doneRequired) / \(required.count)").font(.title.weight(.bold).monospacedDigit()).foregroundStyle(EduTheme.ink)
                Text("(\(percent) %)").font(.subheadline).foregroundStyle(EduTheme.muted)
                Spacer()
                if complete {
                    Text("École prête")
                        .font(.caption.weight(.bold)).foregroundStyle(H.emerald)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(H.emerald50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(H.slate100)
                    Capsule().fill(H.brand600).frame(width: geo.size.width * CGFloat(percent) / 100)
                }
            }
            .frame(height: 8)
            if !complete, let next = nextStep {
                Button { open(next.screen) } label: {
                    Label("Continuer : \(next.title)", systemImage: "chevron.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private var doneCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Configuration de base terminée", systemImage: "sparkles")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(H.brand800)
            Text("Vous pouvez encore compléter les parents et l’emploi du temps, puis gérer les bulletins et les messages au quotidien.")
                .font(.subheadline).foregroundStyle(H.brand800.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                outline("Bulletins") { open(.bulletins) }
                outline("Messages") { open(.messages) }
                Button { open(.dashboard) } label: {
                    Text("Retour à mon école")
                        .font(.caption.weight(.semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 10).frame(minHeight: 34)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.teal.opacity(0.3), lineWidth: 1))
    }

    private func outline(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                .padding(.horizontal, 10).frame(minHeight: 34)
                .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var stepsList: some View {
        VStack(spacing: 10) {
            ForEach(Self.steps) { step in
                let status = counts.map { Self.status(step.id, $0) } ?? .todo
                Button { open(step.screen) } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: status == .done ? "checkmark" : "circle")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(status == .done ? .white : EduTheme.muted)
                            .frame(width: 30, height: 30)
                            .background(status == .done ? H.emerald : H.slate100, in: Circle())
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Text("Étape \(step.order)").font(.caption.weight(.medium)).foregroundStyle(EduTheme.subtle)
                                badge(status)
                            }
                            Text(step.title).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                            Text(step.description).font(.caption).foregroundStyle(EduTheme.muted)
                                .fixedSize(horizontal: false, vertical: true)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle).padding(.top, 8)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(status == .done ? H.emerald50.opacity(0.6) : .white,
                                in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                        .stroke(status == .done ? H.emerald.opacity(0.3) : EduTheme.border, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func badge(_ status: Status) -> some View {
        switch status {
        case .done: tag("Fait", fg: H.emerald, bg: H.emerald50)
        case .optional: tag("Optionnel", fg: EduTheme.muted, bg: H.slate100)
        case .todo: tag("À faire", fg: H.amber, bg: H.amber50)
        }
    }

    private func tag(_ text: String, fg: Color, bg: Color) -> some View {
        Text(text).font(.system(size: 11, weight: .bold)).foregroundStyle(fg)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(bg, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { counts = nil; ready = true; return }
        let api = EduAPI()
        async let school = api.fetchSchool(id: schoolId)
        async let years = api.fetchYears(schoolId: schoolId)
        async let subjects = api.countExact(table: "matieres", schoolId: schoolId)
        async let classes = api.countExact(table: "classes", schoolId: schoolId)
        async let teachers = api.countActiveRole(schoolId: schoolId, role: "teacher")
        async let students = api.countActiveRole(schoolId: schoolId, role: "student")
        async let parents = api.countActiveRole(schoolId: schoolId, role: "parent")
        async let setup = api.setupCounts(schoolId: schoolId)
        var c = Counts()
        if let s = try? await school {
            let fields = [s.name, s.code, s.schoolType, s.region, s.city, s.address, s.phone, s.email]
            c.profileComplete = fields.allSatisfy { !($0 ?? "").trimmingCharacters(in: .whitespaces).isEmpty }
        }
        let yrs = (try? await years) ?? []
        c.years = yrs.count
        c.currentYear = yrs.contains { $0.isCurrent }
        c.subjects = (try? await subjects) ?? 0
        c.classes = (try? await classes) ?? 0
        c.teachers = (try? await teachers) ?? 0
        c.students = (try? await students) ?? 0
        c.parents = (try? await parents) ?? 0
        if let s = try? await setup {
            c.classesWithProgramme = s.classesWithProgramme ?? 0
            c.enrollments = s.enrollments ?? 0
            c.assignments = s.assignments ?? 0
            c.timetableSlots = s.timetableSlots ?? 0
        }
        counts = c
        ready = true
    }
}

extension EduAPI {
    func countActiveRole(schoolId: String, role: String) async throws -> Int {
        try await client.from("roles_utilisateurs").select("id", head: true, count: .exact)
            .eq("school_id", value: schoolId).eq("role", value: role).eq("active", value: true)
            .execute().count ?? 0
    }
}
