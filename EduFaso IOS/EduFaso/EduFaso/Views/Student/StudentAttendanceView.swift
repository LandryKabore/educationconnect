import SwiftUI

struct StudentAttendanceView: View {
    @EnvironmentObject private var auth: AuthViewModel
    var studentIdOverride: String? = nil
    /// When set (teacher viewing a student), only these subjects are available.
    var allowedSubjectIds: [String]? = nil

    @State private var periods: [AttendancePeriod] = AttendancePeriodBuilder.build()
    @State private var periodKey: AttendancePeriodKey = .t1
    @State private var subjectId = ""
    @State private var statusFilter: AttendanceStatusFilter = .all
    @State private var subjects: [(id: String, name: String)] = []
    @State private var totals: AttendanceTotals?
    @State private var rows: [AttendanceRow] = []
    @State private var hasMore = false
    @State private var loadingMore = false
    @State private var ready = false
    @State private var listLoading = false
    @State private var error: String?

    private let pageSize = 30

    private var studentId: String? { studentIdOverride ?? auth.userId }

    private var isParentAudience: Bool {
        auth.primaryRole == .parent
    }

    private var showJustifyHint: Bool {
        auth.primaryRole == .parent || auth.primaryRole == .student
    }

    private var selectedPeriod: AttendancePeriod {
        periods.first(where: { $0.key == periodKey }) ?? periods[0]
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if !ready {
                    LoadingBlock()
                } else if let error {
                    Text(error)
                        .foregroundStyle(EduTheme.fasoRed)
                        .padding()
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            periodTabs
                            if subjects.count > 1 {
                                subjectPicker
                            }
                            if let totals, totals.total > 0 {
                                rateCard(totals)
                                breakdownCards(totals)
                                exceptionsSection(totals)
                                if totals.absent > 0, showJustifyHint {
                                    messageHint
                                }
                            } else {
                                PremiumEmpty(
                                    title: "Aucune présence",
                                    systemImage: "checklist",
                                    message: "Aucun cours enregistré sur cette période."
                                )
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
        }
        .premiumTitle("Mes présences")
        .task { await bootstrap() }
        .refreshable { await reloadAll(showFullLoading: false) }
        .onChange(of: periodKey) { _, _ in
            Task { await reloadScoped(resetList: true) }
        }
        .onChange(of: subjectId) { _, _ in
            Task { await reloadScoped(resetList: true) }
        }
        .onChange(of: statusFilter) { _, _ in
            Task { await reloadList(reset: true) }
        }
    }

    private var periodTabs: some View {
        EduPeriodSegmentPicker(
            options: periods.map { ($0.key, $0.label) },
            selection: $periodKey
        )
    }

    private var subjectPicker: some View {
        Menu {
            if allowedSubjectIds == nil {
                Button("Toutes les matières") { subjectId = "" }
            }
            ForEach(subjects, id: \.id) { subject in
                Button(subject.name) { subjectId = subject.id }
            }
        } label: {
            HStack {
                Text(
                    subjects.first(where: { $0.id == subjectId })?.name
                        ?? (allowedSubjectIds == nil ? "Toutes les matières" : "Choisir une matière")
                )
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(EduTheme.ink)
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.white)
            )
        }
    }

    private func rateCard(_ t: AttendanceTotals) -> some View {
        HStack(spacing: 16) {
            RateRing(rate: t.ratePercent)
            VStack(alignment: .leading, spacing: 4) {
                Text("PRÉSENCE")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.6)
                Text("\(t.total - t.absent) cours sur \(t.total)")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("Les absences justifiées ne comptent pas ; un retard compte comme présent.")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(cardBackground)
    }

    private func breakdownCards(_ t: AttendanceTotals) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("ABSENCES")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.6)
                Text("\(t.absencesTotal)")
                    .font(.title2.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.fasoRed)
                Text("\(t.excused) justifiée\(t.excused == 1 ? "" : "s") · \(t.absent) non justifiée\(t.absent == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(cardBackground)

            VStack(alignment: .leading, spacing: 4) {
                Text("RETARDS")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.6)
                Text("\(t.late)")
                    .font(.title2.weight(.bold).monospacedDigit())
                    .foregroundStyle(Color.orange)
                Text("\(t.present) cours présent\(t.present == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(cardBackground)
        }
    }

    private func exceptionsSection(_ t: AttendanceTotals) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ABSENCES ET RETARDS")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.6)
                Spacer()
                Text("\(t.exceptionsTotal)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
            }

            HStack(spacing: 8) {
                ForEach(AttendanceStatusFilter.allCases) { chip in
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
                                    .strokeBorder(statusFilter == chip ? EduTheme.navy.opacity(0.35) : Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            if listLoading && rows.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
            } else if rows.isEmpty {
                Text(
                    t.exceptionsTotal == 0
                    ? "Aucune absence ni retard sur cette période. Bravo !"
                    : "Rien à afficher avec ce filtre."
                )
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(cardBackground)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 {
                            Divider().padding(.leading, 68)
                        }
                        exceptionRow(row)
                    }
                }
                .background(cardBackground)

                if hasMore {
                    Button {
                        Task { await loadMore() }
                    } label: {
                        if loadingMore {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                        } else {
                            Text("Afficher plus (\(max(t.exceptionsTotal - rows.count, 0)) restantes)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.navy)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(loadingMore)
                }
            }
        }
    }

    private func exceptionRow(_ row: AttendanceRow) -> some View {
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(dayNumber(row.date))
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.ink)
                Text(monthShort(row.date))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
                    .textCase(.uppercase)
            }
            .frame(width: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(row.matieres?.name ?? "Matière")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                Text(weekdayAndNote(row))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            Text(label(for: row.status))
                .font(.caption.weight(.bold))
                .foregroundStyle(color(for: row.status))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule().fill(color(for: row.status).opacity(0.12))
                )
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var messageHint: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .foregroundStyle(EduTheme.teal)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                Text(isParentAudience ? "Une absence à justifier ?" : "Une absence à expliquer ?")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                NavigationLink {
                    MessagesView()
                } label: {
                    Text("Écrivez à l’école depuis la messagerie")
                        .font(.subheadline.weight(.semibold))
                        .underline()
                        .foregroundStyle(EduTheme.teal)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(EduTheme.teal.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(EduTheme.teal.opacity(0.25), lineWidth: 1)
                )
        )
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.white)
    }

    private func label(for status: String) -> String {
        switch status.lowercased() {
        case "present", "présent": return "Présent"
        case "absent": return "Absent"
        case "late", "retard": return "Retard"
        case "excused", "excusé": return "Justifié"
        default: return status
        }
    }

    private func color(for status: String) -> Color {
        switch status.lowercased() {
        case "present", "présent": return EduTheme.fasoGreen
        case "absent": return EduTheme.fasoRed
        case "late", "retard": return .orange
        case "excused", "excusé": return EduTheme.teal
        default: return EduTheme.muted
        }
    }

    private func dayNumber(_ iso: String) -> String {
        guard let d = parseISO(iso) else { return "—" }
        return String(Calendar.current.component(.day, from: d))
    }

    private func monthShort(_ iso: String) -> String {
        guard let d = parseISO(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "MMM"
        return f.string(from: d)
    }

    private func weekdayAndNote(_ row: AttendanceRow) -> String {
        var parts: [String] = []
        if let d = parseISO(row.date) {
            let f = DateFormatter()
            f.locale = Locale(identifier: "fr_FR")
            f.dateFormat = "EEEE"
            parts.append(f.string(from: d).capitalized)
        }
        if let note = row.note?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
            parts.append(note)
        }
        return parts.joined(separator: " · ")
    }

    private func parseISO(_ s: String) -> Date? {
        let parts = s.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private func bootstrap() async {
        ready = false
        error = nil
        let api = EduAPI()
        if let ctx = try? await api.fetchAttendancePeriodContext() {
            periods = AttendancePeriodBuilder.build(
                yearStart: ctx.start,
                yearEnd: ctx.end,
                custom: ctx.custom
            )
        } else {
            periods = AttendancePeriodBuilder.build()
        }
        periodKey = AttendancePeriodBuilder.currentKey(periods: periods)
        if let sid = studentId,
           let counts = try? await api.fetchAttendanceCounts(studentId: sid) {
            var loaded = (counts.bySubject ?? [])
                .compactMap { row -> (id: String, name: String)? in
                    guard let id = row.subjectId, !id.isEmpty else { return nil }
                    return (id, row.name)
                }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            if let allowed = allowedSubjectIds, !allowed.isEmpty {
                let allowedSet = Set(allowed)
                loaded = loaded.filter { allowedSet.contains($0.id) }
                // Teachers only see their subjects — lock or default to the first one.
                if loaded.count == 1 {
                    subjectId = loaded[0].id
                } else if subjectId.isEmpty || !allowedSet.contains(subjectId) {
                    subjectId = loaded.first?.id ?? ""
                }
            }
            subjects = loaded
        }
        await reloadScoped(resetList: true)
        ready = true
    }

    private func reloadAll(showFullLoading: Bool) async {
        if showFullLoading { ready = false }
        await bootstrap()
    }

    private func reloadScoped(resetList: Bool) async {
        guard let sid = studentId else {
            error = "Compte introuvable."
            return
        }
        let api = EduAPI()
        let period = selectedPeriod
        do {
            async let totalsTask = api.fetchAttendanceTotals(
                studentId: sid,
                from: period.from,
                to: period.to,
                subjectId: subjectId.isEmpty ? nil : subjectId
            )
            totals = try await totalsTask
            error = nil
            if resetList {
                await reloadList(reset: true)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func reloadList(reset: Bool) async {
        guard let sid = studentId else { return }
        if reset {
            listLoading = true
            rows = []
            hasMore = false
        }
        let api = EduAPI()
        let period = selectedPeriod
        let status = statusFilter == .all ? nil : statusFilter.rawValue
        do {
            let page = try await api.fetchAttendanceExceptions(
                studentId: sid,
                from: period.from,
                to: period.to,
                subjectId: subjectId.isEmpty ? nil : subjectId,
                status: status,
                offset: reset ? 0 : rows.count,
                limit: pageSize
            )
            if reset {
                rows = page
            } else {
                rows.append(contentsOf: page)
            }
            hasMore = page.count == pageSize
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        listLoading = false
    }

    private func loadMore() async {
        guard !loadingMore, hasMore else { return }
        loadingMore = true
        await reloadList(reset: false)
        loadingMore = false
    }
}

private struct RateRing: View {
    let rate: Int?

    private var tone: Color {
        guard let rate else { return Color(red: 203 / 255, green: 213 / 255, blue: 225 / 255) }
        if rate >= 90 { return EduTheme.fasoGreen }
        if rate >= 80 { return .orange }
        return EduTheme.fasoRed
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255), lineWidth: 8)
            Circle()
                .trim(from: 0, to: CGFloat(rate ?? 0) / 100)
                .stroke(tone, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(rate.map { "\($0) %" } ?? "—")
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(EduTheme.ink)
        }
        .frame(width: 72, height: 72)
    }
}
