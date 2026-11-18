import SwiftUI
import Supabase

/// School admin « Compositions », like the web CompositionsEcole: multi-subject sessions over
/// 2–3 days per class, with their papers; creating a session (one paper per subject of the
/// programme, each with its teacher, date and time) and deleting one (admin password).
struct SchoolCompositionsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var classId = ""
    @State private var sessions: [Session] = []
    @State private var ready = false
    @State private var error: String?
    @State private var creating = false
    @State private var deleting: Session?
    @State private var password = ""
    @State private var busyId: String?

    @State private var tour = TabTour(key: "compositions-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct Paper: Decodable, Identifiable, Hashable {
        let id: String
        let session_id: String?
        let eval_date: String?
        let start_time: String?
        let end_time: String?
        let matieres: NamedEntity?
    }

    struct Session: Identifiable, Hashable {
        let id: String
        let title: String
        let period: String
        let startsOn: String
        let endsOn: String
        let classId: String
        let className: String?
        var papers: [Paper]
    }

    private var groups: [(id: String, name: String, sessions: [Session])] {
        var by: [String: [Session]] = [:]
        for s in sessions { by[s.classId, default: []].append(s) }
        let order = classes.map(\.id).filter { by[$0] != nil } + by.keys.filter { id in !classes.contains { $0.id == id } }
        return order.map { id in
            let list = by[id]!.sorted { $0.startsOn < $1.startsOn }
            return (id, list.first?.className ?? classes.first { $0.id == id }?.name ?? "Classe", list)
        }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "co.new", icon: "plus", title: "Nouvelle composition",
                          message: "Une session sur 2–3 jours pour une classe : chaque matière du programme devient une épreuve, avec son enseignant, sa date et son horaire."),
            CoachMarkStep(id: "co.list", icon: "text.book.closed", title: "Les sessions",
                          message: "Par classe : la période, les dates et les épreuves. Pendant ces jours, les cours de la classe sont suspendus."),
            CoachMarkStep(id: "co.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        HStack {
                            Text("Classe").foregroundStyle(EduTheme.ink)
                            Spacer()
                            Picker("Classe", selection: $classId) {
                                Text("Toutes les classes").tag("")
                                ForEach(classes) { Text($0.name).tag($0.id) }
                            }
                            .labelsHidden()
                        }
                        .font(.subheadline).tint(EduTheme.teal)
                        .padding(.horizontal, 16).padding(.vertical, 6)
                        .modifier(HomeCardStyle())
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        if sessions.isEmpty {
                            Text("Aucune composition pour cette sélection. Créez-en une pour une classe.")
                                .font(.subheadline).foregroundStyle(EduTheme.muted)
                                .frame(maxWidth: .infinity).padding(24).modifier(HomeCardStyle())
                                .coachMarkTarget("co.list")
                        } else {
                            VStack(alignment: .leading, spacing: 18) {
                                ForEach(groups, id: \.id) { g in
                                    VStack(alignment: .leading, spacing: 8) {
                                        HStack(spacing: 8) {
                                            Circle().fill(TeacherStudentsView.classColor(id: g.id, name: g.name)).frame(width: 8, height: 8)
                                            Text(g.name).font(.headline).foregroundStyle(EduTheme.ink)
                                            Text("\(g.sessions.count) composition\(g.sessions.count > 1 ? "s" : "")").font(.caption).foregroundStyle(EduTheme.muted)
                                        }
                                        ForEach(g.sessions) { s in card(s) }
                                    }
                                }
                            }
                            .coachMarkTarget("co.list")
                        }
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await load() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Compositions")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: classId) { _, _ in Task { await load() } }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(isPresented: $creating) {
            CompositionFormSheet(classes: classes, initialClassId: classId.isEmpty ? classes.first?.id ?? "" : classId) { Task { await load() } }
                .environmentObject(auth)
        }
        .alert(deleting.map { "Supprimer « \($0.title) » ?" } ?? "", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            SecureField("Mot de passe", text: $password)
            Button("Annuler", role: .cancel) { password = ""; deleting = nil }
            Button("Supprimer la composition", role: .destructive) { if let s = deleting { Task { await delete(s) } } }
        } message: {
            Text("Cette composition et toutes ses épreuves seront définitivement retirées. Saisissez votre mot de passe administrateur pour confirmer.")
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Compositions").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Sessions multi-matières sur 2–3 jours — planifiées par l’administration.")
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("co.help")
                }
                Button { creating = true } label: {
                    Label("Nouvelle composition", systemImage: "plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(classes.isEmpty)
                .coachMarkTarget("co.new")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func card(_ s: Session) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(s.title).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Text("Planifiée").font(.caption.weight(.bold)).foregroundStyle(H.emerald)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(H.emerald50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                Spacer()
            }
            Text("\(s.period) · \(Self.date(s.startsOn, "d MMM")) – \(Self.date(s.endsOn, "d MMM yyyy")) · \(s.papers.count) épreuve\(s.papers.count != 1 ? "s" : "")")
                .font(.caption).foregroundStyle(EduTheme.muted)
            if !s.papers.isEmpty {
                Divider()
                ForEach(s.papers) { p in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "list.clipboard").font(.caption).foregroundStyle(EduTheme.subtle)
                        (Text(p.matieres?.name ?? "Matière").fontWeight(.medium).foregroundColor(EduTheme.ink)
                         + Text([p.eval_date.map { " · " + Self.date($0, "EEE d MMM") }, p.start_time.map { s in " · \(s.prefix(5))" + (p.end_time.map { " – \($0.prefix(5))" } ?? "") }].compactMap { $0 }.joined())
                            .foregroundColor(EduTheme.muted))
                            .font(.caption)
                    }
                }
            }
            Button(role: .destructive) { deleting = s } label: {
                Label("Supprimer", systemImage: "trash").font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 34)
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
            }
            .tint(Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255))
            .disabled(busyId == s.id)
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    static func date(_ iso: String, _ pattern: String) -> String {
        guard let d = EduDates.parseDay(String(iso.prefix(10))) else { return iso }
        return TeacherExercisesView.format(d, pattern)
    }

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
            sessions = ids.isEmpty ? [] : try await api.fetchSchoolCompositionSessions(classIds: ids)
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    private func delete(_ s: Session) async {
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
        busyId = s.id
        defer { busyId = nil }
        do {
            try await EduAPI().deleteCompositionSession(id: s.id)
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Create

private struct CompositionFormSheet: View {
    let classes: [ClassRow]
    let initialClassId: String
    var onSaved: () -> Void

    struct PaperDraft: Identifiable {
        var id: String { subjectId }
        let subjectId: String
        let subjectName: String
        var included = true
        var teacherId: String
        var date: Date
        var start = "08:00"
        var end = "10:00"
        var maxScore = "20"
    }

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var classId = ""
    @State private var title = ""
    @State private var period = "Trimestre 1"
    @State private var startsOn = Date()
    @State private var endsOn = Calendar.current.date(byAdding: .day, value: 2, to: Date()) ?? Date()
    @State private var papers: [PaperDraft] = []
    @State private var teachers: [SchoolTimetableView.Person] = []
    @State private var assignments: [SchoolTimetableView.Assignment] = []
    @State private var subjects: [NamedEntity] = []
    @State private var loadingProgramme = false
    @State private var saving = false
    @State private var error: String?

    private func teachersFor(_ subjectId: String) -> [SchoolTimetableView.Person] {
        let forSubject = Set(assignments.filter { $0.class_section_id == classId && $0.subject_id == subjectId }.map(\.teacher_id))
        if !forSubject.isEmpty { return teachers.filter { forSubject.contains($0.id) } }
        let forClass = Set(assignments.filter { $0.class_section_id == classId }.map(\.teacher_id))
        return teachers.filter { forClass.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Session de 2–3 jours : toutes les matières du programme sont listées. Cochez celles à inclure, puis renseignez date et horaire pour chaque épreuve. Les enseignants noteront ensuite dans Évaluations & notes.")
                        .font(.caption).foregroundStyle(EduTheme.muted)
                }
                Section {
                    Picker("Classe", selection: $classId) { ForEach(classes) { Text($0.name).tag($0.id) } }
                    TextField("Titre (ex. Compositions du 1er trimestre)", text: $title)
                    Picker("Trimestre", selection: $period) { ForEach(EvaluationFormSheet.periods, id: \.self) { Text($0).tag($0) } }
                    DatePicker("Début", selection: $startsOn, displayedComponents: .date)
                    DatePicker("Fin", selection: $endsOn, in: startsOn..., displayedComponents: .date)
                }
                .environment(\.locale, Locale(identifier: "fr_FR"))
                Section("Épreuves") {
                    if loadingProgramme {
                        ProgressView()
                    } else if papers.isEmpty {
                        Text("Aucune matière au programme de cette classe.").foregroundStyle(EduTheme.muted)
                    }
                    ForEach($papers) { $p in
                        VStack(alignment: .leading, spacing: 8) {
                            Toggle(p.subjectName, isOn: $p.included).font(.subheadline.weight(.semibold)).tint(EduTheme.teal)
                            if p.included {
                                Picker("Enseignant", selection: $p.teacherId) {
                                    Text("Choisir…").tag("")
                                    ForEach(teachersFor(p.subjectId)) { Text($0.name).tag($0.id) }
                                }
                                DatePicker("Date", selection: $p.date, in: startsOn...max(startsOn, endsOn), displayedComponents: .date)
                                    .environment(\.locale, Locale(identifier: "fr_FR"))
                                HStack {
                                    Picker("Début", selection: $p.start) { ForEach(SchoolTimetableView.timeOptions, id: \.self) { Text($0).tag($0) } }
                                    Picker("Fin", selection: $p.end) { ForEach(SchoolTimetableView.timeOptions, id: \.self) { Text($0).tag($0) } }
                                }
                                .font(.caption)
                                HStack {
                                    Text("Note max").font(.caption)
                                    Spacer()
                                    TextField("20", text: $p.maxScore).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width: 60)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }
            .navigationTitle("Nouvelle composition")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Enregistrement…" : "Créer") { Task { await save() } }.fontWeight(.semibold).disabled(saving)
                }
            }
        }
        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .task {
            classId = initialClassId
            guard let sid = auth.schoolId else { return }
            let api = EduAPI()
            teachers = (try? await api.fetchActiveTeachers(schoolId: sid)) ?? []
            assignments = (try? await api.fetchSchoolAssignments(schoolId: sid)) ?? []
            subjects = (try? await api.fetchSchoolSubjects(schoolId: sid)) ?? []
            if let ctx = try? await api.fetchAttendancePeriodContext() {
                let base = AttendancePeriodBuilder.build(yearStart: ctx.start, yearEnd: ctx.end, custom: ctx.custom)
                if let cur = ParentHomeLoader.currentTrimester(from: base)?.label, EvaluationFormSheet.periods.contains(cur) { period = cur }
            }
            await rebuildPapers()
        }
        .onChange(of: classId) { _, _ in Task { await rebuildPapers() } }
        .onChange(of: startsOn) { _, new in
            if endsOn < new { endsOn = new }
            for i in papers.indices where papers[i].date < new { papers[i].date = new }
        }
    }

    /// The programme's subjects (else the subjects taught in the class), each with its teacher.
    private func rebuildPapers() async {
        guard !classId.isEmpty else { papers = []; return }
        loadingProgramme = true
        defer { loadingProgramme = false }
        var rows = ((try? await EduAPI().fetchProgrammeSubjects(classId: classId)) ?? [])
        if rows.isEmpty {
            let ids = Set(assignments.filter { $0.class_section_id == classId }.map(\.subject_id))
            rows = subjects.filter { ids.contains($0.id ?? "") }.map { (id: $0.id ?? "", name: $0.name) }
        }
        papers = rows.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }.map { r in
            PaperDraft(subjectId: r.id, subjectName: r.name, teacherId: teachersFor(r.id).first?.id ?? "", date: startsOn)
        }
    }

    private func save() async {
        guard let uid = auth.userId, !classId.isEmpty else { return }
        let t = title.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { error = "Donnez un titre à la composition"; return }
        let from = EduDates.day(startsOn), to = EduDates.day(endsOn)
        guard to >= from else { error = "La date de fin doit être après la date de début"; return }
        let included = papers.filter(\.included)
        guard !included.isEmpty else { error = "Cochez au moins une matière"; return }
        for p in included {
            if p.teacherId.isEmpty { error = "Choisissez un enseignant pour \(p.subjectName)"; return }
            let d = EduDates.day(p.date)
            if d < from || d > to { error = "La date de \(p.subjectName) doit être entre \(from) et \(to)"; return }
            if p.start >= p.end { error = "Créneau invalide pour \(p.subjectName)"; return }
            if (Double(p.maxScore) ?? 0) <= 0 { error = "Note max invalide pour \(p.subjectName)"; return }
        }
        saving = true
        defer { saving = false }
        do {
            try await EduAPI().createCompositionSession(
                classId: classId, period: period, title: t, startsOn: from, endsOn: to, by: uid,
                papers: included.map { (subjectId: $0.subjectId, subjectName: $0.subjectName, teacherId: $0.teacherId,
                                        date: EduDates.day($0.date), start: $0.start, end: $0.end, maxScore: Double($0.maxScore) ?? 20) })
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - API

extension EduAPI {
    func fetchSchoolCompositionSessions(classIds: [String]) async throws -> [SchoolCompositionsView.Session] {
        struct S: Decodable {
            let id: String; let title: String?; let period_label: String?; let starts_on: String; let ends_on: String
            let class_section_id: String; let classes: NamedEntity?
        }
        let rows: [S] = try await client.from("composition_sessions")
            .select("id, title, period_label, starts_on, ends_on, class_section_id, classes(id, name)")
            .in("class_section_id", values: classIds).order("starts_on", ascending: false).execute().value
        guard !rows.isEmpty else { return [] }
        let papers: [SchoolCompositionsView.Paper] = try await client.from("evaluations")
            .select("id, session_id, eval_date, start_time, end_time, matieres(name)")
            .in("session_id", values: rows.map(\.id)).eq("type", value: "composition").order("eval_date").execute().value
        let by = Dictionary(grouping: papers, by: { $0.session_id ?? "" })
        return rows.map { s in
            SchoolCompositionsView.Session(id: s.id, title: s.title ?? "Composition", period: s.period_label ?? "", startsOn: s.starts_on,
                                           endsOn: s.ends_on, classId: s.class_section_id, className: s.classes?.name, papers: by[s.id] ?? [])
        }
    }

    func fetchProgrammeSubjects(classId: String) async throws -> [(id: String, name: String)] {
        struct Row: Decodable { let subject_id: String; let matieres: NamedEntity? }
        let rows: [Row] = try await client.from("programme_classe").select("subject_id, matieres(id, name)")
            .eq("class_section_id", value: classId).order("created_at").execute().value
        return rows.map { (id: $0.subject_id, name: $0.matieres?.name ?? "Matière") }
    }

    func createCompositionSession(classId: String, period: String, title: String, startsOn: String, endsOn: String, by: String,
                                  papers: [(subjectId: String, subjectName: String, teacherId: String, date: String, start: String, end: String, maxScore: Double)]) async throws {
        struct SessionInsert: Encodable { let class_section_id: String; let period_label: String; let title: String; let starts_on: String; let ends_on: String; let created_by: String }
        struct Created: Decodable { let id: String }
        struct PaperInsert: Encodable {
            let class_section_id: String; let subject_id: String; let teacher_id: String; let period_label: String
            let type = "composition"; let title: String; let max_score: Double; let eval_date: String
            let start_time: String; let end_time: String; let admin_confirmed = true; let confirmed_at: String; let confirmed_by: String; let session_id: String
        }
        let session: Created = try await client.from("composition_sessions")
            .insert(SessionInsert(class_section_id: classId, period_label: period, title: title, starts_on: startsOn, ends_on: endsOn, created_by: by))
            .select("id").single().execute().value
        let now = ISO8601DateFormatter().string(from: Date())
        let rows = papers.map {
            PaperInsert(class_section_id: classId, subject_id: $0.subjectId, teacher_id: $0.teacherId, period_label: period,
                        title: "\(title) — \($0.subjectName)", max_score: $0.maxScore, eval_date: $0.date,
                        start_time: $0.start, end_time: $0.end, confirmed_at: now, confirmed_by: by, session_id: session.id)
        }
        do {
            try await client.from("evaluations").insert(rows).execute()
        } catch {
            // roll back the empty session if the papers failed
            try? await client.from("composition_sessions").delete().eq("id", value: session.id).execute()
            throw error
        }
    }

    /// Papers first (their session_id is ON DELETE SET NULL), then the session.
    func deleteCompositionSession(id: String) async throws {
        try await client.from("evaluations").delete().eq("session_id", value: id).execute()
        try await client.from("composition_sessions").delete().eq("id", value: id).execute()
    }
}
