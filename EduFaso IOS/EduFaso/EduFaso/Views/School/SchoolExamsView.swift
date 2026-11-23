import SwiftUI
import Supabase

/// School admin « Examens », like the web ExamensEcole: the exams of every class (à venir,
/// passés, en attente, confirmés, tous), confirming the ones proposed by teachers, removing a
/// confirmation, deleting (admin password), and creating an exam that is confirmed at once.
struct SchoolExamsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var exams: [Exam] = []
    @State private var filter: Filter = .upcoming
    @State private var classId = ""
    @State private var ready = false
    @State private var error: String?
    @State private var busyId: String?
    /// examen a tapped notification is about (briefly highlighted)
    @State private var highlighted: Set<String> = []
    @State private var creating = false
    @State private var deleting: Exam?
    @State private var password = ""

    @State private var tour = TabTour(key: "examens-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let sky = Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)
    private let sky100 = Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255)

    enum Filter: String, CaseIterable, Identifiable {
        case upcoming, past, pending, confirmed, all
        var id: String { rawValue }
        var label: String {
            switch self {
            case .upcoming: return "À venir"
            case .past: return "Passés"
            case .pending: return "En attente de confirmation"
            case .confirmed: return "Confirmés (à venir)"
            case .all: return "Tous"
            }
        }
    }

    struct Exam: Decodable, Identifiable, Hashable {
        let id: String
        let title: String?
        let description: String?
        let eval_date: String?
        let start_time: String?
        let end_time: String?
        let period_label: String?
        let admin_confirmed: Bool?
        let class_section_id: String?
        let classes: NamedEntity?
        let matieres: NamedEntity?
        let teacher: PersonName?
        var confirmed: Bool { admin_confirmed == true }

        /// Past once its day is over (or its end time today).
        func isPast(now: Date = Date()) -> Bool {
            guard let d = eval_date?.prefix(10) else { return false }
            let today = EduDates.day(now)
            if String(d) < today { return true }
            if String(d) == today, let end = end_time { return TeacherLessons.minutes(String(end.prefix(5))) <= TeacherLessons.minutes(of: now) }
            return false
        }
    }

    private var shown: [Exam] {
        switch filter {
        case .upcoming, .confirmed: return exams.filter { !$0.isPast() }
        case .past: return exams.filter { $0.isPast() }
        default: return exams
        }
    }
    private var pastCount: Int { exams.filter { $0.isPast() }.count }

    private var groups: [(id: String, name: String, exams: [Exam])] {
        var by: [String: [Exam]] = [:]
        for e in shown { by[e.class_section_id ?? "_", default: []].append(e) }
        func key(_ e: Exam) -> String { "\(e.eval_date ?? "9999-99-99")T\((e.start_time ?? "99:99").prefix(5))" }
        let order = classes.map(\.id).filter { by[$0] != nil } + by.keys.filter { id in !classes.contains { $0.id == id } }
        return order.map { id in
            let list = by[id]!.sorted { filter == .past ? key($0) > key($1) : key($0) < key($1) }
            return (id, list.first?.classes?.name ?? classes.first { $0.id == id }?.name ?? "Classe", list)
        }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ex.filters", icon: "line.3.horizontal.decrease.circle", title: "Statut et classe",
                          message: "À venir, passés, en attente de confirmation, confirmés ou tous ; pour toutes les classes ou une seule."),
            CoachMarkStep(id: "ex.list", icon: "doc.text", title: "Confirmer",
                          message: "Les examens proposés par les enseignants ne sont visibles des élèves qu’une fois confirmés. Touchez « Confirmer la date »."),
            CoachMarkStep(id: "ex.new", icon: "plus", title: "Créer un examen",
                          message: "Un examen créé ici est confirmé tout de suite. Un seul examen par jour et par classe."),
            CoachMarkStep(id: "ex.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        filters.coachMarkTarget("ex.filters")
                        if filter == .upcoming && pastCount > 0 {
                            Button { filter = .past } label: {
                                (Text("\(pastCount) examen\(pastCount > 1 ? "s" : "") passé\(pastCount > 1 ? "s" : "") — ").foregroundColor(EduTheme.muted)
                                 + Text("Voir les passés").foregroundColor(EduTheme.teal).fontWeight(.semibold))
                                    .font(.subheadline)
                            }
                            .buttonStyle(.plain)
                        }
                        if filter == .pending {
                            let n = shown.filter { !$0.confirmed }.count
                            Text("\(n) examen\(n > 1 ? "s" : "") en attente.").font(.subheadline).foregroundStyle(EduTheme.muted)
                        }
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        if shown.isEmpty {
                            Text(emptyText).font(.subheadline).foregroundStyle(EduTheme.muted)
                                .frame(maxWidth: .infinity).padding(24).modifier(HomeCardStyle())
                                .coachMarkTarget("ex.list")
                        } else {
                            VStack(alignment: .leading, spacing: 18) {
                                ForEach(groups, id: \.id) { g in group(g) }
                            }
                            .coachMarkTarget("ex.list")
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
            .pushFocus(["aconfirmer"], ready: ready, proxy: proxy, highlighted: $highlighted) { f in
                let ids = Set(f.ids("eval-a"))
                guard let hits = Optional(shown.filter { ids.contains($0.id) }), let first = hits.first else { return nil }
                return (first.id, Set(hits.map(\.id)))
            }
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Examens")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: filter) { _, _ in Task { await load() } }
        .onChange(of: classId) { _, _ in Task { await load() } }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(isPresented: $creating) {
            ExamFormSheet(classes: classes, initialClassId: classId.isEmpty ? classes.first?.id ?? "" : classId) {
                Task { await load() }
            }
            .environmentObject(auth)
        }
        .passwordConfirm(item: $deleting, password: $password, title: { "Supprimer « \($0.title ?? "cet examen") » ?" }, message: "Cet examen et les notes associées seront définitivement retirés. Saisissez votre mot de passe administrateur pour confirmer.", confirm: "Supprimer l’examen") { e in await delete(e) }
    }

    private var emptyText: String {
        switch filter {
        case .pending: return "Aucun examen en attente de confirmation."
        case .past: return "Aucun examen passé pour cette sélection."
        case .upcoming: return "Aucun examen à venir."
        default: return "Aucun examen pour cette sélection."
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Examens").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Créez un examen pour une classe, ou confirmez ceux proposés par les enseignants.")
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("ex.help")
                }
                Button { creating = true } label: {
                    Label("Créer un examen", systemImage: "plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(classes.isEmpty)
                .coachMarkTarget("ex.new")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var filters: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Statut").foregroundStyle(EduTheme.ink)
                Spacer()
                Picker("Statut", selection: $filter) { ForEach(Filter.allCases) { Text($0.label).tag($0) } }.labelsHidden()
            }
            Divider()
            HStack {
                Text("Classe").foregroundStyle(EduTheme.ink)
                Spacer()
                Picker("Classe", selection: $classId) {
                    Text("Toutes les classes").tag("")
                    ForEach(classes) { Text($0.name).tag($0.id) }
                }
                .labelsHidden()
            }
        }
        .font(.subheadline).tint(EduTheme.teal)
        .padding(.horizontal, 16).padding(.vertical, 4)
        .modifier(HomeCardStyle())
    }

    private func group(_ g: (id: String, name: String, exams: [Exam])) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle().fill(TeacherStudentsView.classColor(id: g.id, name: g.name)).frame(width: 8, height: 8)
                Text(g.name).font(.headline).foregroundStyle(EduTheme.ink)
                Text("\(g.exams.count) examen\(g.exams.count > 1 ? "s" : "")").font(.caption).foregroundStyle(EduTheme.muted)
            }
            ForEach(g.exams) { e in card(e).pushHighlight(highlighted.contains(e.id)).id(e.id) }
        }
    }

    private func card(_ e: Exam) -> some View {
        let past = e.isPast()
        let date = e.eval_date.flatMap { EduDates.parseDay(String($0.prefix(10))) }
            .map { TeacherExercisesView.format($0, "EEE d MMM yyyy").capitalized(with: Locale(identifier: "fr_FR")) } ?? "Date non définie"
        let slot = e.start_time.map { s in e.end_time.map { "\(s.prefix(5)) – \($0.prefix(5))" } ?? String(s.prefix(5)) }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text([e.teacher?.fullName.isEmpty == false ? e.teacher!.fullName : "Enseignant", e.matieres?.name ?? "Matière"].joined(separator: " · "))
                    .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).lineLimit(1)
                Spacer(minLength: 4)
                if past { tag("Passé", sky, sky100) }
                else if e.confirmed { tag("Confirmé", H.emerald, H.emerald50) }
                else { tag("À confirmer", H.amber, H.amber50) }
            }
            Text(e.title ?? "Examen").font(.subheadline).foregroundStyle(EduTheme.ink)
            if let d = e.description, !d.isEmpty { Text(d).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(3) }
            HStack(spacing: 6) {
                Label([date, slot].compactMap { $0 }.joined(separator: " · "), systemImage: "calendar")
                    .font(.caption).foregroundStyle(EduTheme.muted)
                if let p = e.period_label { tag(p, EduTheme.muted, H.slate100) }
            }
            if !past || e.confirmed {
                HStack(spacing: 8) {
                    if !e.confirmed && !past {
                        action("Confirmer la date", primary: true) { Task { await setConfirmed(e, true) } }
                    } else if e.confirmed && !past {
                        action("Retirer la confirmation", primary: false) { Task { await setConfirmed(e, false) } }
                    }
                    Spacer()
                    Button(role: .destructive) { deleting = e } label: {
                        Label("Supprimer", systemImage: "trash").font(.caption.weight(.semibold))
                    }
                    .tint(Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255))
                }
                .disabled(busyId == e.id)
            }
        }
        .padding(14)
        .opacity(past ? 0.8 : 1)
        .modifier(HomeCardStyle())
    }

    private func tag(_ text: String, _ fg: Color, _ bg: Color) -> some View {
        Text(text).font(.caption.weight(.bold)).foregroundStyle(fg)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func action(_ title: String, primary: Bool, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(primary ? .white : EduTheme.ink)
                .padding(.horizontal, 12).frame(minHeight: 34)
                .background(primary ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(primary ? .clear : EduTheme.borderStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Data

    private func load() async {
        guard let sid = auth.schoolId else { ready = true; return }
        let api = EduAPI()
        do {
            if classes.isEmpty {
                classes = try await api.fetchClasses(schoolId: sid).sorted { a, b in
                    let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
                    let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
                    return ra != rb ? ra < rb : a.name.localizedStandardCompare(b.name) == .orderedAscending
                }
            }
            let ids = classId.isEmpty ? classes.map(\.id) : [classId]
            exams = ids.isEmpty ? [] : try await api.fetchSchoolExamList(classIds: ids, confirmed: filter == .pending ? false : (filter == .confirmed ? true : nil))
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    private func setConfirmed(_ e: Exam, _ confirmed: Bool) async {
        guard let uid = auth.userId else { return }
        busyId = e.id
        defer { busyId = nil }
        do {
            try await EduAPI().setExamConfirmed(id: e.id, confirmed: confirmed, by: uid)
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func delete(_ e: Exam) async {
        let pw = password
        password = ""
        deleting = nil
        do {
            guard let email = SupabaseManager.client.auth.currentUser?.email else { error = "Session expirée."; return }
            _ = try await SupabaseManager.client.auth.signIn(email: email, password: pw)
        } catch {
            self.error = "Mot de passe incorrect."
            return
        }
        busyId = e.id
        defer { busyId = nil }
        do {
            try await EduAPI().deleteEvaluation(id: e.id)
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Create

private struct ExamFormSheet: View {
    let classes: [ClassRow]
    let initialClassId: String
    var onSaved: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var classId = ""
    @State private var teacherId = ""
    @State private var subjectId = ""
    @State private var period = "Trimestre 1"
    @State private var title = ""
    @State private var details = ""
    @State private var date = Date()
    @State private var start = "08:00"
    @State private var end = "10:00"
    @State private var teachers: [SchoolTimetableView.Person] = []
    @State private var subjects: [NamedEntity] = []
    @State private var assignments: [SchoolTimetableView.Assignment] = []
    @State private var saving = false
    @State private var error: String?

    private var classTeachers: [SchoolTimetableView.Person] {
        let ids = Set(assignments.filter { $0.class_section_id == classId }.map(\.teacher_id))
        return teachers.filter { ids.contains($0.id) }
    }
    private var teacherSubjects: [NamedEntity] {
        var ids = Set(assignments.filter { $0.teacher_id == teacherId && $0.class_section_id == classId }.map(\.subject_id))
        if !subjectId.isEmpty { ids.insert(subjectId) }
        return subjects.filter { ids.contains($0.id ?? "") }
    }

    var body: some View {
        EduFormSheet(title: "Créer un examen", primary: saving ? "Enregistrement…" : "Créer", primaryDisabled: saving, busy: saving, onPrimary: { Task { await save() } }) {
                Section {
                    Picker("Classe", selection: $classId) { ForEach(classes) { Text($0.name).tag($0.id) } }
                        .onChange(of: classId) { _, _ in teacherId = ""; subjectId = "" }
                    Picker("Enseignant", selection: $teacherId) {
                        Text("Choisir…").tag("")
                        ForEach(classTeachers) { Text($0.name).tag($0.id) }
                    }
                    .onChange(of: teacherId) { _, _ in subjectId = "" }
                    Picker("Matière", selection: $subjectId) {
                        Text("Choisir…").tag("")
                        ForEach(teacherSubjects, id: \.id) { Text($0.name).tag($0.id ?? "") }
                    }
                    .disabled(teacherId.isEmpty)
                    Picker("Trimestre", selection: $period) {
                        ForEach(EvaluationFormSheet.periods, id: \.self) { Text($0).tag($0) }
                    }
                }
                Section {
                    TextField("Titre", text: $title)
                    TextField("Description (facultatif)", text: $details, axis: .vertical).lineLimit(2...5)
                }
                Section {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "fr_FR"))
                    Picker("Début", selection: $start) { ForEach(SchoolTimetableView.timeOptions, id: \.self) { Text($0).tag($0) } }
                    Picker("Fin", selection: $end) { ForEach(SchoolTimetableView.timeOptions, id: \.self) { Text($0).tag($0) } }
                } footer: {
                    Text("Un seul examen par jour et par classe. Il est confirmé tout de suite et visible des élèves.")
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .task {
            classId = initialClassId
            guard let sid = auth.schoolId else { return }
            let api = EduAPI()
            teachers = (try? await api.fetchActiveTeachers(schoolId: sid)) ?? []
            subjects = (try? await api.fetchSchoolSubjects(schoolId: sid)) ?? []
            assignments = (try? await api.fetchSchoolAssignments(schoolId: sid)) ?? []
            if let ctx = try? await api.fetchAttendancePeriodContext() {
                let base = AttendancePeriodBuilder.build(yearStart: ctx.start, yearEnd: ctx.end, custom: ctx.custom)
                if let cur = ParentHomeLoader.currentTrimester(from: base)?.label, EvaluationFormSheet.periods.contains(cur) { period = cur }
            }
        }
    }

    private func save() async {
        guard let uid = auth.userId, !classId.isEmpty else { return }
        guard !teacherId.isEmpty, !subjectId.isEmpty else { error = "Choisissez l’enseignant et la matière"; return }
        let t = title.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { error = "Indiquez un titre"; return }
        guard start < end else { error = "L’heure de fin doit être après l’heure de début"; return }
        let day = EduDates.day(date)
        saving = true
        defer { saving = false }
        let api = EduAPI()
        do {
            if let other = try await api.examOnDay(classId: classId, day: day) {
                let slot = other.start_time.map { s in other.end_time.map { " · \(s.prefix(5)) – \($0.prefix(5))" } ?? "" } ?? ""
                error = "Un examen est déjà prévu ce jour pour cette classe (\(other.matieres?.name ?? "Matière")\(slot)). Choisissez une autre date."
                return
            }
            try await api.createConfirmedExam(classId: classId, subjectId: subjectId, teacherId: teacherId, period: period, title: t,
                                              description: details.trimmingCharacters(in: .whitespaces), day: day, start: start, end: end, by: uid)
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation {
                self.error = String(describing: error).contains("23505")
                    ? "Un examen est déjà prévu ce jour pour cette classe. Choisissez une autre date."
                    : error.localizedDescription
            }
        }
    }
}

// MARK: - API

extension EduAPI {
    func fetchSchoolExamList(classIds: [String], confirmed: Bool?) async throws -> [SchoolExamsView.Exam] {
        var q = client.from("evaluations")
            .select("id, title, description, eval_date, start_time, end_time, period_label, admin_confirmed, class_section_id, classes(id, name), matieres(name), teacher:profils!evaluations_teacher_id_fkey(first_name, last_name)")
            .eq("type", value: "examen")
            .in("class_section_id", values: classIds)
        if let confirmed { q = q.eq("admin_confirmed", value: confirmed) }
        return try await q.order("eval_date", ascending: true, nullsFirst: false).execute().value
    }

    func setExamConfirmed(id: String, confirmed: Bool, by: String) async throws {
        struct P: Encodable {
            let admin_confirmed: Bool; let confirmed_at: String?; let confirmed_by: String?
            func encode(to e: Encoder) throws {
                var c = e.container(keyedBy: K.self)
                try c.encode(admin_confirmed, forKey: .admin_confirmed); try c.encode(confirmed_at, forKey: .confirmed_at); try c.encode(confirmed_by, forKey: .confirmed_by)
            }
            enum K: String, CodingKey { case admin_confirmed, confirmed_at, confirmed_by }
        }
        let now = ISO8601DateFormatter().string(from: Date())
        try await client.from("evaluations").update(P(admin_confirmed: confirmed, confirmed_at: confirmed ? now : nil, confirmed_by: confirmed ? by : nil))
            .eq("id", value: id).execute()
    }

    func examOnDay(classId: String, day: String) async throws -> SchoolExamsView.Exam? {
        let rows: [SchoolExamsView.Exam] = try await client.from("evaluations")
            .select("id, title, description, eval_date, start_time, end_time, period_label, admin_confirmed, class_section_id, classes(id, name), matieres(name), teacher:profils!evaluations_teacher_id_fkey(first_name, last_name)")
            .eq("type", value: "examen").eq("class_section_id", value: classId).eq("eval_date", value: day).limit(1)
            .execute().value
        return rows.first
    }

    func createConfirmedExam(classId: String, subjectId: String, teacherId: String, period: String, title: String,
                             description: String, day: String, start: String, end: String, by: String) async throws {
        struct P: Encodable {
            let class_section_id: String; let subject_id: String; let teacher_id: String; let period_label: String
            let title: String; let description: String?; let eval_date: String; let type = "examen"
            let start_time: String; let end_time: String; let admin_confirmed = true; let confirmed_at: String; let confirmed_by: String
        }
        try await client.from("evaluations").insert(P(class_section_id: classId, subject_id: subjectId, teacher_id: teacherId, period_label: period,
                                                       title: title, description: description.isEmpty ? nil : description, eval_date: day,
                                                       start_time: start, end_time: end, confirmed_at: ISO8601DateFormatter().string(from: Date()), confirmed_by: by))
            .execute()
    }
}
