import SwiftUI

/// Teacher « Mes classes », like the web MesClasses: the classes the teacher teaches, ordered
/// by school progression, with the class average in each of their subjects, the class to watch
/// (lowest average) and shortcuts to Évaluations, Appel and Élèves.
struct TeacherClassesView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassCard] = []
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "mes-classes-enseignant")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct SubjectAvg: Identifiable, Hashable {
        var id: String { subjectId }
        let subjectId: String
        let subjectName: String
        let averageOn20: Double?
        let gradeCount: Int
    }

    struct ClassCard: Identifiable, Hashable {
        var id: String { classId }
        let classId: String
        let className: String
        let gradeLevel: String?
        var studentCount: Int
        var subjects: [SubjectAvg]

        /// Average over the teacher's subjects in the class (nil without grades).
        var average: Double? {
            let graded = subjects.compactMap(\.averageOn20)
            return graded.isEmpty ? nil : graded.reduce(0, +) / Double(graded.count)
        }
    }

    private var tourSteps: [CoachMarkStep] {
        var steps = [
            CoachMarkStep(id: "classes.stats", icon: "chart.bar.fill", title: "En un coup d’œil",
                          message: "Vos classes, le nombre total d’élèves et la moyenne de vos classes dans vos matières."),
        ]
        if weakest != nil {
            steps.append(CoachMarkStep(id: "classes.watch", icon: "chart.line.downtrend.xyaxis", title: "Classe à suivre",
                                       message: "La classe qui a la moyenne la plus basse. Touchez pour l’ouvrir."))
        }
        if !classes.isEmpty {
            steps.append(CoachMarkStep(id: "classes.card", icon: "rectangle.3.group", title: "Vos classes",
                                       message: "Pour chaque matière : la moyenne de classe sur 20 et le nombre de notes. Le trait au milieu marque 10/20. Touchez la carte pour ouvrir la classe."))
            steps.append(CoachMarkStep(id: "classes.actions", icon: "hand.tap.fill", title: "Raccourcis",
                                       message: "Ouvrez directement les évaluations, l’appel ou la liste des élèves de la classe."))
        }
        steps.append(CoachMarkStep(id: "classes.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                                   message: "Touchez ce bouton à tout moment pour relancer la visite."))
        return steps
    }

    private var totalStudents: Int { classes.reduce(0) { $0 + $1.studentCount } }

    private var overall: Double? {
        let all = classes.flatMap { $0.subjects.compactMap(\.averageOn20) }
        return all.isEmpty ? nil : all.reduce(0, +) / Double(all.count)
    }

    private var belowCount: Int { classes.filter { ($0.average ?? 20) < 10 }.count }

    private var weakest: ClassCard? {
        classes.filter { $0.average != nil }.min { ($0.average ?? 0) < ($1.average ?? 0) }
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
                            ForEach(Array(classes.enumerated()), id: \.element.id) { i, c in
                                card(c, first: i == 0)
                            }
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
        .navigationTitle("Mes classes")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    // MARK: - Banner

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Mes classes")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                        Text("Les classes où vous enseignez, avec la moyenne de classe dans votre matière.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("classes.help")
                }
                HStack(spacing: 8) {
                    stat("Classes", "\(classes.count)", "cette année")
                    stat("Élèves", "\(totalStudents)", "au total")
                    stat("Moyenne", overall.map { "\(Self.fmt($0))" } ?? "—",
                         belowCount > 0 ? "\(belowCount) classe\(belowCount > 1 ? "s" : "") sous 10" : "toutes classes")
                }
                .coachMarkTarget("classes.stats")

                if let w = weakest {
                    watchCard(w).coachMarkTarget("classes.watch")
                }
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
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text(value)
                    .font(.title2.weight(.bold).monospacedDigit())
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if label == "Moyenne" && value != "—" {
                    Text("/20").font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.7))
                }
            }
            Text(hint)
                .font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    private func watchCard(_ c: ClassCard) -> some View {
        let tone = Tone(c.average)
        return NavigationLink {
            ClassHubView(classId: c.classId, className: c.className)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Label("CLASSE À SUIVRE", systemImage: "chart.line.downtrend.xyaxis")
                    .font(.system(size: 11, weight: .semibold)).tracking(0.5)
                    .foregroundStyle(EduTheme.muted)
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.className)
                            .font(.title3.weight(.bold))
                            .foregroundStyle(EduTheme.ink)
                            .lineLimit(1)
                        Text("la moyenne la plus basse de vos classes")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                    Spacer(minLength: 8)
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text(Self.fmt(c.average ?? 0))
                            .font(.title2.weight(.bold).monospacedDigit())
                            .foregroundStyle(tone.text)
                        Text("/20").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                    }
                }
                Label("Ouvrir la classe", systemImage: "chevron.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.teal)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Class card

    private func card(_ c: ClassCard, first: Bool) -> some View {
        let tone = Tone(c.average)
        let short = Self.shortName(c.className)
        return VStack(spacing: 0) {
            NavigationLink {
                ClassHubView(classId: c.classId, className: c.className)
            } label: {
                VStack(alignment: .leading, spacing: 0) {
                    tone.bar.frame(height: 4)
                    HStack(alignment: .top, spacing: 12) {
                        Text(short)
                            .font(short.count > 2 ? .caption.weight(.bold) : .subheadline.weight(.bold))
                            .foregroundStyle(H.brand800)
                            .frame(width: 44, height: 44)
                            .background(H.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.className)
                                .font(.headline)
                                .foregroundStyle(EduTheme.ink)
                                .lineLimit(1)
                            Label(meta(c), systemImage: "person.2")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        Text(tone.label)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(tone.chipText)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(tone.chipBg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                    .padding([.horizontal, .top], 16)

                    VStack(spacing: 14) {
                        ForEach(c.subjects) { s in subjectRow(s) }
                    }
                    .padding(16)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .modifier(OptionalCoachMark(id: first ? "classes.card" : nil))

            Divider()
            HStack(spacing: 8) {
                footer("Évaluations", "book") {
                    TeacherEvaluationsView(initialClassId: c.classId)
                }
                footer("Appel", "checklist") {
                    TeacherAttendanceView(initialClassId: c.classId)
                }
                footer("Élèves", "graduationcap") {
                    TeacherStudentsView(initialClassId: c.classId)
                }
            }
            .padding(12)
            .modifier(OptionalCoachMark(id: first ? "classes.actions" : nil))
        }
        .modifier(HomeCardStyle())
    }

    private func meta(_ c: ClassCard) -> String {
        var s = "\(c.studentCount) élève\(c.studentCount > 1 ? "s" : "")"
        if let g = c.gradeLevel, !g.isEmpty, g != c.className { s += " · \(g)" }
        return s
    }

    private func subjectRow(_ s: SubjectAvg) -> some View {
        let t = Tone(s.averageOn20)
        let progress = s.averageOn20.map { min(1, max(0, $0 / 20)) } ?? 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(s.subjectName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                Spacer(minLength: 8)
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(s.averageOn20.map { Self.fmt($0) } ?? "—")
                        .font(.title3.weight(.bold).monospacedDigit())
                        .foregroundStyle(t.text)
                    Text("/20").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(H.slate100)
                    Capsule().fill(t.bar).frame(width: geo.size.width * progress)
                    Rectangle().fill(EduTheme.subtle.opacity(0.6))
                        .frame(width: 1)
                        .offset(x: geo.size.width / 2)
                }
            }
            .frame(height: 8)
            Text(s.gradeCount > 0
                 ? "Moyenne de classe · \(s.gradeCount) note\(s.gradeCount > 1 ? "s" : "")"
                 : "Aucune note encore")
                .font(.system(size: 11))
                .foregroundStyle(EduTheme.muted)
        }
    }

    private func footer<D: View>(_ label: String, _ icon: String, @ViewBuilder destination: @escaping () -> D) -> some View {
        NavigationLink { destination() } label: {
            Label(label, systemImage: icon)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 38)
                .foregroundStyle(.white)
                .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Tone

    private struct Tone {
        let label: String
        let text: Color
        let bar: Color
        let chipText: Color
        let chipBg: Color

        init(_ avg: Double?) {
            let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)
            guard let avg else {
                label = "Pas de notes"; text = EduTheme.subtle; bar = EduTheme.border
                chipText = EduTheme.muted; chipBg = H.slate100
                return
            }
            if avg >= 12 {
                label = "Bon niveau"; text = H.emerald; bar = Color(red: 16 / 255, green: 185 / 255, blue: 129 / 255)
                chipText = H.emerald; chipBg = H.emerald50
            } else if avg >= 10 {
                label = "Moyen"; text = H.amber; bar = Color(red: 251 / 255, green: 191 / 255, blue: 36 / 255)
                chipText = H.amber; chipBg = H.amber50
            } else {
                label = "En difficulté"; text = rose; bar = Color(red: 244 / 255, green: 63 / 255, blue: 94 / 255)
                chipText = rose; chipBg = Color(red: 255 / 255, green: 241 / 255, blue: 242 / 255)
            }
        }
    }

    // MARK: - Helpers

    static func fmt(_ v: Double) -> String { String(format: "%.2f", v) }

    /// « Terminale A » → « TA », « 6ème A » → « 6A »
    static func shortName(_ name: String) -> String {
        let parts = name.split(whereSeparator: \.isWhitespace).map(String.init)
        guard let firstPart = parts.first else { return "" }
        if parts.count == 1 { return String(firstPart.prefix(3)) }
        let first: String
        if firstPart.first?.isNumber == true {
            first = String(firstPart.prefix { $0.isNumber })
        } else {
            first = String(firstPart.prefix(firstPart.count <= 3 ? 3 : 1))
        }
        return first + String(parts.last!.prefix(2))
    }

    private static let progression = ["cp1", "cp2", "ce1", "ce2", "cm1", "cm2", "6eme", "5eme", "4eme", "3eme", "seconde", "premiere", "terminale"]

    private static func compactKey(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr_FR"))
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
    }

    /// School progression: CP → … → 6ème → … → Terminale, then by name.
    static func gradeRank(name: String, gradeLevel: String?) -> Int {
        for key in [gradeLevel, name].compactMap({ $0 }).map(compactKey) {
            if let i = progression.firstIndex(where: { key == $0 || key.hasPrefix($0) }) { return i }
        }
        return progression.count + 1
    }

    // MARK: - Loading

    private func load() async {
        guard let tid = auth.userId else { ready = true; return }
        do {
            let api = EduAPI()
            let rows = try await api.fetchTeachingAssignments(teacherId: tid)
            var grouped: [String: ClassCard] = [:]
            var names: [String: [String: String]] = [:]
            for row in rows {
                let classId = row.classSectionId
                let subjectId = row.subjectId ?? row.matieres?.id ?? row.id
                if grouped[classId] == nil {
                    grouped[classId] = ClassCard(classId: classId, className: row.classes?.name ?? "Classe",
                                                 gradeLevel: row.classes?.gradeLevel, studentCount: 0, subjects: [])
                }
                names[classId, default: [:]][subjectId] = row.matieres?.name ?? "Matière"
            }

            let stats = try await api.fetchTeacherClassStats(classIds: Array(grouped.keys))
            var avg: [String: TeacherClassStatsPayload.Average] = [:]
            for a in stats.averages { avg["\(a.classId)|\(a.subjectId)"] = a }

            classes = grouped.values.map { c in
                var next = c
                next.studentCount = stats.counts[c.classId] ?? 0
                next.subjects = (names[c.classId] ?? [:]).map { sid, sname in
                    let a = avg["\(c.classId)|\(sid)"]
                    return SubjectAvg(subjectId: sid, subjectName: sname, averageOn20: a?.avg, gradeCount: a?.n ?? 0)
                }
                .sorted { $0.subjectName.localizedCaseInsensitiveCompare($1.subjectName) == .orderedAscending }
                return next
            }
            .sorted { a, b in
                let ra = Self.gradeRank(name: a.className, gradeLevel: a.gradeLevel)
                let rb = Self.gradeRank(name: b.className, gradeLevel: b.gradeLevel)
                if ra != rb { return ra < rb }
                return a.className.localizedStandardCompare(b.className) == .orderedAscending
            }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }
}

/// Puts a coach-mark target only on the first card.
private struct OptionalCoachMark: ViewModifier {
    let id: String?
    func body(content: Content) -> some View {
        if let id { content.coachMarkTarget(id) } else { content }
    }
}
