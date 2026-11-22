import SwiftUI

struct StudentCompositionsView: View {
    private enum StatusFilter: String, CaseIterable, Identifiable {
        case all, upcoming, ongoing, done
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return "Tout"
            case .upcoming: return "À venir"
            case .ongoing: return "En cours"
            case .done: return "Terminées"
            }
        }
    }

    @EnvironmentObject private var auth: AuthViewModel
    /// The student's own screen: the tour speaks to them as "tu".
    private var isStudent: Bool { auth.primaryRole == .student && childName == nil }

    var studentIdOverride: String? = nil
    /// Parent view: the child's first name, shown in the titles.
    var childName: String? = nil
    @State private var sessions: [StudentCompositionSession] = []

    @State private var tour = TabTour(key: "compositions")
    @State private var ownCoach = CoachMarkRegistry()
    @Environment(CoachMarkRegistry.self) private var outerCoach: CoachMarkRegistry?
    private var coach: CoachMarkRegistry { outerCoach ?? ownCoach }

    private static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    private static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)

    private var pageTitle: String { childName.map { "Compositions \(ParentHomeView.de($0))" } ?? "Mes compositions" }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(
                id: "child.switcher", icon: "arrow.left.arrow.right",
                title: "Changer d’enfant",
                message: "Vous avez plusieurs enfants. Essayez maintenant : touchez le prénom d’un autre enfant dans la barre en haut.",
                requiresAction: true,
                doneMessage: "Voilà ! La page affiche maintenant les compositions de cet enfant."
            ),
            CoachMarkStep(
                id: "compo.stats", icon: "chart.bar.fill",
                title: "En un coup d’œil",
                message: (isStudent ? "Tes compositions de l’année : celles à venir et celle en cours." : "Nombre de compositions de l’année, celles à venir et celle en cours.")
            ),
            CoachMarkStep(
                id: "compo.filters", icon: "line.3.horizontal.decrease.circle",
                title: "Filtrer",
                message: "Tout, à venir, en cours ou terminées."
            ),
            CoachMarkStep(
                id: "compo.timetable", icon: "tablecells",
                title: "Emploi du temps de la composition",
                message: "La composition en cours ou la prochaine : chaque jour en colonne, chaque épreuve à son heure, une couleur par matière."
            ),
            CoachMarkStep(
                id: "compo.sessions", icon: "list.bullet.rectangle",
                title: "Toutes les compositions",
                message: (isStudent ? "Chaque composition avec ses dates, son statut et la liste des épreuves. Tes notes arrivent dans « Mes notes » une fois saisies." : "Chaque composition avec ses dates, son statut et la liste des épreuves. Les notes arrivent dans « Notes » une fois saisies.")
            ),
            CoachMarkStep(
                id: "compo.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: (isStudent ? "Touche ce bouton à tout moment pour relancer la visite." : "Touchez ce bouton à tout moment pour relancer la visite.")
            ),
        ]
    }
    @State private var expandedIds: Set<String> = []
    /// composition a tapped notification is about (briefly highlighted)
    @State private var highlighted: Set<String> = []
    @State private var statusFilter: StatusFilter = .all
    @State private var className: String?
    @State private var loading = true
    @State private var error: String?

    private var filteredSessions: [StudentCompositionSession] {
        let base: [StudentCompositionSession]
        switch statusFilter {
        case .all: base = sessions
        case .upcoming: base = sessions.filter { $0.statusLabel == "À venir" || $0.statusLabel == "Programmée" }
        case .ongoing: base = sessions.filter { $0.statusLabel == "En cours" }
        case .done: base = sessions.filter { $0.statusLabel == "Terminée" }
        }
        return base.sorted { lhs, rhs in
            let l = lhs.startsOn ?? "9999"
            let r = rhs.startsOn ?? "9999"
            let lDone = lhs.statusLabel == "Terminée"
            let rDone = rhs.statusLabel == "Terminée"
            if lDone != rDone { return !lDone && rDone }
            return l < r
        }
    }

    private var upcomingCount: Int {
        sessions.filter { $0.statusLabel == "À venir" || $0.statusLabel == "Programmée" }.count
    }

    private var ongoingCount: Int {
        sessions.filter { $0.statusLabel == "En cours" }.count
    }

    /// Running composition, else the next upcoming one — used for the mini timetable.
    private var featuredSession: StudentCompositionSession? {
        if let running = sessions.first(where: { $0.statusLabel == "En cours" }) {
            return running
        }
        return sessions
            .filter { $0.statusLabel == "À venir" || $0.statusLabel == "Programmée" }
            .sorted { ($0.startsOn ?? "9999") < ($1.startsOn ?? "9999") }
            .first
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
                        TimelineView(.periodic(from: .now, by: 30)) { context in
                            ScrollView {
                                VStack(alignment: .leading, spacing: 16) {
                                    banner
                                    hintCard
                                    if sessions.isEmpty {
                                        Text("Aucune composition programmée pour le moment.")
                                            .font(.subheadline)
                                            .foregroundStyle(EduTheme.muted)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 28)
                                            .modifier(HomeCardStyle())
                                    } else {
                                        statusChips.coachMarkTarget("compo.filters")
                                        VStack(spacing: 10) {
                                            if filteredSessions.isEmpty {
                                                Text("Rien à afficher avec ce filtre.")
                                                    .font(.subheadline)
                                                    .foregroundStyle(EduTheme.muted)
                                                    .frame(maxWidth: .infinity, alignment: .leading)
                                                    .padding(16)
                                                    .background(cardBackground)
                                            } else {
                                                ForEach(filteredSessions) { session in
                                                    sessionCard(session, now: context.date)
                                                        .pushHighlight(highlighted.contains(session.id))
                                                        .id(session.id)
                                                }
                                            }
                                        }
                                        .coachMarkTarget("compo.sessions")
                                    }
                                }
                                .padding(.horizontal, 16)
                                .padding(.top, 8)
                                .padding(.bottom, 32)
                            }
                            .refreshable { await load() }
                            .tabTour(tour, registry: coach, scroller: proxy)
                            .pushFocus(["composition"], ready: !loading, proxy: proxy, highlighted: $highlighted) { f in
                                let ids = Set(f.ids("compo"))
                                guard let hit = sessions.first(where: { ids.contains($0.id) }) else { return nil }
                                statusFilter = .all
                                expandedIds.insert(hit.id)
                                return (hit.id, [hit.id])
                            }
                        }
                    }
                    .onAppear { tour.autoStartOnce({ tourSteps }, registry: coach) }
                }
            }
        }
        .environment(coach)
        .premiumTitle(pageTitle)
        .task(id: studentIdOverride) { await load() }
        .onChange(of: studentIdOverride) { _, _ in
            guard tour.showing, tour.steps.indices.contains(tour.index),
                  tour.steps[tour.index].requiresAction else { return }
            tour.steps[tour.index].doneMessage = "Voilà ! La page affiche maintenant les compositions \(childName.map { ParentHomeView.de($0) } ?? "de cet enfant"). Le bouton plein, en haut, montre toujours l’enfant affiché."
            tour.actionDone = true
        }
        .onChange(of: statusFilter) { _, _ in
            expandedIds.removeAll()
        }
    }

    /// Teal banner, like the web PageBanner.
    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Épreuves de fin de Trimestre" + ((className ?? "").isEmpty ? "" : " · Classe \(className!)"))
                            .font(.caption.weight(.semibold))
                            .tracking(1.4)
                            .textCase(.uppercase)
                            .foregroundStyle(.white.opacity(0.7))
                        Text(pageTitle)
                            .font(.system(size: 28, weight: .bold))
                            .tracking(-0.4)
                            .foregroundStyle(.white)
                        Text("Programme des compositions planifiées par l’établissement.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    TourHelpButton { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("compo.help")
                }
                HStack(alignment: .top, spacing: 10) {
                    bannerStat("Compositions", "\(sessions.count)", "cette année")
                    bannerStat("À venir", "\(upcomingCount)", upcomingCount == 0 ? "rien de prévu" : "programmée\(upcomingCount > 1 ? "s" : "")")
                    bannerStat("En cours", "\(ongoingCount)", ongoingCount == 0 ? "aucune" : "en ce moment")
                }
                .coachMarkTarget("compo.stats")
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
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
            Text(hint)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 80, alignment: .topLeading)
        .padding(10)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    private var statusChips: some View {
        HStack(spacing: 4) {
            ForEach(StatusFilter.allCases) { chip in
                let active = statusFilter == chip
                Button {
                    withAnimation(.snappy(duration: 0.2)) { statusFilter = chip }
                } label: {
                    Text(chip.label)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .foregroundStyle(active ? .white : EduTheme.ink.opacity(0.8))
                        .frame(maxWidth: .infinity, minHeight: 38)
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
        .sensoryFeedback(.selection, trigger: statusFilter)
    }

    private var hintCard: some View {
        Text(childName == nil
             ? "Chaque composition regroupe les épreuves de ta classe. Les notes apparaissent dans « Mes notes » une fois saisies."
             : "Chaque composition regroupe les épreuves de la classe. Les notes apparaissent dans « Notes » une fois saisies.")
            .font(.footnote)
            .foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(EduTheme.brand50)
            )
    }

    private func featuredTimetableCard(_ session: StudentCompositionSession) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("EMPLOI DU TEMPS DE LA COMPOSITION")
                .font(.caption2.weight(.bold))
                .foregroundStyle(EduTheme.muted)
                .tracking(0.4)
            Text(session.title?.isEmpty == false ? session.title! : "Composition")
                .font(.headline.weight(.semibold))
                .foregroundStyle(EduTheme.ink)
            if let period = session.periodLabel, !period.isEmpty {
                Text(period)
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
            }
            CompositionMiniTimetableView(papers: session.papers, compact: false)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .overlay(
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .stroke(EduTheme.teal.opacity(0.2), lineWidth: 1)
        )
    }

    private func sessionCard(_ session: StudentCompositionSession, now: Date) -> some View {
        let expanded = expandedIds.contains(session.id)
        let status = session.statusLabel
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expanded {
                        expandedIds.remove(session.id)
                    } else {
                        expandedIds.insert(session.id)
                    }
                }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    sessionDateBadge(session)

                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(session.title?.isEmpty == false ? session.title! : "Composition")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.ink)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Text(status)
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(statusColor(status))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(statusColor(status).opacity(0.12), in: Capsule())
                        }

                        HStack(spacing: 8) {
                            if let range = dateRangeLabel(session) {
                                Label(range, systemImage: "calendar")
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            if let countdown = countdownChip(for: session, now: now), countdown.text != status {
                                Text(countdown.text)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(countdown.color)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(countdown.color.opacity(0.12), in: Capsule())
                            }
                        }

                        HStack(spacing: 8) {
                            if let period = session.periodLabel, !period.isEmpty {
                                Text(period)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(EduTheme.teal)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(EduTheme.teal.opacity(0.12), in: Capsule())
                            }
                            Text("\(session.papers.count) épreuve\(session.papers.count == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                    }

                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(EduTheme.muted)
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                        .padding(.top, 4)
                }
                .padding(14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // the running / next composition shows its timetable inside its own card
            if featuredSession?.id == session.id, !session.papers.isEmpty {
                Rectangle().fill(EduTheme.border).frame(height: 1)
                VStack(alignment: .leading, spacing: 8) {
                    Text("EMPLOI DU TEMPS DE LA COMPOSITION")
                        .font(.caption2.weight(.bold))
                        .tracking(0.6)
                        .foregroundStyle(EduTheme.muted)
                    CompositionMiniTimetableView(papers: session.papers, compact: false)
                }
                .padding(14)
                .coachMarkTarget("compo.timetable")
            }

            if expanded {
                Divider().padding(.horizontal, 14)
                if session.papers.isEmpty {
                    Text("Épreuves non encore publiées.")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                } else {
                    VStack(spacing: 10) {
                        if featuredSession?.id != session.id {
                            CompositionMiniTimetableView(papers: session.papers, compact: true)
                        }
                        ForEach(session.papers) { paper in
                            paperRow(paper)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                }
            }
        }
        .background(cardBackground)
        .overlay(
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .stroke(EduTheme.teal.opacity(status == "En cours" ? 0.35 : 0.12), lineWidth: 1)
        )
    }

    private func sessionDateBadge(_ session: StudentCompositionSession) -> some View {
        let active = session.statusLabel == "En cours" || session.statusLabel == "À venir" || session.statusLabel == "Programmée"
        return VStack(spacing: 2) {
            Text(dayNumber(session.startsOn))
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(active ? EduTheme.teal : EduTheme.ink)
            Text(monthShort(session.startsOn))
                .font(.caption2.weight(.bold))
                .foregroundStyle(EduTheme.muted)
                .textCase(.uppercase)
        }
        .frame(width: 48)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .fill(active ? EduTheme.teal.opacity(0.12) : Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }

    private func paperRow(_ paper: CompositionPaper) -> some View {
        let swatch = SubjectPalette.swatch(for: paper.matieres?.name)
        return HStack(spacing: 10) {
            Capsule()
                .fill(swatch.border)
                .frame(width: 4, height: 34)

            VStack(alignment: .leading, spacing: 2) {
                Text(paper.matieres?.name ?? "Matière")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                if let date = paper.evalDate, !date.isEmpty, let label = prettyDate(date) {
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                }
            }
            Spacer(minLength: 8)
            if let start = paper.startTime, let end = paper.endTime {
                Text("\(start.prefix(5))–\(end.prefix(5))")
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(swatch.border)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(swatch.fill.opacity(0.7), in: Capsule())
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .fill(swatch.fill.opacity(0.28))
        )
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
            .fill(.white)
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    private func statusColor(_ label: String) -> Color {
        switch label {
        case "En cours": return .orange
        case "Terminée": return EduTheme.muted
        default: return EduTheme.teal
        }
    }

    private func dateRangeLabel(_ session: StudentCompositionSession) -> String? {
        let start = prettyDate(session.startsOn)
        let end = prettyDate(session.endsOn)
        if start == nil && end == nil { return nil }
        if let start, let end, start != end { return "\(start) → \(end)" }
        return start ?? end
    }

    private func dayNumber(_ iso: String?) -> String {
        guard let iso else { return "—" }
        let parts = iso.split(separator: "-")
        return parts.count >= 3 ? String(parts[2]) : "—"
    }

    private func monthShort(_ iso: String?) -> String {
        guard let date = parseDay(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "MMM"
        return f.string(from: date)
    }

    private func prettyDate(_ iso: String?) -> String? {
        guard let date = parseDay(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d MMM"
        return f.string(from: date)
    }

    private func parseDay(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count >= 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private func countdownChip(for session: StudentCompositionSession, now: Date) -> (text: String, color: Color)? {
        let today = EduDates.day(now)
        if let starts = session.startsOn, let ends = session.endsOn, today >= starts && today <= ends {
            return ("En cours", .orange)
        }
        guard let starts = session.startsOn, let startDate = parseDay(starts) else { return nil }
        let startOfStart = Calendar.current.startOfDay(for: startDate)
        let startOfNow = Calendar.current.startOfDay(for: now)
        let days = Calendar.current.dateComponents([.day], from: startOfNow, to: startOfStart).day ?? 0
        if days > 0 {
            return (days == 1 ? "Dans 1 j" : "Dans \(days) j", days <= 3 ? Color.orange : EduTheme.teal)
        }
        if let ends = session.endsOn, today > ends {
            return nil
        }
        return ("Aujourd’hui", EduTheme.teal)
    }

    private func load() async {
        let sid = studentIdOverride ?? auth.userId
        guard let sid else {
            loading = false
            error = "Compte introuvable."
            return
        }
        loading = sessions.isEmpty
        do {
            let api = EduAPI()
            guard let enrollment = try await api.activeEnrollment(studentId: sid) else {
                sessions = []
                className = nil
                error = nil
                loading = false
                return
            }
            className = enrollment.className
            let fetchedSessions = try await api.fetchCompositionSessions(classSectionId: enrollment.classId)
            if Task.isCancelled { return }
            sessions = fetchedSessions
            error = nil
        } catch {
            if Task.isCancelled || error.isCancellation { return }
            self.error = error.localizedDescription
        }
        loading = false
    }
}

/// Compact day × start-time grid for composition papers (matches web CompositionMiniTimetable).
private struct CompositionMiniTimetableView: View {
    let papers: [CompositionPaper]
    var compact: Bool = false

    private struct SlotKey: Hashable {
        let day: String
        let start: String
    }

    private var datedPapers: [CompositionPaper] {
        papers.filter { ($0.evalDate ?? "").isEmpty == false }
    }

    private var days: [String] {
        Array(Set(datedPapers.compactMap(\.evalDate))).sorted()
    }

    private var starts: [String] {
        Array(
            Set(
                datedPapers.compactMap { paper -> String? in
                    guard let t = paper.startTime, !t.isEmpty else { return nil }
                    return String(t.prefix(5))
                }
            )
        )
        .sorted { minutes($0) < minutes($1) }
    }

    private var cellMap: [SlotKey: CompositionPaper] {
        var map: [SlotKey: CompositionPaper] = [:]
        for paper in datedPapers {
            guard let day = paper.evalDate, let startRaw = paper.startTime, !startRaw.isEmpty else { continue }
            let key = SlotKey(day: day, start: String(startRaw.prefix(5)))
            if map[key] == nil { map[key] = paper }
        }
        return map
    }

    var body: some View {
        if days.isEmpty || starts.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 0) {
                        Text("Horaire")
                            .font(compact ? .caption2.weight(.semibold) : .caption.weight(.semibold))
                            .foregroundStyle(EduTheme.muted)
                            .frame(width: compact ? 48 : 56, alignment: .leading)
                            .padding(.vertical, compact ? 6 : 8)
                            .padding(.horizontal, 6)

                        ForEach(days, id: \.self) { day in
                            VStack(spacing: 1) {
                                Text(weekdayShort(day))
                                    .font(compact ? .caption2.weight(.bold) : .caption.weight(.bold))
                                    .foregroundStyle(EduTheme.ink)
                                    .textCase(.uppercase)
                                Text(dayMonth(day))
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(EduTheme.muted)
                            }
                            .frame(width: compact ? 84 : 96)
                            .padding(.vertical, compact ? 6 : 8)
                        }
                    }
                    .background(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))

                    ForEach(starts, id: \.self) { start in
                        HStack(alignment: .top, spacing: 0) {
                            Text(start)
                                .font(compact ? .caption2.weight(.semibold).monospacedDigit() : .caption.weight(.semibold).monospacedDigit())
                                .foregroundStyle(EduTheme.muted)
                                .frame(width: compact ? 48 : 56, alignment: .leading)
                                .padding(.vertical, compact ? 4 : 6)
                                .padding(.horizontal, 6)

                            ForEach(days, id: \.self) { day in
                                cell(day: day, start: start)
                                    .frame(width: compact ? 84 : 96)
                                    .padding(.horizontal, 3)
                                    .padding(.vertical, compact ? 3 : 4)
                            }
                        }
                        .overlay(alignment: .bottom) {
                            Divider().opacity(0.5)
                        }
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                        .stroke(Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
        }
    }

    @ViewBuilder
    private func cell(day: String, start: String) -> some View {
        if let paper = cellMap[SlotKey(day: day, start: start)] {
            let name = paper.matieres?.name ?? "Matière"
            let swatch = SubjectPalette.swatch(for: name)
            let end = paper.endTime.map { String($0.prefix(5)) } ?? ""
            HStack(spacing: 0) {
                Capsule()
                    .fill(swatch.border)
                    .frame(width: 3)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(compact ? .caption2.weight(.bold) : .caption.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    if !end.isEmpty {
                        Text("\(start)–\(end)")
                            .font(.system(size: compact ? 9 : 10, weight: .semibold, design: .monospaced))
                            .foregroundStyle(EduTheme.muted)
                    }
                }
                .padding(.horizontal, 5)
                .padding(.vertical, compact ? 4 : 6)
                Spacer(minLength: 0)
            }
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(swatch.fill.opacity(0.55))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(swatch.border.opacity(0.35), lineWidth: 1)
            )
        } else {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(
                    Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255),
                    style: StrokeStyle(lineWidth: 1, dash: [4, 3])
                )
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255).opacity(0.6))
                )
                .frame(minHeight: compact ? 32 : 40)
        }
    }

    private func minutes(_ hhmm: String) -> Int {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return 0 }
        return parts[0] * 60 + parts[1]
    }

    private func weekdayShort(_ iso: String) -> String {
        guard let date = parseDay(iso) else { return "—" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEE"
        return f.string(from: date)
    }

    private func dayMonth(_ iso: String) -> String {
        guard let date = parseDay(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d MMM"
        return f.string(from: date)
    }

    private func parseDay(_ iso: String) -> Date? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count >= 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}
