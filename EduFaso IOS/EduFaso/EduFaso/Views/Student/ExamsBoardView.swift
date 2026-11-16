import SwiftUI

/// Examens page (student and parent), same as the web: teal banner (à venir, passés,
/// restants du Trimestre, prochain examen), « Prochains examens » with countdowns, and the
/// « Programme du Trimestre »: 3 examens per subject with their progress. Grades stay on Notes.
struct ExamsBoardView: View {
    @EnvironmentObject private var auth: AuthViewModel
    var studentIdOverride: String? = nil
    /// Parent view: the child's first name, shown in the titles.
    var childName: String? = nil

    static let plannedPerSubject = 3
    private static let trimesters = NotesMath.trimesters

    @State private var exams: [EvaluationRow] = []
    @State private var graded: Set<String> = []
    @State private var className = ""
    @State private var period = NotesMath.trimesters[0]
    @State private var didPickPeriod = false
    @State private var loading = true
    @State private var notEnrolled = false
    @State private var error: String?

    @State private var tour = TabTour(key: "examens")
    @State private var ownCoach = CoachMarkRegistry()
    @Environment(CoachMarkRegistry.self) private var outerCoach: CoachMarkRegistry?
    private var coach: CoachMarkRegistry { outerCoach ?? ownCoach }

    private static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    private static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)
    private static let brand50 = Color(red: 240 / 255, green: 253 / 255, blue: 250 / 255)
    private static let rose = Color(red: 225 / 255, green: 29 / 255, blue: 72 / 255)
    private static let amber = Color(red: 217 / 255, green: 119 / 255, blue: 6 / 255)
    private static let emerald = Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)
    private static let softFill = Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)

    private var studentId: String? { studentIdOverride ?? auth.userId }
    private var title: String { childName.map { "Examens \(ParentHomeView.de($0))" } ?? "Mes examens" }
    private var today: String { EduDates.day() }

    private func day(_ e: EvaluationRow) -> String? {
        guard let d = e.evalDate ?? e.dueDate, !d.isEmpty else { return nil }
        return String(d.prefix(10))
    }
    private func isDone(_ e: EvaluationRow) -> Bool {
        graded.contains(e.id) || (day(e).map { $0 < today } ?? false)
    }
    private static func normalize(_ raw: String?) -> String {
        let t = (raw ?? "").trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return "Sans Trimestre" }
        let lower = t.lowercased()
        for name in trimesters {
            let n = String(name.suffix(1))
            if lower.contains("trimestre \(n)") || lower == "t\(n)" || lower.hasPrefix("t\(n) ") { return name }
        }
        return t
    }

    private var upcoming: [EvaluationRow] {
        exams.filter { !graded.contains($0.id) && (day($0) ?? "") >= today }
            .sorted { (day($0) ?? "", $0.startTime ?? "") < (day($1) ?? "", $1.startTime ?? "") }
    }
    private var pastCount: Int { exams.filter { !graded.contains($0.id) && (day($0).map { $0 < today } ?? false) }.count }
    private var doneCount: Int { exams.filter(isDone).count }
    private var subjectNames: [String] {
        Array(Set(exams.map { $0.matieres?.name.trimmingCharacters(in: .whitespaces) ?? "Matière" }))
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
    private var plannedInPeriod: Int { subjectNames.count * Self.plannedPerSubject }
    private var remaining: Int {
        max(0, plannedInPeriod - exams.filter { Self.normalize($0.periodLabel) == period && isDone($0) }.count)
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(
                id: "child.switcher", icon: "arrow.left.arrow.right",
                title: "Changer d’enfant",
                message: "Vous avez plusieurs enfants. Essayez maintenant : touchez le prénom d’un autre enfant dans la barre en haut.",
                requiresAction: true,
                doneMessage: "Voilà ! La page affiche maintenant les examens de cet enfant."
            ),
            CoachMarkStep(
                id: "exams.stats", icon: "chart.bar.fill",
                title: "En un coup d’œil",
                message: "Examens à venir, examens déjà passés, et ceux qui restent ce Trimestre (3 par matière)."
            ),
            CoachMarkStep(
                id: "exams.next", icon: "calendar.badge.clock",
                title: "Prochain examen",
                message: "Le prochain examen confirmé par l’école, avec le compte à rebours, la date et l’heure."
            ),
            CoachMarkStep(
                id: "exams.upcoming", icon: "list.bullet",
                title: "Prochains examens",
                message: "Tous les examens programmés, du plus proche au plus lointain. Rouge : aujourd’hui ou demain."
            ),
            CoachMarkStep(
                id: "exams.programme", icon: "square.grid.3x3.fill",
                title: "Programme du Trimestre",
                message: "Choisissez un Trimestre : pour chaque matière, les 3 examens prévus, passés (vert) ou à venir (orange). Les notes sont dans « Notes »."
            ),
            CoachMarkStep(
                id: "exams.help", icon: "questionmark.circle.fill",
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
                                    emptyCard("Cet élève n’est pas encore inscrit dans une classe.")
                                } else if exams.isEmpty {
                                    emptyCard("Aucun examen confirmé pour le moment.")
                                } else {
                                    upcomingCard.coachMarkTarget("exams.upcoming")
                                    programme.coachMarkTarget("exams.programme")
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
        .premiumTitle(title)
        .task(id: studentIdOverride) { await load() }
        .onChange(of: studentIdOverride) { _, _ in
            guard tour.showing, tour.steps.indices.contains(tour.index),
                  tour.steps[tour.index].requiresAction else { return }
            tour.steps[tour.index].doneMessage = "Voilà ! La page affiche maintenant les examens \(childName.map { ParentHomeView.de($0) } ?? "de cet enfant"). Le bouton plein, en haut, montre toujours l’enfant affiché."
            tour.actionDone = true
        }
    }

    // MARK: Banner

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Contrôles surveillés" + (className.isEmpty ? "" : " · Classe \(className)"))
                            .font(.caption.weight(.semibold))
                            .tracking(1.4)
                            .textCase(.uppercase)
                            .foregroundStyle(.white.opacity(0.7))
                        Text(title)
                            .font(.system(size: 28, weight: .bold))
                            .tracking(-0.4)
                            .foregroundStyle(.white)
                        Text("3 examens par matière et par Trimestre — confirmés par l’établissement.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    TourHelpButton { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("exams.help")
                }
                HStack(alignment: .top, spacing: 10) {
                    bannerStat("À venir", "\(upcoming.count)", upcoming.isEmpty ? "rien pour l’instant" : "examen\(upcoming.count > 1 ? "s" : "") à venir")
                    bannerStat("Passés", "\(doneCount)", "notes dans « Notes »")
                    bannerStat("Restants · \(period)", "\(remaining)", remaining > 0 ? "sur \(plannedInPeriod) prévus" : "Trimestre terminé")
                }
                .coachMarkTarget("exams.stats")
                nextCard.coachMarkTarget("exams.next")
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
        if let next = upcoming.first, let d = day(next) {
            let n = Self.daysUntil(d)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("PROCHAIN EXAMEN", systemImage: "calendar.badge.clock")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255), in: RoundedRectangle(cornerRadius: EduTheme.radius))
                    Spacer()
                    Text(Self.countdown(n))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(n <= 1 ? Self.rose : EduTheme.muted)
                }
                Text(next.title?.isEmpty == false ? next.title! : (next.matieres?.name ?? "Examen"))
                    .font(.title3.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                Text([next.matieres?.name, "pour le \(Self.format(d, "EEEE d MMMM"))", Self.slot(next)].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("PROCHAIN EXAMEN").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.white.opacity(0.7))
                Text("Rien de prévu pour le moment").font(.headline).foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
    }

    // MARK: Prochains examens

    private var upcomingCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Label("Prochains examens", systemImage: "calendar.badge.clock")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .labelStyle(TealIconLabel())
                Spacer()
                Text(upcoming.isEmpty ? "aucun de prévu" : "\(upcoming.count) à venir")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            Rectangle().fill(EduTheme.border).frame(height: 1)
            if upcoming.isEmpty {
                Text("Aucun examen n’est encore programmé. Les dates apparaissent ici dès que l’établissement les confirme.")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .padding(14)
            } else {
                ForEach(Array(upcoming.prefix(8).enumerated()), id: \.element.id) { index, e in
                    upcomingRow(e)
                        .overlay(alignment: .top) {
                            if index > 0 { Rectangle().fill(EduTheme.border).frame(height: 1) }
                        }
                }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func upcomingRow(_ e: EvaluationRow) -> some View {
        let d = day(e) ?? today
        let n = Self.daysUntil(d)
        return HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(Self.format(d, "EEE").replacingOccurrences(of: ".", with: "").uppercased())
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(EduTheme.muted)
                Text(Self.format(d, "d")).font(.title3.weight(.bold)).foregroundStyle(EduTheme.ink)
                Text(Self.format(d, "MMM")).font(.system(size: 10)).foregroundStyle(EduTheme.muted)
            }
            .frame(width: 50)
            .padding(.vertical, 5)
            .background(Self.softFill, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Circle().fill(SubjectPalette.swatch(for: e.matieres?.name).border).frame(width: 9, height: 9)
                    Text(e.matieres?.name ?? "Examen")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                }
                Text([e.title, Self.slot(e), Self.normalize(e.periodLabel)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(2)
            }
            Spacer(minLength: 6)
            Text(Self.countdown(n))
                .font(.caption.weight(.bold))
                .foregroundStyle(n <= 1 ? Self.rose : n <= 7 ? Self.amber : EduTheme.muted)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background((n <= 1 ? Self.rose : n <= 7 ? Self.amber : EduTheme.subtle).opacity(0.12), in: RoundedRectangle(cornerRadius: EduTheme.radius))
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    // MARK: Programme du Trimestre

    private var programme: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Programme du Trimestre").font(.headline.weight(.bold)).foregroundStyle(EduTheme.ink)
                    Text("3 examens par matière. Les notes sont dans « Notes ».")
                        .font(.caption).foregroundStyle(EduTheme.muted)
                }
                Spacer()
                NavigationLink {
                    StudentGradesView(studentIdOverride: studentIdOverride, childName: childName)
                } label: {
                    Label("Voir les notes", systemImage: "chevron.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 38)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 4) {
                ForEach(Self.trimesters, id: \.self) { p in
                    let active = p == period
                    let list = exams.filter { Self.normalize($0.periodLabel) == p }
                    let done = list.filter(isDone).count
                    Button {
                        withAnimation(.snappy(duration: 0.2)) { period = p; didPickPeriod = true }
                    } label: {
                        VStack(spacing: 1) {
                            Text(p).font(.subheadline.weight(.bold)).lineLimit(1).minimumScaleFactor(0.75)
                            Text(list.isEmpty ? "rien de publié" : done == list.count ? "tous passés" : "\(done) passé\(done > 1 ? "s" : "") · \(list.count - done) à venir")
                                .font(.system(size: 10))
                                .foregroundStyle(active ? .white.opacity(0.8) : EduTheme.muted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .foregroundStyle(active ? .white : Self.brand800)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background {
                            if active { RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).fill(EduTheme.teal) }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
            .background(Self.brand50, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color(red: 153 / 255, green: 246 / 255, blue: 228 / 255), lineWidth: 1))
            .sensoryFeedback(.selection, trigger: period)

            VStack(spacing: 10) {
                ForEach(subjectNames, id: \.self) { subject in
                    subjectRow(subject)
                }
            }
        }
    }

    private func subjectRow(_ subject: String) -> some View {
        let list = exams
            .filter { Self.normalize($0.periodLabel) == period && ($0.matieres?.name.trimmingCharacters(in: .whitespaces) ?? "Matière") == subject }
            .sorted { (day($0) ?? "") < (day($1) ?? "") }
        let done = list.filter(isDone).count
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle().fill(SubjectPalette.swatch(for: subject).border).frame(width: 10, height: 10)
                Text(subject).font(.subheadline.weight(.bold)).foregroundStyle(EduTheme.ink)
                Spacer()
                HStack(spacing: 2) {
                    ForEach(0..<Self.plannedPerSubject, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(i < done ? Self.emerald : i < list.count ? Color(red: 252 / 255, green: 211 / 255, blue: 77 / 255) : EduTheme.border)
                            .frame(width: 16, height: 8)
                    }
                }
                Text("\(done)/\(Self.plannedPerSubject)")
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.muted)
            }
            HStack(spacing: 6) {
                ForEach(0..<Self.plannedPerSubject, id: \.self) { i in
                    examCell(i < list.count ? list[i] : nil, number: i + 1)
                }
            }
        }
        .padding(12)
        .modifier(HomeCardStyle())
    }

    private func examCell(_ e: EvaluationRow?, number: Int) -> some View {
        Group {
            if let e {
                let d = day(e)
                let date = d.map { Self.format($0, "EEE d MMM").capitalized } ?? "Date à confirmer"
                if isDone(e) {
                    VStack(spacing: 2) {
                        Label("Passé", systemImage: "checkmark").font(.caption.weight(.bold)).foregroundStyle(Self.emerald)
                        Text(date).font(.system(size: 10)).foregroundStyle(EduTheme.muted).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Self.emerald.opacity(0.08), in: RoundedRectangle(cornerRadius: EduTheme.radius))
                } else {
                    VStack(spacing: 2) {
                        Text(date).font(.caption.weight(.bold)).foregroundStyle(Self.amber).lineLimit(1).minimumScaleFactor(0.75)
                        Text(e.startTime.map { "à \($0.prefix(5))" } ?? "heure à confirmer")
                            .font(.system(size: 10)).foregroundStyle(EduTheme.muted).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Color(red: 255 / 255, green: 251 / 255, blue: 235 / 255), in: RoundedRectangle(cornerRadius: EduTheme.radius))
                }
            } else {
                VStack(spacing: 2) {
                    Text("Examen \(number)").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                    Text("date pas encore publiée").font(.system(size: 10)).foregroundStyle(EduTheme.subtle).lineLimit(1).minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, minHeight: 50)
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(EduTheme.borderStrong, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
            }
        }
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
        loading = exams.isEmpty && !notEnrolled
        let api = EduAPI()
        do {
            guard let enrollment = try await api.activeEnrollment(studentId: sid) else {
                notEnrolled = true
                exams = []
                loading = false
                return
            }
            notEnrolled = false
            className = enrollment.className ?? ""
            let rows = try await api.fetchEvaluations(classId: enrollment.classId, type: "examen", confirmedOnly: true)
            graded = (try? await api.fetchGradedEvaluationIds(studentId: sid, evaluationIds: rows.map(\.id))) ?? []
            if Task.isCancelled { return }
            exams = rows
            if !didPickPeriod {
                let base: [AttendancePeriod]
                if let ctx = try? await api.fetchAttendancePeriodContext() {
                    base = AttendancePeriodBuilder.build(yearStart: ctx.start, yearEnd: ctx.end, custom: ctx.custom)
                } else {
                    base = AttendancePeriodBuilder.build()
                }
                if let current = ParentHomeLoader.currentTrimester(from: base)?.label, Self.trimesters.contains(current) {
                    period = current
                }
            }
            error = nil
        } catch {
            if Task.isCancelled || error.isCancellation { return }
            self.error = error.localizedDescription
        }
        loading = false
    }

    // MARK: Helpers

    private static func date(_ iso: String) -> Date? {
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(iso.prefix(10)))
    }

    static func format(_ iso: String, _ pattern: String) -> String {
        guard let d = date(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = pattern
        return f.string(from: d)
    }

    static func daysUntil(_ iso: String) -> Int {
        guard let d = date(iso), let t = date(EduDates.day()) else { return 0 }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: t, to: d).day ?? 0
    }

    static func countdown(_ n: Int) -> String {
        n == 0 ? "Aujourd’hui" : n == 1 ? "Demain" : "Dans \(n) jours"
    }

    private static func slot(_ e: EvaluationRow) -> String? {
        guard let start = e.startTime, !start.isEmpty else { return nil }
        if let end = e.endTime, !end.isEmpty { return "\(start.prefix(5)) – \(end.prefix(5))" }
        return "à partir de \(start.prefix(5))"
    }
}

/// Teal icon before a section title.
private struct TealIconLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            configuration.icon.foregroundStyle(EduTheme.teal)
            configuration.title
        }
    }
}
