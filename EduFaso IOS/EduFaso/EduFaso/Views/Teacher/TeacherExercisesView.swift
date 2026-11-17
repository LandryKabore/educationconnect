import SwiftUI
import Supabase

/// Teacher « Exercices de maison », like the web ExercicesMaison: per class, the homework given in
/// lessons (cahier « travail à faire ») and the exercises created as evaluations, with their due
/// date and a countdown. Create, edit, grade (graded exercises) and remove.
struct TeacherExercisesView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var items: [Homework] = []
    @State private var selectedId: String?
    @State private var showPast = false
    @State private var ready = false
    @State private var error: String?
    @State private var defaultPeriod = "Trimestre 1"

    @State private var newFor: ClassRow?
    @State private var editing: Homework?
    @State private var removing: Homework?

    @State private var tour = TabTour(key: "exercices-maison-enseignant")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)
    private let rose50 = Color(red: 255 / 255, green: 241 / 255, blue: 242 / 255)

    struct ClassRow: Identifiable, Hashable {
        var id: String { classId }
        let classId: String
        let className: String
        let gradeLevel: String?
        var subjects: [Subject]
        var roster: Int
    }

    struct Subject: Hashable, Identifiable { let id: String; let name: String }

    /// One homework item, whether created as an exercise or written in a lesson.
    struct Homework: Identifiable, Hashable {
        enum Source { case exercise, lesson }
        var id: String { (source == .exercise ? "e-" : "c-") + itemId }
        let source: Source
        let itemId: String
        let classId: String
        let subjectId: String
        let subjectName: String
        let title: String
        let details: String?
        let due: String?
        let given: String
        // exercise only
        var period: String?
        var maxScore: Double?
        var graded: Int = 0
        var evaluation: EvaluationRow?
        // lesson only
        var hasContent = false

        static func == (a: Homework, b: Homework) -> Bool { a.id == b.id && a.due == b.due && a.title == b.title && a.graded == b.graded }
        func hash(into h: inout Hasher) { h.combine(id) }
    }

    private var today: String { EduDates.day() }
    private func isUpcoming(_ h: Homework) -> Bool { h.due.map { $0 >= today } ?? true }

    private var selected: ClassRow? { classes.first { $0.classId == selectedId } ?? classes.first }
    private var classItems: [Homework] { items.filter { $0.classId == selected?.classId } }
    private var upcomingCount: Int { classItems.filter(isUpcoming).count }
    private var shown: [Homework] {
        classItems
            .filter { showPast ? !isUpcoming($0) : isUpcoming($0) }
            .sorted { a, b in
                showPast ? (a.due ?? "") > (b.due ?? "") : (a.due ?? "9999") < (b.due ?? "9999")
            }
    }
    private var totalUpcoming: Int { items.filter(isUpcoming).count }
    private var dueSoon: Int {
        items.filter { h in
            guard let d = h.due, d >= today else { return false }
            return (Self.daysBetween(today, d) ?? 99) <= 2
        }.count
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ex.stats", icon: "chart.bar.fill", title: "En un coup d’œil",
                          message: "Les exercices à venir dans vos classes, et ceux à rendre dans les 2 jours."),
            CoachMarkStep(id: "ex.classes", icon: "rectangle.3.group", title: "Choisir la classe",
                          message: "Touchez une classe. Le chiffre indique ses exercices à venir."),
            CoachMarkStep(id: "ex.view", icon: "calendar", title: "À venir ou passés",
                          message: "Passez des exercices à venir à ceux dont la date est passée."),
            CoachMarkStep(id: "ex.new", icon: "plus", title: "Nouvel exercice",
                          message: "Donnez un travail à faire et sa date. Les élèves et les parents le voient avec un compte à rebours. Il peut être noté ou non."),
            CoachMarkStep(id: "ex.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
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
                            classChips.coachMarkTarget("ex.classes")
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
        .navigationTitle("Exercices de maison")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(item: $newFor) { c in
            ExerciseFormSheet(classRow: c, defaultPeriod: defaultPeriod, editing: nil) { Task { await load() } }
        }
        .sheet(item: $editing) { h in
            if h.source == .lesson {
                LessonHomeworkSheet(item: h) { Task { await load() } }
            } else if let c = classes.first(where: { $0.classId == h.classId }) {
                ExerciseFormSheet(classRow: c, defaultPeriod: defaultPeriod, editing: h) { Task { await load() } }
            }
        }
        .confirmationDialog(
            removing?.source == .lesson ? "Retirer ce travail du cahier de textes ?" : "Supprimer « \(removing?.title ?? "") » ?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible
        ) {
            Button(removing?.source == .lesson ? "Retirer" : "Supprimer", role: .destructive) {
                if let h = removing { Task { await remove(h) } }
            }
            Button("Annuler", role: .cancel) {}
        }
    }

    // MARK: - Banner

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Exercices de maison")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                        Text("Le travail à faire à la maison et sa date. Les élèves et les parents le voient avec un compte à rebours.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("ex.help")
                }
                HStack(spacing: 8) {
                    stat("À venir", "\(totalUpcoming)", "dans vos classes")
                    stat("Bientôt", "\(dueSoon)", "sous 2 jours")
                    stat("Classes", "\(classes.count)", "où vous enseignez")
                }
                .coachMarkTarget("ex.stats")
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
                    let n = items.filter { $0.classId == c.classId && isUpcoming($0) }.count
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { selectedId = c.classId }
                    } label: {
                        HStack(spacing: 8) {
                            Circle().fill(TeacherStudentsView.classColor(id: c.classId, name: c.className)).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(c.className).font(.subheadline.weight(.semibold)).lineLimit(1)
                                Text(c.subjects.map(\.name).joined(separator: ", "))
                                    .font(.system(size: 10)).lineLimit(1)
                                    .foregroundStyle(on ? .white.opacity(0.85) : EduTheme.muted)
                            }
                            if n > 0 {
                                Text("\(n)")
                                    .font(.system(size: 11, weight: .bold).monospacedDigit())
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .foregroundStyle(on ? EduTheme.teal : EduTheme.muted)
                                    .background(on ? .white : H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
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

    // MARK: - Class homework

    private func classCard(_ c: ClassRow) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.className).font(.headline).foregroundStyle(EduTheme.ink)
                        Text("\(c.roster) élèves · \(classItems.count) exercice\(classItems.count > 1 ? "s" : "")")
                            .font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    Spacer()
                    Button { newFor = c } label: {
                        Label("Nouvel exercice", systemImage: "plus")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 38)
                            .foregroundStyle(.white)
                            .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .coachMarkTarget("ex.new")
                }
                HStack(spacing: 2) {
                    segment("À venir", upcomingCount, on: !showPast) { showPast = false }
                    segment("Passés", classItems.count - upcomingCount, on: showPast) { showPast = true }
                }
                .padding(2)
                .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .coachMarkTarget("ex.view")
            }
            .padding(16)
            Divider()

            if shown.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "book.closed").font(.title2).foregroundStyle(EduTheme.borderStrong)
                    Text(showPast ? "Aucun exercice passé." : "Aucun exercice à venir pour cette classe.")
                        .font(.subheadline).foregroundStyle(EduTheme.muted)
                }
                .frame(maxWidth: .infinity)
                .padding(28)
            } else {
                ForEach(shown) { h in row(h, roster: c.roster) }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func segment(_ label: String, _ n: Int, on: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.15)) { action() }
        } label: {
            HStack(spacing: 6) {
                Text(label).font(.caption.weight(.semibold))
                Text("\(n)")
                    .font(.system(size: 10, weight: .bold).monospacedDigit())
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(on ? Color(red: 204 / 255, green: 251 / 255, blue: 241 / 255) : EduTheme.border,
                                in: RoundedRectangle(cornerRadius: 3, style: .continuous))
            }
            .frame(maxWidth: .infinity, minHeight: 32)
            .foregroundStyle(on ? H.brand800 : EduTheme.muted)
            .background(on ? .white : .clear, in: RoundedRectangle(cornerRadius: EduTheme.radius - 1, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func row(_ h: Homework, roster: Int) -> some View {
        let days = h.due.flatMap { Self.daysBetween(today, $0) }
        let urgent = days.map { $0 >= 0 && $0 <= 1 } ?? false
        let countdown: String = {
            guard let days else { return "Sans date" }
            if days < 0 { return "Il y a \(-days) j" }
            if days == 0 { return "Aujourd’hui" }
            if days == 1 { return "Demain" }
            return "Dans \(days) jours"
        }()
        let chipFg: Color = days == nil || (days ?? 0) < 0 ? EduTheme.muted : (urgent ? rose : H.emerald)
        let chipBg: Color = days == nil || (days ?? 0) < 0 ? H.slate100 : (urgent ? Color(red: 255 / 255, green: 228 / 255, blue: 230 / 255) : H.emerald50)

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 0) {
                    if let due = h.due, let d = EduDates.parseDay(due) {
                        Text(Self.format(d, "d")).font(.title3.weight(.bold).monospacedDigit())
                        Text(Self.format(d, "MMM").uppercased()).font(.system(size: 10, weight: .semibold))
                    } else {
                        Image(systemName: "calendar.badge.clock").font(.title3).foregroundStyle(EduTheme.subtle)
                    }
                }
                .frame(width: 52, height: 48)
                .foregroundStyle(urgent ? rose : EduTheme.ink)
                .background(urgent ? rose50 : H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(h.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(2)
                    Text(meta(h, roster: roster))
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(2)
                }
                Spacer(minLength: 4)
                Text(countdown)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(chipFg)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(chipBg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    .fixedSize()
            }
            HStack(spacing: 8) {
                Spacer()
                if h.source == .exercise, let e = h.evaluation {
                    NavigationLink {
                        GradeEntryView(evaluation: e, recordedBy: auth.userId)
                    } label: {
                        Text("Noter")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 32)
                            .foregroundStyle(EduTheme.ink)
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                iconButton("pencil", label: "Modifier \(h.title)") { editing = h }
                iconButton("trash", label: "Supprimer \(h.title)", danger: true) { removing = h }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .overlay(alignment: .top) { Divider().opacity(0.6) }
    }

    private func iconButton(_ icon: String, label: String, danger: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(danger ? rose : EduTheme.muted)
                .frame(width: 34, height: 32)
                .background(danger ? rose50 : H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func meta(_ h: Homework, roster: Int) -> String {
        var s = "\(h.subjectName) · "
        s += h.source == .lesson ? "donné en cours le \(Self.dayLabel(h.given))" : "exercice créé le \(Self.dayLabel(h.given))"
        if h.source == .exercise, h.graded > 0 { s += " · \(h.graded)/\(roster) notes" }
        return s
    }

    // MARK: - Helpers

    static func daysBetween(_ from: String, _ to: String) -> Int? {
        guard let a = EduDates.parseDay(from), let b = EduDates.parseDay(to) else { return nil }
        return Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: a), to: Calendar.current.startOfDay(for: b)).day
    }

    static func format(_ d: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = pattern
        return f.string(from: d)
    }

    /// « mar. 3 nov. »
    static func dayLabel(_ iso: String) -> String {
        guard let d = EduDates.parseDay(String(iso.prefix(10))) else { return iso }
        return format(d, "EEE d MMM")
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
                var c = map[cid] ?? ClassRow(classId: cid, className: r.classes?.name ?? "Classe",
                                             gradeLevel: r.classes?.gradeLevel, subjects: [], roster: 0)
                let sid = r.subjectId ?? r.matieres?.id ?? r.id
                if !c.subjects.contains(where: { $0.id == sid }) { c.subjects.append(Subject(id: sid, name: r.matieres?.name ?? "Matière")) }
                map[cid] = c
            }
            var ordered = map.values.sorted { a, b in
                let ra = TeacherClassesView.gradeRank(name: a.className, gradeLevel: a.gradeLevel)
                let rb = TeacherClassesView.gradeRank(name: b.className, gradeLevel: b.gradeLevel)
                if ra != rb { return ra < rb }
                return a.className.localizedStandardCompare(b.className) == .orderedAscending
            }
            let classIds = ordered.map(\.classId)
            guard !classIds.isEmpty else { classes = []; items = []; error = nil; ready = true; return }

            async let evalsTask = api.fetchTeacherExercises(teacherId: tid, classIds: classIds)
            async let lessonsTask = api.fetchTeacherLessonHomework(teacherId: tid)
            async let statsTask = api.fetchTeacherClassStats(classIds: classIds)
            let (evals, lessons, stats) = try await (evalsTask, lessonsTask, statsTask)
            let graded = evals.isEmpty ? [:] : try await api.fetchGradeCounts(evaluationIds: evals.map(\.row.id))
            for i in ordered.indices { ordered[i].roster = stats.counts[ordered[i].classId] ?? 0 }

            let ids = Set(classIds)
            var list: [Homework] = evals.map { e in
                Homework(source: .exercise, itemId: e.row.id, classId: e.row.classSectionId ?? "",
                         subjectId: e.row.subjectId ?? "", subjectName: e.row.matieres?.name ?? "Matière",
                         title: e.row.title ?? "Exercice", details: e.row.details, due: e.row.evalDate.map { String($0.prefix(10)) },
                         given: String(e.createdAt.prefix(10)), period: e.row.periodLabel,
                         maxScore: e.row.maxScore ?? 20, graded: graded[e.row.id] ?? 0, evaluation: e.row)
            }
            list += lessons.compactMap { r in
                guard let hw = r.homework?.trimmingCharacters(in: .whitespacesAndNewlines), !hw.isEmpty,
                      let cid = r.class_section_id, ids.contains(cid) else { return nil }
                return Homework(source: .lesson, itemId: r.id, classId: cid, subjectId: r.subject_id ?? "",
                                subjectName: r.matieres?.name ?? "Matière", title: hw, details: nil,
                                due: r.homework_due.map { String($0.prefix(10)) }, given: String(r.entry_date.prefix(10)),
                                hasContent: !(r.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            classes = ordered
            items = list
            if selectedId == nil || !ids.contains(selectedId ?? "") { selectedId = ordered.first?.classId }
            if let ctx = try? await api.fetchAttendancePeriodContext() {
                let base = AttendancePeriodBuilder.build(yearStart: ctx.start, yearEnd: ctx.end, custom: ctx.custom)
                if let cur = ParentHomeLoader.currentTrimester(from: base)?.label,
                   ["Trimestre 1", "Trimestre 2", "Trimestre 3"].contains(cur) { defaultPeriod = cur }
            }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    private func remove(_ h: Homework) async {
        do {
            let api = EduAPI()
            switch h.source {
            case .lesson:
                // keep the lesson notes, drop only the homework (or the whole entry if it had nothing else)
                if h.hasContent { try await api.updateLessonHomework(id: h.itemId, homework: nil, due: nil) }
                else { try await api.deleteCahierEntry(id: h.itemId) }
            case .exercise:
                try await api.deleteEvaluation(id: h.itemId)
            }
            removing = nil
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - New / edit exercise

private struct ExerciseFormSheet: View {
    let classRow: TeacherExercisesView.ClassRow
    let defaultPeriod: String
    let editing: TeacherExercisesView.Homework?
    var onSaved: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var subjectId = ""
    @State private var period = "Trimestre 1"
    @State private var title = ""
    @State private var details = ""
    @State private var hasDate = false
    @State private var due = Date()
    @State private var graded = false
    @State private var maxScore = "20"
    @State private var saving = false
    @State private var error: String?

    /// A new exercise that is not graded is plain homework (no trimester, no grade sheet).
    private var plainHomework: Bool { editing == nil && !graded }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Classe ").foregroundStyle(EduTheme.muted) + Text(classRow.className).bold()
                }
                if editing == nil {
                    Section {
                        Toggle(isOn: $graded) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Noté")
                                Text(graded ? "Une note sera saisie pour chaque élève." : "Non noté : les élèves voient seulement le travail et la date.")
                                    .font(.caption).foregroundStyle(EduTheme.muted)
                            }
                        }
                        .tint(EduTheme.teal)
                    }
                }
                Section {
                    if classRow.subjects.count > 1 {
                        Picker("Matière", selection: $subjectId) {
                            ForEach(classRow.subjects) { s in Text(s.name).tag(s.id) }
                        }
                    }
                    if !plainHomework {
                        Picker("Trimestre", selection: $period) {
                            ForEach(["Trimestre 1", "Trimestre 2", "Trimestre 3"], id: \.self) { Text($0).tag($0) }
                        }
                    }
                    TextField("Titre (ex. Exercices page 42)", text: $title)
                    Toggle("Pour quand ?", isOn: $hasDate).tint(EduTheme.teal)
                    if hasDate {
                        DatePicker("Date", selection: $due, in: (editing == nil ? Calendar.current.startOfDay(for: Date()) : .distantPast)..., displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "fr_FR"))
                    }
                    if !plainHomework {
                        HStack {
                            Text("Note maximale")
                            Spacer()
                            TextField("20", text: $maxScore)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 70)
                        }
                    }
                }
                Section("Description (facultatif)") {
                    TextField("Ex. Exercices 1 à 4, à présenter en classe…", text: $details, axis: .vertical)
                        .lineLimit(3...6)
                }
                if let error {
                    Section { Text(error).foregroundStyle(EduTheme.fasoRed) }
                }
            }
            .navigationTitle(editing == nil ? "Nouvel exercice" : "Modifier l’exercice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Enregistrement…" : "Enregistrer") { Task { await save() } }
                        .fontWeight(.semibold)
                        .disabled(saving)
                }
            }
        }
        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .onAppear(perform: fill)
    }

    private func fill() {
        subjectId = editing?.subjectId ?? classRow.subjects.first?.id ?? ""
        period = editing?.period ?? defaultPeriod
        title = editing?.title ?? ""
        details = editing?.details ?? ""
        if let d = editing?.due.flatMap(EduDates.parseDay) { hasDate = true; due = d }
        if let m = editing?.maxScore { maxScore = m.rounded() == m ? String(Int(m)) : String(m) }
    }

    private func save() async {
        guard let tid = auth.userId else { return }
        guard !subjectId.isEmpty else { error = "Choisissez une matière"; return }
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "Donnez un titre"; return }
        let d = details.trimmingCharacters(in: .whitespacesAndNewlines)
        let date = hasDate ? EduDates.day(due) : nil
        saving = true
        defer { saving = false }
        do {
            let api = EduAPI()
            if plainHomework {
                // saved like the « travail à faire » of the cahier: shown in Exercices de maison, never graded
                try await api.insertCahier(CahierInsert(
                    class_section_id: classRow.classId, subject_id: subjectId, entry_date: EduDates.day(),
                    content: "", homework: [t, d].filter { !$0.isEmpty }.joined(separator: "\n"), homework_due: date))
            } else {
                guard let max = Double(maxScore.replacingOccurrences(of: ",", with: ".")), max > 0 else {
                    error = "Note maximale invalide"; return
                }
                let payload = ExercisePayload(class_section_id: classRow.classId, subject_id: subjectId, teacher_id: tid,
                                              period_label: period, type: "devoir", title: t, description: d.isEmpty ? nil : d,
                                              max_score: max, eval_date: date, start_time: nil, end_time: nil)
                if let editing { try await api.updateExercise(id: editing.itemId, payload) }
                else { try await api.insertExercise(payload) }
            }
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Edit lesson homework

/// Edit the « travail à faire » of a lesson (text and due date), without touching the lesson content.
private struct LessonHomeworkSheet: View {
    let item: TeacherExercisesView.Homework
    var onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var hasDate = false
    @State private var due = Date()
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("\(item.subjectName) · donné en cours le \(TeacherExercisesView.dayLabel(item.given))")
                        .font(.subheadline).foregroundStyle(EduTheme.muted)
                }
                Section("Travail à faire") {
                    TextField("Travail à faire", text: $text, axis: .vertical).lineLimit(3...8)
                }
                Section {
                    Toggle("Pour quand ?", isOn: $hasDate).tint(EduTheme.teal)
                    if hasDate {
                        DatePicker("Date", selection: $due, in: (EduDates.parseDay(item.given) ?? .distantPast)..., displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "fr_FR"))
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(EduTheme.fasoRed) }
                }
            }
            .navigationTitle("Modifier l’exercice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Enregistrement…" : "Enregistrer") { Task { await save() } }
                        .fontWeight(.semibold)
                        .disabled(saving)
                }
            }
        }
        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .onAppear {
            text = item.title
            if let d = item.due.flatMap(EduDates.parseDay) { hasDate = true; due = d }
        }
    }

    private func save() async {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "Écrivez le travail à faire"; return }
        saving = true
        defer { saving = false }
        do {
            try await EduAPI().updateLessonHomework(id: item.itemId, homework: t, due: hasDate ? EduDates.day(due) : nil)
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - API

nonisolated struct ExercisePayload: Encodable {
    let class_section_id: String
    let subject_id: String
    let teacher_id: String
    let period_label: String
    let type: String
    let title: String
    let description: String?
    let max_score: Double
    let eval_date: String?
    let start_time: String?
    let end_time: String?

    enum CodingKeys: String, CodingKey {
        case class_section_id, subject_id, teacher_id, period_label, type, title, description, max_score, eval_date, start_time, end_time
    }

    // send nulls explicitly so an edit can clear the date / description
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(class_section_id, forKey: .class_section_id)
        try c.encode(subject_id, forKey: .subject_id)
        try c.encode(teacher_id, forKey: .teacher_id)
        try c.encode(period_label, forKey: .period_label)
        try c.encode(type, forKey: .type)
        try c.encode(title, forKey: .title)
        try c.encode(description, forKey: .description)
        try c.encode(max_score, forKey: .max_score)
        try c.encode(eval_date, forKey: .eval_date)
        try c.encode(start_time, forKey: .start_time)
        try c.encode(end_time, forKey: .end_time)
    }
}

extension EduAPI {
    struct TeacherExercise {
        let row: EvaluationRow
        let createdAt: String
    }

    struct LessonHomeworkRow: Decodable {
        let id: String
        let class_section_id: String?
        let subject_id: String?
        let creneau_id: String?
        let entry_date: String
        let content: String?
        let homework: String?
        let homework_due: String?
        let matieres: NamedEntity?
    }

    func fetchTeacherExercises(teacherId: String, classIds: [String]) async throws -> [TeacherExercise] {
        let data = try await client.from("evaluations")
            .select("id, title, eval_date, start_time, end_time, type, period_label, max_score, admin_confirmed, subject_id, class_section_id, teacher_id, description, created_at, matieres(name), classes(name)")
            .eq("teacher_id", value: teacherId)
            .eq("type", value: "devoir")
            .in("class_section_id", values: classIds)
            .execute()
            .data
        struct Created: Decodable { let id: String; let created_at: String? }
        let rows = try JSONDecoder().decode([EvaluationRow].self, from: data)
        let created = Dictionary((try JSONDecoder().decode([Created].self, from: data)).map { ($0.id, $0.created_at ?? "") },
                                 uniquingKeysWith: { a, _ in a })
        return rows.map { TeacherExercise(row: $0, createdAt: created[$0.id] ?? "") }
    }

    func fetchTeacherLessonHomework(teacherId: String) async throws -> [LessonHomeworkRow] {
        try await client.from("cahier_entrees")
            .select("id, class_section_id, subject_id, creneau_id, entry_date, content, homework, homework_due, matieres(name)")
            .eq("teacher_id", value: teacherId)
            .not("homework", operator: .is, value: "null")
            .order("entry_date", ascending: false)
            .limit(500)
            .execute()
            .value
    }

    func insertExercise(_ p: ExercisePayload) async throws {
        try await client.from("evaluations").insert(p).execute()
    }

    func updateExercise(id: String, _ p: ExercisePayload) async throws {
        try await client.from("evaluations").update(p).eq("id", value: id).execute()
    }

    func deleteEvaluation(id: String) async throws {
        try await client.from("evaluations").delete().eq("id", value: id).execute()
    }

    func deleteCahierEntry(id: String) async throws {
        try await client.from("cahier_entrees").delete().eq("id", value: id).execute()
    }

    func updateLessonHomework(id: String, homework: String?, due: String?) async throws {
        struct P: Encodable {
            let homework: String?
            let homework_due: String?
            func encode(to e: Encoder) throws {
                var c = e.container(keyedBy: K.self)
                try c.encode(homework, forKey: .homework)
                try c.encode(homework_due, forKey: .homework_due)
            }
            enum K: String, CodingKey { case homework, homework_due }
        }
        try await client.from("cahier_entrees").update(P(homework: homework, homework_due: due)).eq("id", value: id).execute()
    }
}
