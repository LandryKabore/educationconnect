import SwiftUI
import Supabase

/// School admin « Mon école », like the web EcoleOverview: greeting banner with the school's
/// figures and what needs handling, today's attendance, exams to confirm and coming, students
/// without a class, timetable coverage, and the latest announcements and messages.
struct SchoolHomeView: View {
    var open: (AppScreen) -> Void
    @EnvironmentObject private var auth: AuthViewModel

    @State private var data = SchoolHome()
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "mon-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)
    private let rose100 = Color(red: 255 / 255, green: 228 / 255, blue: 230 / 255)
    private let sky = Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)
    private let sky100 = Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255)

    struct SchoolHome {
        var classes = 0
        var students = 0
        var departed = 0
        var teachers = 0
        var subjects = 0
        var yearLabel: String?
        var stats: EduAPI.SchoolHomeFull?
        var withoutClass = 0
        var pendingExamCount = 0
        var presenceAlerts: [EduAPI.PresenceAlert] = []
        var pendingExams: [EvaluationRow] = []
        var upcomingExams: [EvaluationRow] = []
        var announcements: [MessageRow] = []
        var messages: [MessageRow] = []
        var unreadMessages = 0
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ecole.stats", icon: "chart.bar.fill", title: "Votre école",
                          message: "Les classes, les élèves inscrits et les enseignants. Touchez un chiffre pour ouvrir la liste."),
            CoachMarkStep(id: "ecole.todo", icon: "checkmark.circle.fill", title: "À traiter",
                          message: "Ce qui attend une action : examens à confirmer, élèves sans classe, classes sans emploi du temps."),
            CoachMarkStep(id: "ecole.presences", icon: "checklist", title: "Présences du jour",
                          message: "Les absences, retards et justifiés saisis aujourd’hui par les enseignants."),
            CoachMarkStep(id: "ecole.exams", icon: "doc.text", title: "Examens",
                          message: "Les examens proposés par les enseignants à confirmer, et ceux qui arrivent."),
            CoachMarkStep(id: "ecole.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    private var todo: [(key: String, text: String, screen: AppScreen)] {
        var out: [(String, String, AppScreen)] = []
        let p = data.pendingExamCount
        if p > 0 { out.append(("exams", "\(p) examen\(p > 1 ? "s" : "") à confirmer", .schoolHomework)) }
        let w = data.withoutClass
        if w > 0 { out.append(("sans-classe", "\(w) élève\(w > 1 ? "s" : "") sans classe", .students)) }
        let e = data.stats?.classesWithoutEdt.count ?? 0
        if e > 0 { out.append(("edt", "\(e) classe\(e > 1 ? "s" : "") sans emploi du temps", .schoolTimetable)) }
        return out.map { (key: $0.0, text: $0.1, screen: $0.2) }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 16) {
                        banner
                        if let error {
                            Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed)
                        }
                        presencesPanel.coachMarkTarget("ecole.presences")
                        examsPanel.coachMarkTarget("ecole.exams")
                        withoutClassPanel
                        timetablePanel
                        communicationPanel
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
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    // MARK: - Banner

    private var banner: some View {
        let active = max(0, data.students - data.departed)
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text([Self.greeting(), data.yearLabel.map { "Année \($0)" }].compactMap { $0 }.joined(separator: " · ").uppercased())
                            .font(.system(size: 11, weight: .semibold)).tracking(1.2)
                            .foregroundStyle(.white.opacity(0.7))
                        Text(auth.schools.first?.name ?? "Mon école")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                        Text([auth.profile?.fullName, "Administrateur"].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") + " 👋")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("ecole.help")
                }
                HStack(spacing: 8) {
                    stat("Classes", "\(data.classes)", "sections actives") { open(.classes) }
                    stat("Élèves", "\(active)", data.departed > 0 ? "\(data.departed) sorti\(data.departed > 1 ? "s" : "") cette année" : "inscrits") { open(.students) }
                    stat("Enseignants", "\(data.teachers)", "\(data.subjects) matière\(data.subjects > 1 ? "s" : "")") { open(.teachers) }
                }
                .coachMarkTarget("ecole.stats")
                todoCard.coachMarkTarget("ecole.todo")
                Button { open(.schoolSettings) } label: {
                    Label("Paramètres de l’école", systemImage: "gearshape")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 34)
                        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.2), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }
                .frame(height: 4)
                .accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, _ hint: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .semibold)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1).minimumScaleFactor(0.8)
                Text(value)
                    .font(.title2.weight(.bold).monospacedDigit())
                    .foregroundStyle(.white)
                Text(hint)
                    .font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var todoCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("À TRAITER", systemImage: "checkmark.circle")
                    .font(.system(size: 11, weight: .bold)).tracking(0.6)
                    .foregroundStyle(sky)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(sky100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                Spacer()
                Text(todo.isEmpty ? "Tout est à jour" : "\(todo.count) point\(todo.count > 1 ? "s" : "")")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(todo.isEmpty ? H.emerald : rose)
            }
            if todo.isEmpty {
                Text("Rien en attente aujourd’hui.")
                    .font(.headline).foregroundStyle(EduTheme.ink)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(todo.enumerated()), id: \.element.key) { i, t in
                        if i > 0 { Divider() }
                        Button { open(t.screen) } label: {
                            HStack {
                                Text(t.text).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                                Spacer()
                                Text("Voir")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            }
                            .padding(.vertical, 9)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    // MARK: - Panels

    private func panel<Content: View>(icon: String, title: String, subtitle: String,
                                      @ViewBuilder content: () -> Content,
                                      @ViewBuilder footer: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.teal)
                    .frame(width: 36, height: 36)
                    .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(EduTheme.ink)
                    Text(subtitle).font(.caption).foregroundStyle(EduTheme.muted)
                }
                Spacer(minLength: 0)
            }
            content()
            footer()
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func primaryButton(_ title: String, badge: Int = 0, badgeColor: Color? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(title)
                if badge > 0 {
                    Text("\(badge)")
                        .font(.caption2.weight(.bold).monospacedDigit())
                        .foregroundStyle(badgeColor ?? H.amber)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.white, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func empty(_ text: String) -> some View {
        Text(text).font(.subheadline).foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func chip(_ text: String, fg: Color, bg: Color) -> some View {
        Text(text).font(.caption.weight(.semibold)).foregroundStyle(fg)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func sectionLabel(_ text: String, color: Color = EduTheme.muted) -> some View {
        Text(text.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(0.6).foregroundStyle(color)
    }

    private var presencesPanel: some View {
        let s = data.stats
        let total = (s?.absent ?? 0) + (s?.late ?? 0) + (s?.excused ?? 0)
        return panel(icon: "checkmark.circle", title: "Présences du jour",
                     subtitle: TeacherAppelView.dayLabel(EduDates.day())) {
            if total == 0 {
                empty("Aucune absence ni retard saisi aujourd’hui.")
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        if let a = s?.absent, a > 0 { chip("\(a) absent\(a > 1 ? "s" : "")", fg: rose, bg: rose100) }
                        if let l = s?.late, l > 0 { chip("\(l) retard\(l > 1 ? "s" : "")", fg: H.amber, bg: H.amber50) }
                        if let e = s?.excused, e > 0 { chip("\(e) justifié\(e > 1 ? "s" : "")", fg: sky, bg: sky100) }
                    }
                    ForEach(data.presenceAlerts) { p in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.studentName).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).lineLimit(1)
                                Text([p.className, p.subjectName].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(EduTheme.muted)
                            }
                            Spacer()
                            switch p.status {
                            case "absent": chip("Absent", fg: rose, bg: rose100)
                            case "late": chip("Retard", fg: H.amber, bg: H.amber50)
                            default: chip("Justifié", fg: sky, bg: sky100)
                            }
                        }
                        .padding(10)
                        .background(H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
            }
        } footer: {
            primaryButton("Voir les présences") { open(.schoolAttendance) }
        }
    }

    private func examLine(_ e: EvaluationRow, longDate: Bool) -> String {
        let date = e.evalDate.flatMap { EduDates.parseDay(String($0.prefix(10))) }
            .map { TeacherExercisesView.format($0, longDate ? "EEEE d MMMM" : "d MMM") }
        let slot = e.startTime.map { s in e.endTime.map { "\(s.prefix(5)) – \($0.prefix(5))" } ?? String(s.prefix(5)) }
        return [e.classes?.name, e.matieres?.name, date, slot].compactMap { $0 }.joined(separator: " · ")
    }

    private var examsPanel: some View {
        panel(icon: "doc.text", title: "Examens", subtitle: "À confirmer et prochainement") {
            if data.pendingExams.isEmpty && data.upcomingExams.isEmpty {
                empty("Aucun examen en attente ni à venir.")
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    if !data.pendingExams.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            sectionLabel("À confirmer", color: H.amber)
                            ForEach(data.pendingExams) { e in examRow(e, bg: H.amber50, long: false) }
                        }
                    }
                    if !data.upcomingExams.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            sectionLabel("Confirmés à venir")
                            ForEach(data.upcomingExams) { e in examRow(e, bg: sky100.opacity(0.6), long: true) }
                        }
                    }
                }
            }
        } footer: {
            primaryButton("Gérer les examens", badge: data.pendingExamCount) { open(.schoolHomework) }
        }
    }

    private func examRow(_ e: EvaluationRow, bg: Color, long: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(e.title ?? "Examen").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).lineLimit(1)
            Text(examLine(e, longDate: long)).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var withoutClassPanel: some View {
        let sample = data.stats?.studentsWithoutClass?.sample ?? []
        return panel(icon: "graduationcap", title: "Élèves sans classe", subtitle: "À affecter à une section") {
            if sample.isEmpty && data.withoutClass == 0 {
                empty("Tous les élèves sont affectés à une classe.")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(sample) { s in
                        HStack {
                            Text(s.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).lineLimit(1)
                            Spacer()
                            Text("Sans classe").font(.caption.weight(.medium)).foregroundStyle(H.amber)
                        }
                        .padding(10)
                        .background(H.amber50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                    if data.withoutClass > sample.count {
                        let n = data.withoutClass - sample.count
                        Text("+\(n) autre\(n > 1 ? "s" : "")").font(.caption).foregroundStyle(EduTheme.muted)
                    }
                }
            }
        } footer: {
            primaryButton("Gérer les élèves", badge: data.withoutClass) { open(.students) }
        }
    }

    private var timetablePanel: some View {
        let s = data.stats
        return panel(icon: "calendar", title: "Emplois du temps", subtitle: "Couverture des classes") {
            if data.classes == 0 {
                empty("Aucune classe à planifier.")
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        coverageTile("Avec emploi du temps", value: "\(s?.classesWithEdt ?? 0)", suffix: "/\(data.classes)", color: EduTheme.teal)
                        coverageTile("Créneaux aujourd’hui", value: "\(s?.todaySlotCount ?? 0)", suffix: nil, color: sky)
                    }
                    if let missing = s?.classesWithoutEdt, !missing.isEmpty {
                        sectionLabel("Sans emploi du temps", color: H.amber)
                        ForEach(missing) { c in
                            Text(c.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(H.amber50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        }
                    } else {
                        Text("Toutes les classes ont un emploi du temps.").font(.subheadline).foregroundStyle(H.emerald)
                    }
                }
            }
        } footer: {
            primaryButton("Voir les emplois du temps") { open(.schoolTimetable) }
        }
    }

    private func coverageTile(_ label: String, value: String, suffix: String?, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.4)
                .foregroundStyle(EduTheme.muted).multilineTextAlignment(.center).lineLimit(2)
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text(value).font(.title3.weight(.bold).monospacedDigit()).foregroundStyle(color)
                if let suffix { Text(suffix).font(.subheadline).foregroundStyle(EduTheme.subtle) }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var communicationPanel: some View {
        panel(icon: "bell", title: "Annonces & messages", subtitle: "Communications de l’école") {
            if data.announcements.isEmpty && data.messages.isEmpty {
                empty("Aucune communication récente.")
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        sectionLabel("Annonces")
                        if data.announcements.isEmpty {
                            Text("Aucune annonce.").font(.subheadline).foregroundStyle(EduTheme.muted)
                        }
                        ForEach(data.announcements) { m in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(alignment: .top) {
                                    Text(m.subject?.isEmpty == false ? m.subject! : "Annonce")
                                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                                    Spacer()
                                    if let d = m.createdAt { Text(MessageDateFormatting.listTime(d)).font(.caption2).foregroundStyle(EduTheme.subtle) }
                                }
                                Text(m.body ?? "").font(.caption).foregroundStyle(EduTheme.muted).lineLimit(2)
                            }
                            .padding(10)
                            .background(H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        sectionLabel("Messages récents")
                        if data.messages.isEmpty {
                            Text("Aucun message.").font(.subheadline).foregroundStyle(EduTheme.muted)
                        }
                        ForEach(data.messages) { m in
                            let unread = m.readAt == nil
                            Button { open(.messages) } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(alignment: .top) {
                                        Text(m.sender?.fullName.isEmpty == false ? m.sender!.fullName : "Expéditeur")
                                            .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                                        if unread { Circle().fill(EduTheme.teal).frame(width: 7, height: 7) }
                                        Spacer()
                                        if let d = m.createdAt { Text(MessageDateFormatting.listTime(d)).font(.caption2).foregroundStyle(EduTheme.subtle) }
                                    }
                                    if let s = m.subject, !s.isEmpty {
                                        Text(s).font(.subheadline).foregroundStyle(EduTheme.ink.opacity(0.8)).lineLimit(1)
                                    }
                                    Text(m.body ?? "").font(.caption).foregroundStyle(EduTheme.muted).lineLimit(1)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(unread ? EduTheme.brand50 : H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        } footer: {
            HStack(spacing: 8) {
                Button { open(.announcements) } label: {
                    Label("Annonces", systemImage: "bell")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
                }
                .buttonStyle(.plain)
                primaryButton("Messages", badge: data.unreadMessages, badgeColor: rose) { open(.messages) }
            }
        }
    }

    // MARK: - Helpers

    static func greeting(_ now: Date = Date()) -> String {
        let h = Calendar.current.component(.hour, from: now)
        return h < 12 ? "Bonjour" : (h < 18 ? "Bon après-midi" : "Bonsoir")
    }

    // MARK: - Loading

    private func load() async {
        guard let schoolId = auth.schoolId else { ready = true; auth.markPortalReady(); return }
        let api = EduAPI()
        var next = SchoolHome()
        async let classes = api.countExact(table: "classes", schoolId: schoolId)
        async let subjects = api.countExact(table: "matieres", schoolId: schoolId)
        async let students = api.countRole(schoolId: schoolId, role: "student")
        async let teachers = api.countRole(schoolId: schoolId, role: "teacher")
        async let departed = api.departuresTotal(schoolId: schoolId)
        async let years = api.fetchYears(schoolId: schoolId)
        async let stats = api.schoolHomeFull(schoolId: schoolId)
        async let missing = api.studentsWithoutClass(schoolId: schoolId)
        async let alerts = api.todayPresenceAlerts(schoolId: schoolId)
        async let pending = api.schoolExams(schoolId: schoolId, confirmed: false)
        async let upcoming = api.schoolExams(schoolId: schoolId, confirmed: true)
        async let pendingCount = api.pendingExamCount(schoolId: schoolId)
        next.classes = (try? await classes) ?? 0
        next.subjects = (try? await subjects) ?? 0
        next.students = (try? await students) ?? 0
        next.teachers = (try? await teachers) ?? 0
        next.departed = (try? await departed) ?? 0
        let yrs = (try? await years) ?? []
        next.yearLabel = yrs.first(where: \.isCurrent)?.label
        do {
            next.stats = try await stats
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        next.withoutClass = (try? await missing) ?? 0
        next.presenceAlerts = (try? await alerts) ?? []
        next.pendingExams = (try? await pending) ?? []
        next.upcomingExams = (try? await upcoming) ?? []
        next.pendingExamCount = (try? await pendingCount) ?? 0
        if let uid = auth.userId, let inbox = try? await api.fetchInbox(userId: uid, kind: .all, limit: 30) {
            next.announcements = Array(inbox.filter { $0.isAnnouncement == true }.prefix(3))
            next.messages = Array(inbox.filter { $0.isAnnouncement != true }.prefix(3))
            next.unreadMessages = inbox.filter { $0.readAt == nil && $0.isAnnouncement != true }.count
        }
        data = next
        ready = true
        auth.markPortalReady()
    }
}

// MARK: - API

extension EduAPI {
    struct NamedRow: Decodable, Identifiable { let id: String; let name: String }
    struct StudentsWithoutClassSample: Decodable { let count: Int?; let sample: [NamedRow]? }

    /// `ef_school_home_stats` with the lists the web uses.
    struct SchoolHomeFull: Decodable {
        let absent: Int?
        let late: Int?
        let excused: Int?
        let classesWithEdt: Int?
        let todaySlotCount: Int?
        let classesWithoutEdt: [NamedRow]
        let studentsWithoutClass: StudentsWithoutClassSample?

        enum CodingKeys: String, CodingKey { case absent, late, excused, classesWithEdt, todaySlotCount, classesWithoutEdt, studentsWithoutClass }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            absent = try? c.decode(Int.self, forKey: .absent)
            late = try? c.decode(Int.self, forKey: .late)
            excused = try? c.decode(Int.self, forKey: .excused)
            classesWithEdt = try? c.decode(Int.self, forKey: .classesWithEdt)
            todaySlotCount = try? c.decode(Int.self, forKey: .todaySlotCount)
            classesWithoutEdt = (try? c.decode([NamedRow].self, forKey: .classesWithoutEdt)) ?? []
            studentsWithoutClass = try? c.decode(StudentsWithoutClassSample.self, forKey: .studentsWithoutClass)
        }
    }

    struct PresenceAlert: Identifiable {
        let id: String
        let status: String
        let studentName: String
        let className: String
        let subjectName: String?
    }

    func schoolHomeFull(schoolId: String) async throws -> SchoolHomeFull {
        try await call("ef_school_home_stats", params: HomeStatsParams(
            p_school: schoolId, p_date: EduDates.day(), p_dow: EduDates.weekday()
        ))
    }

    func countExact(table: String, schoolId: String) async throws -> Int {
        try await client.from(table).select("id", head: true, count: .exact)
            .eq("school_id", value: schoolId).execute().count ?? 0
    }

    func countRole(schoolId: String, role: String) async throws -> Int {
        try await client.from("roles_utilisateurs").select("id", head: true, count: .exact)
            .eq("school_id", value: schoolId).eq("role", value: role).execute().count ?? 0
    }

    func departuresTotal(schoolId: String) async throws -> Int {
        struct Params: Encodable { let p_school: String }
        struct Out: Decodable { let total: Int? }
        let out: Out = try await call("ef_departures_summary", params: Params(p_school: schoolId))
        return out.total ?? 0
    }

    /// First absences / lates / excused of today (the exact totals come from the stats).
    func todayPresenceAlerts(schoolId: String) async throws -> [PresenceAlert] {
        struct P: Decodable { let first_name: String?; let last_name: String? }
        struct Row: Decodable {
            let id: String
            let status: String
            let class_section_id: String
            let matieres: NamedEntity?
            let profils: P?
            let classes: Cls?
            struct Cls: Decodable { let name: String? }
        }
        let rows: [Row] = try await client.from("presences")
            .select("id, status, class_section_id, matieres(name), profils:profils!presences_student_id_fkey(first_name, last_name), classes:classes!presences_class_section_id_fkey!inner(name, school_id)")
            .eq("date", value: EduDates.day())
            .eq("classes.school_id", value: schoolId)
            .in("status", values: ["absent", "late", "excused"])
            .order("status")
            .limit(6)
            .execute()
            .value
        return rows.map {
            PresenceAlert(id: $0.id, status: $0.status,
                          studentName: "\($0.profils?.first_name ?? "") \($0.profils?.last_name ?? "")".trimmingCharacters(in: .whitespaces),
                          className: $0.classes?.name ?? "Classe", subjectName: $0.matieres?.name)
        }
    }

    /// Exams to confirm (confirmed = false) or confirmed and coming (confirmed = true), first 4.
    func schoolExams(schoolId: String, confirmed: Bool) async throws -> [EvaluationRow] {
        var q = client.from("evaluations")
            .select("id, title, eval_date, start_time, end_time, type, period_label, max_score, admin_confirmed, subject_id, class_section_id, teacher_id, description, matieres(name), classes!inner(name, school_id)")
            .eq("type", value: "examen")
            .eq("classes.school_id", value: schoolId)
            .eq("admin_confirmed", value: confirmed)
        if confirmed { q = q.or("eval_date.is.null,eval_date.gte.\(EduDates.day())") }
        return try await q.order("eval_date", ascending: true, nullsFirst: false).limit(4).execute().value
    }

    func pendingExamCount(schoolId: String) async throws -> Int {
        try await client.from("evaluations").select("id, classes!inner(school_id)", head: true, count: .exact)
            .eq("type", value: "examen")
            .eq("admin_confirmed", value: false)
            .eq("classes.school_id", value: schoolId)
            .execute().count ?? 0
    }
}
