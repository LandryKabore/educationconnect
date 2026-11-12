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
        case all, todo, upcoming, past, graded
        var id: String { rawValue }

        func label(for type: String?) -> String {
            switch self {
            case .all: return "Tout"
            case .todo: return "À faire"
            case .upcoming: return "À venir"
            case .past: return "Passés"
            case .graded: return "Notés"
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
    @State private var rows: [EvaluationRow] = []
    @State private var gradedIds: Set<String> = []
    @State private var expandedIds: Set<String> = []
    @State private var statusFilter: StatusFilter = .all
    @State private var className: String?
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?

    private var resolvedStudentId: String? { studentId ?? (teacherId == nil && !allowEntry ? auth.userId : nil) }
    private var isStudentAudience: Bool { resolvedStudentId != nil && !allowEntry }
    private var isExamMode: Bool { type == "examen" }

    private var availableFilters: [StatusFilter] {
        if isExamMode {
            return [.all, .upcoming, .past, .graded]
        }
        return [.all, .todo, .graded]
    }

    private var emptyTitle: String {
        switch type {
        case "devoir": return "Aucun exercice"
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
            return "Aucun exercice de maison publié pour ta classe."
        case "examen":
            return "Aucun devoir confirmé par l’établissement pour le moment."
        default:
            return "Rien à afficher pour le moment."
        }
    }

    private var accent: Color {
        switch type {
        case "devoir": return EduTheme.fasoRed
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
        case .upcoming: base = rows.filter { isUpcoming($0) }
        case .past: base = rows.filter { !isUpcoming($0) }
        case .graded: base = rows.filter { gradedIds.contains($0.id) }
        }
        return base.sorted { lhs, rhs in
            let l = eventDay(lhs) ?? "9999"
            let r = eventDay(rhs) ?? "9999"
            if isExamMode {
                // Upcoming first (soonest), then past (most recent)
                let lUp = isUpcoming(lhs)
                let rUp = isUpcoming(rhs)
                if lUp != rUp { return lUp && !rUp }
                return lUp ? l < r : l > r
            }
            return l > r
        }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if !ready || loading {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else if rows.isEmpty {
                    PremiumEmpty(title: emptyTitle, systemImage: "doc.text", message: emptyMessage)
                } else {
                    VStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 12) {
                            summaryCard
                            if isStudentAudience {
                                statusChips
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(EduTheme.loginBackground)

                        ScrollView {
                            LazyVStack(spacing: 10) {
                                if filteredRows.isEmpty {
                                    Text("Rien à afficher avec ce filtre.")
                                        .font(.subheadline)
                                        .foregroundStyle(EduTheme.muted)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(16)
                                        .background(cardBackground)
                                } else {
                                    ForEach(filteredRows) { row in
                                        evaluationCard(row)
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
        .premiumTitle(title)
        .task { await load(isRefresh: false) }
    }

    private var summaryCard: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(accent.opacity(0.12))
                Image(systemName: summaryIcon)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(accent)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 4) {
                Text((className ?? "Ma classe").uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.5)
                Text("\(rows.count) \(itemNoun(rows.count))")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                if isStudentAudience {
                    if isExamMode {
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
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(cardBackground)
    }

    private var summaryIcon: String {
        switch type {
        case "devoir": return "list.clipboard.fill"
        case "examen": return "pencil.and.list.clipboard"
        case "composition": return "graduationcap.fill"
        default: return "doc.text.fill"
        }
    }

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(availableFilters) { chip in
                    Button {
                        statusFilter = chip
                    } label: {
                        Text(chip.label(for: type))
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

    @ViewBuilder
    private func evaluationCard(_ row: EvaluationRow) -> some View {
        let graded = gradedIds.contains(row.id)
        let expanded = expandedIds.contains(row.id)
        let canEnter = allowEntry && row.classSectionId != nil && row.subjectId != nil
        let hasDetails = !(row.details ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        let swatch = SubjectPalette.swatch(for: row.matieres?.name)

        VStack(alignment: .leading, spacing: 0) {
            if canEnter {
                NavigationLink {
                    GradeEntryView(evaluation: row, recordedBy: recordedBy)
                } label: {
                    cardHeader(row, graded: graded, expanded: false, expandable: false, showsChevron: true, swatch: swatch)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    guard hasDetails else { return }
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if expanded {
                            expandedIds.remove(row.id)
                        } else {
                            expandedIds.insert(row.id)
                        }
                    }
                } label: {
                    cardHeader(row, graded: graded, expanded: expanded, expandable: hasDetails, swatch: swatch)
                }
                .buttonStyle(.plain)

                if expanded, let details = row.details, !details.isEmpty {
                    Divider().padding(.horizontal, 14)
                    Text(details)
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.ink.opacity(0.85))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                }
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

    private func cardHeader(
        _ row: EvaluationRow,
        graded: Bool,
        expanded: Bool,
        expandable: Bool,
        showsChevron: Bool = false,
        swatch: SubjectPalette.Swatch
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            if isExamMode {
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

                if let subject = row.matieres?.name, !subject.isEmpty {
                    Text(subject)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(swatch.border)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(swatch.border.opacity(0.12), in: Capsule())
                }

                if isExamMode {
                    if let time = timeRange(row) {
                        Label(time, systemImage: "clock")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(EduTheme.navy)
                    }
                    if let period = row.periodLabel, !period.isEmpty {
                        Text(period)
                            .font(.caption2)
                            .foregroundStyle(EduTheme.muted)
                    }
                } else {
                    if !row.whenLabel.isEmpty {
                        Label(prettyWhen(row), systemImage: "calendar")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                    if let period = row.periodLabel, !period.isEmpty {
                        Text(period)
                            .font(.caption2)
                            .foregroundStyle(EduTheme.muted)
                    }
                }
            }

            if expandable || showsChevron {
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
        } else if isExamMode {
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
        } else if isStudentAudience {
            Text("À faire")
                .font(.caption2.weight(.bold))
                .foregroundStyle(swatch.border)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(swatch.border.opacity(0.12), in: Capsule())
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

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.white)
    }

    private func itemNoun(_ count: Int) -> String {
        switch type {
        case "devoir": return count == 1 ? "exercice" : "exercices"
        case "examen": return count == 1 ? "devoir" : "devoirs"
        case "composition": return count == 1 ? "composition" : "compositions"
        default: return count == 1 ? "évaluation" : "évaluations"
        }
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

            if let sid, !fetched.isEmpty {
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

struct GradeEntryView: View {
    let evaluation: EvaluationRow
    var recordedBy: String? = nil
    @EnvironmentObject private var auth: AuthViewModel
    @State private var drafts: [ScoreDraft] = []
    @State private var loading = true
    @State private var saving = false
    @State private var message: String?

    struct ScoreDraft: Identifiable {
        let id: String
        var noteId: String?
        var name: String
        var score: String
        var absent: Bool
    }

    var body: some View {
        PremiumScreenChrome {
            Form {
                Section {
                    Text(evaluation.title ?? evaluation.typeLabel)
                        .font(.headline)
                        .foregroundStyle(EduTheme.ink)
                    Text(evaluation.matieres?.name ?? evaluation.typeLabel)
                        .foregroundStyle(EduTheme.muted)
                    if !evaluation.whenLabel.isEmpty {
                        Text(evaluation.whenLabel).font(.caption).foregroundStyle(EduTheme.navy)
                    }
                }
                if loading {
                    ProgressView().tint(EduTheme.navy)
                } else {
                    Section("Élèves") {
                        ForEach($drafts) { $draft in
                            HStack {
                                Text(draft.name)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(EduTheme.ink)
                                Spacer()
                                if draft.absent {
                                    Text("Absent").foregroundStyle(.orange)
                                } else {
                                    TextField("Note", text: $draft.score)
                                        .keyboardType(.decimalPad)
                                        .multilineTextAlignment(.trailing)
                                        .foregroundStyle(EduTheme.ink)
                                        .frame(width: 72)
                                }
                                Toggle("Absent", isOn: $draft.absent)
                                    .labelsHidden()
                                    .tint(EduTheme.navy)
                            }
                        }
                    }
                    Section {
                        Button {
                            Task { await save() }
                        } label: {
                            HStack {
                                if saving { ProgressView().tint(.white) }
                                Text("Enregistrer les notes").fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                        }
                        .listRowBackground(EduTheme.navy)
                        .foregroundStyle(.white)
                        .disabled(saving || drafts.isEmpty)
                    }
                }
                if let message {
                    Text(message).foregroundStyle(EduTheme.teal)
                }
            }
        }
        .premiumTitle("Saisie")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let classId = evaluation.classSectionId else {
            message = "Cette évaluation n’a pas de classe."
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
                let score = note?.score.map { formatScore($0) } ?? ""
                return ScoreDraft(id: student.studentId, noteId: note?.id, name: student.fullName, score: score, absent: note?.isAbsent == true)
            }
            message = nil
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }

    private func save() async {
        guard let classId = evaluation.classSectionId, let subjectId = evaluation.subjectId else { return }
        let recorder = recordedBy ?? auth.userId
        guard let recorder else { return }
        saving = true
        defer { saving = false }
        let maxScore = evaluation.maxScore ?? 20
        let period = evaluation.periodLabel ?? "Trimestre 1"
        var inserts: [GradeInsert] = []
        var updates: [GradeUpdate] = []
        for draft in drafts {
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
            await load()
        } catch {
            message = error.localizedDescription
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
    @State private var period = "Trimestre 1"
    @State private var stats: BulletinClassStats?
    @State private var grades: [GradeRow] = []
    @State private var expandedIds: Set<String> = []
    @State private var classId: String?
    @State private var className: String?
    @State private var loading = true
    @State private var error: String?

    private let periods = ["Trimestre 1", "Trimestre 2", "Trimestre 3", "Année"]

    private var subjects: [BulletinSubjectStat] {
        stats?.subjects ?? []
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
        .task { await load(reset: true) }
        .onChange(of: period) { _, _ in
            expandedIds.removeAll()
            Task { await load(reset: false) }
        }
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
    let classId: String
    let className: String
    @EnvironmentObject private var auth: AuthViewModel
    @State private var students: [PresenceDraft] = []
    @State private var subjects: [String] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else {
                    List {
                        if !subjects.isEmpty {
                            Section("Matières") {
                                Text(subjects.joined(separator: ", "))
                                    .font(.subheadline)
                                    .foregroundStyle(EduTheme.muted)
                            }
                        }
                        Section("Ouvrir") {
                            NavigationLink("Emploi du temps") { TimetableView(mode: .classSection(classId)) }
                            NavigationLink("Cahier de textes") { CahierFeedView(classId: classId, title: "Cahier") }
                            NavigationLink("Notes et évaluations") {
                                EvaluationsBrowser(classId: classId, allowEntry: true, title: "Notes")
                            }
                            if auth.primaryRole == .teacher {
                                NavigationLink("Faire l’appel") { TeacherAttendanceView(initialClassId: classId) }
                            }
                        }
                        Section("Élèves (\(students.count))") {
                            ForEach(students) { student in
                                NavigationLink {
                                    StudentFileView(
                                        studentId: student.studentId,
                                        name: student.fullName,
                                        className: className
                                    )
                                } label: {
                                    HStack(spacing: 10) {
                                        Text(String(student.fullName.prefix(1)).uppercased())
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(.white)
                                            .frame(width: 32, height: 32)
                                            .background(EduTheme.navy, in: Circle())
                                        Text(student.fullName)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(EduTheme.ink)
                                    }
                                }
                            }
                        }
                    }
                    .scrollContentBackground(.hidden)
                }
            }
        }
        .premiumTitle(className)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        loading = students.isEmpty
        do {
            let api = EduAPI()
            students = try await api.fetchStudentsInClass(classSectionId: classId)
            let assignments = try await api.fetchClassAssignments(classId: classId)
            subjects = Array(Set(assignments.compactMap { $0.matieres?.name })).sorted()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct StudentFileView: View {
    let studentId: String
    let name: String
    var className: String?
    var phone: String?
    var matricule: String?

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
                        }
                    }
                    .padding(.vertical, 4)
                    if let matricule, !matricule.isEmpty { LabeledContent("Matricule", value: matricule) }
                    if let phone, !phone.isEmpty { LabeledContent("Téléphone", value: phone) }
                }
                Section("Dossier") {
                    NavigationLink("Notes") { StudentGradesView(studentIdOverride: studentId) }
                    NavigationLink("Présences") { StudentAttendanceView(studentIdOverride: studentId) }
                    NavigationLink("Bulletin") { BulletinBoard(studentId: studentId) }
                    NavigationLink("Emploi du temps") { TimetableView(mode: .student, studentIdOverride: studentId) }
                    NavigationLink("Cahier de textes") { CahierFeedView(studentId: studentId) }
                    NavigationLink("Devoirs") { EvaluationsBrowser(studentId: studentId, type: "examen", confirmedOnly: true, title: "Devoirs") }
                    NavigationLink("Exercices") { EvaluationsBrowser(studentId: studentId, type: "devoir", title: "Exercices") }
                    NavigationLink("Compositions") { EvaluationsBrowser(studentId: studentId, type: "composition", title: "Compositions") }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .premiumTitle("Élève")
        .navigationBarTitleDisplayMode(.inline)
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
    @EnvironmentObject private var auth: AuthViewModel
    @State private var classes: [(id: String, name: String, subjects: [String])] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if classes.isEmpty {
                    PremiumEmpty(title: "Aucune classe", systemImage: "rectangle.3.group", message: "Aucune classe ne t’est affectée.")
                } else {
                    List(classes, id: \.id) { item in
                        NavigationLink {
                            ClassHubView(classId: item.id, className: item.name)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                                Text(item.subjects.joined(separator: ", "))
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
        .premiumTitle("Classes")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let tid = auth.userId else { return }
        loading = classes.isEmpty
        do {
            let rows = try await EduAPI().fetchTeachingAssignments(teacherId: tid)
            var grouped: [String: (name: String, subjects: [String])] = [:]
            for row in rows {
                let id = row.classSectionId
                var entry = grouped[id] ?? (row.classes?.name ?? "Classe", [])
                if let subject = row.matieres?.name, !entry.subjects.contains(subject) {
                    entry.subjects.append(subject)
                }
                grouped[id] = entry
            }
            classes = grouped.map { ($0.key, $0.value.name, $0.value.subjects.sorted()) }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct TeacherStudentsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var sections: [(id: String, name: String, students: [PresenceDraft])] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if sections.isEmpty {
                    PremiumEmpty(title: "Aucun élève", systemImage: "graduationcap", message: "Aucun élève dans tes classes.")
                } else {
                    List {
                        ForEach(sections, id: \.id) { section in
                            Section {
                                ForEach(section.students) { student in
                                    NavigationLink {
                                        StudentFileView(studentId: student.studentId, name: student.fullName, className: section.name)
                                    } label: {
                                        HStack(spacing: 12) {
                                            Text(String(student.fullName.prefix(1)).uppercased())
                                                .font(.subheadline.weight(.bold))
                                                .foregroundStyle(.white)
                                                .frame(width: 36, height: 36)
                                                .background(EduTheme.teal, in: Circle())
                                            Text(student.fullName)
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundStyle(EduTheme.ink)
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
                                Text(section.name.uppercased())
                                    .font(.caption2.weight(.semibold))
                                    .tracking(0.7)
                                    .foregroundStyle(EduTheme.muted)
                            }
                        }
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle("Élèves")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let tid = auth.userId else { return }
        loading = sections.isEmpty
        do {
            let api = EduAPI()
            let assignments = try await api.fetchTeachingAssignments(teacherId: tid)
            var seen = Set<String>()
            var built: [(id: String, name: String, students: [PresenceDraft])] = []
            for assignment in assignments where seen.insert(assignment.classSectionId).inserted {
                let students = try await api.fetchStudentsInClass(classSectionId: assignment.classSectionId)
                built.append((assignment.classSectionId, assignment.classes?.name ?? "Classe", students))
            }
            sections = built.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
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

struct TeacherAttendanceOverview: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var classIds: [String] = []
    @State private var ready = false

    var body: some View {
        Group {
            if !ready { LoadingBlock() }
            else {
                PresenceLogView(classIds: classIds, title: "Présences")
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard let tid = auth.userId else { return }
        let rows = (try? await EduAPI().fetchTeachingAssignments(teacherId: tid)) ?? []
        classIds = Array(Set(rows.map(\.classSectionId)))
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
