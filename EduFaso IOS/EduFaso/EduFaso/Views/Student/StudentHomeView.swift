import SwiftUI

struct StudentHomeView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var className: String?
    @State private var classId: String?
    @State private var average: Double?
    @State private var annual: AnnualAverageResult?
    @State private var gradeCount = 0
    @State private var recentGrades: [GradeRow] = []
    @State private var attendanceRate: Int?
    @State private var absencesCount = 0
    @State private var lateCount = 0
    @State private var pendingExercises: [EvaluationRow] = []
    @State private var upcomingExams: [EvaluationRow] = []
    @State private var upcomingCompositions: [StudentCompositionSession] = []
    @State private var todaySlots: [TimetableSlot] = []
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0
    @State private var loading = true
    @State private var ready = false

    private var firstName: String {
        if let first = auth.profile?.firstName.trimmingCharacters(in: .whitespaces), !first.isEmpty {
            return first
        }
        return auth.profile?.fullName.split(separator: " ").first.map(String.init) ?? ""
    }

    private var nowSlot: TimetableSlot? {
        let now = minutesNow()
        return todaySlots.first {
            minutes($0.startTime) <= now && now < minutes($0.endTime)
        }
    }

    private var nextSlot: TimetableSlot? {
        let now = minutesNow()
        return todaySlots.first { minutes($0.startTime) > now }
    }

    var body: some View {
        Group {
            if !ready {
                Color.clear
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        hero

                        if unreadMessages > 0 || unreadAnnouncements > 0 {
                            inboxBanner
                        }

                        todaySection

                        statsRow

                        bulletinAveragesCard

                        if !pendingExercises.isEmpty || !upcomingExams.isEmpty || !upcomingCompositions.isEmpty {
                            upcomingPanel
                        }

                        gradesPanel

                        shortcutsGrid
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                }
                .refreshable { await load(isRefresh: true) }
            }
        }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load(isRefresh: false) }
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [EduTheme.teal, EduTheme.navy],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Image(systemName: "graduationcap.fill")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 58, height: 58)
                .shadow(color: EduTheme.navy.opacity(0.25), radius: 12, y: 6)

                VStack(alignment: .leading, spacing: 3) {
                    Text("\(TimeGreeting.current()), \(firstName.isEmpty ? "…" : firstName)")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    Text(className.map { "Classe · \($0)" } ?? (auth.schools.first?.name ?? "Espace élève"))
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                    Text(todayCaption)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(EduTheme.teal)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var todayCaption: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "EEEE d MMMM"
        return formatter.string(from: Date()).capitalized
    }

    // MARK: - Inbox

    private var inboxBanner: some View {
        HStack(spacing: 10) {
            if unreadMessages > 0 {
                NavigationLink {
                    MessagesView()
                } label: {
                    Label("\(unreadMessages) message\(unreadMessages > 1 ? "s" : "")", systemImage: "envelope.fill")
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(EduTheme.navy, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
            if unreadAnnouncements > 0 {
                NavigationLink {
                    MessagesView(announcementsOnly: true)
                } label: {
                    Label("\(unreadAnnouncements) annonce\(unreadAnnouncements > 1 ? "s" : "")", systemImage: "megaphone.fill")
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(EduTheme.brand50, in: Capsule())
                        .foregroundStyle(EduTheme.navy)
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Today (one block: highlight + remaining list)

    private var laterToday: [TimetableSlot] {
        guard let focus = nowSlot ?? nextSlot else { return [] }
        return todaySlots.filter {
            $0.id != focus.id && minutes($0.startTime) > minutes(focus.startTime)
        }
    }

    private var todaySection: some View {
        let focus = nowSlot ?? nextSlot
        let subtitle: String = {
            if todaySlots.isEmpty { return "Aucun cours au planning" }
            if focus == nil { return "\(todaySlots.count) cours · terminée" }
            if nowSlot != nil { return "En cours · \(laterToday.count) après" }
            return "Prochain · \(laterToday.count) ensuite"
        }()

        return HomePanel(
            systemImage: "calendar",
            title: "Aujourd’hui",
            subtitle: subtitle
        ) {
            if let slot = focus {
                focusBanner(slot, live: nowSlot != nil)

                if !laterToday.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(laterToday.prefix(6)) { row in
                            NavigationLink { TimetableView(mode: .student) } label: {
                                courseRow(row)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                todayActions
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(todaySlots.isEmpty ? "Pas de cours prévu" : "Journée terminée ✨")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                    Text(todaySlots.isEmpty
                         ? "Profite de ta journée libre, ou consulte la semaine."
                         : "Plus de cours pour aujourd’hui. Reviens demain.")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                    todayActions
                        .padding(.top, 4)
                }
            }
        }
    }

    private func focusBanner(_ slot: TimetableSlot, live: Bool) -> some View {
        let swatch = SubjectPalette.swatch(for: slot.matieres?.name)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(live ? "EN COURS" : "PROCHAIN COURS")
                    .font(.caption.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(live ? EduTheme.fasoRed : EduTheme.teal)
                Spacer()
                Text("\(clock(slot.startTime))–\(clock(slot.endTime))")
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.ink)
            }
            Text(slot.matieres?.name ?? "Cours")
                .font(.title3.weight(.bold))
                .foregroundStyle(EduTheme.ink)
            HStack(spacing: 12) {
                if let teacher = slot.teacherName {
                    Label(teacher, systemImage: "person.fill")
                }
                if let room = formatRoom(slot.room) {
                    Label(room, systemImage: "mappin.and.ellipse")
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(EduTheme.ink.opacity(0.75))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(swatch.fill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(swatch.border.opacity(0.45), lineWidth: 1)
        )
    }

    private var todayActions: some View {
        HStack(spacing: 8) {
            NavigationLink { TimetableView(mode: .student) } label: {
                Text("Emploi du temps")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(EduTheme.navy)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)

            NavigationLink { CahierFeedView() } label: {
                Text("Cahier")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                    .foregroundStyle(EduTheme.navy)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Stats

    private var statsRow: some View {
        HStack(spacing: 10) {
            NavigationLink {
                BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin")
            } label: {
                statTile(
                    label: "Moyenne",
                    value: average.map { String(format: "%.1f" , $0) } ?? "—",
                    hint: average == nil ? "En attente" : (average! >= 10 ? "Sur la bonne voie" : "À renforcer"),
                    color: average == nil ? EduTheme.muted : (average! >= 10 ? EduTheme.teal : Color.orange),
                    icon: "chart.bar.fill"
                )
            }
            .buttonStyle(.plain)

            NavigationLink { StudentAttendanceView() } label: {
                statTile(
                    label: "Présence",
                    value: attendanceRate.map { "\($0)%" } ?? "—",
                    hint: attendanceRate == nil
                        ? "Pas encore de saisie"
                        : "\(absencesCount) abs · \(lateCount) ret",
                    color: attendanceRate == nil ? EduTheme.muted : (attendanceRate! >= 85 ? EduTheme.fasoGreen : Color.orange),
                    icon: "checkmark.seal.fill"
                )
            }
            .buttonStyle(.plain)

            NavigationLink { StudentGradesView() } label: {
                statTile(
                    label: "Notes",
                    value: "\(gradeCount)",
                    hint: "Publiées",
                    color: Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255),
                    icon: "pencil.and.list.clipboard"
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func statTile(label: String, value: String, hint: String, color: Color, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.caption.weight(.bold))
                .foregroundStyle(color)
                .frame(width: 28, height: 28)
                .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text(value)
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(color)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(EduTheme.ink)
            Text(hint)
                .font(.caption2)
                .foregroundStyle(EduTheme.muted)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.black.opacity(0.04), lineWidth: 1)
        )
    }

    // MARK: - Bulletin averages

    private var bulletinAveragesCard: some View {
        let trimesters = annual?.trimesters ?? []
        return HomePanel(
            systemImage: "doc.text.fill",
            title: "Bulletin · moyennes",
            subtitle: "Trimestres et moyenne annuelle"
        ) {
            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { i in
                    let value = i < trimesters.count ? trimesters[i].generalAverage : nil
                    averageChip(
                        label: "T\(i + 1)",
                        value: value,
                        footer: "/ 20",
                        highlight: false
                    )
                }
                averageChip(
                    label: "ANNÉE",
                    value: annual?.annualAverage ?? average,
                    footer: passLabel,
                    highlight: true
                )
            }

            NavigationLink {
                BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin")
            } label: {
                Text("Voir mon bulletin")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(EduTheme.teal)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
    }

    private var passLabel: String {
        if let passed = annual?.passed {
            return passed ? "Admis" : "Ajourné"
        }
        if let avg = annual?.annualAverage ?? average {
            return avg >= 10 ? "Admis" : "Ajourné"
        }
        return "/ 20"
    }

    private func averageChip(label: String, value: Double?, footer: String, highlight: Bool) -> some View {
        let tone: Color = {
            guard let value else { return EduTheme.muted }
            return value >= 10 ? EduTheme.teal : Color.orange
        }()
        return VStack(spacing: 4) {
            Text(label)
                .font(.caption2.weight(.bold))
                .tracking(0.4)
                .foregroundStyle(highlight ? EduTheme.teal : EduTheme.muted)
            Text(value.map { String(format: "%.1f", $0) } ?? "—")
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(tone)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(footer)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(highlight ? EduTheme.fasoGreen : EduTheme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(highlight ? EduTheme.brand50 : Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(highlight ? EduTheme.teal.opacity(0.2) : Color.clear, lineWidth: 1)
        )
    }

    private func courseRow(_ slot: TimetableSlot) -> some View {
        let swatch = SubjectPalette.swatch(for: slot.matieres?.name)
        return HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(swatch.border)
                .frame(width: 4, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(slot.matieres?.name ?? "Cours")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text([slot.teacherName, formatRoom(slot.room)].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text("\(clock(slot.startTime))")
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(swatch.border)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(swatch.fill.opacity(0.65))
        )
    }

    // MARK: - Upcoming work

    private var upcomingPanel: some View {
        HomePanel(
            systemImage: "bell.badge.fill",
            title: "À préparer",
            subtitle: "Exercices, devoirs et compositions"
        ) {
            VStack(spacing: 8) {
                ForEach(pendingExercises.prefix(3)) { item in
                    NavigationLink {
                        EvaluationsBrowser(studentId: auth.userId, type: "devoir", title: "Exercices")
                    } label: {
                        upcomingRow(
                            badge: "Exercice",
                            badgeColor: EduTheme.fasoRed,
                            title: item.title?.isEmpty == false ? item.title! : (item.matieres?.name ?? "Exercice"),
                            subtitle: item.matieres?.name,
                            trailing: item.evalDate ?? item.dueDate
                        )
                    }
                    .buttonStyle(.plain)
                }
                ForEach(upcomingExams.prefix(3)) { item in
                    NavigationLink {
                        EvaluationsBrowser(studentId: auth.userId, type: "examen", confirmedOnly: true, title: "Devoirs")
                    } label: {
                        upcomingRow(
                            badge: "Devoir",
                            badgeColor: EduTheme.navy,
                            title: item.title?.isEmpty == false ? item.title! : (item.matieres?.name ?? "Devoir"),
                            subtitle: item.matieres?.name,
                            trailing: item.evalDate ?? item.dueDate
                        )
                    }
                    .buttonStyle(.plain)
                }
                ForEach(upcomingCompositions.prefix(2)) { session in
                    NavigationLink { StudentCompositionsView() } label: {
                        upcomingRow(
                            badge: "Compo",
                            badgeColor: EduTheme.teal,
                            title: session.title?.isEmpty == false ? session.title! : "Composition",
                            subtitle: session.periodLabel,
                            trailing: session.startsOn
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func upcomingRow(badge: String, badgeColor: Color, title: String, subtitle: String?, trailing: String?) -> some View {
        HStack(spacing: 10) {
            Text(badge)
                .font(.caption2.weight(.bold))
                .foregroundStyle(badgeColor)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(badgeColor.opacity(0.12), in: Capsule())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            if let trailing, !trailing.isEmpty {
                Text(trailing)
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(EduTheme.navy)
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(EduTheme.muted.opacity(0.7))
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }

    // MARK: - Grades

    private var gradesPanel: some View {
        HomePanel(
            systemImage: "chart.line.uptrend.xyaxis",
            title: "Dernières notes",
            subtitle: recentGrades.isEmpty ? "Rien pour le moment" : "Tes résultats récents"
        ) {
            if recentGrades.isEmpty {
                HomePanelEmpty(message: "Les notes publiées apparaîtront ici.")
            } else {
                VStack(spacing: 8) {
                    ForEach(recentGrades.prefix(5)) { grade in
                        NavigationLink { StudentGradesView() } label: {
                            gradeRow(grade)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func gradeRow(_ grade: GradeRow) -> some View {
        let on20 = scoreOn20(grade)
        let swatch = SubjectPalette.swatch(for: grade.matieres?.name)
        return HStack(spacing: 12) {
            Circle()
                .fill(swatch.fill)
                .overlay(Circle().stroke(swatch.border.opacity(0.5), lineWidth: 1))
                .frame(width: 36, height: 36)
                .overlay {
                    Text(String((grade.matieres?.name ?? "?").prefix(1)).uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(swatch.border)
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(grade.evaluations?.title?.isEmpty == false ? grade.evaluations!.title! : (grade.matieres?.name ?? "Matière"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                Text([grade.matieres?.name, grade.periodLabel].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(on20.map { String(format: "%.1f", $0) } ?? "Abs")
                .font(.headline.monospacedDigit())
                .foregroundStyle(on20 == nil ? Color.orange : ((on20 ?? 0) >= 10 ? EduTheme.teal : Color.orange))
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }

    // MARK: - Shortcuts

    private var shortcutsGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Accès rapide")
                .font(.headline)
                .foregroundStyle(EduTheme.ink)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                shortcutTile("Mes notes", "book.fill", EduTheme.navy) { StudentGradesView() }
                shortcutTile("Présences", "checkmark.circle.fill", EduTheme.fasoGreen) { StudentAttendanceView() }
                shortcutTile("Exercices", "list.clipboard.fill", EduTheme.fasoRed) {
                    EvaluationsBrowser(studentId: auth.userId, type: "devoir", title: "Exercices")
                }
                shortcutTile("Devoirs", "doc.text.fill", Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)) {
                    EvaluationsBrowser(studentId: auth.userId, type: "examen", confirmedOnly: true, title: "Devoirs")
                }
                shortcutTile("Compositions", "doc.on.doc.fill", EduTheme.teal) { StudentCompositionsView() }
                shortcutTile("Bulletin", "chart.bar.doc.horizontal.fill", Color.orange) {
                    BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin")
                }
                shortcutTile("Emploi du temps", "calendar", EduTheme.navy) { TimetableView(mode: .student) }
                shortcutTile("Mes profs", "person.2.fill", EduTheme.teal) { MyTeachersView() }
                shortcutTile("Cahier", "pencil.and.list.clipboard", EduTheme.fasoYellow) { CahierFeedView() }
                shortcutTile("Messages", "envelope.fill", EduTheme.navy) { MessagesView() }
            }
        }
    }

    private func shortcutTile<Destination: View>(_ title: String, _ icon: String, _ color: Color, @ViewBuilder destination: () -> Destination) -> some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(color)
                    .frame(width: 34, height: 34)
                    .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.black.opacity(0.04), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Load / helpers

    private func scoreOn20(_ grade: GradeRow) -> Double? {
        if grade.isAbsent == true { return nil }
        guard let score = grade.score, let max = grade.maxScore, max > 0 else { return nil }
        return (score / max) * 20
    }

    private func minutesNow() -> Int {
        let c = Calendar.current
        return c.component(.hour, from: Date()) * 60 + c.component(.minute, from: Date())
    }

    private func minutes(_ time: String) -> Int {
        let parts = time.split(separator: ":")
        let h = Int(parts.first ?? "0") ?? 0
        let m = parts.count > 1 ? (Int(parts[1]) ?? 0) : 0
        return h * 60 + m
    }

    private func clock(_ time: String) -> String {
        let m = minutes(time)
        let h = m / 60
        let min = m % 60
        return min == 0 ? "\(h)h" : String(format: "%dh%02d", h, min)
    }

    private func formatRoom(_ room: String?) -> String? {
        guard let trimmed = room?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        if trimmed.lowercased().hasPrefix("salle") { return trimmed }
        if trimmed.first?.isNumber == true { return "Salle \(trimmed)" }
        return trimmed
    }

    private func load(isRefresh: Bool) async {
        guard let sid = auth.userId else {
            loading = false
            ready = true
            auth.markPortalReady()
            return
        }
        // First open: keep a full-screen loader until everything is ready.
        // Pull-to-refresh: keep the current dashboard visible.
        if !isRefresh && !ready {
            loading = true
        }
        let api = EduAPI()
        let today = EduDates.day()
        do {
            if let enrollment = try await api.activeEnrollment(studentId: sid) {
                classId = enrollment.classId
                className = enrollment.className
            }

            async let gradesTask = api.fetchGrades(studentId: sid, limit: 120)
            async let attendanceCountsTask = api.fetchAttendanceCounts(studentId: sid)
            async let inboxTask = api.fetchInbox(userId: sid, kind: .all, limit: 80)

            let grades = try await gradesTask
            recentGrades = Array(grades.prefix(8))
            gradeCount = grades.count

            if let classId {
                annual = await api.fetchAnnualAverage(studentId: sid, classSectionId: classId)
                average = annual?.annualAverage
                let efDay = EduDates.weekday()
                async let slotsTask = api.fetchTimetable(classSectionId: classId)
                async let examsTask = api.fetchEvaluations(classId: classId, type: "examen", confirmedOnly: true)
                async let exercisesTask = api.fetchEvaluations(classId: classId, type: "devoir")
                async let compositionsTask = api.fetchCompositionSessions(classSectionId: classId)

                let slots = try await slotsTask
                todaySlots = slots.filter { $0.dayOfWeek == efDay }.sorted { $0.startTime < $1.startTime }

                let exams = (try? await examsTask) ?? []
                upcomingExams = exams
                    .filter { ($0.evalDate ?? $0.dueDate).map { $0 >= today } ?? true }
                    .prefix(5)
                    .map { $0 }

                let exercises = (try? await exercisesTask) ?? []
                pendingExercises = exercises
                    .filter { ($0.evalDate ?? $0.dueDate).map { $0 >= today } ?? true }
                    .prefix(5)
                    .map { $0 }

                let compositions = (try? await compositionsTask) ?? []
                upcomingCompositions = compositions
                    .filter { ($0.endsOn ?? "") >= today }
                    .prefix(3)
                    .map { $0 }
            } else {
                annual = nil
                average = nil
                todaySlots = []
                upcomingExams = []
                pendingExercises = []
                upcomingCompositions = []
            }

            if let counts = try? await attendanceCountsTask {
                absencesCount = counts.absent ?? 0
                lateCount = counts.late ?? 0
                attendanceRate = counts.ratePercent
            }

            let inbox = try await inboxTask
            unreadMessages = inbox.filter { $0.readAt == nil && ($0.isAnnouncement != true) }.count
            unreadAnnouncements = inbox.filter { $0.readAt == nil && ($0.isAnnouncement == true) }.count
        } catch {
            // Keep painted state.
        }
        loading = false
        ready = true
        auth.markPortalReady()
    }
}
