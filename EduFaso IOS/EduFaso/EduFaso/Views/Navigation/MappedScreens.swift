import SwiftUI

// MARK: - Shared pieces

struct ChildGate<Content: View>: View {
    let title: String
    @ViewBuilder var content: (ChildSummary) -> Content
    @State private var children: [ChildSummary] = []
    @State private var childId = ""
    @State private var loading = true
    @State private var error: String?

    private var selected: ChildSummary? {
        children.first { $0.id == childId } ?? children.first
    }

    var body: some View {
        Group {
            if loading { LoadingBlock() }
            else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else if children.isEmpty {
                PremiumEmpty(
                    title: "Aucun enfant lié",
                    systemImage: "figure.and.child.holdinghands",
                    message: "Aucun enfant n’est associé à ce compte pour le moment."
                )
            }
            else if let child = selected {
                content(child)
                    .id(child.id)
                    .safeAreaInset(edge: .top, spacing: 0) {
                        if children.count > 1 {
                            HStack(spacing: 10) {
                                Image(systemName: "person.crop.circle")
                                    .foregroundStyle(EduTheme.teal)
                                Picker("Enfant", selection: $childId) {
                                    ForEach(children) { Text($0.fullName).tag($0.id) }
                                }
                                .pickerStyle(.menu)
                                .tint(EduTheme.navy)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.white)
                            .overlay(alignment: .bottom) { Divider() }
                        }
                    }
            }
        }
        .premiumTitle(title)
        .scrollContentBackground(.hidden)
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .preferredColorScheme(.light)
        .tint(EduTheme.navy)
        .task { await load() }
    }

    private func load() async {
        loading = children.isEmpty
        do {
            children = try await EduAPI().fetchChildren()
            if childId.isEmpty { childId = children.first?.id ?? "" }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct EvaluationsBrowser: View {
    private enum StatusFilter: String, CaseIterable, Identifiable {
        case all, todo, late, upcoming, past, graded, toGrade, confirm
        var id: String { rawValue }

        func label(for type: String?) -> String {
            switch self {
            case .all: return "Tout"
            case .todo: return "À faire"
            case .late: return "En retard"
            case .upcoming: return "À venir"
            case .past: return "Passés"
            case .graded: return "Notés"
            case .toGrade: return "À noter"
            case .confirm: return "À confirmer"
            }
        }
    }

    var classId: String? = nil
    var classIds: [String]? = nil
    var studentId: String? = nil
    var teacherId: String? = nil
    var type: String? = nil
    var confirmedOnly = false
    var allowEntry = false
    var recordedBy: String? = nil
    let title: String

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var rows: [EvaluationRow] = []
    @State private var gradedIds: Set<String> = []
    @State private var expandedIds: Set<String> = []
    @State private var statusFilter: StatusFilter = .all
    @State private var className: String?
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?
    @State private var showCreate = false

    private var resolvedStudentId: String? { studentId ?? (teacherId == nil && !allowEntry ? auth.userId : nil) }
    private var isStudentAudience: Bool { resolvedStudentId != nil && !allowEntry }
    private var isTeacherAudience: Bool { allowEntry && !isStudentAudience }
    private var isExamMode: Bool { type == "examen" }
    private var isQuizMode: Bool { type == "interrogation" }
    /// Exercices de maison are not graded here — just to read, like the cahier.
    private var isHomeworkInfoMode: Bool { type == "devoir" && isStudentAudience }
    private var canCreateEvaluation: Bool {
        allowEntry && (auth.primaryRole == .teacher || auth.primaryRole == .schoolAdmin)
            && (type == nil || type == "interrogation")
    }

    private var availableFilters: [StatusFilter] {
        if isTeacherAudience {
            var chips: [StatusFilter] = [.all, .toGrade, .upcoming, .graded]
            if confirmCount > 0 { chips.append(.confirm) }
            return chips
        }
        if isHomeworkInfoMode {
            return []
        }
        if isExamMode || isQuizMode {
            return [.all, .upcoming, .past, .graded]
        }
        return [.all, .todo, .graded]
    }

    private func isLate(_ row: EvaluationRow) -> Bool {
        !gradedIds.contains(row.id) && eventDay(row) != nil && !isUpcoming(row)
    }

    private var lateCount: Int {
        rows.filter { isLate($0) }.count
    }

    private var confirmCount: Int {
        rows.filter { $0.adminConfirmed == false && ($0.type == "examen" || $0.type == "composition") }.count
    }

    /// Past date + not graded — what teachers actually need to act on.
    private var needsGradingCount: Int {
        rows.filter { !gradedIds.contains($0.id) && !isUpcoming($0) }.count
    }

    private var emptyTitle: String {
        switch type {
        case "devoir": return "Aucun exercice"
        case "interrogation": return "Aucune interrogation"
        case "examen": return "Aucun devoir"
        case "composition": return "Aucune composition"
        default: return "Aucune évaluation"
        }
    }

    private var emptyMessage: String {
        if className == nil, resolvedStudentId != nil {
            return "Aucune classe active trouvée pour ce compte."
        }
        switch type {
        case "devoir":
            return "Les exercices de maison se trouvent dans le cahier de textes."
        case "interrogation":
            return "Aucune interrogation publiée pour ta classe pour le moment."
        case "examen":
            return "Aucun devoir confirmé par l’établissement pour le moment."
        default:
            return "Rien à afficher pour le moment."
        }
    }

    private var accent: Color {
        switch type {
        case "devoir": return EduTheme.fasoRed
        case "interrogation": return Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)
        case "examen": return EduTheme.navy
        case "composition": return EduTheme.teal
        default: return EduTheme.navy
        }
    }

    private var pendingCount: Int {
        rows.filter { !gradedIds.contains($0.id) }.count
    }

    private var gradedCount: Int {
        rows.filter { gradedIds.contains($0.id) }.count
    }

    private var upcomingCount: Int {
        rows.filter { isUpcoming($0) }.count
    }

    private var filteredRows: [EvaluationRow] {
        let base: [EvaluationRow]
        switch statusFilter {
        case .all: base = rows
        case .todo: base = rows.filter { !gradedIds.contains($0.id) }
        case .late: base = rows.filter { isLate($0) }
        case .upcoming: base = rows.filter { isUpcoming($0) }
        case .past: base = rows.filter { !isUpcoming($0) }
        case .graded: base = rows.filter { gradedIds.contains($0.id) }
        case .toGrade:
            base = rows.filter { !gradedIds.contains($0.id) && !isUpcoming($0) }
        case .confirm:
            base = rows.filter {
                $0.adminConfirmed == false && ($0.type == "examen" || $0.type == "composition")
            }
        }
        return base.sorted { lhs, rhs in
            let l = eventDay(lhs) ?? "9999"
            let r = eventDay(rhs) ?? "9999"
            if isTeacherAudience {
                // À noter first, then upcoming soonest, then graded/past.
                let lNeed = !gradedIds.contains(lhs.id) && !isUpcoming(lhs)
                let rNeed = !gradedIds.contains(rhs.id) && !isUpcoming(rhs)
                if lNeed != rNeed { return lNeed && !rNeed }
                let lUp = isUpcoming(lhs)
                let rUp = isUpcoming(rhs)
                if lUp != rUp { return lUp && !rUp }
                return lUp ? l < r : l > r
            }
            if isExamMode || isQuizMode {
                let lUp = isUpcoming(lhs)
                let rUp = isUpcoming(rhs)
                if lUp != rUp { return lUp && !rUp }
                return lUp ? l < r : l > r
            }
            if isHomeworkInfoMode {
                return l > r
            }
            if isStudentAudience {
                let lDone = gradedIds.contains(lhs.id)
                let rDone = gradedIds.contains(rhs.id)
                if lDone != rDone { return !lDone && rDone }
                return l < r
            }
            return l > r
        }
    }

    private var filterEmptyMessage: String {
        switch statusFilter {
        case .todo: return "Rien à faire pour le moment."
        case .late: return "Rien en retard."
        case .graded: return "Rien n’a encore été noté."
        case .upcoming: return "Rien à venir pour le moment."
        case .past: return "Rien de passé à afficher."
        default: return "Rien à afficher avec ce filtre."
        }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if !ready || loading {
                    LoadingBlock()
                } else if let error {
                    VStack(spacing: 12) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.largeTitle)
                            .foregroundStyle(Color.orange)
                            .accessibilityHidden(true)
                        Text("Chargement impossible")
                            .font(.headline)
                            .foregroundStyle(EduTheme.ink)
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(EduTheme.muted)
                            .multilineTextAlignment(.center)
                        Button {
                            Task { await load(isRefresh: false) }
                        } label: {
                            Text("Réessayer")
                                .font(.subheadline.weight(.bold))
                                .padding(.horizontal, 18)
                                .frame(minHeight: 44)
                                .foregroundStyle(.white)
                                .background(EduTheme.teal, in: Capsule())
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if rows.isEmpty {
                    PremiumEmpty(title: emptyTitle, systemImage: "doc.text", message: emptyMessage)
                } else {
                    VStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 12) {
                            summaryCard
                            if (isStudentAudience || isTeacherAudience), !availableFilters.isEmpty {
                                statusChips
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(EduTheme.loginBackground)

                        TimelineView(.periodic(from: .now, by: 30)) { context in
                            ScrollView {
                                LazyVStack(spacing: 10) {
                                    if filteredRows.isEmpty {
                                        Text(filterEmptyMessage)
                                            .font(.subheadline)
                                            .foregroundStyle(EduTheme.muted)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(16)
                                            .background(cardBackground)
                                    } else {
                                        ForEach(filteredRows) { row in
                                            evaluationCard(row, now: context.date)
                                        }
                                    }
                                }
                                .padding(.horizontal, 16)
                                .padding(.bottom, 24)
                            }
                            .refreshable { await load(isRefresh: true) }
                        }
                    }
                }
            }
        }
        .premiumTitle(title)
        .toolbar {
            if canCreateEvaluation {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreate = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .accessibilityLabel("Nouvelle évaluation")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if canCreateEvaluation, ready, !loading {
                Button {
                    showCreate = true
                } label: {
                    Label("Nouvelle évaluation", systemImage: "plus")
                        .font(.body.weight(.bold))
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(.white)
                        .background(EduTheme.navy, in: Capsule())
                        .shadow(color: EduTheme.navy.opacity(0.3), radius: 10, y: 4)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
            }
        }
        .sheet(isPresented: $showCreate) {
            CreateEvaluationSheet(
                preselectedClassId: classId,
                lockedType: type == "interrogation" ? type : nil
            ) {
                showCreate = false
                Task { await load(isRefresh: true) }
            }
            .environmentObject(auth)
        }
        .task { await load(isRefresh: false) }
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(accent.opacity(0.12))
                    Image(systemName: summaryIcon)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(accent)
                }
                .frame(width: 48, height: 48)

                VStack(alignment: .leading, spacing: 4) {
                    Text((className ?? (isTeacherAudience ? "Mes évaluations" : "Ma classe")).uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(EduTheme.muted)
                        .tracking(0.5)
                    Text("\(rows.count) \(itemNoun(rows.count))")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    if !isTeacherAudience {
                        if isStudentAudience {
                            if isHomeworkInfoMode {
                                Text("À lire · comme le cahier de textes")
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            } else if isExamMode || isQuizMode {
                                Text("\(upcomingCount) à venir · \(gradedCount) noté\(gradedCount == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            } else {
                                Text("\(pendingCount) à faire · \(gradedCount) noté\(gradedCount == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                        } else if let className, !className.isEmpty {
                            Text(className)
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                    }
                }
                Spacer(minLength: 0)
            }

            if isTeacherAudience {
                HStack(spacing: 8) {
                    summaryStat("\(needsGradingCount)", "À noter", needsGradingCount > 0 ? EduTheme.fasoRed : EduTheme.muted) {
                        statusFilter = .toGrade
                    }
                    summaryStat("\(upcomingCount)", "À venir", EduTheme.navy) {
                        statusFilter = .upcoming
                    }
                    summaryStat("\(gradedCount)", "Notés", EduTheme.teal) {
                        statusFilter = .graded
                    }
                }
            }
        }
        .padding(16)
        .background(cardBackground)
    }

    private func summaryStat(_ value: String, _ label: String, _ tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(value)
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(tint)
                Text(label)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var summaryIcon: String {
        switch type {
        case "devoir": return "list.clipboard.fill"
        case "interrogation": return "questionmark.circle.fill"
        case "examen": return "pencil.and.list.clipboard"
        case "composition": return "graduationcap.fill"
        default: return "doc.text.fill"
        }
    }

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(availableFilters) { chip in
                    let count = filterCount(chip)
                    let selected = statusFilter == chip
                    Button {
                        statusFilter = chip
                    } label: {
                        HStack(spacing: 5) {
                            Text(chip.label(for: type))
                                .font(.caption.weight(.semibold))
                            if let count, chip != .all {
                                Text("\(count)")
                                    .font(.caption2.weight(.bold).monospacedDigit())
                                    .foregroundStyle(statusFilter == chip ? .white : EduTheme.muted)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(
                                        Capsule().fill(
                                            statusFilter == chip
                                                ? EduTheme.navy.opacity(0.85)
                                                : Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255)
                                        )
                                    )
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
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
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(count.map { "\(chip.label(for: type)), \($0)" } ?? chip.label(for: type))
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityHint("Filtre la liste")
                }
            }
        }
    }

    private func filterCount(_ chip: StatusFilter) -> Int? {
        switch chip {
        case .all: return rows.count
        case .todo: return pendingCount
        case .late: return lateCount
        case .upcoming: return upcomingCount
        case .past: return rows.filter { !isUpcoming($0) }.count
        case .graded: return gradedCount
        case .toGrade: return needsGradingCount
        case .confirm: return confirmCount
        }
    }

    @ViewBuilder
    private func evaluationCard(_ row: EvaluationRow, now: Date) -> some View {
        let graded = gradedIds.contains(row.id)
        let expanded = expandedIds.contains(row.id)
        let canEnter = allowEntry && row.classSectionId != nil && row.subjectId != nil
        let hasDetails = !(row.details ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let swatch = SubjectPalette.swatch(for: row.matieres?.name)

        if isTeacherAudience, canEnter {
            NavigationLink {
                GradeEntryView(evaluation: row, recordedBy: recordedBy)
            } label: {
                teacherEvalCard(row, graded: graded, swatch: swatch, now: now)
            }
            .buttonStyle(.plain)
            .accessibilityHint(graded ? "Ouvre la modification des notes" : "Ouvre la saisie des notes")
        } else {
            VStack(alignment: .leading, spacing: 0) {
                if canEnter {
                    NavigationLink {
                        GradeEntryView(evaluation: row, recordedBy: recordedBy)
                    } label: {
                        cardHeader(
                            row,
                            graded: graded,
                            expanded: false,
                            expandable: false,
                            showsChevron: true,
                            gradeAction: graded ? "Modifier" : "Noter",
                            swatch: swatch,
                            now: now
                        )
                    }
                    .buttonStyle(.plain)
                } else if hasDetails {
                    Button {
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                            if expanded {
                                expandedIds.remove(row.id)
                            } else {
                                expandedIds.insert(row.id)
                            }
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 0) {
                            cardHeader(row, graded: graded, expanded: expanded, expandable: true, swatch: swatch, now: now)
                            if !expanded, let details = row.details {
                                Text(details.trimmingCharacters(in: .whitespacesAndNewlines))
                                    .font(.footnote)
                                    .foregroundStyle(EduTheme.ink.opacity(0.7))
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 14)
                                    .padding(.leading, 16)
                                    .padding(.bottom, 12)
                                    .padding(.top, -4)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(spokenLabel(row, graded: graded, now: now))
                    .accessibilityValue(expanded ? "Consignes affichées" : "")
                    .accessibilityHint(expanded ? "Masque les consignes" : "Affiche les consignes")
                    .accessibilityAddTraits(.isButton)

                    if expanded, let details = row.details, !details.isEmpty {
                        Divider().padding(.horizontal, 14)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Consignes")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(EduTheme.muted)
                                .textCase(.uppercase)
                                .accessibilityAddTraits(.isHeader)
                            Text(details)
                                .font(.subheadline)
                                .foregroundStyle(EduTheme.ink.opacity(0.85))
                                .textSelection(.enabled)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                    }
                } else {
                    cardHeader(row, graded: graded, expanded: false, expandable: false, swatch: swatch, now: now)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(spokenLabel(row, graded: graded, now: now))
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(swatch.fill.opacity(0.35))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(.white.opacity(0.72))
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(swatch.border.opacity(0.35), lineWidth: 1)
            )
        }
    }

    /// Cleaner teacher card: date · title · meta · clear status + Noter.
    private func teacherEvalCard(
        _ row: EvaluationRow,
        graded: Bool,
        swatch: SubjectPalette.Swatch,
        now: Date
    ) -> some View {
        let status = teacherStatus(row, graded: graded, now: now)

        return HStack(alignment: .center, spacing: 12) {
            dateBadge(row, swatch: swatch)

            VStack(alignment: .leading, spacing: 6) {
                Text(row.title?.isEmpty == false ? row.title! : row.typeLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                Text(
                    [shortTypeLabel(row), row.matieres?.name, row.classes?.name]
                        .compactMap { $0?.isEmpty == false ? $0 : nil }
                        .joined(separator: " · ")
                )
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
                .lineLimit(1)

                if let time = timeRange(row) {
                    Text(time)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(EduTheme.navy)
                } else if let period = row.periodLabel, !period.isEmpty {
                    Text(period)
                        .font(.caption2)
                        .foregroundStyle(EduTheme.muted)
                }
            }

            Spacer(minLength: 4)

            VStack(alignment: .trailing, spacing: 8) {
                Text(status.text)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(status.color)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(status.color.opacity(0.12), in: Capsule())

                HStack(spacing: 4) {
                    Image(systemName: "pencil.line")
                        .font(.caption2.weight(.bold))
                    Text(graded ? "Modifier" : "Noter")
                        .font(.caption.weight(.bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(EduTheme.navy, in: Capsule())
            }
        }
        .padding(14)
        .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
    }

    private func teacherStatus(
        _ row: EvaluationRow,
        graded: Bool,
        now: Date
    ) -> (text: String, color: Color) {
        if graded {
            return ("Noté", EduTheme.teal)
        }
        if row.adminConfirmed == false && (row.type == "examen" || row.type == "composition") {
            return ("À confirmer", Color.orange)
        }
        if !isUpcoming(row) {
            // Date passed, still ungraded — not “late homework”, just needs grading.
            return ("À noter", EduTheme.fasoRed)
        }
        if let chip = countdownChip(for: row, now: now, teacherMode: true) {
            return chip
        }
        return ("À venir", EduTheme.navy)
    }

    private func cardHeader(
        _ row: EvaluationRow,
        graded: Bool,
        expanded: Bool,
        expandable: Bool,
        showsChevron: Bool = false,
        gradeAction: String? = nil,
        swatch: SubjectPalette.Swatch,
        now: Date
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            if isExamMode || isQuizMode || (isTeacherAudience && (row.type == "examen" || row.type == "interrogation")) {
                dateBadge(row, swatch: swatch)
            } else {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(swatch.border)
                    .frame(width: 4)
                    .padding(.vertical, 2)
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(row.title?.isEmpty == false ? row.title! : row.typeLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    statusBadge(row, graded: graded, swatch: swatch)
                }

                HStack(spacing: 6) {
                    if isTeacherAudience, type == nil {
                        Text(shortTypeLabel(row))
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(typeTint(row))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(typeTint(row).opacity(0.12), in: Capsule())
                    }
                    if let subject = row.matieres?.name, !subject.isEmpty {
                        Text(subject)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(swatch.border)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(swatch.border.opacity(0.12), in: Capsule())
                    }
                    if isTeacherAudience, let className = row.classes?.name, !className.isEmpty {
                        Text(className)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                }

                HStack(spacing: 8) {
                    if isExamMode || isQuizMode || (isTeacherAudience && (row.type == "examen" || row.type == "interrogation")) {
                        if let time = timeRange(row) {
                            Label(time, systemImage: "clock")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(EduTheme.navy)
                        } else if !row.whenLabel.isEmpty {
                            Label(prettyWhen(row), systemImage: "calendar")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                    } else if !row.whenLabel.isEmpty {
                        Label(prettyWhen(row), systemImage: "calendar")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }

                    if let countdown = countdownChip(for: row, now: now) {
                        Text(countdown.text)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(countdown.color)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(countdown.color.opacity(0.12), in: Capsule())
                    }
                }

                HStack(spacing: 8) {
                    if let period = row.periodLabel, !period.isEmpty {
                        Text(period)
                            .font(.caption2)
                            .foregroundStyle(EduTheme.muted)
                    }
                    Spacer(minLength: 0)
                    if let gradeAction {
                        HStack(spacing: 4) {
                            Image(systemName: "pencil.line")
                                .font(.caption2.weight(.bold))
                            Text(gradeAction)
                                .font(.caption.weight(.bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(EduTheme.navy, in: Capsule())
                    }
                }
            }

            if gradeAction == nil, expandable || showsChevron {
                Image(systemName: showsChevron ? "chevron.right" : "chevron.down")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .rotationEffect(.degrees(!showsChevron && expanded ? 180 : 0))
                    .padding(.top, 4)
            }
        }
        .padding(14)
        .contentShape(Rectangle())
    }

    private func dateBadge(_ row: EvaluationRow, swatch: SubjectPalette.Swatch) -> some View {
        let upcoming = isUpcoming(row)
        return VStack(spacing: 2) {
            Text(dayNumber(row))
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(upcoming ? swatch.border : EduTheme.ink)
            Text(monthShort(row))
                .font(.caption2.weight(.bold))
                .foregroundStyle(EduTheme.muted)
                .textCase(.uppercase)
        }
        .frame(width: 48)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(upcoming ? swatch.fill.opacity(0.9) : Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }

    @ViewBuilder
    private func statusBadge(_ row: EvaluationRow, graded: Bool, swatch: SubjectPalette.Swatch) -> some View {
        if graded {
            Text("Noté")
                .font(.caption2.weight(.bold))
                .foregroundStyle(EduTheme.teal)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(EduTheme.teal.opacity(0.12), in: Capsule())
        } else if isExamMode || isQuizMode {
            let label = relativeDayLabel(row)
            Text(label)
                .font(.caption2.weight(.bold))
                .foregroundStyle(label == "Passé" ? EduTheme.muted : swatch.border)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    (label == "Passé" ? EduTheme.muted : swatch.border).opacity(0.12),
                    in: Capsule()
                )
        } else if isHomeworkInfoMode {
            // Informative only — no “à faire / noté” status.
            EmptyView()
        } else if row.adminConfirmed == false && (row.type == "examen" || row.type == "composition") {
            Text("À confirmer")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.orange)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.orange.opacity(0.12), in: Capsule())
        }
    }

    private func eventDay(_ row: EvaluationRow) -> String? {
        let raw = row.evalDate ?? row.dueDate
        guard let raw, !raw.isEmpty else { return nil }
        return String(raw.prefix(10))
    }

    private func isUpcoming(_ row: EvaluationRow) -> Bool {
        guard let day = eventDay(row) else { return true }
        return day >= EduDates.day()
    }

    private func relativeDayLabel(_ row: EvaluationRow) -> String {
        guard let day = eventDay(row) else { return "Planifié" }
        let today = EduDates.day()
        if day == today { return "Aujourd’hui" }
        if let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date()) {
            if day == EduDates.day(tomorrow) { return "Demain" }
        }
        return day >= today ? "À venir" : "Passé"
    }

    private func dayNumber(_ row: EvaluationRow) -> String {
        guard let day = eventDay(row) else { return "—" }
        let parts = day.split(separator: "-")
        return parts.count >= 3 ? String(parts[2]) : "—"
    }

    private func monthShort(_ row: EvaluationRow) -> String {
        guard let day = eventDay(row) else { return "" }
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count >= 3 else { return "" }
        let comps = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard let date = Calendar.current.date(from: comps) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "MMM"
        return f.string(from: date)
    }

    private func timeRange(_ row: EvaluationRow) -> String? {
        let start = row.startTime.map { String($0.prefix(5)) } ?? ""
        let end = row.endTime.map { String($0.prefix(5)) } ?? ""
        if start.isEmpty && end.isEmpty { return nil }
        if end.isEmpty { return start }
        if start.isEmpty { return end }
        return "\(start) – \(end)"
    }

    private func dueMoment(for row: EvaluationRow) -> Date? {
        guard let day = eventDay(row) else { return nil }
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count >= 3 else { return nil }
        var comps = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        let timeSource = row.startTime ?? ""
        let timeParts = timeSource.split(separator: ":").compactMap { Int($0) }
        if timeParts.count >= 2 {
            comps.hour = timeParts[0]
            comps.minute = timeParts[1]
        } else {
            // End of day for date-only homework due dates
            comps.hour = 23
            comps.minute = 59
        }
        return Calendar.current.date(from: comps)
    }

    private func countdownChip(
        for row: EvaluationRow,
        now: Date,
        teacherMode: Bool = false
    ) -> (text: String, color: Color)? {
        guard !gradedIds.contains(row.id), let target = dueMoment(for: row) else { return nil }
        let seconds = target.timeIntervalSince(now)
        if seconds >= 0 {
            let totalMin = Int(seconds / 60)
            let days = totalMin / (60 * 24)
            let hours = (totalMin % (60 * 24)) / 60
            let mins = totalMin % 60
            let text: String
            if days > 0 {
                text = days == 1 ? "Dans 1 j" : "Dans \(days) j"
            } else if hours > 0 {
                text = hours == 1 ? "Dans 1 h" : "Dans \(hours) h"
            } else if mins > 0 {
                text = mins == 1 ? "Dans 1 min" : "Dans \(mins) min"
            } else {
                text = "Maintenant"
            }
            let color: Color = days == 0 ? Color.orange : EduTheme.navy
            return (text, color)
        } else if teacherMode {
            // Teachers: past date = “still to grade”, not student-style “en retard”.
            return ("À noter", EduTheme.fasoRed)
        } else if isExamMode || isQuizMode || isHomeworkInfoMode
                    || row.type == "examen" || row.type == "composition" || row.type == "interrogation" || row.type == "devoir" {
            // Past supervised work / interrogations show “Passé”.
            // Exercices de maison aren’t graded here — no “en retard”.
            return nil
        } else {
            let lateMin = Int((-seconds) / 60)
            let days = lateMin / (60 * 24)
            let hours = (lateMin % (60 * 24)) / 60
            let text: String
            if days > 0 {
                text = days == 1 ? "En retard · 1 j" : "En retard · \(days) j"
            } else if hours > 0 {
                text = hours == 1 ? "En retard · 1 h" : "En retard · \(hours) h"
            } else {
                text = "En retard"
            }
            return (text, EduTheme.fasoRed)
        }
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.white)
    }

    private func itemNoun(_ count: Int) -> String {
        switch type {
        case "interrogation": return count == 1 ? "interrogation" : "interrogations"
        case "devoir": return count == 1 ? "exercice" : "exercices"
        case "examen": return count == 1 ? "devoir" : "devoirs"
        case "composition": return count == 1 ? "composition" : "compositions"
        default: return count == 1 ? "évaluation" : "évaluations"
        }
    }

    private func shortTypeLabel(_ row: EvaluationRow) -> String {
        switch row.type {
        case "interrogation": return "Interro"
        case "devoir": return "Exercice"
        case "examen": return "Devoir"
        case "composition": return "Compo"
        default: return row.typeLabel
        }
    }

    private func typeTint(_ row: EvaluationRow) -> Color {
        switch row.type {
        case "interrogation": return Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)
        case "devoir": return EduTheme.fasoRed
        case "examen": return EduTheme.navy
        case "composition": return EduTheme.teal
        default: return EduTheme.muted
        }
    }

    /// One sentence for VoiceOver: what, which subject, when, and where it stands.
    private func spokenLabel(_ row: EvaluationRow, graded: Bool, now: Date) -> String {
        var parts: [String] = [shortTypeLabel(row)]
        parts.append(row.title?.isEmpty == false ? row.title! : row.typeLabel)
        if let subject = row.matieres?.name, !subject.isEmpty { parts.append(subject) }
        if let when = spokenWhen(row) {
            parts.append(isHomeworkInfoMode ? "pour le \(when)" : when)
        }
        if isHomeworkInfoMode {
            parts.append("à lire")
        } else if graded {
            parts.append("noté")
        } else if let chip = countdownChip(for: row, now: now) {
            parts.append(Self.spokenUnits(chip.text))
        } else if isExamMode || isQuizMode {
            parts.append(relativeDayLabel(row))
        }
        if let period = row.periodLabel, !period.isEmpty { parts.append(period) }
        return parts.joined(separator: ", ")
    }

    private func spokenWhen(_ row: EvaluationRow) -> String? {
        guard let day = eventDay(row) else { return nil }
        let p = day.split(separator: "-").compactMap { Int($0) }
        guard p.count >= 3,
              let date = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
        else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEEE d MMMM"
        var text = f.string(from: date)
        if let start = row.startTime?.prefix(5), !start.isEmpty {
            text += " à \(start.replacingOccurrences(of: ":", with: " h "))"
        }
        return text
    }

    private static func spokenUnits(_ text: String) -> String {
        text.replacingOccurrences(of: " · ", with: ", ")
            .replacingOccurrences(of: #"\b1 j\b"#, with: "1 jour", options: .regularExpression)
            .replacingOccurrences(of: #"(\d+) j\b"#, with: "$1 jours", options: .regularExpression)
            .replacingOccurrences(of: #"\b1 h\b"#, with: "1 heure", options: .regularExpression)
            .replacingOccurrences(of: #"(\d+) h\b"#, with: "$1 heures", options: .regularExpression)
            .replacingOccurrences(of: #"\b1 min\b"#, with: "1 minute", options: .regularExpression)
            .replacingOccurrences(of: #"(\d+) min\b"#, with: "$1 minutes", options: .regularExpression)
    }

    private func prettyWhen(_ row: EvaluationRow) -> String {
        let raw = row.evalDate ?? row.dueDate ?? ""
        let parts = raw.split(separator: "-").compactMap { Int($0) }
        var label = raw
        if parts.count >= 3 {
            let comps = DateComponents(year: parts[0], month: parts[1], day: parts[2])
            if let date = Calendar.current.date(from: comps) {
                let f = DateFormatter()
                f.locale = Locale(identifier: "fr_FR")
                f.dateFormat = "EEEE d MMM"
                label = f.string(from: date).capitalized
            }
        }
        let start = row.startTime.map { String($0.prefix(5)) } ?? ""
        let end = row.endTime.map { String($0.prefix(5)) } ?? ""
        if start.isEmpty { return label }
        if end.isEmpty { return "\(label) · \(start)" }
        return "\(label) · \(start)–\(end)"
    }

    private func load(isRefresh: Bool) async {
        if !isRefresh && !ready { loading = true }
        do {
            let api = EduAPI()
            var resolvedClass = classId
            var resolvedName = className
            let sid = resolvedStudentId

            if resolvedClass == nil, let sid {
                if let enrollment = try await api.activeEnrollment(studentId: sid) {
                    resolvedClass = enrollment.classId
                    resolvedName = enrollment.className
                }
            }

            // Student/parent path with no class → nothing to show (don't pretend it's a fetch bug).
            if sid != nil, resolvedClass == nil, classIds == nil, teacherId == nil {
                rows = []
                gradedIds = []
                className = resolvedName
                error = nil
                loading = false
                ready = true
                return
            }

            // Students can only see confirmed rows (RLS). Mirror web MesDevoirs:
            // examens → confirmedOnly; exercices → still confirmed via RLS, but we
            // also request confirmed when browsing as a student without teacher entry.
            let forceConfirmed = confirmedOnly || (sid != nil && teacherId == nil && allowEntry == false)

            let fetched = try await api.fetchEvaluations(
                classId: resolvedClass,
                classIds: classIds,
                teacherId: teacherId,
                type: type,
                confirmedOnly: forceConfirmed
            )
            rows = fetched
            className = resolvedName

            // Exercices de maison aren’t graded for students — skip the notes lookup.
            if let sid, !fetched.isEmpty, type != "devoir" {
                gradedIds = (try? await api.fetchGradedEvaluationIds(
                    studentId: sid,
                    evaluationIds: fetched.map(\.id)
                )) ?? []
            } else {
                gradedIds = []
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
        ready = true
    }
}

/// Teachers create interrogations (graded). Exercices de maison go in the cahier, not here.
struct CreateEvaluationSheet: View {
    var preselectedClassId: String? = nil
    var lockedType: String? = nil
    var onCreated: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var assignments: [TeachingAssignment] = []
    @State private var selected: TeachingAssignment?
    @State private var evalType = "interrogation"
    @State private var title = ""
    @State private var description = ""
    @State private var period = "Trimestre 1"
    @State private var maxScoreText = "20"
    @State private var evalDate = Date()
    @State private var includeTime = false
    @State private var startTime = Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var endTime = Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?

    private let periods = ["Trimestre 1", "Trimestre 2", "Trimestre 3"]
    private let teacherTypes: [(id: String, label: String)] = [
        ("interrogation", "Interrogation"),
    ]

    private var filteredAssignments: [TeachingAssignment] {
        guard let preselectedClassId else { return assignments }
        return assignments.filter { $0.classSectionId == preselectedClassId }
    }

    private var canSave: Bool {
        selected != nil
            && selected?.subjectId != nil
            && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && Double(maxScoreText.replacingOccurrences(of: ",", with: ".")) != nil
            && !saving
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if loading {
                        ProgressView().tint(EduTheme.navy).frame(maxWidth: .infinity, minHeight: 120)
                    } else if filteredAssignments.isEmpty {
                        Text("Aucune classe assignée pour créer une évaluation.")
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 24)
                    } else {
                        fieldBlock("Classe et matière") {
                            Picker("Classe et matière", selection: $selected) {
                                Text("Choisir").tag(Optional<TeachingAssignment>.none)
                                ForEach(filteredAssignments) { item in
                                    Text("\(item.classes?.name ?? "Classe") — \(item.matieres?.name ?? "")")
                                        .tag(Optional(item))
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(EduTheme.navy)
                        }

                        Text("Interrogation")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.ink)
                        Text("Les exercices de maison se mettent dans le cahier de textes.")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)

                        fieldBlock("Titre") {
                            TextField("Ex. Interro chap. 2", text: $title)
                        }

                        fieldBlock("Description (optionnel)") {
                            TextField("Consignes, chapitre…", text: $description, axis: .vertical)
                                .lineLimit(2...5)
                        }

                        fieldBlock("Période") {
                            Picker("Période", selection: $period) {
                                ForEach(periods, id: \.self) { Text($0).tag($0) }
                            }
                            .pickerStyle(.segmented)
                        }

                        HStack(spacing: 12) {
                            fieldBlock("Note max") {
                                TextField("20", text: $maxScoreText)
                                    .keyboardType(.decimalPad)
                            }
                            DatePicker("Date", selection: $evalDate, displayedComponents: .date)
                                .tint(EduTheme.navy)
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .trailing)
                                .padding(.top, 22)
                        }

                        Toggle(isOn: $includeTime) {
                            Text("Horaires")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.ink)
                        }
                        .tint(EduTheme.navy)

                        if includeTime {
                            HStack(spacing: 12) {
                                DatePicker("Début", selection: $startTime, displayedComponents: .hourAndMinute)
                                    .tint(EduTheme.navy)
                                DatePicker("Fin", selection: $endTime, displayedComponents: .hourAndMinute)
                                    .tint(EduTheme.navy)
                            }
                        }

                        if let error {
                            Text(error)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(EduTheme.fasoRed)
                        }

                        Button {
                            Task { await save() }
                        } label: {
                            HStack {
                                if saving { ProgressView().tint(.white) }
                                Text("Créer l'évaluation").fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .foregroundStyle(.white)
                            .background(canSave ? EduTheme.navy : EduTheme.muted.opacity(0.35), in: Capsule())
                        }
                        .disabled(!canSave)
                        .padding(.top, 4)
                    }
                }
                .padding(20)
            }
            .background(EduTheme.loginBackground.ignoresSafeArea())
            .navigationTitle("Nouvelle évaluation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
            .task { await load() }
        }
        .preferredColorScheme(.light)
        .tint(EduTheme.navy)
    }

    private func fieldBlock<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
            content()
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(EduTheme.fieldBorder.opacity(0.7), lineWidth: 1)
                )
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        guard let tid = auth.userId else { return }
        let rows = (try? await EduAPI().fetchTeachingAssignments(teacherId: tid)) ?? []
        assignments = rows
        let options = filteredAssignments
        if let preselectedClassId,
           let match = options.first(where: { $0.classSectionId == preselectedClassId }) {
            selected = match
        } else if options.count == 1 {
            selected = options.first
        }
        evalType = lockedType ?? "interrogation"
    }

    private func save() async {
        guard let selected, let subjectId = selected.subjectId, let tid = auth.userId else { return }
        let maxScore = Double(maxScoreText.replacingOccurrences(of: ",", with: ".")) ?? 20
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDesc = description.trimmingCharacters(in: .whitespacesAndNewlines)
        saving = true
        defer { saving = false }
        do {
            let timeFmt = DateFormatter()
            timeFmt.locale = Locale(identifier: "en_US_POSIX")
            timeFmt.dateFormat = "HH:mm:ss"
            _ = try await EduAPI().createEvaluation(EvaluationInsert(
                class_section_id: selected.classSectionId,
                subject_id: subjectId,
                teacher_id: tid,
                period_label: period,
                type: lockedType ?? evalType,
                title: trimmedTitle,
                description: trimmedDesc.isEmpty ? nil : trimmedDesc,
                max_score: maxScore,
                eval_date: EduDates.day(evalDate),
                start_time: includeTime ? timeFmt.string(from: startTime) : nil,
                end_time: includeTime ? timeFmt.string(from: endTime) : nil,
                admin_confirmed: true
            ))
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct GradeEntryView: View {
    let evaluation: EvaluationRow
    var recordedBy: String? = nil
    @EnvironmentObject private var auth: AuthViewModel
    @FocusState private var focusedStudentId: String?
    @State private var drafts: [ScoreDraft] = []
    @State private var loading = true
    @State private var saving = false
    @State private var message: String?
    @State private var error: String?

    struct ScoreDraft: Identifiable {
        let id: String
        var noteId: String?
        var name: String
        var score: String
        var absent: Bool
    }

    private var maxScore: Double { evaluation.maxScore ?? 20 }

    private var filledCount: Int {
        drafts.filter { $0.absent || !$0.score.trimmingCharacters(in: .whitespaces).isEmpty }.count
    }

    private var progress: Double {
        guard !drafts.isEmpty else { return 0 }
        return Double(filledCount) / Double(drafts.count)
    }

    private var provisionalAverage: Double? {
        let scores = drafts.compactMap { draft -> Double? in
            guard !draft.absent else { return nil }
            let raw = draft.score.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
            guard !raw.isEmpty, let value = Double(raw) else { return nil }
            return value
        }
        guard !scores.isEmpty else { return nil }
        return scores.reduce(0, +) / Double(scores.count)
    }

    var body: some View {
        PremiumScreenChrome {
            ZStack(alignment: .bottom) {
                if loading {
                    LoadingBlock()
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            headerCard
                            progressCard
                            if drafts.isEmpty {
                                PremiumEmpty(
                                    title: "Aucun élève",
                                    systemImage: "person.3",
                                    message: "Cette classe n’a pas encore d’élèves inscrits."
                                )
                            } else {
                                LazyVStack(spacing: 10) {
                                    ForEach($drafts) { $draft in
                                        studentCard($draft)
                                    }
                                }
                            }
                            if let error {
                                Text(error)
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(EduTheme.fasoRed)
                            }
                            if let message {
                                Text(message)
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(EduTheme.teal)
                            }
                        }
                        .padding(16)
                        .padding(.bottom, 100)
                    }
                    .scrollDismissesKeyboard(.interactively)

                    saveBar
                }
            }
        }
        .premiumTitle("Saisie des notes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("OK") { focusedStudentId = nil }
                    .fontWeight(.semibold)
            }
        }
        .task { await load() }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(evaluation.title?.isEmpty == false ? evaluation.title! : evaluation.typeLabel)
                .font(.title3.weight(.bold))
                .foregroundStyle(EduTheme.ink)
            HStack(spacing: 8) {
                if let subject = evaluation.matieres?.name, !subject.isEmpty {
                    Text(subject)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(EduTheme.navy)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(EduTheme.navy.opacity(0.1), in: Capsule())
                }
                Text(evaluation.typeLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
            }
            if !evaluation.whenLabel.isEmpty {
                Text(evaluation.whenLabel)
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            }
            Text("Note sur \(formatScore(maxScore))")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(EduTheme.tealDark)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.05), radius: 10, y: 3)
        )
    }

    private var progressCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Progression")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Spacer()
                Text("\(filledCount)/\(drafts.count)")
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.navy)
            }
            ProgressView(value: progress)
                .tint(EduTheme.teal)
            if let avg = provisionalAverage {
                Text("Moyenne provisoire : \(formatScore(avg)) / \(formatScore(maxScore))")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
            } else {
                Text("Saisissez une note, ou marquez l’élève absent.")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
        )
    }

    private func studentCard(_ draft: Binding<ScoreDraft>) -> some View {
        let value = draft.wrappedValue
        let invalid = isInvalid(value)
        let status = rowStatus(value)

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(value.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(status.label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(status.color)
                }

                Spacer(minLength: 8)

                HStack(spacing: 6) {
                    TextField(
                        "0",
                        text: Binding(
                            get: { draft.wrappedValue.score },
                            set: { draft.wrappedValue.score = sanitizeScoreInput($0) }
                        )
                    )
                    .keyboardType(.decimalPad)
                    .focused($focusedStudentId, equals: value.id)
                    .multilineTextAlignment(.center)
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(value.absent ? EduTheme.muted : EduTheme.ink)
                    .disabled(value.absent)
                    .frame(width: 72, height: 48)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(value.absent ? Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255) : .white)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(
                                invalid ? EduTheme.fasoRed : (focusedStudentId == value.id ? EduTheme.teal : Color.black.opacity(0.1)),
                                lineWidth: invalid || focusedStudentId == value.id ? 2 : 1
                            )
                    )

                    Text("/ \(formatScore(maxScore))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(EduTheme.muted)
                }

                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        let next = !draft.wrappedValue.absent
                        draft.wrappedValue.absent = next
                        if next {
                            draft.wrappedValue.score = ""
                            if focusedStudentId == value.id { focusedStudentId = nil }
                        }
                    }
                } label: {
                    Text(draft.wrappedValue.absent ? "Absent ✓" : "Absent")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(draft.wrappedValue.absent ? Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255) : EduTheme.ink)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .background(
                            Capsule().fill(
                                draft.wrappedValue.absent
                                    ? Color(red: 254 / 255, green: 243 / 255, blue: 199 / 255)
                                    : Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)
                            )
                        )
                        .overlay(
                            Capsule().stroke(
                                draft.wrappedValue.absent
                                    ? Color(red: 251 / 255, green: 191 / 255, blue: 36 / 255)
                                    : Color.black.opacity(0.1),
                                lineWidth: 1
                            )
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(draft.wrappedValue.absent ? "Retirer l’absence" : "Marquer absent")
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.white)
        )
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(status.color)
                .frame(width: 4)
                .padding(.vertical, 10)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
    }

    private var saveBar: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.black.opacity(0.06)).frame(height: 1)
            Button {
                Task { await save() }
            } label: {
                HStack(spacing: 8) {
                    if saving {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "checkmark.circle.fill")
                    }
                    Text(saving ? "Enregistrement…" : "Enregistrer les notes")
                        .font(.body.weight(.bold))
                }
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(.white)
                .background(
                    (canSave ? EduTheme.navy : EduTheme.muted.opacity(0.45)),
                    in: Capsule()
                )
            }
            .disabled(!canSave || saving)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 16)
            .background(Color.white)
        }
    }

    private var canSave: Bool {
        !drafts.isEmpty && drafts.contains { draft in
            if draft.absent { return true }
            let raw = draft.score.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
            return !raw.isEmpty && Double(raw) != nil && !isInvalid(draft)
        }
    }

    private struct RowStatus {
        let label: String
        let color: Color
    }

    private func rowStatus(_ draft: ScoreDraft) -> RowStatus {
        if isInvalid(draft) {
            return RowStatus(label: "Note invalide", color: EduTheme.fasoRed)
        }
        if draft.absent {
            return RowStatus(label: "Absent", color: Color(red: 180 / 255, green: 83 / 255, blue: 9 / 255))
        }
        if draft.score.trimmingCharacters(in: .whitespaces).isEmpty {
            return RowStatus(label: "À saisir", color: EduTheme.muted)
        }
        if draft.noteId != nil {
            return RowStatus(label: "Enregistrée", color: EduTheme.fasoGreen)
        }
        return RowStatus(label: "Prête", color: EduTheme.teal)
    }

    private func isInvalid(_ draft: ScoreDraft) -> Bool {
        guard !draft.absent else { return false }
        let raw = draft.score.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        guard !raw.isEmpty else { return false }
        guard let value = Double(raw) else { return true }
        return value < 0 || value > maxScore
    }

    private func sanitizeScoreInput(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: " ", with: "")
            .filter { $0.isNumber || $0 == "," || $0 == "." }
    }

    private func load() async {
        guard let classId = evaluation.classSectionId else {
            error = "Cette évaluation n’a pas de classe."
            loading = false
            return
        }
        loading = true
        do {
            let api = EduAPI()
            let students = try await api.fetchStudentsInClass(classSectionId: classId)
            let notes = try await api.fetchGradesForEvaluation(evaluation.id)
            let byStudent = Dictionary(notes.map { ($0.studentId, $0) }, uniquingKeysWith: { a, _ in a })
            drafts = students.map { student in
                let note = byStudent[student.studentId]
                let score = note?.isAbsent == true ? "" : (note?.score.map { formatScore($0) } ?? "")
                return ScoreDraft(
                    id: student.studentId,
                    noteId: note?.id,
                    name: student.fullName,
                    score: score,
                    absent: note?.isAbsent == true
                )
            }
            error = nil
            message = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func save() async {
        guard let classId = evaluation.classSectionId, let subjectId = evaluation.subjectId else { return }
        let recorder = recordedBy ?? auth.userId
        guard let recorder else { return }
        focusedStudentId = nil
        saving = true
        defer { saving = false }
        let period = evaluation.periodLabel ?? "Trimestre 1"
        var inserts: [GradeInsert] = []
        var updates: [GradeUpdate] = []
        for draft in drafts {
            if isInvalid(draft) {
                error = "Corrigez les notes invalides avant d’enregistrer."
                return
            }
            let trimmed = draft.score.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
            if !draft.absent && trimmed.isEmpty { continue }
            guard draft.absent || Double(trimmed) != nil else { continue }
            let score = draft.absent ? 0 : (Double(trimmed) ?? 0)
            if let noteId = draft.noteId {
                updates.append(GradeUpdate(
                    id: noteId, student_id: draft.id, subject_id: subjectId, class_section_id: classId,
                    period_label: period, evaluation_id: evaluation.id, score: score, max_score: maxScore,
                    is_absent: draft.absent, comment: nil, recorded_by: recorder
                ))
            } else {
                inserts.append(GradeInsert(
                    student_id: draft.id, subject_id: subjectId, class_section_id: classId,
                    period_label: period, evaluation_id: evaluation.id, score: score, max_score: maxScore,
                    is_absent: draft.absent, comment: nil, recorded_by: recorder
                ))
            }
        }
        do {
            try await EduAPI().saveGrades(inserts: inserts, updates: updates)
            message = "Notes enregistrées."
            error = nil
            await load()
        } catch {
            self.error = error.localizedDescription
            message = nil
        }
    }

    private func formatScore(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value)
    }
}

struct CahierFeedView: View {
    var classId: String? = nil
    var studentId: String? = nil
    var title: String = "Cahier de textes"
    @EnvironmentObject private var auth: AuthViewModel
    @State private var entries: [CahierEntry] = []
    @State private var className: String?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if entries.isEmpty {
                    PremiumEmpty(title: "Cahier vide", systemImage: "book", message: "Rien dans le cahier pour le moment.")
                } else {
                    List(entries) { entry in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(entry.matieres?.name ?? "Cours")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                Spacer()
                                Text(entry.entryDate)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(EduTheme.navy)
                            }
                            if let content = entry.content, !content.isEmpty {
                                Text(content)
                                    .font(.subheadline)
                                    .foregroundStyle(EduTheme.ink.opacity(0.9))
                            }
                            if let homework = entry.homework, !homework.isEmpty {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("À faire")
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(EduTheme.muted)
                                    Text(homework)
                                        .font(.subheadline)
                                        .foregroundStyle(EduTheme.ink)
                                    if let due = entry.homeworkDue, !due.isEmpty {
                                        Text("Pour le \(due)")
                                            .font(.caption)
                                            .foregroundStyle(EduTheme.muted)
                                    }
                                }
                                .padding(10)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            if let teacher = entry.teacher?.fullName, !teacher.isEmpty {
                                Text(teacher)
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                        }
                        .padding(.vertical, 6)
                        .listRowBackground(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(.white)
                                .padding(.vertical, 3)
                        )
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle(className.map { "Cahier · \($0)" } ?? title)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        loading = entries.isEmpty
        do {
            let api = EduAPI()
            var resolved = classId
            if resolved == nil {
                let sid = studentId ?? auth.userId
                if let sid, let enrollment = try await api.activeEnrollment(studentId: sid) {
                    resolved = enrollment.classId
                    className = enrollment.className
                }
            }
            guard let resolved else {
                entries = []
                error = nil
                loading = false
                return
            }
            entries = try await api.fetchCahier(classId: resolved)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct BulletinBoard: View {
    let studentId: String
    var title: String = "Bulletin"
    @EnvironmentObject private var auth: AuthViewModel
    @State private var period = "Trimestre 1"
    @State private var stats: BulletinClassStats?
    @State private var grades: [GradeRow] = []
    @State private var expandedIds: Set<String> = []
    @State private var classId: String?
    @State private var className: String?
    @State private var studentName: String?
    @State private var loading = true
    @State private var exporting = false
    @State private var exportError: String?
    @State private var error: String?

    private let periods = ["Trimestre 1", "Trimestre 2", "Trimestre 3", "Année"]

    private var subjects: [BulletinSubjectStat] {
        stats?.subjects ?? []
    }

    private var canExport: Bool {
        guard let stats else { return false }
        let hasSubjects = !(stats.subjects?.isEmpty ?? true)
        return hasSubjects || stats.general != nil
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if studentId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    PremiumEmpty(title: "Élève introuvable", systemImage: "person.crop.circle.badge.exclamationmark")
                } else if loading && stats == nil {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else {
                    VStack(spacing: 0) {
                        stickyHeader
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .padding(.bottom, 10)
                            .background(EduTheme.loginBackground)

                        HStack {
                            Text("MATIÈRES")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(EduTheme.muted)
                                .tracking(0.6)
                            Spacer()
                            Text("\(subjects.count)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(EduTheme.muted)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(EduTheme.loginBackground)

                        ScrollView {
                            LazyVStack(spacing: 10) {
                                if subjects.isEmpty {
                                    Text("Aucune note sur cette période.")
                                        .font(.subheadline)
                                        .foregroundStyle(EduTheme.muted)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(16)
                                        .background(cardBackground)
                                } else {
                                    ForEach(subjects) { line in
                                        subjectDropdown(line)
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.bottom, 24)
                        }
                        .refreshable { await load(reset: true) }
                    }
                }
            }
        }
        .premiumTitle(title)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await exportPdf() }
                } label: {
                    if exporting {
                        ProgressView()
                    } else {
                        Image(systemName: "square.and.arrow.down")
                    }
                }
                .disabled(exporting || !canExport)
                .accessibilityLabel("Télécharger le bulletin PDF")
            }
        }
        .alert("Export impossible", isPresented: Binding(
            get: { exportError != nil },
            set: { if !$0 { exportError = nil } }
        )) {
            Button("OK", role: .cancel) { exportError = nil }
        } message: {
            Text(exportError ?? "")
        }
        .task { await load(reset: true) }
        .onChange(of: period) { _, _ in
            expandedIds.removeAll()
            Task { await load(reset: false) }
        }
    }

    private func exportPdf() async {
        guard let stats, let classId else {
            exportError = "Bulletin incomplet."
            return
        }
        if (stats.subjects ?? []).isEmpty, stats.general == nil, period != "Année" {
            exportError = "Aucune note pour cette période."
            return
        }
        exporting = true
        defer { exporting = false }

        let api = EduAPI()
        async let codeTask = api.issueBulletinCode(
            studentId: studentId,
            classSectionId: classId,
            periodLabel: period
        )
        async let annualTask: AnnualAverageResult? = period == "Année"
            ? await api.fetchAnnualAverage(studentId: studentId, classSectionId: classId)
            : nil
        async let schoolTask: School? = {
            if let id = auth.schoolId {
                return try? await api.fetchSchool(id: id)
            }
            return auth.schools.first
        }()
        async let profileTask: Profile? = {
            if studentId == auth.userId { return auth.profile }
            let rows: [Profile] = (try? await SupabaseManager.client
                .from("profils")
                .select("id, first_name, last_name, email, phone, avatar_url, date_of_birth, gender, address, matricule, must_change_password, family_managed, last_login_at, active")
                .eq("id", value: studentId)
                .limit(1)
                .execute()
                .value) ?? []
            return rows.first
        }()

        let code = await codeTask
        let annual = await annualTask
        let school = await schoolTask
        let profile = await profileTask
        // HTTPS handoff (Camera only opens http(s)) → tries edufaso:// then web verify.
        let verifyURL = code.map {
            let enc = $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0
            return "https://hbfjtsxzueftoiryzhxh.supabase.co/functions/v1/ouvrir-verifier?c=\(enc)"
        }

        if period == "Année",
           (annual?.trimesters ?? []).allSatisfy({ $0.generalAverage == nil }),
           stats.general == nil {
            exportError = "Aucune note sur l’année."
            return
        }

        let lastName = profile?.lastName ?? studentName?.split(separator: " ").last.map(String.init)
        let data = BulletinPdf.make(
            .init(
                school: .init(
                    name: school?.name ?? auth.schools.first?.name ?? "École",
                    city: school?.city ?? auth.schools.first?.city,
                    address: school?.address,
                    phone: school?.phone,
                    email: school?.email
                ),
                student: .init(
                    firstName: profile?.firstName,
                    lastName: profile?.lastName,
                    dateOfBirth: profile?.dateOfBirth,
                    gender: profile?.gender,
                    matricule: profile?.matricule
                ),
                className: stats.className ?? className ?? "—",
                periodLabel: period,
                stats: stats,
                annual: annual,
                verificationCode: code,
                verificationURL: verifyURL,
                logo: UIImage(named: "EduFasoLogo")
            )
        )
        let filePeriod = period == "Année" ? "annee" : period.replacingOccurrences(of: " ", with: "-")
        PdfShare.present(data: data, fileName: "bulletin-\(lastName ?? "eleve")-\(filePeriod).pdf")
    }

    private var stickyHeader: some View {
        VStack(spacing: 12) {
            EduPeriodSegmentPicker(
                options: periods.map { ($0, $0) },
                selection: $period
            )

            VStack(spacing: 10) {
                if let className = stats?.className ?? className {
                    Text(className)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(EduTheme.muted)
                }
                Text("Moyenne générale")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
                Text(stats?.general?.studentAvg.map { String(format: "%.2f / 20", $0) } ?? "—")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle((stats?.general?.studentAvg ?? 0) >= 10 ? EduTheme.teal : Color.orange)

                HStack(spacing: 16) {
                    if let rank = stats?.general?.rank, let total = stats?.general?.rankedCount {
                        metricPill("Rang", "\(rank)/\(total)")
                    }
                    if let classAvg = stats?.general?.classAvg {
                        metricPill("Classe", String(format: "%.1f", classAvg))
                    }
                    if let absences = stats?.attendance?.absences {
                        metricPill("Absences", "\(absences)")
                    }
                    if let lates = stats?.attendance?.lates {
                        metricPill("Retards", "\(lates)")
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .padding(.horizontal, 12)
            .background(cardBackground)
        }
    }

    private func subjectDropdown(_ line: BulletinSubjectStat) -> some View {
        let expanded = expandedIds.contains(line.id)
        let rows = gradesForSubject(line)
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expanded {
                        expandedIds.remove(line.id)
                    } else {
                        expandedIds.insert(line.id)
                    }
                }
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(line.subjectName ?? "Matière")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.ink)
                            .multilineTextAlignment(.leading)
                        Text([
                            line.coefficient.map { "coef \($0.formatted())" },
                            line.teacherName,
                            line.rank.map { "rang \($0)" },
                        ].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .multilineTextAlignment(.leading)
                        if let classAvg = line.classAvg {
                            Text("Moy. classe \(String(format: "%.1f", classAvg))")
                                .font(.caption2)
                                .foregroundStyle(EduTheme.muted)
                        }
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 6) {
                        Text(line.studentAvg.map { String(format: "%.2f", $0) } ?? "—")
                            .font(.headline.monospacedDigit())
                            .foregroundStyle((line.studentAvg ?? 0) >= 10 ? EduTheme.teal : Color.orange)
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(EduTheme.muted)
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                    }
                }
                .padding(14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expanded {
                Divider().padding(.horizontal, 14)
                if rows.isEmpty {
                    Text(period == "Année" ? "Aucune note sur l’année." : "Aucune note sur \(period.lowercased()).")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, grade in
                            if index > 0 {
                                Divider().padding(.leading, 14)
                            }
                            gradeDetailRow(grade)
                        }
                    }
                }
            }
        }
        .background(cardBackground)
    }

    private func gradeDetailRow(_ grade: GradeRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(gradeTitle(grade))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(EduTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    if let type = grade.evaluations?.type, !type.isEmpty {
                        Text(typeLabel(type))
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.navy)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(EduTheme.navy.opacity(0.08), in: Capsule())
                    }
                    if period == "Année", let p = grade.periodLabel, !p.isEmpty {
                        Text(p)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                    if let date = grade.evaluations?.evalDate, !date.isEmpty {
                        Text(prettyDate(date))
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                }
            }
            Spacer(minLength: 8)
            gradeScore(grade)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private func gradeScore(_ grade: GradeRow) -> some View {
        if grade.isAbsent == true {
            Text("Absent")
                .font(.caption.weight(.bold))
                .foregroundStyle(.orange)
        } else if let score = grade.score, let max = grade.maxScore, max > 0 {
            let on20 = (score / max) * 20
            Text(String(format: "%.1f / 20", on20))
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(on20 >= 10 ? EduTheme.teal : Color.orange)
        } else if let score = grade.score {
            Text(String(format: "%.1f / %.0f", score, grade.maxScore ?? 20))
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(EduTheme.teal)
        } else {
            Text("—").foregroundStyle(EduTheme.muted)
        }
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.white)
    }

    private func metricPill(_ title: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(EduTheme.ink)
            Text(title).font(.caption2).foregroundStyle(EduTheme.muted)
        }
    }

    private func gradesForSubject(_ line: BulletinSubjectStat) -> [GradeRow] {
        grades.filter { grade in
            let sameSubject: Bool
            if let sid = line.subjectId, let gid = grade.subjectId, !sid.isEmpty, !gid.isEmpty {
                sameSubject = sid == gid
            } else if let sid = line.subjectId, let mid = grade.matieres?.id, !sid.isEmpty {
                sameSubject = sid == mid
            } else {
                let left = (line.subjectName ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                let right = (grade.matieres?.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                sameSubject = !left.isEmpty && left == right
            }
            guard sameSubject else { return false }
            if period == "Année" { return true }
            return grade.periodLabel == period
        }
        .sorted {
            ($0.evaluations?.evalDate ?? $0.createdAt ?? "") > ($1.evaluations?.evalDate ?? $1.createdAt ?? "")
        }
    }

    private func gradeTitle(_ grade: GradeRow) -> String {
        if let title = grade.evaluations?.title, !title.isEmpty { return title }
        return grade.matieres?.name ?? "Note"
    }

    private func typeLabel(_ type: String) -> String {
        switch type {
        case "devoir": return "Exercice"
        case "examen": return "Devoir"
        case "composition": return "Composition"
        case "interrogation": return "Interro"
        default: return type.capitalized
        }
    }

    private func prettyDate(_ iso: String) -> String {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count >= 3 else { return iso }
        let comps = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard let date = Calendar.current.date(from: comps) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d MMM"
        return f.string(from: date)
    }

    private func load(reset: Bool) async {
        guard !studentId.isEmpty else {
            loading = false
            return
        }
        if reset { loading = stats == nil }
        do {
            let api = EduAPI()
            if classId == nil {
                if let enrollment = try await api.activeEnrollment(studentId: studentId) {
                    classId = enrollment.classId
                    className = enrollment.className
                }
            }
            if studentName == nil {
                if studentId == auth.userId {
                    studentName = auth.profile?.fullName
                } else {
                    struct Mini: Decodable {
                        let first_name: String?
                        let last_name: String?
                    }
                    let rows: [Mini] = (try? await SupabaseManager.client
                        .from("profils")
                        .select("first_name, last_name")
                        .eq("id", value: studentId)
                        .limit(1)
                        .execute()
                        .value) ?? []
                    if let p = rows.first {
                        studentName = "\(p.first_name ?? "") \(p.last_name ?? "")"
                            .trimmingCharacters(in: .whitespaces)
                    }
                }
            }
            guard let classId else {
                error = "Aucune inscription active."
                stats = nil
                loading = false
                return
            }
            async let statsTask = api.fetchBulletinStats(
                studentId: studentId,
                classSectionId: classId,
                periodLabel: period
            )
            async let gradesTask = api.fetchGrades(studentId: studentId)
            stats = try await statsTask
            grades = (try? await gradesTask) ?? grades
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct ClassHubView: View {
    private struct SubjectLine: Identifiable, Hashable {
        let id: String
        let name: String
        let averageOn20: Double?
        let gradeCount: Int
    }

    let classId: String
    let className: String
    @EnvironmentObject private var auth: AuthViewModel

    @State private var students: [PresenceDraft] = []
    @State private var gradeLevel: String?
    @State private var mySubjects: [SubjectLine] = []
    @State private var upcoming: [EvaluationRow] = []
    @State private var studentSearch = ""
    @State private var loading = true
    @State private var error: String?

    private var isTeacher: Bool { auth.primaryRole == .teacher }

    private var filteredStudents: [PresenceDraft] {
        let q = studentSearch.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return students }
        return students.filter { $0.fullName.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            heroHeader
                            actionsGrid
                            if !mySubjects.isEmpty {
                                subjectsSection
                            }
                            if !upcoming.isEmpty {
                                upcomingSection
                            }
                            rosterSection
                        }
                        .padding(16)
                        .padding(.bottom, 28)
                    }
                    .refreshable { await load() }
                }
            }
        }
        .premiumTitle(className)
        .task { await load() }
    }

    // MARK: Hero

    private var heroHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(className)
                .font(.largeTitle.weight(.bold))
                .foregroundStyle(EduTheme.ink)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                metaChip(systemImage: "person.2.fill", text: "\(students.count) élève\(students.count == 1 ? "" : "s")")
                if let gradeLevel, !gradeLevel.isEmpty {
                    metaChip(systemImage: "graduationcap.fill", text: gradeLevel)
                }
                if isTeacher, !mySubjects.isEmpty {
                    metaChip(
                        systemImage: "book.fill",
                        text: mySubjects.count == 1
                            ? (mySubjects.first?.name ?? "Matière")
                            : "\(mySubjects.count) matières"
                    )
                }
            }

            Text(isTeacher
                 ? "Ta classe — notes, présences et suivi des élèves."
                 : "Fiche classe — effectif, notes et outils du quotidien.")
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [EduTheme.brand50, .white],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(color: .black.opacity(0.05), radius: 12, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(EduTheme.teal.opacity(0.18), lineWidth: 1)
        )
    }

    private func metaChip(systemImage: String, text: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.caption.weight(.bold))
            .foregroundStyle(EduTheme.navy)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(.white.opacity(0.9)))
            .overlay(Capsule().stroke(Color.black.opacity(0.06), lineWidth: 1))
    }

    // MARK: Actions

    private var actionsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            if isTeacher {
                actionTile(
                    title: "Faire l’appel",
                    subtitle: "Présences du jour",
                    systemImage: "checklist",
                    tint: EduTheme.teal
                ) {
                    TeacherAttendanceView(initialClassId: classId)
                }
            } else {
                actionTile(
                    title: "Présences",
                    subtitle: "Suivi de classe",
                    systemImage: "checklist",
                    tint: EduTheme.teal
                ) {
                    TeacherAttendanceView(initialClassId: classId)
                }
            }

            actionTile(
                title: "Notes",
                subtitle: isTeacher ? "Tes évaluations" : "Devoirs & notes",
                systemImage: "pencil.and.list.clipboard",
                tint: EduTheme.navy
            ) {
                if isTeacher {
                    EvaluationsBrowser(
                        classId: classId,
                        teacherId: auth.userId,
                        allowEntry: true,
                        recordedBy: auth.userId,
                        title: "Notes"
                    )
                } else {
                    EvaluationsBrowser(classId: classId, allowEntry: true, title: "Notes")
                }
            }

            actionTile(
                title: "Emploi du temps",
                subtitle: "Semaine de la classe",
                systemImage: "calendar",
                tint: Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)
            ) {
                TimetableView(mode: .classSection(classId))
            }

            actionTile(
                title: "Cahier",
                subtitle: "Textes & devoirs",
                systemImage: "book",
                tint: EduTheme.fasoYellow
            ) {
                CahierFeedView(classId: classId, title: "Cahier")
            }
        }
    }

    private func actionTile<Dest: View>(
        title: String,
        subtitle: String,
        systemImage: String,
        tint: Color,
        @ViewBuilder destination: @escaping () -> Dest
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(tint)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(tint.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.white)
                    .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.black.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: Subjects

    private var subjectsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Mes matières", subtitle: "Moyenne de classe sur tes enseignements")
            VStack(spacing: 8) {
                ForEach(mySubjects) { subject in
                    subjectRow(subject)
                }
            }
        }
    }

    private func subjectRow(_ subject: SubjectLine) -> some View {
        let avg = subject.averageOn20
        let tint: Color = {
            guard let avg else { return EduTheme.muted }
            if avg >= 12 { return EduTheme.fasoGreen }
            if avg >= 10 { return Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255) }
            return EduTheme.fasoRed
        }()
        let progress = avg.map { min(1, max(0, $0 / 20)) } ?? 0

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(subject.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Spacer()
                if let avg {
                    Text("\(Self.formatAvg(avg)) / 20")
                        .font(.headline.weight(.bold).monospacedDigit())
                        .foregroundStyle(tint)
                } else {
                    Text("— / 20")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(EduTheme.muted)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
                    Capsule().fill(tint).frame(width: geo.size.width * progress)
                }
            }
            .frame(height: 7)
            Text(subject.gradeCount > 0
                 ? "\(subject.gradeCount) note\(subject.gradeCount == 1 ? "" : "s")"
                 : "Aucune note encore")
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(tint.opacity(0.25), lineWidth: 1)
        )
    }

    // MARK: Upcoming

    private var upcomingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("À venir", subtitle: "Tes prochaines évaluations dans cette classe")
            VStack(spacing: 8) {
                ForEach(upcoming.prefix(4)) { row in
                    NavigationLink {
                        if row.classSectionId != nil, row.subjectId != nil {
                            GradeEntryView(evaluation: row, recordedBy: auth.userId)
                        } else {
                            EvaluationsBrowser(
                                classId: classId,
                                teacherId: auth.userId,
                                allowEntry: true,
                                recordedBy: auth.userId,
                                title: "Notes"
                            )
                        }
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(row.title?.isEmpty == false ? row.title! : row.typeLabel)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                    .lineLimit(2)
                                Text([row.matieres?.name, row.whenLabel].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            Spacer()
                            HStack(spacing: 4) {
                                Image(systemName: "pencil.line")
                                    .font(.caption2.weight(.bold))
                                Text("Noter")
                                    .font(.caption.weight(.bold))
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(EduTheme.navy, in: Capsule())
                        }
                        .padding(14)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(.white)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(Color.black.opacity(0.06), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Ouvre la saisie des notes")
                }
            }
        }
    }

    // MARK: Roster

    private var rosterSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Effectif", subtitle: "\(students.count) élève\(students.count == 1 ? "" : "s") inscrit\(students.count == 1 ? "" : "s")")

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(EduTheme.muted)
                TextField("Rechercher un élève…", text: $studentSearch)
                    .textInputAutocapitalization(.words)
                    .disableAutocorrection(true)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.black.opacity(0.06), lineWidth: 1)
            )

            if students.isEmpty {
                PremiumEmpty(
                    title: "Aucun élève",
                    systemImage: "person.3",
                    message: "Cette classe n’a pas encore d’effectif."
                )
            } else if filteredStudents.isEmpty {
                Text("Aucun élève ne correspond à la recherche.")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .padding(.vertical, 8)
            } else {
                LazyVStack(spacing: 8) {
                    ForEach(filteredStudents) { student in
                        NavigationLink {
                            StudentFileView(
                                studentId: student.studentId,
                                name: student.fullName,
                                className: className,
                                classId: classId,
                                subjectIds: isTeacher ? mySubjects.map(\.id) : nil,
                                subjectLabels: isTeacher ? mySubjects.map(\.name) : nil
                            )
                        } label: {
                            HStack(spacing: 12) {
                                UserAvatarView(
                                    url: student.avatarUrl,
                                    firstName: student.firstName,
                                    lastName: student.lastName,
                                    size: 40
                                )
                                Text(student.fullName)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                    .lineLimit(1)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(EduTheme.muted)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(.white)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(Color.black.opacity(0.06), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func sectionTitle(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.headline)
                .foregroundStyle(EduTheme.ink)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
        }
    }

    // MARK: Load

    private func load() async {
        loading = students.isEmpty
        do {
            let api = EduAPI()
            async let studentsTask = api.fetchStudentsInClass(classSectionId: classId)
            async let assignmentsTask = api.fetchClassAssignments(classId: classId)

            let loadedStudents = try await studentsTask
            let assignments = try await assignmentsTask
            students = loadedStudents.sorted {
                $0.fullName.localizedCaseInsensitiveCompare($1.fullName) == .orderedAscending
            }
            gradeLevel = assignments.compactMap(\.classes?.gradeLevel).first

            if isTeacher, let tid = auth.userId {
                let mine = try await api.fetchTeachingAssignments(teacherId: tid)
                    .filter { $0.classSectionId == classId }
                let stats = try await api.fetchTeacherClassStats(classIds: [classId])
                let avgMap = Dictionary(
                    uniqueKeysWithValues: stats.averages.map { ("\($0.classId)|\($0.subjectId)", $0) }
                )
                mySubjects = mine.compactMap { row -> SubjectLine? in
                    let subjectId = row.subjectId ?? row.matieres?.id
                    let name = row.matieres?.name
                    guard let subjectId, let name, !name.isEmpty else { return nil }
                    let avg = avgMap["\(classId)|\(subjectId)"]
                    return SubjectLine(
                        id: subjectId,
                        name: name,
                        averageOn20: avg?.avg,
                        gradeCount: avg?.n ?? 0
                    )
                }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

                let today = EduDates.day()
                let evals = try await api.fetchEvaluations(
                    classId: classId,
                    teacherId: tid,
                    confirmedOnly: false
                )
                upcoming = evals
                    .filter { row in
                        let day = String((row.evalDate ?? row.dueDate ?? "").prefix(10))
                        return day.isEmpty || day >= today
                    }
                    .sorted {
                        (String(($0.evalDate ?? $0.dueDate ?? "9999").prefix(10)))
                            < (String(($1.evalDate ?? $1.dueDate ?? "9999").prefix(10)))
                    }
            } else {
                mySubjects = Array(
                    Set(assignments.compactMap { row -> SubjectLine? in
                        guard let name = row.matieres?.name, !name.isEmpty else { return nil }
                        return SubjectLine(
                            id: row.subjectId ?? row.matieres?.id ?? name,
                            name: name,
                            averageOn20: nil,
                            gradeCount: 0
                        )
                    })
                )
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                upcoming = []
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private static func formatAvg(_ value: Double) -> String {
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "fr_FR")
        nf.minimumFractionDigits = 2
        nf.maximumFractionDigits = 2
        return nf.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
    }

    private static func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        let chars = parts.compactMap { $0.first.map(String.init) }
        let value = chars.joined().uppercased()
        return value.isEmpty ? "?" : value
    }
}

struct StudentFileView: View {
    let studentId: String
    let name: String
    var className: String?
    var classId: String? = nil
    /// Teacher-only: restrict notes / présences to these subjects.
    var subjectIds: [String]? = nil
    var subjectLabels: [String]? = nil
    var phone: String?
    var matricule: String?

    @EnvironmentObject private var auth: AuthViewModel
    @State private var resolvedClassId: String?
    @State private var resolvedSubjectIds: [String] = []
    @State private var resolvedSubjectLabels: [String] = []

    private var isTeacherScoped: Bool {
        auth.primaryRole == .teacher
    }

    private var effectiveClassId: String? { classId ?? resolvedClassId }
    private var effectiveSubjectIds: [String] {
        if let subjectIds, !subjectIds.isEmpty { return subjectIds }
        return resolvedSubjectIds
    }
    private var effectiveSubjectLabels: [String] {
        if let subjectLabels, !subjectLabels.isEmpty { return subjectLabels }
        return resolvedSubjectLabels
    }

    var body: some View {
        PremiumScreenChrome {
            List {
                Section {
                    HStack(spacing: 12) {
                        Text(String(name.prefix(1)).uppercased())
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 52, height: 52)
                            .background(EduTheme.navy, in: Circle())
                        VStack(alignment: .leading, spacing: 4) {
                            Text(name).font(.headline).foregroundStyle(EduTheme.ink)
                            if let className, !className.isEmpty {
                                Text(className).font(.caption).foregroundStyle(EduTheme.muted)
                            }
                            if isTeacherScoped, !effectiveSubjectLabels.isEmpty {
                                Text(effectiveSubjectLabels.joined(separator: " · "))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(EduTheme.teal)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    if let matricule, !matricule.isEmpty { LabeledContent("Matricule", value: matricule) }
                    if let phone, !phone.isEmpty { LabeledContent("Téléphone", value: phone) }
                }

                if isTeacherScoped {
                    Section {
                        Text("Tu vois uniquement tes matières pour cet élève — pas le dossier complet.")
                            .font(.footnote)
                            .foregroundStyle(EduTheme.muted)
                            .listRowBackground(Color.clear)
                    }
                    Section("Suivi (tes matières)") {
                        NavigationLink("Notes") {
                            StudentGradesView(
                                studentIdOverride: studentId,
                                subjectIds: effectiveSubjectIds
                            )
                        }
                        NavigationLink("Présences") {
                            StudentAttendanceView(
                                studentIdOverride: studentId,
                                allowedSubjectIds: effectiveSubjectIds
                            )
                        }
                        if let effectiveClassId {
                            NavigationLink("Mes évaluations") {
                                EvaluationsBrowser(
                                    classId: effectiveClassId,
                                    teacherId: auth.userId,
                                    allowEntry: true,
                                    title: "Évaluations"
                                )
                            }
                        }
                    }
                } else {
                    Section("Dossier") {
                        NavigationLink("Notes") { StudentGradesView(studentIdOverride: studentId) }
                        NavigationLink("Présences") { StudentAttendanceView(studentIdOverride: studentId) }
                        NavigationLink("Bulletin") { BulletinBoard(studentId: studentId) }
                        NavigationLink("Emploi du temps") { TimetableView(mode: .student, studentIdOverride: studentId) }
                        NavigationLink("Cahier de textes") { CahierFeedView(studentId: studentId) }
                        NavigationLink("Devoirs") { EvaluationsBrowser(studentId: studentId, type: "examen", confirmedOnly: true, title: "Devoirs") }
                        NavigationLink("Interrogations") { EvaluationsBrowser(studentId: studentId, type: "interrogation", title: "Interrogations") }
                        NavigationLink("Compositions") { EvaluationsBrowser(studentId: studentId, type: "composition", title: "Compositions") }
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .premiumTitle("Élève")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard isTeacherScoped else { return }
            await resolveTeacherScope()
        }
    }

    private func resolveTeacherScope() async {
        guard let tid = auth.userId else { return }
        let api = EduAPI()
        let resolvedClass: String?
        if let classId {
            resolvedClass = classId
        } else if let enrollment = try? await api.activeEnrollment(studentId: studentId) {
            resolvedClass = enrollment.classId
        } else {
            resolvedClass = nil
        }
        resolvedClassId = resolvedClass
        guard let resolvedClass else { return }
        let assignments = (try? await api.fetchTeachingAssignments(teacherId: tid)) ?? []
        let mine = assignments.filter { $0.classSectionId == resolvedClass }
        if subjectIds == nil || subjectIds?.isEmpty == true {
            resolvedSubjectIds = mine.compactMap { $0.subjectId ?? $0.matieres?.id }
            resolvedSubjectLabels = mine.compactMap(\.matieres?.name).filter { !$0.isEmpty }
        }
    }
}

struct PeopleListView: View {
    enum Kind { case students, parents }
    let kind: Kind
    var screenTitle: String? = nil
    @EnvironmentObject private var auth: AuthViewModel
    @State private var search = ""
    @State private var rows: [PersonRow] = []
    @State private var total = 0
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading && rows.isEmpty { LoadingBlock() }
                else if let error, rows.isEmpty { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if rows.isEmpty {
                    PremiumEmpty(
                        title: kind == .students ? "Aucun élève" : "Aucun parent",
                        systemImage: kind == .students ? "graduationcap" : "figure.and.child.holdinghands"
                    )
                } else {
                    List {
                        Section {
                            Text("\(total) \(kind == .students ? "élève(s)" : "parent(s)")")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(EduTheme.muted)
                                .listRowBackground(Color.clear)
                        }
                        ForEach(rows) { person in
                            Group {
                                if kind == .students {
                                    NavigationLink {
                                        StudentFileView(
                                            studentId: person.id,
                                            name: person.fullName,
                                            className: person.className,
                                            phone: person.phone,
                                            matricule: person.matricule
                                        )
                                    } label: {
                                        personLabel(person)
                                    }
                                } else {
                                    personLabel(person)
                                }
                            }
                            .listRowBackground(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(.white)
                                    .padding(.vertical, 3)
                            )
                        }
                        if rows.count < total {
                            Button("Afficher la suite (\(rows.count) / \(total))") {
                                Task { await load(reset: false) }
                            }
                        }
                    }
                    .premiumListStyle()
                    .searchable(text: $search, prompt: "Rechercher")
                    .onSubmit(of: .search) { Task { await load(reset: true) } }
                }
            }
        }
        .premiumTitle(screenTitle ?? (kind == .students ? "Élèves" : "Parents"))
        .task { await load(reset: true) }
        .refreshable { await load(reset: true) }
        .onChange(of: search) { _, new in
            if new.isEmpty { Task { await load(reset: true) } }
        }
    }

    private func personLabel(_ person: PersonRow) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(person.fullName.isEmpty ? "Sans nom" : person.fullName).font(.headline)
            if kind == .students, let className = person.className, !className.isEmpty {
                Text(className).font(.caption).foregroundStyle(EduTheme.muted)
            }
            if kind == .parents, let children = person.children, !children.isEmpty {
                Text(children.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(2)
            }
        }
    }

    private func load(reset: Bool) async {
        guard let schoolId = auth.schoolId else {
            error = "Aucune école associée."
            loading = false
            return
        }
        if reset { loading = rows.isEmpty }
        do {
            let api = EduAPI()
            let page: PeoplePage
            let offset = reset ? 0 : rows.count
            if kind == .students {
                page = try await api.fetchStudentsPage(schoolId: schoolId, search: search, offset: offset)
            } else {
                page = try await api.fetchParentsPage(schoolId: schoolId, search: search, offset: offset)
            }
            rows = reset ? page.rows : rows + page.rows
            total = page.total
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct MyTeachersView: View {
    var studentId: String? = nil
    @EnvironmentObject private var auth: AuthViewModel
    @State private var cards: [(id: String, name: String, subjects: [String])] = []
    @State private var className: String?
    @State private var loading = true
    @State private var error: String?

    private var subjectCount: Int {
        Set(cards.flatMap(\.subjects)).count
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else if cards.isEmpty {
                    PremiumEmpty(
                        title: "Aucun enseignant",
                        systemImage: "person.2",
                        message: "Aucun enseignant affecté à ta classe."
                    )
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            summaryCard
                            Text("ENSEIGNANTS")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(EduTheme.muted)
                                .tracking(0.6)

                            VStack(spacing: 10) {
                                ForEach(cards, id: \.id) { card in
                                    teacherCard(card)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
        }
        .premiumTitle("Mes profs")
        .task { await load() }
        .refreshable { await load() }
    }

    private var summaryCard: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(EduTheme.teal.opacity(0.12))
                Image(systemName: "person.2.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(EduTheme.teal)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 4) {
                Text((className ?? "Ma classe").uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.5)
                Text("\(cards.count) enseignant\(cards.count == 1 ? "" : "s")")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("\(subjectCount) matière\(subjectCount == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(cardBackground)
    }

    private func teacherCard(_ card: (id: String, name: String, subjects: [String])) -> some View {
        let displayName = card.name.isEmpty ? "Enseignant" : card.name
        let tint = avatarTint(for: displayName)
        return HStack(alignment: .top, spacing: 12) {
            Text(initials(displayName))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(tint, in: Circle())

            VStack(alignment: .leading, spacing: 8) {
                Text(displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)

                if card.subjects.isEmpty {
                    Text("Matière non précisée")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                } else {
                    subjectChips(card.subjects)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(cardBackground)
    }

    private func subjectChips(_ subjects: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(chunked(subjects, size: 2), id: \.self) { row in
                HStack(spacing: 6) {
                    ForEach(row, id: \.self) { subject in
                        Text(subject)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.navy)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(EduTheme.navy.opacity(0.08), in: Capsule())
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private func chunked(_ items: [String], size: Int) -> [[String]] {
        stride(from: 0, to: items.count, by: size).map {
            Array(items[$0..<min($0 + size, items.count)])
        }
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.white)
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        let value = parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
        return value.isEmpty ? "?" : value
    }

    private func avatarTint(for name: String) -> Color {
        let palette: [Color] = [
            EduTheme.navy, EduTheme.teal, EduTheme.fasoGreen,
            Color.orange, Color(red: 124 / 255, green: 58 / 255, blue: 237 / 255),
            Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255),
        ]
        var hash = 0
        for (i, ch) in name.utf8.enumerated() { hash = (hash + Int(ch) * (i + 1)) % 997 }
        return palette[hash % palette.count]
    }

    private func load() async {
        guard let sid = studentId ?? auth.userId else { return }
        loading = cards.isEmpty
        do {
            let api = EduAPI()
            guard let enrollment = try await api.activeEnrollment(studentId: sid) else {
                cards = []
                loading = false
                return
            }
            className = enrollment.className
            let rows = try await api.fetchClassAssignments(classId: enrollment.classId)
            var grouped: [String: (name: String, subjects: [String])] = [:]
            for row in rows {
                let key = row.teacher?.fullName ?? row.id
                var entry = grouped[key] ?? (row.teacher?.fullName ?? "", [])
                if let subject = row.matieres?.name, !entry.subjects.contains(subject) {
                    entry.subjects.append(subject)
                }
                if entry.name.isEmpty { entry.name = row.teacher?.fullName ?? "" }
                grouped[key] = entry
            }
            cards = grouped.map { ($0.key, $0.value.name, $0.value.subjects.sorted()) }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

// MARK: - Teacher

struct TeacherClassesView: View {
    private enum Filter: String, CaseIterable, Identifiable {
        case all, watch
        var id: String { rawValue }
    }

    private enum SortMode: String {
        case name, average
    }

    @EnvironmentObject private var auth: AuthViewModel
    @State private var classes: [TeacherClassCardModel] = []
    @State private var filter: Filter = .all
    @State private var sortMode: SortMode = .name
    @State private var loading = true
    @State private var error: String?

    private var totalStudents: Int { classes.reduce(0) { $0 + $1.studentCount } }
    private var totalSubjects: Int {
        Set(classes.flatMap { $0.subjects.map(\.subjectId) }).count
    }

    private var watchCount: Int {
        classes.filter(\.needsWatch).count
    }

    private var visibleClasses: [TeacherClassCardModel] {
        let base: [TeacherClassCardModel]
        switch filter {
        case .all: base = classes
        case .watch: base = classes.filter(\.needsWatch)
        }
        switch sortMode {
        case .name:
            return base.sorted {
                $0.className.localizedCaseInsensitiveCompare($1.className) == .orderedAscending
            }
        case .average:
            return base.sorted {
                ($0.primaryAverage ?? -1) > ($1.primaryAverage ?? -1)
            }
        }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else if classes.isEmpty {
                    PremiumEmpty(
                        title: "Aucune classe",
                        systemImage: "rectangle.3.group",
                        message: "Aucune classe ne t’est affectée."
                    )
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            headerBlock
                            statsStrip
                            filterRow
                            LazyVStack(spacing: 12) {
                                ForEach(visibleClasses) { item in
                                    TeacherClassCard(model: item)
                                }
                            }
                        }
                        .padding(16)
                        .padding(.bottom, 24)
                    }
                    .refreshable { await load() }
                }
            }
        }
        .premiumTitle("Mes classes")
        .task { await load() }
        .refreshable { await load() }
    }

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Mes classes")
                .font(.title2.weight(.bold))
                .foregroundStyle(EduTheme.ink)
            Text("Classes où tu enseignes — moyenne de classe par matière")
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
        }
    }

    private var statsStrip: some View {
        HStack(spacing: 0) {
            statCell("\(classes.count)", "Classes")
            Rectangle().fill(Color.black.opacity(0.08)).frame(width: 1, height: 36)
            statCell("\(totalStudents)", "Élèves")
            Rectangle().fill(Color.black.opacity(0.08)).frame(width: 1, height: 36)
            statCell("\(totalSubjects)", totalSubjects == 1 ? "Matière" : "Matières")
        }
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
    }

    private func statCell(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(EduTheme.ink)
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private var filterRow: some View {
        HStack(spacing: 8) {
            filterPill("Toutes (\(classes.count))", selected: filter == .all) {
                filter = .all
            }
            filterPill("À surveiller (\(watchCount))", selected: filter == .watch, systemImage: "exclamationmark.circle") {
                filter = .watch
            }
            Spacer(minLength: 0)
            Button {
                sortMode = sortMode == .name ? .average : .name
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(Color.black.opacity(0.08), lineWidth: 1))
            }
            .accessibilityLabel(sortMode == .name ? "Trier par moyenne" : "Trier par nom")
        }
    }

    private func filterPill(_ title: String, selected: Bool, systemImage: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.caption2.weight(.bold))
                }
                Text(title)
                    .font(.caption.weight(.bold))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .foregroundStyle(selected ? .white : EduTheme.ink)
            .background(
                Capsule().fill(selected ? EduTheme.navy : Color.white)
            )
            .overlay(
                Capsule().stroke(selected ? Color.clear : Color.black.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        guard let tid = auth.userId else { return }
        loading = classes.isEmpty
        do {
            let api = EduAPI()
            let rows = try await api.fetchTeachingAssignments(teacherId: tid)

            var grouped: [String: TeacherClassCardModel] = [:]
            for row in rows {
                let classId = row.classSectionId
                let subjectId = row.subjectId ?? row.matieres?.id ?? row.id
                let subjectName = row.matieres?.name ?? "Matière"
                var entry = grouped[classId] ?? TeacherClassCardModel(
                    classId: classId,
                    className: row.classes?.name ?? "Classe",
                    gradeLevel: row.classes?.gradeLevel,
                    studentCount: 0,
                    subjects: []
                )
                if !entry.subjects.contains(where: { $0.subjectId == subjectId }) {
                    entry.subjects.append(
                        TeacherClassSubjectAvg(
                            subjectId: subjectId,
                            subjectName: subjectName,
                            averageOn20: nil,
                            gradeCount: 0
                        )
                    )
                }
                grouped[classId] = entry
            }

            let classIds = Array(grouped.keys)
            let stats = try await api.fetchTeacherClassStats(classIds: classIds)
            let avgMap = Dictionary(
                uniqueKeysWithValues: stats.averages.map { ("\($0.classId)|\($0.subjectId)", $0) }
            )

            classes = grouped.values.map { model in
                var next = model
                next.studentCount = stats.counts[model.classId] ?? 0
                next.subjects = model.subjects
                    .map { subject in
                        let key = "\(model.classId)|\(subject.subjectId)"
                        if let a = avgMap[key] {
                            return TeacherClassSubjectAvg(
                                subjectId: subject.subjectId,
                                subjectName: subject.subjectName,
                                averageOn20: a.avg,
                                gradeCount: a.n
                            )
                        }
                        return subject
                    }
                    .sorted {
                        $0.subjectName.localizedCaseInsensitiveCompare($1.subjectName) == .orderedAscending
                    }
                return next
            }
            .sorted {
                $0.className.localizedCaseInsensitiveCompare($1.className) == .orderedAscending
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

// MARK: - Teacher class cards

private struct TeacherClassSubjectAvg: Identifiable, Hashable {
    var id: String { subjectId }
    let subjectId: String
    let subjectName: String
    let averageOn20: Double?
    let gradeCount: Int
}

private struct TeacherClassCardModel: Identifiable, Hashable {
    var id: String { classId }
    let classId: String
    let className: String
    let gradeLevel: String?
    var studentCount: Int
    var subjects: [TeacherClassSubjectAvg]

    var primaryAverage: Double? {
        let values = subjects.compactMap(\.averageOn20)
        guard !values.isEmpty else { return nil }
        return values.min()
    }

    var needsWatch: Bool {
        subjects.contains { subject in
            guard let avg = subject.averageOn20, subject.gradeCount > 0 else { return false }
            return avg < 10
        }
    }

    var status: TeacherClassLevelStatus {
        guard let avg = primaryAverage else { return .none }
        if avg >= 12 { return .good }
        if avg >= 10 { return .ok }
        return .watch
    }
}

private enum TeacherClassLevelStatus {
    case good, ok, watch, none

    var label: String {
        switch self {
        case .good: return "Bon niveau"
        case .ok: return "Moyen"
        case .watch: return "À surveiller"
        case .none: return "Pas encore de notes"
        }
    }

    var color: Color {
        switch self {
        case .good: return EduTheme.fasoGreen
        case .ok: return Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)
        case .watch: return EduTheme.fasoRed
        case .none: return EduTheme.muted
        }
    }
}

private struct TeacherClassCard: View {
    let model: TeacherClassCardModel
    @EnvironmentObject private var auth: AuthViewModel
    private var status: TeacherClassLevelStatus { model.status }

    var body: some View {
        VStack(spacing: 0) {
            NavigationLink {
                ClassHubView(classId: model.classId, className: model.className)
            } label: {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(model.className)
                                .font(.title3.weight(.bold))
                                .foregroundStyle(EduTheme.ink)
                            Text(metaLine)
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(EduTheme.muted)
                            .padding(.top, 6)
                    }

                    ForEach(model.subjects) { subject in
                        subjectBlock(subject)
                    }
                }
                .padding(16)
            }
            .buttonStyle(.plain)

            HStack(spacing: 8) {
                NavigationLink {
                    TeacherAttendanceView(initialClassId: model.classId)
                } label: {
                    Label("Faire l’appel", systemImage: "checklist")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(.white)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)

                NavigationLink {
                    EvaluationsBrowser(
                        classId: model.classId,
                        teacherId: auth.userId,
                        allowEntry: true,
                        recordedBy: auth.userId,
                        title: "Notes"
                    )
                } label: {
                    Label("Notes", systemImage: "pencil.and.list.clipboard")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(EduTheme.navy)
                        .background(EduTheme.navy.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.05), radius: 10, y: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(status.color.opacity(status == .none ? 0.15 : 0.55), lineWidth: 1.5)
        )
    }

    private var metaLine: String {
        var parts = ["\(model.studentCount) élève\(model.studentCount == 1 ? "" : "s")"]
        if let grade = model.gradeLevel, !grade.isEmpty {
            parts.append(grade)
        }
        return parts.joined(separator: " · ")
    }

    private func subjectBlock(_ subject: TeacherClassSubjectAvg) -> some View {
        let avg = subject.averageOn20
        let subjectStatus = TeacherClassCardModel(
            classId: model.classId,
            className: model.className,
            gradeLevel: model.gradeLevel,
            studentCount: model.studentCount,
            subjects: [subject]
        ).status
        let progress = avg.map { min(1, max(0, $0 / 20)) } ?? 0

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(subject.subjectName)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.navy)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule().fill(EduTheme.navy.opacity(0.08))
                    )
                Spacer(minLength: 8)
                if let avg {
                    Text("\(Self.formatAvg(avg)) / 20")
                        .font(.title3.weight(.bold).monospacedDigit())
                        .foregroundStyle(subjectStatus.color)
                } else {
                    Text("— / 20")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(EduTheme.muted)
                }
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
                    Capsule()
                        .fill(subjectStatus.color)
                        .frame(width: geo.size.width * progress)
                }
            }
            .frame(height: 7)

            HStack {
                Text(subjectStatus.label)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(subjectStatus.color)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(subjectStatus.color.opacity(0.12), in: Capsule())
                Spacer()
                Text(subject.gradeCount > 0
                     ? "\(subject.gradeCount) note\(subject.gradeCount == 1 ? "" : "s")"
                     : "Aucune note")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(EduTheme.muted)
            }
        }
    }

    private static func formatAvg(_ value: Double) -> String {
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "fr_FR")
        nf.minimumFractionDigits = 2
        nf.maximumFractionDigits = 2
        return nf.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
    }
}

struct TeacherStudentsView: View {
    private struct ClassSection: Identifiable {
        let id: String
        let name: String
        let students: [PresenceDraft]
        let subjectIds: [String]
        let subjectLabels: [String]
    }

    @EnvironmentObject private var auth: AuthViewModel
    @State private var sections: [ClassSection] = []
    @State private var loading = true
    @State private var error: String?
    @State private var search = ""
    @State private var selectedClassId: String? = nil

    private var filteredSections: [ClassSection] {
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return sections.compactMap { section in
            if let selectedClassId, section.id != selectedClassId { return nil }
            let students: [PresenceDraft]
            if q.isEmpty {
                students = section.students
            } else {
                students = section.students.filter {
                    $0.fullName.localizedCaseInsensitiveContains(q)
                }
            }
            guard !students.isEmpty || q.isEmpty else { return nil }
            if q.isEmpty { return section }
            return ClassSection(
                id: section.id,
                name: section.name,
                students: students,
                subjectIds: section.subjectIds,
                subjectLabels: section.subjectLabels
            )
        }
    }

    private var totalStudents: Int {
        sections.reduce(0) { $0 + $1.students.count }
    }

    private var visibleCount: Int {
        filteredSections.reduce(0) { $0 + $1.students.count }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if sections.isEmpty {
                    PremiumEmpty(title: "Aucun élève", systemImage: "graduationcap", message: "Aucun élève dans tes classes.")
                } else {
                    VStack(spacing: 0) {
                        filtersHeader
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .padding(.bottom, 10)
                            .background(EduTheme.loginBackground)

                        if filteredSections.isEmpty || visibleCount == 0 {
                            PremiumEmpty(
                                title: "Aucun résultat",
                                systemImage: "magnifyingglass",
                                message: "Aucun élève ne correspond à ces filtres."
                            )
                        } else {
                            List {
                                ForEach(filteredSections) { section in
                                    Section {
                                        ForEach(section.students) { student in
                                            NavigationLink {
                                                StudentFileView(
                                                    studentId: student.studentId,
                                                    name: student.fullName,
                                                    className: section.name,
                                                    classId: section.id,
                                                    subjectIds: section.subjectIds,
                                                    subjectLabels: section.subjectLabels
                                                )
                                            } label: {
                                                HStack(spacing: 12) {
                                                    UserAvatarView(
                                                        url: student.avatarUrl,
                                                        firstName: student.firstName,
                                                        lastName: student.lastName,
                                                        size: 40
                                                    )
                                                    VStack(alignment: .leading, spacing: 2) {
                                                        Text(student.fullName)
                                                            .font(.subheadline.weight(.semibold))
                                                            .foregroundStyle(EduTheme.ink)
                                                        Text(section.name)
                                                            .font(.caption)
                                                            .foregroundStyle(EduTheme.muted)
                                                    }
                                                    Spacer(minLength: 0)
                                                }
                                                .padding(.vertical, 2)
                                            }
                                            .listRowBackground(
                                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                    .fill(.white)
                                                    .padding(.vertical, 3)
                                            )
                                        }
                                    } header: {
                                        HStack {
                                            Text(section.name.uppercased())
                                                .font(.caption2.weight(.semibold))
                                                .tracking(0.7)
                                                .foregroundStyle(EduTheme.muted)
                                            Spacer()
                                            Text("\(section.students.count)")
                                                .font(.caption2.weight(.bold).monospacedDigit())
                                                .foregroundStyle(EduTheme.muted)
                                        }
                                    }
                                }
                            }
                            .premiumListStyle()
                        }
                    }
                }
            }
        }
        .premiumTitle("Élèves")
        .task { await load() }
        .refreshable { await load() }
    }

    private var filtersHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(EduTheme.muted)
                TextField("Rechercher un élève…", text: $search)
                    .textInputAutocapitalization(.words)
                    .disableAutocorrection(true)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.black.opacity(0.06), lineWidth: 1)
            )

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    classChip(id: nil, label: "Toutes", count: totalStudents)
                    ForEach(sections) { section in
                        classChip(id: section.id, label: section.name, count: section.students.count)
                    }
                }
            }

            Text("\(visibleCount) élève\(visibleCount == 1 ? "" : "s")")
                .font(.caption.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
        }
    }

    private func classChip(id: String?, label: String, count: Int) -> some View {
        let on = selectedClassId == id
        return Button {
            selectedClassId = id
        } label: {
            HStack(spacing: 5) {
                Text(label)
                    .font(.caption.weight(.semibold))
                Text("\(count)")
                    .font(.caption2.weight(.bold).monospacedDigit())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(on ? Color.white.opacity(0.25) : Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255))
                    )
            }
            .foregroundStyle(on ? .white : EduTheme.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Capsule().fill(on ? EduTheme.navy : .white))
            .overlay(
                Capsule().stroke(on ? EduTheme.navy : Color.black.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        guard let tid = auth.userId else { return }
        loading = sections.isEmpty
        do {
            let api = EduAPI()
            let assignments = try await api.fetchTeachingAssignments(teacherId: tid)
            var byClass: [String: ClassSection] = [:]
            var order: [String] = []
            for assignment in assignments {
                let classId = assignment.classSectionId
                let subjectId = assignment.subjectId ?? assignment.matieres?.id
                let subjectName = assignment.matieres?.name
                if byClass[classId] == nil {
                    order.append(classId)
                    let students = try await api.fetchStudentsInClass(classSectionId: classId)
                    byClass[classId] = ClassSection(
                        id: classId,
                        name: assignment.classes?.name ?? "Classe",
                        students: students,
                        subjectIds: subjectId.map { [$0] } ?? [],
                        subjectLabels: (subjectName?.isEmpty == false) ? [subjectName!] : []
                    )
                } else if let subjectId, let existing = byClass[classId] {
                    var ids = existing.subjectIds
                    var labels = existing.subjectLabels
                    if !ids.contains(subjectId) {
                        ids.append(subjectId)
                        if let subjectName, !subjectName.isEmpty { labels.append(subjectName) }
                    }
                    byClass[classId] = ClassSection(
                        id: existing.id,
                        name: existing.name,
                        students: existing.students,
                        subjectIds: ids,
                        subjectLabels: labels
                    )
                }
            }
            sections = order.compactMap { byClass[$0] }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            if let selectedClassId, !sections.contains(where: { $0.id == selectedClassId }) {
                self.selectedClassId = nil
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct PresenceLogView: View {
    var classIds: [String]
    var day: String? = nil
    var title: String
    @State private var rows: [PresenceLog] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if rows.isEmpty {
                    PremiumEmpty(title: "Aucune présence", systemImage: "checklist", message: "Aucun pointage pour cette période.")
                } else {
                    List(rows) { row in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(row.profils?.fullName.isEmpty == false ? row.profils!.fullName : "Élève")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                Text([row.classes?.name, row.matieres?.name, row.date].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            Spacer()
                            Text(attendanceLabel(row.status))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(attendanceColor(row.status))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(attendanceColor(row.status).opacity(0.12), in: Capsule())
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(.white)
                                .padding(.vertical, 3)
                        )
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle(title)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        loading = rows.isEmpty
        do {
            rows = try await EduAPI().fetchPresenceLog(classIds: classIds, day: day)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

/// Teacher présence hub — take roll first; history is secondary (not a raw dump).
struct TeacherAttendanceOverview: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var assignments: [TeachingAssignment] = []
    @State private var ready = false

    private var classIds: [String] {
        Array(Set(assignments.map(\.classSectionId)))
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if !ready {
                    LoadingBlock()
                } else if assignments.isEmpty {
                    PremiumEmpty(
                        title: "Aucune classe",
                        systemImage: "checklist",
                        message: "Aucune affectation pour faire l’appel."
                    )
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            NavigationLink {
                                TeacherAttendanceView()
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "checklist")
                                        .font(.title3.weight(.semibold))
                                        .foregroundStyle(.white)
                                        .frame(width: 44, height: 44)
                                        .background(Circle().fill(.white.opacity(0.2)))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Faire l’appel")
                                            .font(.headline.weight(.bold))
                                            .foregroundStyle(.white)
                                        Text("Marquer présents, absents, retards")
                                            .font(.caption)
                                            .foregroundStyle(.white.opacity(0.85))
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.white.opacity(0.8))
                                }
                                .padding(16)
                                .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Ouvre la saisie d’appel")

                            VStack(alignment: .leading, spacing: 10) {
                                Text("Tes classes")
                                    .font(.headline)
                                    .foregroundStyle(EduTheme.ink)

                                ForEach(assignments) { assignment in
                                    NavigationLink {
                                        TeacherAttendanceView(
                                            initialClassId: assignment.classSectionId,
                                            initialSubjectId: assignment.subjectId
                                        )
                                    } label: {
                                        HStack(spacing: 12) {
                                            VStack(alignment: .leading, spacing: 3) {
                                                Text(assignment.classes?.name ?? "Classe")
                                                    .font(.subheadline.weight(.semibold))
                                                    .foregroundStyle(EduTheme.ink)
                                                Text(assignment.matieres?.name ?? "Matière")
                                                    .font(.caption)
                                                    .foregroundStyle(EduTheme.muted)
                                            }
                                            Spacer()
                                            Text("Appel")
                                                .font(.caption.weight(.bold))
                                                .foregroundStyle(.white)
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 6)
                                                .background(EduTheme.navy, in: Capsule())
                                        }
                                        .padding(14)
                                        .background(.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                .stroke(Color.black.opacity(0.06), lineWidth: 1)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }

                            if !classIds.isEmpty {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("Historique")
                                        .font(.headline)
                                        .foregroundStyle(EduTheme.ink)
                                    NavigationLink {
                                        PresenceLogView(classIds: classIds, title: "Historique des présences")
                                    } label: {
                                        HStack {
                                            Image(systemName: "clock.arrow.circlepath")
                                                .foregroundStyle(EduTheme.teal)
                                            Text("Voir les pointages enregistrés")
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundStyle(EduTheme.ink)
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .font(.caption.weight(.bold))
                                                .foregroundStyle(EduTheme.muted)
                                        }
                                        .padding(14)
                                        .background(.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                .stroke(Color.black.opacity(0.06), lineWidth: 1)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(20)
                    }
                }
            }
        }
        .premiumTitle("Présences")
        .task { await load() }
    }

    private func load() async {
        guard let tid = auth.userId else {
            ready = true
            return
        }
        assignments = ((try? await EduAPI().fetchTeachingAssignments(teacherId: tid)) ?? [])
            .sorted {
                let ln = $0.classes?.name ?? ""
                let rn = $1.classes?.name ?? ""
                if ln != rn { return ln.localizedCaseInsensitiveCompare(rn) == .orderedAscending }
                return ($0.matieres?.name ?? "").localizedCaseInsensitiveCompare($1.matieres?.name ?? "") == .orderedAscending
            }
        ready = true
    }
}

struct TeacherCahierView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var assignments: [TeachingAssignment] = []
    @State private var selected: TeachingAssignment?
    @State private var date = Date()
    @State private var content = ""
    @State private var homework = ""
    @State private var due = ""
    @State private var entries: [CahierEntry] = []
    @State private var message: String?
    @State private var saving = false
    @State private var loading = true

    private var canSave: Bool {
        selected != nil
            && !saving
            && (!content.trimmingCharacters(in: .whitespaces).isEmpty
                || !homework.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HomePanel(
                    systemImage: "pencil.and.list.clipboard",
                    title: "Nouvelle saisie",
                    subtitle: "Classe, matière et contenu du jour",
                    content: {
                        VStack(alignment: .leading, spacing: 14) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Classe et matière")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(EduTheme.muted)
                                Picker("Classe et matière", selection: $selected) {
                                    Text("Choisir").tag(Optional<TeachingAssignment>.none)
                                    ForEach(assignments) { item in
                                        Text("\(item.classes?.name ?? "Classe") — \(item.matieres?.name ?? "")")
                                            .tag(Optional(item))
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(EduTheme.navy)
                            }

                            DatePicker("Date", selection: $date, displayedComponents: .date)
                                .tint(EduTheme.navy)

                            fieldBlock("Contenu du cours") {
                                TextField("Ce qui a été fait en classe…", text: $content, axis: .vertical)
                                    .lineLimit(3...8)
                            }
                            fieldBlock("Travail à faire") {
                                TextField("Exercices, lecture…", text: $homework, axis: .vertical)
                                    .lineLimit(2...6)
                            }
                            fieldBlock("À rendre le (AAAA-MM-JJ)") {
                                TextField("Optionnel", text: $due)
                                    .textInputAutocapitalization(.never)
                                    .keyboardType(.numbersAndPunctuation)
                            }

                            Button {
                                Task { await save() }
                            } label: {
                                HStack {
                                    if saving { ProgressView().tint(.white) }
                                    Text("Enregistrer").fontWeight(.bold)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(canSave ? EduTheme.navy : EduTheme.muted.opacity(0.35))
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .disabled(!canSave)

                            if let message {
                                Text(message)
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(message.contains("enregistr") ? EduTheme.teal : EduTheme.fasoRed)
                            }
                        }
                    }
                )

                HomePanel(
                    systemImage: "clock.arrow.circlepath",
                    title: "Mes dernières saisies",
                    subtitle: "Historique récent",
                    content: {
                        if loading && entries.isEmpty {
                            ProgressView().tint(EduTheme.navy).frame(maxWidth: .infinity, minHeight: 60)
                        } else if entries.isEmpty {
                            HomePanelEmpty(message: "Aucune saisie pour le moment.")
                        } else {
                            VStack(spacing: 8) {
                                ForEach(entries.prefix(20)) { entry in
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("\(entry.entryDate) · \(entry.classes?.name ?? "") · \(entry.matieres?.name ?? "")")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(EduTheme.ink)
                                        if let content = entry.content, !content.isEmpty {
                                            Text(content).font(.footnote).foregroundStyle(EduTheme.ink)
                                        }
                                        if let homework = entry.homework, !homework.isEmpty {
                                            Text("À faire : \(homework)")
                                                .font(.footnote)
                                                .foregroundStyle(EduTheme.muted)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(12)
                                    .background(
                                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                                            .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                                    )
                                }
                            }
                        }
                    }
                )
            }
            .padding(20)
        }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .premiumTitle("Cahier de textes")
        .preferredColorScheme(.light)
        .tint(EduTheme.navy)
        .task { await load() }
        .refreshable { await load() }
    }

    private func fieldBlock<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
            content()
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(EduTheme.fieldBorder.opacity(0.7), lineWidth: 1)
                )
        }
    }

    private func load() async {
        loading = entries.isEmpty
        guard let tid = auth.userId else { loading = false; return }
        let api = EduAPI()
        assignments = (try? await api.fetchTeachingAssignments(teacherId: tid)) ?? []
        entries = (try? await api.fetchCahierForTeacher(teacherId: tid)) ?? []
        loading = false
    }

    private func save() async {
        guard let selected, let subjectId = selected.subjectId else { return }
        saving = true
        defer { saving = false }
        let homeworkText = homework.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await EduAPI().insertCahier(CahierInsert(
                class_section_id: selected.classSectionId,
                subject_id: subjectId,
                entry_date: EduDates.day(date),
                content: content.trimmingCharacters(in: .whitespacesAndNewlines),
                homework: homeworkText.isEmpty ? nil : homeworkText,
                homework_due: homeworkText.isEmpty ? nil : (due.isEmpty ? nil : due)
            ))
            content = ""
            homework = ""
            due = ""
            message = "Cahier enregistré."
            await load()
        } catch {
            message = error.localizedDescription
        }
    }
}

// MARK: - School

struct SchoolDashboardView: View {
    var open: (AppScreen) -> Void
    @EnvironmentObject private var auth: AuthViewModel
    @State private var classCount = 0
    @State private var subjectCount = 0
    @State private var studentTotal = 0
    @State private var teacherCount = 0
    @State private var stats: SchoolHomeStats?
    @State private var withoutClass = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(auth.schools.first?.name ?? "Mon école")
                    .font(.title2.bold())
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    StatCard(title: "Élèves", value: "\(studentTotal)", systemImage: "graduationcap")
                    StatCard(title: "Enseignants", value: "\(teacherCount)", systemImage: "person.2")
                    StatCard(title: "Classes", value: "\(classCount)", systemImage: "rectangle.3.group")
                    StatCard(title: "Matières", value: "\(subjectCount)", systemImage: "book")
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Aujourd’hui").font(.headline)
                    Text("Absents \(stats?.absent ?? 0) · retards \(stats?.late ?? 0) · excusés \(stats?.excused ?? 0)")
                    Text("Créneaux du jour : \(stats?.todaySlotCount ?? 0) · classes avec emploi du temps : \(stats?.classesWithEdt ?? 0)")
                    if withoutClass > 0 {
                        Text("\(withoutClass) élève(s) sans classe")
                            .foregroundStyle(.orange)
                    }
                }
                .font(.subheadline)
                .foregroundStyle(EduTheme.ink)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 16))

                Button { open(.schoolConfig) } label: {
                    Label("Configuration de l’école", systemImage: "checklist")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .tint(EduTheme.teal)
            }
            .padding()
        }
        .background(EduTheme.sand.ignoresSafeArea())
        .premiumTitle("Mon école")
        .scrollContentBackground(.hidden)
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .preferredColorScheme(.light)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { return }
        let api = EduAPI()
        classCount = (try? await api.countRows(table: "classes", schoolId: schoolId)) ?? 0
        subjectCount = (try? await api.countRows(table: "matieres", schoolId: schoolId)) ?? 0
        teacherCount = (try? await api.fetchRolePeople(role: "teacher", schoolId: schoolId).count) ?? 0
        studentTotal = (try? await api.fetchStudentsPage(schoolId: schoolId, search: "", offset: 0).total) ?? 0
        stats = try? await api.homeStats(schoolId: schoolId)
        withoutClass = (try? await api.studentsWithoutClass(schoolId: schoolId)) ?? 0
    }
}

struct SchoolConfigView: View {
    var open: (AppScreen) -> Void
    @EnvironmentObject private var auth: AuthViewModel
    @State private var steps: [(title: String, detail: String, done: Bool, screen: AppScreen)] = []
    @State private var loading = true

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else {
                    List {
                        let done = steps.filter(\.done).count
                        Section {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(done) / \(steps.count) étapes prêtes")
                                    .font(.headline)
                                    .foregroundStyle(EduTheme.ink)
                                ProgressView(value: Double(done), total: Double(max(steps.count, 1)))
                                    .tint(EduTheme.teal)
                            }
                            .padding(.vertical, 4)
                            .listRowBackground(EduTheme.brand50)
                        }
                        Section("Étapes") {
                            ForEach(Array(steps.enumerated()), id: \.offset) { _, step in
                                Button { open(step.screen) } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: step.done ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(step.done ? EduTheme.teal : EduTheme.muted)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(step.title)
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundStyle(EduTheme.ink)
                                            Text(step.detail).font(.caption).foregroundStyle(EduTheme.muted)
                                        }
                                        Spacer(minLength: 0)
                                        Image(systemName: "chevron.right")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(EduTheme.muted)
                                    }
                                }
                                .listRowBackground(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(.white)
                                        .padding(.vertical, 3)
                                )
                            }
                        }
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle("Configuration")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { loading = false; return }
        let api = EduAPI()
        let school = try? await api.fetchSchool(id: schoolId)
        let years = (try? await api.fetchYears(schoolId: schoolId)) ?? []
        let subjects = (try? await api.countRows(table: "matieres", schoolId: schoolId)) ?? 0
        let classes = (try? await api.countRows(table: "classes", schoolId: schoolId)) ?? 0
        let teachers = (try? await api.fetchRolePeople(role: "teacher", schoolId: schoolId).count) ?? 0
        let students = (try? await api.fetchStudentsPage(schoolId: schoolId, search: "", offset: 0).total) ?? 0
        let parents = (try? await api.fetchParentsPage(schoolId: schoolId, search: "", offset: 0).total) ?? 0
        let setup = try? await api.setupCounts(schoolId: schoolId)
        let profileReady = !(school?.name.isEmpty ?? true) && !(school?.city ?? "").isEmpty
        steps = [
            ("Profil de l’école", "Nom, adresse, téléphone", profileReady, .schoolSettings),
            ("Année scolaire", "Année en cours", years.contains { $0.isCurrent }, .years),
            ("Matières", "\(subjects) matière(s)", subjects > 0, .subjects),
            ("Classes", "\(classes) classe(s)", classes > 0, .classes),
            ("Programmes", "\(setup?.classesWithProgramme ?? 0) classe(s) avec programme", (setup?.classesWithProgramme ?? 0) > 0, .programmes),
            ("Enseignants", "\(teachers) enseignant(s)", teachers > 0, .teachers),
            ("Affectations", "\(setup?.assignments ?? 0) affectation(s)", (setup?.assignments ?? 0) > 0, .teachers),
            ("Élèves", "\(students) élève(s)", students > 0, .students),
            ("Parents", "\(parents) parent(s)", parents > 0, .parents),
            ("Emploi du temps", "\(setup?.timetableSlots ?? 0) créneau(x)", (setup?.timetableSlots ?? 0) > 0, .schoolTimetable),
        ]
        loading = false
    }
}

struct SchoolSettingsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var name = ""
    @State private var code = ""
    @State private var schoolType = "primaire"
    @State private var region = ""
    @State private var city = ""
    @State private var address = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var school: School?
    @State private var message: String?
    @State private var saving = false

    private let types = [
        ("primaire", "Primaire"),
        ("secondaire", "Secondaire"),
        ("mixte", "Primaire + Secondaire"),
        ("technique", "Technique / Professionnel"),
        ("autre", "Autre"),
    ]

    var body: some View {
        PremiumScreenChrome {
            Form {
                Section("Identité") {
                    TextField("Nom", text: $name)
                    TextField("Code", text: $code)
                    Picker("Type", selection: $schoolType) {
                        ForEach(types, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .tint(EduTheme.navy)
                }
                Section("Coordonnées") {
                    TextField("Région", text: $region)
                    TextField("Ville", text: $city)
                    TextField("Adresse", text: $address)
                    TextField("Téléphone", text: $phone).keyboardType(.phonePad)
                    TextField("E-mail", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                }
                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            if saving { ProgressView().tint(.white) }
                            Text("Enregistrer").fontWeight(.bold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                    .listRowBackground(EduTheme.navy)
                    .foregroundStyle(.white)
                    .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if let message {
                    Text(message).foregroundStyle(EduTheme.teal)
                }
            }
        }
        .premiumTitle("Paramètres école")
        .task { await load() }
    }

    private func load() async {
        guard let schoolId = auth.schoolId, let school = try? await EduAPI().fetchSchool(id: schoolId) else { return }
        self.school = school
        name = school.name
        code = school.code ?? ""
        schoolType = school.schoolType?.isEmpty == false ? school.schoolType! : "primaire"
        region = school.region ?? ""
        city = school.city ?? ""
        address = school.address ?? ""
        phone = school.phone ?? ""
        email = school.email ?? ""
    }

    private func save() async {
        guard let school else { return }
        saving = true
        defer { saving = false }
        do {
            try await EduAPI().saveSchool(school, fields: SchoolFields(
                name: name.trimmingCharacters(in: .whitespaces),
                code: code.trimmingCharacters(in: .whitespaces),
                school_type: schoolType,
                region: region.trimmingCharacters(in: .whitespaces),
                city: city.trimmingCharacters(in: .whitespaces),
                address: address.trimmingCharacters(in: .whitespaces),
                phone: phone.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespaces).lowercased()
            ))
            if let uid = auth.userId { await auth.loadUserData(userId: uid) }
            message = "Profil de l’école mis à jour."
        } catch {
            message = error.localizedDescription
        }
    }
}

struct YearsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var years: [YearRow] = []
    @State private var label = ""
    @State private var start = ""
    @State private var end = ""
    @State private var message: String?

    var body: some View {
        PremiumScreenChrome {
                List {
            Section("Nouvelle année") {
                TextField("Libellé (ex. 2026-2027)", text: $label)
                TextField("Début AAAA-MM-JJ", text: $start)
                TextField("Fin AAAA-MM-JJ", text: $end)
                Button("Créer") { Task { await create() } }
                    .disabled(label.isEmpty || start.isEmpty || end.isEmpty)
            }
            Section("Années") {
                if years.isEmpty { Text("Aucune année.").foregroundStyle(EduTheme.muted) }
                ForEach(years) { year in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(year.label).font(.headline)
                            Text("\(year.startDate) → \(year.endDate)")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                        Spacer()
                        if year.isCurrent {
                            Text("En cours").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        } else {
                            Button("Courante") { Task { await makeCurrent(year) } }
                                .font(.caption)
                        }
                    }
                }
            }
            if let message { Text(message).foregroundStyle(EduTheme.teal) }
        }
        }
        .premiumTitle("Années scolaires")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        guard let schoolId = auth.schoolId else { return }
        years = (try? await EduAPI().fetchYears(schoolId: schoolId)) ?? []
    }

    private func create() async {
        guard let schoolId = auth.schoolId else { return }
        do {
            try await EduAPI().insertYear(YearInsert(
                school_id: schoolId, label: label, start_date: start, end_date: end, is_current: years.isEmpty
            ))
            label = ""; start = ""; end = ""
            message = "Année créée."
            await reload()
        } catch { message = error.localizedDescription }
    }

    private func makeCurrent(_ year: YearRow) async {
        guard let schoolId = auth.schoolId else { return }
        do {
            try await EduAPI().makeYearCurrent(schoolId: schoolId, yearId: year.id)
            await reload()
        } catch { message = error.localizedDescription }
    }
}

struct PeriodsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var rows: [PeriodRow] = []
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
                Group {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else if rows.isEmpty { PremiumEmpty(title: "Aucune période enregistrée") }
            else {
                List(rows) { row in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(row.label).font(.headline)
                            if let start = row.startDate, let end = row.endDate {
                                Text("\(start) → \(end)").font(.caption).foregroundStyle(EduTheme.muted)
                            }
                        }
                        Spacer()
                        Text(row.statusLabel)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(row.status == "cloturee" ? .orange : EduTheme.teal)
                    }
                }
                    .premiumListStyle()
            }
        }
        }
        .premiumTitle("Périodes et clôture")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { return }
        do { rows = try await EduAPI().fetchPeriods(schoolId: schoolId); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct SubjectsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var rows: [SubjectRow] = []
    @State private var name = ""
    @State private var message: String?

    var body: some View {
        PremiumScreenChrome {
                List {
            Section("Ajouter") {
                TextField("Nom de la matière", text: $name)
                Button("Ajouter") { Task { await add() } }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Section("Catalogue") {
                ForEach(rows) { row in
                    HStack {
                        Text(row.name)
                        Spacer()
                        if let code = row.code, !code.isEmpty {
                            Text(code).foregroundStyle(EduTheme.muted)
                        }
                        if let coef = row.coefficient {
                            Text("coef \(coef.formatted())").font(.caption).foregroundStyle(EduTheme.muted)
                        }
                    }
                }
            }
            if let message { Text(message) }
        }
        }
        .premiumTitle("Matières")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        guard let schoolId = auth.schoolId else { return }
        rows = (try? await EduAPI().fetchSubjects(schoolId: schoolId)) ?? []
    }

    private func add() async {
        guard let schoolId = auth.schoolId else { return }
        do {
            try await EduAPI().insertSubject(SubjectInsert(school_id: schoolId, name: name.trimmingCharacters(in: .whitespaces), coefficient: 1))
            name = ""
            message = "Matière ajoutée."
            await reload()
        } catch { message = error.localizedDescription }
    }
}

struct ClassesAdminView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var classes: [ClassRow] = []
    @State private var years: [YearRow] = []
    @State private var yearId = ""
    @State private var name = ""
    @State private var level = ""
    @State private var message: String?

    var body: some View {
        PremiumScreenChrome {
                List {
            Section("Nouvelle classe") {
                if years.isEmpty {
                    Text("Créez d’abord une année scolaire.").foregroundStyle(EduTheme.muted)
                } else {
                    Picker("Année", selection: $yearId) {
                        ForEach(years) { Text($0.label).tag($0.id) }
                    }
                    TextField("Nom", text: $name)
                    TextField("Niveau", text: $level)
                    Button("Créer") { Task { await create() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || yearId.isEmpty)
                }
            }
            Section("Classes") {
                ForEach(classes) { item in
                    NavigationLink {
                        ClassHubView(classId: item.id, className: item.name)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(item.name).font(.headline)
                            if let level = item.gradeLevel, !level.isEmpty {
                                Text(level).font(.caption).foregroundStyle(EduTheme.muted)
                            }
                        }
                    }
                }
            }
            if let message { Text(message) }
        }
        }
        .premiumTitle("Classes")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        guard let schoolId = auth.schoolId else { return }
        let api = EduAPI()
        classes = (try? await api.fetchClasses(schoolId: schoolId)) ?? []
        years = (try? await api.fetchYears(schoolId: schoolId)) ?? []
        if yearId.isEmpty { yearId = years.first { $0.isCurrent }?.id ?? years.first?.id ?? "" }
    }

    private func create() async {
        guard let schoolId = auth.schoolId else { return }
        do {
            try await EduAPI().insertClass(ClassInsert(
                school_id: schoolId,
                academic_year_id: yearId,
                name: name.trimmingCharacters(in: .whitespaces),
                grade_level: level.trimmingCharacters(in: .whitespaces)
            ))
            name = ""; level = ""
            message = "Classe créée."
            await reload()
        } catch { message = error.localizedDescription }
    }
}

struct ProgrammeView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var rows: [ProgrammeRow] = []
    @State private var error: String?

    private var grouped: [(name: String, lines: [ProgrammeRow])] {
        let dict = Dictionary(grouping: rows) { $0.classes?.name ?? "Classe" }
        return dict.keys.sorted().map { ($0, dict[$0] ?? []) }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if rows.isEmpty {
                    PremiumEmpty(title: "Aucun programme", systemImage: "list.bullet.rectangle")
                } else {
                    List {
                        ForEach(grouped, id: \.name) { group in
                            Section(group.name) {
                                ForEach(group.lines) { line in
                                    HStack {
                                        Text(line.matieres?.name ?? "Matière")
                                            .font(.subheadline.weight(.medium))
                                            .foregroundStyle(EduTheme.ink)
                                        Spacer()
                                        Text("coef \(line.coefficient.map { $0.formatted() } ?? "1")")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(EduTheme.muted)
                                    }
                                    .listRowBackground(
                                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                                            .fill(.white)
                                            .padding(.vertical, 3)
                                    )
                                }
                            }
                        }
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle("Programmes")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { return }
        do { rows = try await EduAPI().fetchProgramme(schoolId: schoolId); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct SchoolTimetableMenu: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var classes: [ClassRow] = []

    var body: some View {
        PremiumScreenChrome {
            Group {
                if classes.isEmpty {
                    PremiumEmpty(title: "Aucune classe", systemImage: "calendar", message: "Créez des classes pour gérer les emplois du temps.")
                } else {
                    List(classes) { item in
                        NavigationLink(item.name) { TimetableView(mode: .classSection(item.id)) }
                            .listRowBackground(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(.white)
                                    .padding(.vertical, 3)
                            )
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle("Emplois du temps")
        .task {
            guard let schoolId = auth.schoolId else { return }
            classes = (try? await EduAPI().fetchClasses(schoolId: schoolId)) ?? []
        }
    }
}

struct SchoolAttendanceView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var summary: AttendanceSummary?
    @State private var classIds: [String] = []
    @State private var ready = false

    var body: some View {
        VStack(spacing: 0) {
            if let summary {
                HStack(spacing: 8) {
                    dayStat("Présents", summary.present ?? 0, EduTheme.teal)
                    dayStat("Absents", summary.absent ?? 0, EduTheme.fasoRed)
                    dayStat("Retards", summary.late ?? 0, Color.orange)
                    dayStat("Excusés", summary.excused ?? 0, EduTheme.navy)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.white)
                .overlay(alignment: .bottom) { Divider() }
            }
            if ready {
                PresenceLogView(classIds: classIds, day: EduDates.day(), title: "Présences")
            } else {
                LoadingBlock()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(EduTheme.loginBackground)
            }
        }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .preferredColorScheme(.light)
        .task { await load() }
    }

    private func dayStat(_ title: String, _ value: Int, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { return }
        let api = EduAPI()
        summary = try? await api.attendanceDay(schoolId: schoolId, day: EduDates.day())
        classIds = ((try? await api.fetchClasses(schoolId: schoolId)) ?? []).map(\.id)
        ready = true
    }
}

struct SchoolEvalMenu: View {
    var type: String
    var title: String
    @EnvironmentObject private var auth: AuthViewModel
    @State private var classIds: [String] = []
    @State private var ready = false

    var body: some View {
        Group {
            if ready {
                EvaluationsBrowser(classIds: classIds, type: type, allowEntry: true, title: title)
            } else {
                LoadingBlock().premiumTitle(title)
                .scrollContentBackground(.hidden)
                .background(EduTheme.loginBackground.ignoresSafeArea())
                .preferredColorScheme(.light)
            }
        }
        .task {
            guard let schoolId = auth.schoolId else { return }
            classIds = ((try? await EduAPI().fetchClasses(schoolId: schoolId)) ?? []).map(\.id)
            ready = true
        }
    }
}

struct SessionsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var rows: [SessionRow] = []
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
                Group {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else if rows.isEmpty { PremiumEmpty(title: "Aucune session de composition") }
            else {
                List(rows) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.title ?? "Composition").font(.headline)
                        Text(row.classes?.name ?? "").font(.subheadline).foregroundStyle(EduTheme.muted)
                        Text([row.periodLabel, row.startsOn, row.endsOn].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(EduTheme.teal)
                    }
                }
                    .premiumListStyle()
            }
        }
        }
        .premiumTitle("Compositions")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { return }
        do { rows = try await EduAPI().fetchSessions(schoolId: schoolId); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct TeacherEntryView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var teachers: [RolePerson] = []
    @State private var teacherId = ""

    var body: some View {
        PremiumScreenChrome {
                List {
            Section("Enseignant") {
                Picker("Compte", selection: $teacherId) {
                    Text("Choisir").tag("")
                    ForEach(teachers) { teacher in
                        Text(teacher.profils?.fullName ?? "Enseignant").tag(teacher.userId)
                    }
                }
            }
            if !teacherId.isEmpty {
                Section("Saisie") {
                    NavigationLink("Devoirs et évaluations") {
                        EvaluationsBrowser(teacherId: teacherId, allowEntry: true, recordedBy: teacherId, title: "Évaluations")
                    }
                    NavigationLink("Cahier de textes") {
                        TeacherCahierProxy(teacherId: teacherId)
                    }
                }
            }
        }
        }
        .premiumTitle("Saisie enseignant")
        .task {
            guard let schoolId = auth.schoolId else { return }
            teachers = (try? await EduAPI().fetchRolePeople(role: "teacher", schoolId: schoolId)) ?? []
        }
    }
}

struct TeacherCahierProxy: View {
    let teacherId: String
    @State private var entries: [CahierEntry] = []

    var body: some View {
        PremiumScreenChrome {
                List(entries) { entry in
            VStack(alignment: .leading) {
                Text("\(entry.entryDate) · \(entry.classes?.name ?? "") · \(entry.matieres?.name ?? "")")
                    .font(.headline)
                if let content = entry.content { Text(content).font(.subheadline) }
            }
        }
        }
        .premiumTitle("Cahier")
        .overlay { if entries.isEmpty { PremiumEmpty(title: "Aucune saisie") } }
        .task { entries = (try? await EduAPI().fetchCahierForTeacher(teacherId: teacherId)) ?? [] }
    }
}

struct BulletinsMenu: View {
    var body: some View {
        PeopleListView(kind: .students, screenTitle: "Bulletins")
    }
}

struct SchoolCahierView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var entries: [CahierEntry] = []
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
                Group {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else if entries.isEmpty { PremiumEmpty(title: "Aucune saisie récente") }
            else {
                List(entries) { entry in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(entry.classes?.name ?? "Classe") · \(entry.matieres?.name ?? "")")
                            .font(.headline)
                        Text(entry.entryDate).font(.caption).foregroundStyle(EduTheme.teal)
                        if let content = entry.content, !content.isEmpty { Text(content).font(.subheadline) }
                        if let homework = entry.homework, !homework.isEmpty {
                            Text("À faire : \(homework)").font(.footnote).foregroundStyle(EduTheme.muted)
                        }
                    }
                }
                    .premiumListStyle()
            }
        }
        }
        .premiumTitle("Cahier de textes")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { return }
        do {
            let ids = try await EduAPI().fetchClasses(schoolId: schoolId).map(\.id)
            entries = try await EduAPI().fetchCahierForClasses(ids)
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct StatisticsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var stats: SchoolStatistics?
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if let stats {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            if let year = stats.year?.label {
                                Text("Année · \(year)")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.muted)
                            }
                            if let totals = stats.totals {
                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                    MetricCardView(label: "Élèves", value: "\(totals.students ?? 0)", hint: "Effectif", valueColor: EduTheme.navy)
                                    MetricCardView(label: "Classes", value: "\(totals.classes ?? 0)", hint: "Sections", valueColor: EduTheme.teal)
                                    MetricCardView(label: "Garçons", value: "\(totals.male ?? 0)", hint: "Répartition", valueColor: Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255))
                                    MetricCardView(label: "Filles", value: "\(totals.female ?? 0)", hint: "Répartition", valueColor: EduTheme.fasoYellow)
                                }
                            }
                            if let classes = stats.byClass, !classes.isEmpty {
                                HomePanel(
                                    systemImage: "rectangle.3.group",
                                    title: "Par classe",
                                    subtitle: "Effectifs et moyennes",
                                    content: {
                                        VStack(spacing: 8) {
                                            ForEach(classes) { item in
                                                HomeRowCard(
                                                    title: item.name ?? "Classe",
                                                    subtitle: "\(item.total ?? 0) élèves · \(item.absent ?? 0) absences",
                                                    trailing: item.average.map { String(format: "%.1f", $0) }
                                                )
                                            }
                                        }
                                    }
                                )
                            }
                        }
                        .padding(20)
                    }
                } else {
                    PremiumEmpty(title: "Aucune statistique", systemImage: "chart.bar")
                }
            }
        }
        .premiumTitle("Statistiques")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let schoolId = auth.schoolId else { loading = false; return }
        do { stats = try await EduAPI().schoolStatistics(schoolId: schoolId); error = nil }
        catch { self.error = error.localizedDescription }
        loading = false
    }
}

struct RolePeopleView: View {
    let role: String
    let title: String
    var schoolScoped = true
    @EnvironmentObject private var auth: AuthViewModel
    @State private var rows: [RolePerson] = []
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
                Group {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else if rows.isEmpty { PremiumEmpty(title: "Aucun compte") }
            else {
                List(rows) { row in
                    VStack(alignment: .leading) {
                        Text(row.profils?.fullName.isEmpty == false ? row.profils!.fullName : "Compte")
                            .font(.headline)
                        Text(AppRole(rawValue: row.role)?.label ?? row.role)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                }
                    .premiumListStyle()
            }
        }
        }
        .premiumTitle(title)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            if schoolScoped {
                guard let schoolId = auth.schoolId else { return }
                rows = try await EduAPI().fetchRolePeople(role: role, schoolId: schoolId)
            } else {
                rows = try await EduAPI().fetchRolePeople(role: role, schoolId: nil)
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct SignalsView: View {
    var schoolId: String?
    @State private var rows: [SignalRow] = []
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
                Group {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else if rows.isEmpty { PremiumEmpty(title: "Aucun signalement") }
            else {
                List(rows) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(row.status ?? "nouveau").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                            Spacer()
                            Text(row.createdAt?.prefix(10) ?? "").font(.caption2).foregroundStyle(EduTheme.muted)
                        }
                        Text(row.message).font(.subheadline)
                        if let route = row.route, !route.isEmpty {
                            Text(route).font(.caption2).foregroundStyle(EduTheme.muted)
                        }
                    }
                }
                    .premiumListStyle()
            }
        }
        }
        .premiumTitle("Signalements")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { rows = try await EduAPI().fetchSignals(schoolId: schoolId); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

// MARK: - Platform admin

struct PlatformDashboardView: View {
    var open: (AppScreen) -> Void
    @State private var schools: [School] = []
    @State private var invites: [InviteRow] = []

    var body: some View {
        List {
            Section {
                LabeledContent("Écoles", value: "\(schools.count)")
                LabeledContent("Actives", value: "\(schools.filter { $0.active != false }.count)")
                LabeledContent("Invitations en attente", value: "\(pending)")
            }
            Section("Écoles récentes") {
                ForEach(schools.prefix(8)) { school in
                    NavigationLink {
                        SchoolDetailView(schoolId: school.id)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(school.name).font(.headline)
                            Text([school.city, school.active == false ? "Inactive" : "Active"].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                    }
                }
            }
            Section {
                Button("Toutes les écoles") { open(.adminSchools) }
                Button("Invitations") { open(.adminInvites) }
                Button("Rapports") { open(.adminReports) }
            }
        }
        .premiumTitle("Tableau de bord")
        .scrollContentBackground(.hidden)
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .preferredColorScheme(.light)
        .task { await load() }
        .refreshable { await load() }
    }

    private var pending: Int {
        invites.filter { $0.acceptedAt == nil && $0.cancelledAt == nil }.count
    }

    private func load() async {
        let api = EduAPI()
        schools = (try? await api.fetchSchools()) ?? []
        invites = (try? await api.fetchInvites()) ?? []
    }
}

struct SchoolsListView: View {
    @State private var schools: [School] = []
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading && schools.isEmpty { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if schools.isEmpty {
                    PremiumEmpty(title: "Aucune école", systemImage: "building.2")
                } else {
                    List(schools) { school in
                        NavigationLink {
                            SchoolDetailView(schoolId: school.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(school.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                Text([school.code, school.city, school.schoolType].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            .padding(.vertical, 4)
                        }
                        .listRowBackground(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(.white)
                                .padding(.vertical, 3)
                        )
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle("Écoles")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        loading = schools.isEmpty
        do { schools = try await EduAPI().fetchSchools(); error = nil }
        catch { self.error = error.localizedDescription }
        loading = false
    }
}

struct SchoolDetailView: View {
    let schoolId: String
    @State private var school: School?
    @State private var message: String?

    var body: some View {
        PremiumScreenChrome {
                Form {
            if let school {
                LabeledContent("Nom", value: school.name)
                LabeledContent("Code", value: school.code ?? "—")
                LabeledContent("Ville", value: school.city ?? "—")
                LabeledContent("Région", value: school.region ?? "—")
                LabeledContent("Adresse", value: school.address ?? "—")
                LabeledContent("Téléphone", value: school.phone ?? "—")
                LabeledContent("E-mail", value: school.email ?? "—")
                LabeledContent("Type", value: school.schoolType ?? "—")
                LabeledContent("Plan", value: school.plan ?? "—")
                LabeledContent("Facturation", value: school.billingStatus ?? "—")
                Toggle("École active", isOn: Binding(
                    get: { school.active != false },
                    set: { newValue in Task { await setActive(newValue) } }
                ))
            } else {
                ProgressView()
            }
            if let message { Text(message) }
        }
        }
        .premiumTitle("École")
        .task { school = try? await EduAPI().fetchSchool(id: schoolId) }
    }

    private func setActive(_ active: Bool) async {
        do {
            try await EduAPI().setSchoolActive(id: schoolId, active: active)
            school = try? await EduAPI().fetchSchool(id: schoolId)
            message = active ? "École activée." : "École désactivée."
        } catch { message = error.localizedDescription }
    }
}

struct AdminUsersView: View {
    @State private var rows: [RolePerson] = []
    @State private var error: String?
    @State private var query = ""

    private var filtered: [RolePerson] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return rows }
        return rows.filter {
            ($0.profils?.fullName ?? "").lowercased().contains(q) || $0.role.contains(q)
        }
    }

    var body: some View {
        PremiumScreenChrome {
                Group {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else {
                List(filtered) { row in
                    VStack(alignment: .leading) {
                        Text(row.profils?.fullName.isEmpty == false ? row.profils!.fullName : row.userId)
                            .font(.headline)
                        Text(AppRole(rawValue: row.role)?.label ?? row.role)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                    .premiumListStyle()
                }
                .searchable(text: $query, prompt: "Nom ou rôle")
            }
        }
        }
        .premiumTitle("Utilisateurs")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { rows = try await EduAPI().fetchAllRolePeople(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct InvitesView: View {
    @State private var rows: [InviteRow] = []
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
                Group {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else if rows.isEmpty { PremiumEmpty(title: "Aucune invitation") }
            else {
                List(rows) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.fullName.isEmpty ? row.email : row.fullName).font(.headline)
                        Text(row.email).font(.caption).foregroundStyle(EduTheme.muted)
                        Text(status(row)).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                    }
                }
                    .premiumListStyle()
            }
        }
        }
        .premiumTitle("Invitations")
        .task { await load() }
        .refreshable { await load() }
    }

    private func status(_ row: InviteRow) -> String {
        if row.acceptedAt != nil { return "Acceptée" }
        if row.cancelledAt != nil { return "Annulée" }
        return "En attente · \(AppRole(rawValue: row.role ?? "")?.label ?? (row.role ?? ""))"
    }

    private func load() async {
        do { rows = try await EduAPI().fetchInvites(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct AdminReportsView: View {
    @State private var schools: [School] = []
    @State private var adminSchoolIds = Set<String>()
    @State private var pending = 0

    var body: some View {
        PremiumScreenChrome {
                List {
            Section {
                LabeledContent("Invitations en attente", value: "\(pending)")
                LabeledContent("Écoles inactives", value: "\(schools.filter { $0.active == false }.count)")
                LabeledContent("Sans administrateur", value: "\(missingAdmin.count)")
            }
            if !missingAdmin.isEmpty {
                Section("Écoles sans administrateur") {
                    ForEach(missingAdmin) { school in
                        Text(school.name)
                    }
                }
            }
        }
        }
        .premiumTitle("Rapports")
        .task { await load() }
        .refreshable { await load() }
    }

    private var missingAdmin: [School] {
        schools.filter { !adminSchoolIds.contains($0.id) }
    }

    private func load() async {
        let api = EduAPI()
        schools = (try? await api.fetchSchools()) ?? []
        let admins = (try? await api.fetchRolePeople(role: "school_admin", schoolId: nil)) ?? []
        adminSchoolIds = Set(admins.compactMap(\.schoolId))
        let invites = (try? await api.fetchInvites()) ?? []
        pending = invites.filter { $0.acceptedAt == nil && $0.cancelledAt == nil }.count
    }
}

struct BillingView: View {
    @State private var schools: [School] = []

    var body: some View {
        PremiumScreenChrome {
            Group {
                if schools.isEmpty {
                    PremiumEmpty(title: "Aucune école", systemImage: "creditcard")
                } else {
                    List(schools) { school in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(school.name)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.ink)
                            Text("Plan : \(school.plan ?? "—")")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                            Text("Statut : \(school.billingStatus ?? "—")")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(EduTheme.teal)
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(.white)
                                .padding(.vertical, 3)
                        )
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle("Abonnements")
        .task { schools = (try? await EduAPI().fetchSchools()) ?? [] }
        .refreshable { schools = (try? await EduAPI().fetchSchools()) ?? [] }
    }
}

struct PlatformSettingsView: View {
    @State private var row: PlatformSettingsRow?
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
                Form {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed) }
            else if let row {
                LabeledContent("Application", value: row.appName ?? "EduFaso")
                LabeledContent("Support", value: row.supportEmail ?? "—")
                LabeledContent("Site d’invitation", value: row.inviteSiteUrl ?? "—")
                LabeledContent("Année par défaut", value: row.defaultYearLabel ?? "—")
            } else {
                ProgressView()
            }
        }
        }
        .premiumTitle("Paramètres")
        .task {
            do { row = try await EduAPI().fetchPlatformSettings() }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct AuditView: View {
    @State private var rows: [AuditRow] = []
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
                Group {
            if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
            else if rows.isEmpty { PremiumEmpty(title: "Journal vide") }
            else {
                List(rows) { row in
                    VStack(alignment: .leading) {
                        Text(row.action).font(.headline)
                        Text([row.entityType, row.createdAt].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                }
                    .premiumListStyle()
            }
        }
        }
        .premiumTitle("Journal d'audit")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { rows = try await EduAPI().fetchAudit(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

func attendanceLabel(_ status: String) -> String {
    switch status {
    case "present": return "Présent"
    case "absent": return "Absent"
    case "late": return "Retard"
    case "excused": return "Excusé"
    default: return status
    }
}

func attendanceColor(_ status: String) -> Color {
    switch status {
    case "present": return EduTheme.teal
    case "absent": return EduTheme.fasoRed
    case "late": return .orange
    case "excused": return .blue
    default: return EduTheme.muted
    }
}
