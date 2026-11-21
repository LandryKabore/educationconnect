import SwiftUI

/// Exercices de maison (student and parent), same as the web: exercises set as evaluations
/// (type devoir, may be graded) plus the homework written in the lessons' cahier de textes,
/// in one timeline grouped by due day, with tabs À faire / Date passée / Notés and subject chips.
struct ExercisesBoardView: View {
    @EnvironmentObject private var auth: AuthViewModel
    var studentIdOverride: String? = nil
    /// Parent view: the child's first name, shown in the titles.
    var childName: String? = nil

    struct Item: Identifiable, Hashable {
        let id: String
        let subject: String
        let title: String
        /// Full text when the title is shortened, or the exercise description.
        let body: String
        /// « Donné en cours le … » for lesson homework.
        let given: String?
        /// yyyy-MM-dd or nil
        let due: String?
        let fromLesson: Bool
    }

    private enum Tab: String, CaseIterable { case todo, past, graded }

    @State private var items: [Item] = []
    @State private var scores: [String: EduAPI.EvaluationScore] = [:]
    @State private var className = ""
    @State private var tab: Tab = .todo
    @State private var subject = ""
    @State private var open: String?
    @State private var loading = true
    @State private var notEnrolled = false
    @State private var error: String?

    @State private var tour = TabTour(key: "exercices")
    @State private var ownCoach = CoachMarkRegistry()
    @Environment(CoachMarkRegistry.self) private var outerCoach: CoachMarkRegistry?
    private var coach: CoachMarkRegistry { outerCoach ?? ownCoach }

    private static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    private static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)
    private static let rose = Color(red: 225 / 255, green: 29 / 255, blue: 72 / 255)
    private static let amber = Color(red: 217 / 255, green: 119 / 255, blue: 6 / 255)
    private static let emerald = Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)
    private static let track = Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255)

    private var studentId: String? { studentIdOverride ?? auth.userId }
    private var title: String { childName.map { "Exercices de maison \(ParentHomeView.de($0))" } ?? "Mes exercices de maison" }

    private func status(_ i: Item) -> Tab {
        if scores[i.id] != nil { return .graded }
        if let d = i.due, ExamsBoardView.daysUntil(d) < 0 { return .past }
        return .todo
    }
    private func count(_ t: Tab) -> Int { items.filter { status($0) == t }.count }

    private var subjectsInTab: [(name: String, count: Int)] {
        var m: [String: Int] = [:]
        for i in items where status(i) == tab { m[i.subject, default: 0] += 1 }
        return m.keys.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }.map { ($0, m[$0] ?? 0) }
    }

    private var shown: [Item] {
        items.filter { status($0) == tab && (subject.isEmpty || $0.subject == subject) }
            .sorted { a, b in
                tab == .todo ? (a.due ?? "9999") < (b.due ?? "9999") : (a.due ?? "") > (b.due ?? "")
            }
    }

    private var groups: [(key: String, due: String?, items: [Item])] {
        var out: [(key: String, due: String?, items: [Item])] = []
        for i in shown {
            let key = i.due ?? "none"
            if let idx = out.firstIndex(where: { $0.key == key }) { out[idx].items.append(i) }
            else { out.append((key, i.due, [i])) }
        }
        return out
    }

    private var next: Item? {
        items.filter { status($0) == .todo && $0.due != nil }.min { ($0.due ?? "") < ($1.due ?? "") }
    }

    private var tourSteps: [CoachMarkStep] {
        childName == nil ? studentTourSteps : parentTourSteps
    }

    /// Student: "tu", no child switcher.
    private var studentTourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(
                id: "ex.stats", icon: "chart.bar.fill",
                title: "En un coup d’œil",
                message: "Tes exercices à faire, ceux qui sont notés et ceux dont la date est passée."
            ),
            CoachMarkStep(
                id: "ex.next", icon: "calendar.badge.clock",
                title: "Prochain exercice",
                message: "Le prochain travail à préparer, avec le nombre de jours qu’il te reste."
            ),
            CoachMarkStep(
                id: "ex.tabs", icon: "line.3.horizontal.decrease.circle",
                title: "Trier tes exercices",
                message: "À faire, date passée ou notés. Touche une matière, en dessous, pour ne garder qu’elle."
            ),
            CoachMarkStep(
                id: "ex.timeline", icon: "list.bullet",
                title: "Jour par jour",
                message: "Tes exercices rangés par date à rendre. « Donné en cours » : ton professeur l’a noté dans le cahier de textes. Touche « Voir tout » pour lire la consigne entière."
            ),
            CoachMarkStep(
                id: "ex.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: "Touche ce bouton à tout moment pour relancer la visite."
            ),
        ]
    }

    private var parentTourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(
                id: "child.switcher", icon: "arrow.left.arrow.right",
                title: "Changer d’enfant",
                message: "Vous avez plusieurs enfants. Essayez maintenant : touchez le prénom d’un autre enfant dans la barre en haut.",
                requiresAction: true,
                doneMessage: "Voilà ! La page affiche maintenant les exercices de cet enfant."
            ),
            CoachMarkStep(
                id: "ex.stats", icon: "chart.bar.fill",
                title: "En un coup d’œil",
                message: "Exercices à faire, exercices notés et ceux dont la date est passée."
            ),
            CoachMarkStep(
                id: "ex.next", icon: "calendar.badge.clock",
                title: "Prochain exercice",
                message: "Le prochain travail à préparer, avec le compte à rebours."
            ),
            CoachMarkStep(
                id: "ex.tabs", icon: "line.3.horizontal.decrease.circle",
                title: "Trier les exercices",
                message: "À faire, date passée ou notés. Les matières, en dessous, filtrent la liste."
            ),
            CoachMarkStep(
                id: "ex.timeline", icon: "list.bullet",
                title: "Jour par jour",
                message: "Les exercices rangés par date à rendre. « Donné en cours » vient du cahier de textes ; touchez « Voir tout » pour lire la consigne entière."
            ),
            CoachMarkStep(
                id: "ex.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: "Touchez ce bouton à tout moment pour relancer la visite."
            ),
        ]
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 20) {
                                banner
                                if notEnrolled {
                                    emptyCard(childName == nil ? "Tu n’es pas encore inscrit dans une classe." : "Cet élève n’est pas encore inscrit dans une classe.")
                                } else if items.isEmpty {
                                    emptyCard("Aucun exercice de maison pour le moment.")
                                } else {
                                    VStack(alignment: .leading, spacing: 10) {
                                        tabs
                                        if subjectsInTab.count > 1 { subjectChips }
                                    }
                                    .coachMarkTarget("ex.tabs")
                                    Text("À préparer pour la classe : rien n’est à rendre en ligne. Si un exercice est noté, la note apparaît dans \(childName == nil ? "« Mes notes »" : "« Notes »").")
                                        .font(.caption)
                                        .foregroundStyle(EduTheme.muted)
                                        .padding(12)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(Self.track, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                                    timeline.coachMarkTarget("ex.timeline")
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                            .padding(.bottom, 32)
                        }
                        .refreshable { await load() }
                        .tabTour(tour, registry: coach, scroller: proxy)
                    }
                    .onAppear { tour.autoStartOnce({ tourSteps }, registry: coach) }
                }
            }
        }
        .environment(coach)
        .premiumTitle(childName.map { "Exercices \(ParentHomeView.de($0))" } ?? "Mes exercices")
        .task(id: studentIdOverride) { await load() }
        .onChange(of: studentIdOverride) { _, _ in
            guard tour.showing, tour.steps.indices.contains(tour.index),
                  tour.steps[tour.index].requiresAction else { return }
            tour.steps[tour.index].doneMessage = "Voilà ! La page affiche maintenant les exercices \(childName.map { ParentHomeView.de($0) } ?? "de cet enfant"). Le bouton plein, en haut, montre toujours l’enfant affiché."
            tour.actionDone = true
        }
        .onChange(of: tab) { _, _ in
            if !subject.isEmpty, !subjectsInTab.contains(where: { $0.name == subject }) { subject = "" }
        }
    }

    // MARK: Banner

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Travail à la maison" + (className.isEmpty ? "" : " · Classe \(className)"))
                            .font(.caption.weight(.semibold))
                            .tracking(1.4)
                            .textCase(.uppercase)
                            .foregroundStyle(.white.opacity(0.7))
                        Text(title)
                            .font(.system(size: 26, weight: .bold))
                            .tracking(-0.4)
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("À préparer et présenter en classe — rien n’est à rendre en ligne.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    TourHelpButton { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("ex.help")
                }
                HStack(alignment: .top, spacing: 10) {
                    let todo = count(.todo)
                    bannerStat("À faire", "\(todo)", todo > 0 ? "exercice\(todo > 1 ? "s" : "") à venir" : "rien pour l’instant")
                    bannerStat("Notés", "\(count(.graded))", "voir dans \(childName == nil ? "Mes notes" : "Notes")")
                    bannerStat("Échéance passée", "\(count(.past))", "date dépassée")
                }
                .coachMarkTarget("ex.stats")
                nextCard.coachMarkTarget("ex.next")
            }
            .padding(20)
            HStack(spacing: 0) {
                EduTheme.fasoRed
                EduTheme.fasoYellow
                EduTheme.fasoGreen
            }
            .frame(height: 4)
            .accessibilityHidden(true)
        }
        .background {
            ZStack {
                LinearGradient(colors: [Self.brand800, EduTheme.teal, Self.brand600], startPoint: .topLeading, endPoint: .bottomTrailing)
                Circle().fill(.white.opacity(0.06)).frame(width: 260, height: 260).offset(x: 150, y: -120)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Self.brand800.opacity(0.25), radius: 14, y: 8)
    }

    private func bannerStat(_ label: String, _ value: String, _ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
            Text(hint)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .padding(10)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    @ViewBuilder private var nextCard: some View {
        if let next, let due = next.due {
            let n = ExamsBoardView.daysUntil(due)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("PROCHAIN EXERCICE", systemImage: "calendar.badge.clock")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255), in: RoundedRectangle(cornerRadius: EduTheme.radius))
                    Spacer()
                    Text(ExamsBoardView.countdown(n))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(n <= 1 ? Self.rose : EduTheme.muted)
                }
                Text(next.title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(2)
                Text("\(next.subject) · pour le \(ExamsBoardView.format(due, "EEEE d MMMM"))")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            }
            .padding(16)
            .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("PROCHAIN EXERCICE").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.white.opacity(0.7))
                Text("Rien de prévu pour le moment").font(.headline).foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
    }

    // MARK: Filters

    private var tabs: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases, id: \.self) { t in
                let active = t == tab
                Button {
                    withAnimation(.snappy(duration: 0.2)) { tab = t }
                } label: {
                    HStack(spacing: 6) {
                        Text(t == .todo ? "À faire" : t == .past ? "Date passée" : "Notés")
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Text("\(count(t))")
                            .font(.caption.weight(.bold).monospacedDigit())
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background((active ? Color.white.opacity(0.2) : Self.track), in: RoundedRectangle(cornerRadius: 3))
                    }
                    .foregroundStyle(active ? .white : EduTheme.ink.opacity(0.8))
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background {
                        if active { RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).fill(EduTheme.teal) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(.white, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1))
        .sensoryFeedback(.selection, trigger: tab)
    }

    private var subjectChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("Toutes", count: subjectsInTab.reduce(0) { $0 + $1.count }, dot: nil, on: subject.isEmpty) { subject = "" }
                ForEach(subjectsInTab, id: \.name) { s in
                    chip(s.name, count: s.count, dot: SubjectPalette.swatch(for: s.name).border, on: subject == s.name) {
                        subject = subject == s.name ? "" : s.name
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func chip(_ text: String, count: Int, dot: Color?, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let dot { Circle().fill(dot).frame(width: 8, height: 8) }
                Text(text).font(.subheadline.weight(.semibold))
                Text("\(count)").font(.caption.monospacedDigit()).foregroundStyle(on ? .white.opacity(0.8) : EduTheme.subtle)
            }
            .foregroundStyle(on ? .white : EduTheme.ink.opacity(0.8))
            .padding(.horizontal, 12)
            .frame(minHeight: 34)
            .background(on ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(on ? EduTheme.teal : EduTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: Timeline

    @ViewBuilder private var timeline: some View {
        if groups.isEmpty {
            emptyCard("Aucun exercice dans cet onglet.")
        } else {
            VStack(alignment: .leading, spacing: 20) {
                ForEach(groups, id: \.key) { g in
                    let label = Self.groupLabel(g.due)
                    let urgent = tab == .todo && g.due != nil && ExamsBoardView.daysUntil(g.due!) <= 1
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(label.title.uppercased())
                                .font(.subheadline.weight(.heavy))
                                .tracking(0.6)
                                .foregroundStyle(urgent ? Self.rose : EduTheme.ink)
                            Text("\(label.hint) · \(g.items.count) exercice\(g.items.count > 1 ? "s" : "")")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                                .lineLimit(1)
                            Rectangle().fill(EduTheme.borderStrong.opacity(0.6)).frame(height: 1)
                        }
                        ForEach(g.items) { item in row(item) }
                    }
                }
            }
        }
    }

    private func row(_ item: Item) -> some View {
        let st = status(item)
        let expandable = !item.body.isEmpty
        let expanded = open == item.id
        let swatch = SubjectPalette.swatch(for: item.subject)
        return Button {
            guard expandable else { return }
            withAnimation(.easeInOut(duration: 0.2)) { open = expanded ? nil : item.id }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        HStack(spacing: 5) {
                            Circle().fill(swatch.border).frame(width: 8, height: 8)
                            Text(item.subject).font(.caption.weight(.bold)).foregroundStyle(EduTheme.ink.opacity(0.7))
                        }
                        Label(item.fromLesson ? "Donné en cours" : "Exercice", systemImage: item.fromLesson ? "book.closed" : "square.and.pencil")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(EduTheme.muted)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Self.track, in: RoundedRectangle(cornerRadius: 3))
                    }
                    Text(expanded && item.fromLesson ? item.body : item.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .multilineTextAlignment(.leading)
                        .lineLimit(expanded ? nil : 2)
                        .fixedSize(horizontal: false, vertical: true)
                    if expanded && !item.fromLesson && !item.body.isEmpty {
                        Text(item.body)
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let given = item.given {
                        Text(given).font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    if expandable {
                        HStack(spacing: 2) {
                            Text(expanded ? "Réduire" : "Voir tout")
                            Image(systemName: "chevron.down").rotationEffect(.degrees(expanded ? 180 : 0))
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(EduTheme.teal)
                    }
                }
                Spacer(minLength: 6)
                statusChip(item, st)
            }
            .padding(.vertical, 12)
            .padding(.trailing, 12)
            .padding(.leading, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white)
            .overlay(alignment: .leading) { Rectangle().fill(swatch.border).frame(width: 5) }
            .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1))
            .opacity(st == .past ? 0.7 : 1)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func statusChip(_ item: Item, _ st: Tab) -> some View {
        switch st {
        case .graded:
            if let s = scores[item.id], s.absent {
                pill("Absent", color: Self.rose)
            } else if let s = scores[item.id], let score = s.score, let max = s.max, max > 0 {
                let v = score / max * 20
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(NotesMath.plain(score))
                        .font(.title3.weight(.bold).monospacedDigit())
                        .foregroundStyle(v >= 14 ? Self.emerald : v >= 10 ? EduTheme.ink : Self.rose)
                    Text("/\(NotesMath.plain(max))").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                }
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Self.track, in: RoundedRectangle(cornerRadius: EduTheme.radius))
            } else {
                pill("Noté", color: Self.emerald)
            }
        case .past:
            pill("Date passée", color: EduTheme.muted)
        case .todo:
            if let due = item.due {
                let n = ExamsBoardView.daysUntil(due)
                pill(n == 0 ? "Aujourd’hui" : n == 1 ? "Demain" : "J-\(n)", color: n <= 1 ? Self.rose : n <= 3 ? Self.amber : EduTheme.muted)
            }
        }
    }

    private func pill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.weight(.bold))
            .foregroundStyle(color)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: EduTheme.radius))
    }

    private func emptyCard(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(EduTheme.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
            .padding(.horizontal, 16)
            .modifier(HomeCardStyle())
    }

    // MARK: Loading

    private func load() async {
        guard let sid = studentId else {
            loading = false
            error = "Compte introuvable."
            return
        }
        loading = items.isEmpty && !notEnrolled
        let api = EduAPI()
        do {
            guard let enrollment = try await api.activeEnrollment(studentId: sid) else {
                notEnrolled = true
                items = []
                loading = false
                return
            }
            notEnrolled = false
            className = enrollment.className ?? ""
            async let exercisesTask = api.fetchEvaluations(classId: enrollment.classId, type: "devoir")
            async let cahierTask = api.fetchCahier(classId: enrollment.classId)
            let exercises = try await exercisesTask
            let lessons = (try? await cahierTask) ?? []
            scores = await api.fetchEvaluationScores(studentId: sid, evaluationIds: exercises.map(\.id))

            let fromExercises = exercises.map { e in
                Item(
                    id: e.id,
                    subject: e.matieres?.name ?? "Matière",
                    title: e.title?.isEmpty == false ? e.title! : "Exercice",
                    body: e.details?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
                    given: nil,
                    due: (e.evalDate ?? e.dueDate).map { String($0.prefix(10)) },
                    fromLesson: false
                )
            }
            let fromLessons = lessons.compactMap { c -> Item? in
                guard let text = c.homework?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
                let short = text.count > 90 ? String(text.prefix(89)).trimmingCharacters(in: .whitespaces) + "…" : text
                return Item(
                    id: "cahier-\(c.id)",
                    subject: c.matieres?.name ?? "Matière",
                    title: short,
                    body: text.count > 90 ? text : "",
                    given: "Donné en cours le \(ExamsBoardView.format(c.entryDate, "EEEE d MMMM"))",
                    due: c.homeworkDue.map { String($0.prefix(10)) },
                    fromLesson: true
                )
            }
            if Task.isCancelled { return }
            items = fromExercises + fromLessons
            // open a tab that has something
            if count(tab) == 0, let first = Tab.allCases.first(where: { count($0) > 0 }) { tab = first }
            error = nil
        } catch {
            if Task.isCancelled || error.isCancellation { return }
            self.error = error.localizedDescription
        }
        loading = false
    }

    private static func groupLabel(_ due: String?) -> (title: String, hint: String) {
        guard let due else { return ("Sans date", "à préparer quand le professeur le demande") }
        let n = ExamsBoardView.daysUntil(due)
        let sameYear = due.prefix(4) == EduDates.day().prefix(4)
        let long = ExamsBoardView.format(due, sameYear ? "EEEE d MMMM" : "EEEE d MMMM yyyy").capitalized
        switch n {
        case 0: return ("Aujourd’hui", long)
        case 1: return ("Demain", long)
        case -1: return ("Hier", long)
        case ..<0: return (long, "il y a \(-n) jours")
        default: return (long, "dans \(n) jours")
        }
    }
}
