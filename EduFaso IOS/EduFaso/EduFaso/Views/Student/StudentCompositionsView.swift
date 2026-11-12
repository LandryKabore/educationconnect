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
    var studentIdOverride: String? = nil
    @State private var sessions: [StudentCompositionSession] = []
    @State private var expandedIds: Set<String> = []
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

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else if sessions.isEmpty {
                    PremiumEmpty(
                        title: "Aucune composition",
                        systemImage: "doc.on.doc",
                        message: "Aucune composition programmée pour le moment."
                    )
                } else {
                    VStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 12) {
                            summaryCard
                            statusChips
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(EduTheme.loginBackground)

                        TimelineView(.periodic(from: .now, by: 30)) { context in
                            ScrollView {
                                LazyVStack(spacing: 10) {
                                    hintCard

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
                                        }
                                    }
                                }
                                .padding(.horizontal, 16)
                                .padding(.bottom, 24)
                            }
                            .refreshable { await load() }
                        }
                    }
                }
            }
        }
        .premiumTitle("Mes compositions")
        .task { await load() }
        .onChange(of: statusFilter) { _, _ in
            expandedIds.removeAll()
        }
    }

    private var summaryCard: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(EduTheme.teal.opacity(0.12))
                Image(systemName: "graduationcap.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(EduTheme.teal)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 4) {
                Text((className ?? "Ma classe").uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.5)
                Text("\(sessions.count) composition\(sessions.count == 1 ? "" : "s")")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("\(upcomingCount) à venir · \(ongoingCount) en cours")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(cardBackground)
    }

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(StatusFilter.allCases) { chip in
                    Button {
                        statusFilter = chip
                    } label: {
                        Text(chip.label)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .foregroundStyle(statusFilter == chip ? EduTheme.navy : EduTheme.muted)
                            .background(
                                Capsule()
                                    .fill(statusFilter == chip ? EduTheme.navy.opacity(0.1) : Color.white)
                            )
                            .overlay(
                                Capsule()
                                    .strokeBorder(
                                        statusFilter == chip ? EduTheme.navy.opacity(0.35) : Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255),
                                        lineWidth: 1
                                    )
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var hintCard: some View {
        Text("Chaque composition regroupe les épreuves de ta classe. Les notes apparaissent dans « Mes notes » une fois saisies.")
            .font(.footnote)
            .foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(EduTheme.brand50)
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
                            if let countdown = countdownChip(for: session, now: now) {
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

            if expanded {
                Divider().padding(.horizontal, 14)
                if session.papers.isEmpty {
                    Text("Épreuves non encore publiées.")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                } else {
                    VStack(spacing: 8) {
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
            RoundedRectangle(cornerRadius: 16, style: .continuous)
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
            RoundedRectangle(cornerRadius: 12, style: .continuous)
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
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(swatch.fill.opacity(0.28))
        )
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.white)
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
            return (days == 1 ? "Dans 1 j" : "Dans \(days) j", days <= 3 ? Color.orange : EduTheme.navy)
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
            sessions = try await api.fetchCompositionSessions(classSectionId: enrollment.classId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
