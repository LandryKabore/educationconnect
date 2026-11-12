import SwiftUI

struct StudentGradesView: View {
    @EnvironmentObject private var auth: AuthViewModel
    var studentIdOverride: String? = nil
    @State private var rows: [GradeRow] = []
    @State private var loading = true
    @State private var error: String?
    @State private var selectedPeriod: String = "Tous"
    @State private var expandedSubjects: Set<String> = []

    private var periods: [String] {
        let found = Set(rows.compactMap(\.periodLabel).filter { !$0.isEmpty })
        let official = ["Trimestre 1", "Trimestre 2", "Trimestre 3"]
        return official + ["Tous"] + found.subtracting(Set(official)).sorted()
    }

    private var filtered: [GradeRow] {
        selectedPeriod == "Tous" ? rows : rows.filter { $0.periodLabel == selectedPeriod }
    }

    private var scoredRows: [GradeRow] {
        filtered.filter { $0.isAbsent != true && scoreOn20($0) != nil }
    }

    private var averageOn20: Double? {
        let values = scoredRows.compactMap(scoreOn20)
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / Double(values.count)
    }

    private var absentCount: Int {
        filtered.filter { $0.isAbsent == true }.count
    }

    private var grouped: [(subject: String, grades: [GradeRow], average: Double?)] {
        let dict = Dictionary(grouping: filtered) { $0.matieres?.name ?? "Matière" }
        return dict.keys.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
            .map { subject in
                let grades = (dict[subject] ?? []).sorted { lhs, rhs in
                    (lhs.evaluations?.evalDate ?? lhs.createdAt ?? "")
                        > (rhs.evaluations?.evalDate ?? rhs.createdAt ?? "")
                }
                let values = grades.compactMap(scoreOn20)
                let average = values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
                return (subject, grades, average)
            }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading {
                    LoadingBlock()
                } else if let error {
                    Text(error)
                        .foregroundStyle(EduTheme.fasoRed)
                        .padding()
                } else if rows.isEmpty {
                    PremiumEmpty(
                        title: "Aucune note",
                        systemImage: "chart.bar.doc.horizontal",
                        message: "Les notes publiées apparaîtront ici."
                    )
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
                            Text("\(grouped.count)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(EduTheme.muted)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(EduTheme.loginBackground)

                        ScrollView {
                            LazyVStack(spacing: 10) {
                                if !filtered.isEmpty {
                                    statsRow
                                }

                                ForEach(grouped, id: \.subject) { group in
                                    subjectDropdown(
                                        subject: group.subject,
                                        grades: group.grades,
                                        average: group.average
                                    )
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
        .premiumTitle("Mes notes")
        .task { await load() }
        .onChange(of: selectedPeriod) { _, _ in
            expandedSubjects.removeAll()
        }
    }

    private var stickyHeader: some View {
        VStack(spacing: 12) {
            EduPeriodSegmentPicker(
                options: periods.map { ($0, periodTitle($0)) },
                selection: $selectedPeriod
            )

            if let averageOn20 {
                averageCard(averageOn20)
            } else if filtered.isEmpty {
                emptyPeriodCard
            }
        }
    }

    private func periodTitle(_ period: String) -> String {
        period == "Tous" ? "Tout" : period
    }

    private func averageCard(_ average: Double) -> some View {
        HStack(spacing: 16) {
            GradeRing(average: average)
            VStack(alignment: .leading, spacing: 4) {
                Text("MOYENNE")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EduTheme.muted)
                    .tracking(0.6)
                Text(String(format: "%.1f / 20", average))
                    .font(.title2.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.ink)
                Text(selectedPeriod == "Tous" ? "Sur toutes les notes publiées" : "Sur \(selectedPeriod.lowercased())")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(cardBackground)
    }

    private var statsRow: some View {
        HStack(spacing: 12) {
            statCard(title: "NOTES", value: "\(filtered.count)", detail: "publiée\(filtered.count == 1 ? "" : "s")", color: EduTheme.navy)
            statCard(title: "MATIÈRES", value: "\(grouped.count)", detail: "évaluée\(grouped.count == 1 ? "" : "s")", color: EduTheme.teal)
            statCard(
                title: "ABSENTS",
                value: "\(absentCount)",
                detail: absentCount == 0 ? "aucune" : "non noté\(absentCount == 1 ? "" : "s")",
                color: absentCount == 0 ? EduTheme.fasoGreen : Color.orange
            )
        }
    }

    private func statCard(title: String, value: String, detail: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2.weight(.bold))
                .foregroundStyle(EduTheme.muted)
                .tracking(0.6)
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(detail)
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(cardBackground)
    }

    private var emptyPeriodCard: some View {
        Text("Aucune note sur cette période.")
            .font(.subheadline)
            .foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(cardBackground)
    }

    private func subjectDropdown(subject: String, grades: [GradeRow], average: Double?) -> some View {
        let expanded = expandedSubjects.contains(subject)
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expanded {
                        expandedSubjects.remove(subject)
                    } else {
                        expandedSubjects.insert(subject)
                    }
                }
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(subject)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.ink)
                            .multilineTextAlignment(.leading)
                        Text("\(grades.count) note\(grades.count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 6) {
                        if let average {
                            Text(String(format: "%.2f", average))
                                .font(.headline.monospacedDigit())
                                .foregroundStyle(average >= 10 ? EduTheme.teal : Color.orange)
                        } else {
                            Text("—")
                                .font(.headline)
                                .foregroundStyle(EduTheme.muted)
                        }
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
                VStack(spacing: 0) {
                    ForEach(Array(grades.enumerated()), id: \.element.id) { index, grade in
                        if index > 0 {
                            Divider().padding(.leading, 14)
                        }
                        gradeRow(grade)
                    }
                }
            }
        }
        .background(cardBackground)
    }

    private func gradeRow(_ g: GradeRow) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(evalTitle(g))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(EduTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    if let type = g.evaluations?.type, !type.isEmpty {
                        Text(typeLabel(type))
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.navy)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(EduTheme.navy.opacity(0.08), in: Capsule())
                    }
                    if let date = g.evaluations?.evalDate, !date.isEmpty {
                        Text(prettyDate(date))
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    } else if selectedPeriod == "Tous", let p = g.periodLabel, !p.isEmpty {
                        Text(p)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                }
            }
            Spacer(minLength: 8)
            scoreBadge(g)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func scoreBadge(_ g: GradeRow) -> some View {
        if g.isAbsent == true {
            Text("Absent")
                .font(.caption.weight(.bold))
                .foregroundStyle(.orange)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.orange.opacity(0.12)))
        } else if let on20 = scoreOn20(g) {
            Text(String(format: "%.1f", on20))
                .font(.headline.monospacedDigit().weight(.bold))
                .foregroundStyle(on20 >= 10 ? EduTheme.teal : Color.orange)
                + Text(" / 20")
                .font(.caption.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
        } else if let score = g.score {
            Text(String(format: "%.1f / %.0f", score, g.maxScore ?? 20))
                .font(.headline.monospacedDigit())
                .foregroundStyle(EduTheme.teal)
        } else {
            Text("—")
                .font(.headline)
                .foregroundStyle(EduTheme.muted)
        }
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.white)
    }

    private func evalTitle(_ g: GradeRow) -> String {
        if let title = g.evaluations?.title, !title.isEmpty { return title }
        return g.matieres?.name ?? "Note"
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

    private func scoreOn20(_ grade: GradeRow) -> Double? {
        if grade.isAbsent == true { return nil }
        guard let score = grade.score, let max = grade.maxScore, max > 0 else { return nil }
        return (score / max) * 20
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

    private func load() async {
        let sid = studentIdOverride ?? auth.userId
        guard let sid else {
            loading = false
            error = "Compte introuvable."
            return
        }
        loading = rows.isEmpty
        do {
            rows = try await EduAPI().fetchGrades(studentId: sid)
            if selectedPeriod != "Tous", !periods.contains(selectedPeriod) {
                selectedPeriod = "Tous"
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

private struct GradeRing: View {
    let average: Double

    private var progress: CGFloat {
        CGFloat(min(max(average / 20, 0), 1))
    }

    private var tint: Color {
        average >= 10 ? EduTheme.teal : Color.orange
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(tint.opacity(0.15), lineWidth: 8)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(tint, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(String(format: "%.1f", average))
                    .font(.headline.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.ink)
                Text("/20")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
            }
        }
        .frame(width: 72, height: 72)
    }
}
