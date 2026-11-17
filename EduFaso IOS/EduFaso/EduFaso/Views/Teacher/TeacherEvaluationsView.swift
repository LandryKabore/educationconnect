import SwiftUI
import Supabase

/// Teacher « Évaluations & notes », like the web MesDevoirsProf: every evaluation of each class,
/// grouped by Trimestre, with how many grades are entered and what is left to grade. Interrogations
/// and exercices de maison can be created, edited and removed here; exams and compositions are
/// planned by the school.
struct TeacherEvaluationsView: View {
    /// Opened from « Mes classes »: start on that class.
    var initialClassId: String? = nil

    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var selectedId: String?
    @State private var trimester = ""
    @State private var ready = false
    @State private var error: String?
    @State private var defaultPeriod = "Trimestre 1"

    @State private var form: FormTarget?
    @State private var removing: Eval?
    @State private var gradeTarget: EvaluationRow?

    @State private var tour = TabTour(key: "examens-evaluations-enseignant")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct Eval: Identifiable, Hashable {
        var id: String { row.id }
        let row: EvaluationRow
        let graded: Int
        var type: String { row.type ?? "devoir" }
        var period: String { row.periodLabel ?? "Sans trimestre" }
        var confirmed: Bool { row.adminConfirmed == true }
    }

    struct ClassRow: Identifiable, Hashable {
        var id: String { classId }
        let classId: String
        let className: String
        let gradeLevel: String?
        var subjects: [TeacherExercisesView.Subject]
        var roster = 0
        var evals: [Eval] = []
        /// An evaluation is finished once every student of the class has a grade.
        func isComplete(_ e: Eval) -> Bool { roster > 0 && e.graded >= roster }
        var toGrade: Int { evals.filter { !isComplete($0) }.count }
    }

    struct FormTarget: Identifiable {
        let id = UUID()
        let classRow: ClassRow
        let type: String
        let editing: EditableEvaluation?
    }

    private var selected: ClassRow? { classes.first { $0.classId == selectedId } ?? classes.first }
    private var periods: [String] {
        Array(Set((selected?.evals ?? []).map(\.period))).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }
    /// A trimester the selected class has no evaluation in falls back to « Tous ».
    private var activeTrimester: String { periods.contains(trimester) ? trimester : "" }
    private var byPeriod: [(String, [Eval])] {
        var map: [String: [Eval]] = [:]
        for e in selected?.evals ?? [] where activeTrimester.isEmpty || e.period == activeTrimester {
            map[e.period, default: []].append(e)
        }
        return map.sorted { $0.key.localizedStandardCompare($1.key) == .orderedDescending }
    }
    private var totalEvals: Int { classes.reduce(0) { $0 + $1.evals.count } }
    private var totalToGrade: Int { classes.reduce(0) { $0 + $1.toGrade } }
    private var pendingExams: Int { classes.reduce(0) { $0 + $1.evals.filter { $0.type == "examen" && !$0.confirmed }.count } }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "evals.stats", icon: "chart.bar.fill", title: "En un coup d’œil",
                          message: "Vos évaluations, celles dont des notes manquent, et les examens en attente de confirmation par l’administration."),
            CoachMarkStep(id: "evals.classes", icon: "rectangle.3.group", title: "Choisir la classe",
                          message: "Touchez une classe. Le chiffre orange indique les évaluations à noter."),
            CoachMarkStep(id: "evals.new", icon: "plus", title: "Nouvelle évaluation",
                          message: "Créez une interrogation ou un exercice de maison. Les examens et compositions sont planifiés par l’administration."),
            CoachMarkStep(id: "evals.list", icon: "list.bullet.rectangle", title: "Par trimestre",
                          message: "Pour chaque évaluation : le nombre de notes saisies. « Saisir les notes » pour les compléter, « Voir les notes » quand tout est noté, et « ⋯ » pour la modifier ou la supprimer."),
            CoachMarkStep(id: "evals.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
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
                        if classes.isEmpty {
                            Text("Aucune classe assignée pour le moment.")
                                .font(.subheadline)
                                .foregroundStyle(EduTheme.muted)
                                .frame(maxWidth: .infinity)
                                .padding(24)
                                .modifier(HomeCardStyle())
                        } else {
                            classChips.coachMarkTarget("evals.classes")
                            if let c = selected { classCard(c) }
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
        .navigationTitle("Évaluations & notes")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .navigationDestination(item: $gradeTarget) { e in
            GradeEntryView(evaluation: e, recordedBy: auth.userId)
        }
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(item: $form) { f in
            EvaluationFormSheet(classId: f.classRow.classId, className: f.classRow.className, subjects: f.classRow.subjects,
                                defaultPeriod: activeTrimester.isEmpty ? defaultPeriod : activeTrimester,
                                defaultType: f.type, editing: f.editing) { createdId, type in
                Task {
                    await load()
                    // a new quiz goes straight to its grade sheet; homework is usually not graded
                    if let createdId, type == "interrogation" {
                        gradeTarget = classes.flatMap(\.evals).first { $0.id == createdId }?.row
                    }
                }
            }
        }
        .confirmationDialog(removeTitle, isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) {
                if let e = removing { Task { await remove(e) } }
            }
            Button("Annuler", role: .cancel) {}
        }
    }

    private var removeTitle: String {
        guard let e = removing else { return "" }
        let t = e.row.title ?? "cette évaluation"
        return e.graded > 0
            ? "« \(t) » a déjà \(e.graded) note\(e.graded > 1 ? "s" : ""). Supprimer l’évaluation et ses notes ?"
            : "Supprimer « \(t) » ?"
    }

    // MARK: - Banner

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Évaluations & notes")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                        Text("Interrogations, exercices de maison et examens de vos classes, avec les notes à saisir.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("evals.help")
                }
                HStack(spacing: 8) {
                    stat("Évaluations", "\(totalEvals)", "dans vos classes")
                    stat("À noter", "\(totalToGrade)", totalToGrade > 0 ? "notes incomplètes" : "tout est noté")
                    stat("Examens", "\(pendingExams)", "en attente")
                }
                .coachMarkTarget("evals.stats")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }
                .frame(height: 4)
                .accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, _ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold)).tracking(0.6)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1).minimumScaleFactor(0.8)
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
            Text(hint)
                .font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    // MARK: - Classes

    private var classChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(classes) { c in
                    let on = c.classId == selected?.classId
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { selectedId = c.classId }
                    } label: {
                        HStack(spacing: 8) {
                            Circle().fill(TeacherStudentsView.classColor(id: c.classId, name: c.className)).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(c.className).font(.subheadline.weight(.semibold)).lineLimit(1)
                                Text("\(c.evals.count) évaluation\(c.evals.count > 1 ? "s" : "")")
                                    .font(.system(size: 10)).lineLimit(1)
                                    .foregroundStyle(on ? .white.opacity(0.85) : EduTheme.muted)
                            }
                            if c.toGrade > 0 {
                                Text("\(c.toGrade)")
                                    .font(.system(size: 11, weight: .bold).monospacedDigit())
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .foregroundStyle(H.amber)
                                    .background(H.amber50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            }
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .foregroundStyle(on ? .white : EduTheme.ink)
                        .background(on ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(on ? .clear : EduTheme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Class evaluations

    private func classCard(_ c: ClassRow) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.className).font(.headline).foregroundStyle(EduTheme.ink)
                    Text("\(c.roster) élèves · \(c.evals.count) évaluation\(c.evals.count > 1 ? "s" : "")")
                        .font(.caption).foregroundStyle(EduTheme.muted)
                }
                Button { form = FormTarget(classRow: c, type: "interrogation", editing: nil) } label: {
                    Label("Nouvelle évaluation", systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .foregroundStyle(.white)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .coachMarkTarget("evals.new")
                if periods.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 2) {
                            ForEach([""] + periods, id: \.self) { p in
                                segment(p.isEmpty ? "Tous" : p,
                                        p.isEmpty ? c.evals.count : c.evals.filter { $0.period == p }.count,
                                        on: activeTrimester == p) { trimester = p }
                            }
                        }
                        .padding(2)
                        .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
            }
            .padding(16)

            if c.evals.isEmpty {
                Divider()
                VStack(spacing: 8) {
                    Image(systemName: "list.clipboard").font(.title2).foregroundStyle(EduTheme.borderStrong)
                    Text("Aucune évaluation dans cette classe pour le moment.")
                        .font(.subheadline).foregroundStyle(EduTheme.muted).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(28)
            } else {
                ForEach(Array(byPeriod.enumerated()), id: \.element.0) { i, group in
                    section(group.0, group.1, in: c, first: i == 0)
                }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func segment(_ label: String, _ n: Int, on: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.15)) { action() }
        } label: {
            HStack(spacing: 5) {
                Text(label).font(.caption.weight(.semibold)).lineLimit(1)
                Text("\(n)")
                    .font(.system(size: 10, weight: .bold).monospacedDigit())
                    .foregroundStyle(on ? H.brand800 : EduTheme.subtle)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .foregroundStyle(on ? H.brand800 : EduTheme.muted)
            .background(on ? .white : .clear, in: RoundedRectangle(cornerRadius: EduTheme.radius - 1, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func section(_ period: String, _ list: [Eval], in c: ClassRow, first: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(period).font(.footnote.weight(.bold)).foregroundStyle(EduTheme.ink)
                Spacer()
                Text("\(list.count) évaluation\(list.count > 1 ? "s" : "")")
                    .font(.caption).foregroundStyle(EduTheme.muted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(H.slate100.opacity(0.8))

            ForEach(Array(list.enumerated()), id: \.element.id) { j, e in
                let r = row(e, in: c)
                if first && j == 0 { r.coachMarkTarget("evals.list") } else { r }
                if j < list.count - 1 { Divider().padding(.leading, 16) }
            }
        }
    }

    private func row(_ e: Eval, in c: ClassRow) -> some View {
        let complete = c.isComplete(e)
        let progress = c.roster > 0 ? min(1, Double(e.graded) / Double(c.roster)) : 0
        let style = Self.typeStyle(e.type)
        let editable = e.type == "interrogation" || e.type == "devoir"
        return HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2).fill(style.fg.opacity(0.7)).frame(width: 3)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top, spacing: 8) {
                    Text(e.row.title ?? e.row.typeLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                    if editable {
                        Menu {
                            Button { edit(e, in: c) } label: { Label("Modifier", systemImage: "pencil") }
                            Button(role: .destructive) { removing = e } label: { Label("Supprimer", systemImage: "trash") }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.muted)
                                .frame(width: 32, height: 24)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Options de \(e.row.title ?? "l’évaluation")")
                    }
                }
                Text(meta(e))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(1)
                if e.type == "examen" {
                    Text(e.confirmed ? "Confirmé" : "En attente de confirmation")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(e.confirmed ? H.emerald : H.amber)
                }
                HStack(spacing: 10) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(H.slate100)
                            Capsule()
                                .fill(complete ? Color(red: 16 / 255, green: 185 / 255, blue: 129 / 255) : H.brand600)
                                .frame(width: geo.size.width * progress)
                        }
                    }
                    .frame(height: 5)
                    Text(complete ? "\(e.graded)/\(c.roster) ✓" : "\(e.graded)/\(c.roster) notes")
                        .font(.caption2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(complete ? H.emerald : (e.graded == 0 ? H.amber : EduTheme.muted))
                        .fixedSize()
                }
                HStack {
                    Spacer()
                    Button { gradeTarget = e.row } label: {
                        Label(complete ? "Voir les notes" : "Saisir les notes",
                              systemImage: complete ? "eye" : "square.and.pencil")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 32)
                            .foregroundStyle(complete ? EduTheme.ink : .white)
                            .background(complete ? .white : EduTheme.teal,
                                        in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                                .stroke(complete ? EduTheme.borderStrong : .clear, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture { gradeTarget = e.row }
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(complete ? "Voir les notes" : "Saisir les notes")
    }

    private func edit(_ e: Eval, in c: ClassRow) {
        form = FormTarget(classRow: c, type: e.type, editing: EditableEvaluation(
            id: e.id, subjectId: e.row.subjectId ?? "", period: e.period, type: e.type,
            title: e.row.title ?? "", description: e.row.details, maxScore: e.row.maxScore ?? 20,
            date: e.row.evalDate.map { String($0.prefix(10)) }))
    }

    private func meta(_ e: Eval) -> String {
        let subject = e.row.matieres?.name ?? "Matière"
        let date = e.row.evalDate.map { TeacherExercisesView.dayLabel($0) } ?? "sans date"
        return "\(e.row.typeLabel) · \(subject) · \(date)"
    }

    static func typeStyle(_ type: String) -> (fg: Color, bg: Color) {
        switch type {
        case "interrogation": return (Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255), Color(red: 240 / 255, green: 249 / 255, blue: 255 / 255))
        case "examen": return (Color(red: 91 / 255, green: 33 / 255, blue: 182 / 255), Color(red: 245 / 255, green: 243 / 255, blue: 255 / 255))
        case "composition": return (Color(red: 6 / 255, green: 95 / 255, blue: 70 / 255), Color(red: 236 / 255, green: 253 / 255, blue: 245 / 255))
        default: return (Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255), Color(red: 255 / 255, green: 251 / 255, blue: 235 / 255))
        }
    }

    // MARK: - Loading

    private func load() async {
        guard let tid = auth.userId else { ready = true; return }
        do {
            let api = EduAPI()
            let rows = try await api.fetchTeachingAssignments(teacherId: tid)
            var map: [String: ClassRow] = [:]
            for r in rows {
                let cid = r.classSectionId
                var c = map[cid] ?? ClassRow(classId: cid, className: r.classes?.name ?? "Classe", gradeLevel: r.classes?.gradeLevel, subjects: [])
                let sid = r.subjectId ?? r.matieres?.id ?? r.id
                if !c.subjects.contains(where: { $0.id == sid }) {
                    c.subjects.append(TeacherExercisesView.Subject(id: sid, name: r.matieres?.name ?? "Matière"))
                }
                map[cid] = c
            }
            var ordered = map.values.sorted { a, b in
                let ra = TeacherClassesView.gradeRank(name: a.className, gradeLevel: a.gradeLevel)
                let rb = TeacherClassesView.gradeRank(name: b.className, gradeLevel: b.gradeLevel)
                if ra != rb { return ra < rb }
                return a.className.localizedStandardCompare(b.className) == .orderedAscending
            }
            let classIds = ordered.map(\.classId)
            if !classIds.isEmpty {
                async let evalsTask = api.fetchTeacherAllEvaluations(teacherId: tid, classIds: classIds)
                async let statsTask = api.fetchTeacherClassStats(classIds: classIds)
                let (evals, stats) = try await (evalsTask, statsTask)
                let graded = evals.isEmpty ? [:] : try await api.fetchGradeCounts(evaluationIds: evals.map(\.id))
                for i in ordered.indices {
                    ordered[i].roster = stats.counts[ordered[i].classId] ?? 0
                    ordered[i].evals = evals
                        .filter { $0.classSectionId == ordered[i].classId }
                        .map { Eval(row: $0, graded: graded[$0.id] ?? 0) }
                }
            }
            classes = ordered
            let ids = Set(classIds)
            if !ready, let initialClassId, ids.contains(initialClassId) { selectedId = initialClassId }
            if selectedId == nil || !ids.contains(selectedId ?? "") { selectedId = ordered.first?.classId }
            if let ctx = try? await api.fetchAttendancePeriodContext() {
                let base = AttendancePeriodBuilder.build(yearStart: ctx.start, yearEnd: ctx.end, custom: ctx.custom)
                if let cur = ParentHomeLoader.currentTrimester(from: base)?.label,
                   EvaluationFormSheet.periods.contains(cur) { defaultPeriod = cur }
            }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    private func remove(_ e: Eval) async {
        do {
            try await EduAPI().deleteEvaluation(id: e.id)
            removing = nil
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

extension EduAPI {
    /// All of the teacher's evaluations in these classes, newest first (undated first, like the web).
    func fetchTeacherAllEvaluations(teacherId: String, classIds: [String]) async throws -> [EvaluationRow] {
        try await client.from("evaluations")
            .select("id, title, eval_date, start_time, end_time, type, period_label, max_score, admin_confirmed, subject_id, class_section_id, teacher_id, description, matieres(name), classes(name)")
            .eq("teacher_id", value: teacherId)
            .in("class_section_id", values: classIds)
            .order("eval_date", ascending: false, nullsFirst: true)
            .execute()
            .value
    }
}
