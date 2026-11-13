import SwiftUI

struct StudentHomeView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.scenePhase) private var scenePhase

    @State private var className: String?
    @State private var classId: String?
    @State private var average: Double?
    @State private var annual: AnnualAverageResult?
    @State private var gradeCount = 0
    @State private var recentGrades: [GradeRow] = []
    @State private var attendanceRate: Int?
    @State private var absencesCount = 0
    @State private var lateCount = 0
    @State private var pendingQuizzes: [EvaluationRow] = []
    @State private var upcomingExams: [EvaluationRow] = []
    @State private var upcomingCompositions: [StudentCompositionSession] = []
    @State private var todaySlots: [TimetableSlot] = []
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0
    @State private var ready = false
    @State private var loadFailed = false

    private static let sky = Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)
    private static let softFill = Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)

    // MARK: - Derived

    private var today: String { EduDates.day() }

    private var firstName: String {
        if let first = auth.profile?.firstName.trimmingCharacters(in: .whitespaces), !first.isEmpty {
            return first
        }
        return auth.profile?.fullName.split(separator: " ").first.map(String.init) ?? ""
    }

    private var currentAverage: Double? { annual?.annualAverage ?? average }

    private struct WorkItem: Identifiable {
        enum Kind { case quiz, exam, composition }
        let id: String
        let kind: Kind
        let title: String
        let subject: String?
        let day: String?
    }

    /// Interrogations, devoirs and compositions merged and sorted by date.
    private var workItems: [WorkItem] {
        let quizzes = pendingQuizzes.map {
            WorkItem(
                id: "iq-\($0.id)",
                kind: .quiz,
                title: ($0.title?.isEmpty == false) ? $0.title! : ($0.matieres?.name ?? "Interrogation"),
                subject: $0.matieres?.name,
                day: eventDay($0)
            )
        }
        let exams = upcomingExams.map {
            WorkItem(
                id: "dv-\($0.id)",
                kind: .exam,
                title: ($0.title?.isEmpty == false) ? $0.title! : ($0.matieres?.name ?? "Devoir"),
                subject: $0.matieres?.name,
                day: eventDay($0)
            )
        }
        let compositions = upcomingCompositions.map {
            WorkItem(
                id: "co-\($0.id)",
                kind: .composition,
                title: ($0.title?.isEmpty == false) ? $0.title! : "Composition",
                subject: $0.periodLabel,
                day: $0.startsOn.map { String($0.prefix(10)) }
            )
        }
        return (quizzes + exams + compositions)
            .sorted { ($0.day ?? "9999") < ($1.day ?? "9999") }
    }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if ready {
                    TimelineView(.everyMinute) { context in
                        VStack(alignment: .leading, spacing: 24) {
                            hero(now: context.date)
                            if unreadMessages > 0 || unreadAnnouncements > 0 { inboxPills }
                            if loadFailed { errorBanner }
                            nowCard(now: context.date)
                            if todaySlots.count > 1 { dayTimeline(now: context.date) }
                        }
                    }

                    workSection
                    resultsSection
                    quickActions
                } else {
                    loadingSkeleton
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .refreshable { await load() }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && ready {
                Task { await load() }
            }
        }
    }

    // MARK: - Hero

    private func hero(now: Date) -> some View {
        let nowMin = Self.minutes(of: now)
        let remaining = todaySlots.filter { Self.minutes($0.endTime) > nowMin }.count

        return VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Self.todayCaption(now))
                        .font(.caption.weight(.bold))
                        .tracking(0.8)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.75))
                    Text("\(TimeGreeting.current(at: now)), \(firstName.isEmpty ? "…" : firstName)")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    Label(
                        className.map { "Classe · \($0)" } ?? (auth.schools.first?.name ?? "Espace élève"),
                        systemImage: "graduationcap.fill"
                    )
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "backpack.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .accessibilityHidden(true)
            }
            .accessibilityElement(children: .combine)

            HStack(spacing: 10) {
                NavigationLink {
                    BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin")
                } label: {
                    heroStat(
                        value: currentAverage.map { Self.format($0, digits: 1) } ?? "—",
                        label: "Moyenne",
                        systemImage: "chart.bar.fill"
                    )
                }
                .buttonStyle(.plain)

                NavigationLink { StudentAttendanceView() } label: {
                    heroStat(
                        value: attendanceRate.map { "\($0)%" } ?? "—",
                        label: "Présence",
                        systemImage: "checkmark.seal.fill"
                    )
                }
                .buttonStyle(.plain)

                heroStat(
                    value: todaySlots.isEmpty ? "0" : "\(remaining)",
                    label: todaySlots.isEmpty ? "Cours aujourd’hui" : "Cours restants",
                    systemImage: "clock.fill"
                )
            }
        }
        .padding(20)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                LinearGradient(
                    colors: [EduTheme.navyDark, EduTheme.navy, EduTheme.teal],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Circle()
                    .fill(.white.opacity(0.07))
                    .frame(width: 220, height: 220)
                    .offset(x: 140, y: -90)
                Circle()
                    .fill(.white.opacity(0.05))
                    .frame(width: 140, height: 140)
                    .offset(x: -150, y: 90)
            }
        }
        .overlay(alignment: .bottom) { fasoStripe }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .shadow(color: EduTheme.navy.opacity(0.28), radius: 18, y: 10)
    }

    private var fasoStripe: some View {
        HStack(spacing: 0) {
            EduTheme.fasoRed
            EduTheme.fasoYellow
            EduTheme.fasoGreen
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }

    private func heroStat(value: String, label: String, systemImage: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.8))
                .accessibilityHidden(true)
            Text(value)
                .font(.system(size: 26, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(.white)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
                .contentTransition(.numericText())
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.13), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.white.opacity(0.18), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(value) \(label)")
    }

    // MARK: - Inbox

    private var inboxPills: some View {
        HStack(spacing: 10) {
            if unreadMessages > 0 {
                NavigationLink { MessagesView() } label: {
                    Label(
                        "\(unreadMessages) message\(unreadMessages > 1 ? "s" : "") non lu\(unreadMessages > 1 ? "s" : "")",
                        systemImage: "envelope.fill"
                    )
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 40)
                    .background(EduTheme.navy, in: Capsule())
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
            if unreadAnnouncements > 0 {
                NavigationLink { MessagesView(announcementsOnly: true) } label: {
                    Label(
                        "\(unreadAnnouncements) annonce\(unreadAnnouncements > 1 ? "s" : "")",
                        systemImage: "megaphone.fill"
                    )
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 40)
                    .background(EduTheme.fasoYellow.opacity(0.18), in: Capsule())
                    .overlay(Capsule().stroke(EduTheme.fasoYellow.opacity(0.5), lineWidth: 1))
                    .foregroundStyle(EduTheme.ink)
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Loading & error

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 18) {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(EduTheme.navy.opacity(0.15))
                .frame(maxWidth: .infinity, minHeight: 190)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(.white)
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Chargement en cours")
    }

    private var errorBanner: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Color.orange)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text("Certaines données n’ont pas pu être chargées.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("Vérifie ta connexion puis réessaie.")
                    .font(.footnote)
                    .foregroundStyle(EduTheme.muted)
                Button("Réessayer") {
                    Task { await load() }
                }
                .font(.subheadline.weight(.bold))
                .foregroundStyle(EduTheme.teal)
                .frame(minHeight: 44, alignment: .leading)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.orange.opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: - Now card

    @ViewBuilder
    private func nowCard(now: Date) -> some View {
        let nowMin = Self.minutes(of: now)
        let current = todaySlots.first {
            Self.minutes($0.startTime) <= nowMin && nowMin < Self.minutes($0.endTime)
        }
        let upcoming = todaySlots.first { Self.minutes($0.startTime) > nowMin }

        if let slot = current ?? upcoming {
            let isCurrent = current != nil
            let swatch = SubjectPalette.swatch(for: slot.matieres?.name)
            let start = Self.minutes(slot.startTime)
            let end = Self.minutes(slot.endTime)

            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    statusCapsule(live: isCurrent)
                    Spacer(minLength: 0)
                    Text(timeRange(slot))
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundStyle(EduTheme.ink)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text(slot.matieres?.name ?? "Cours")
                        .font(.title.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 14) {
                        if let teacher = slot.teacherName, !teacher.isEmpty {
                            Label(teacher, systemImage: "person.fill")
                                .lineLimit(1)
                        }
                        if let room = formatRoom(slot.room) {
                            Label(room, systemImage: "mappin.and.ellipse")
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink.opacity(0.72))
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                if isCurrent {
                    let progress = min(1, max(0, Double(nowMin - start) / Double(max(end - start, 1))))
                    VStack(alignment: .leading, spacing: 8) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(EduTheme.ink.opacity(0.08))
                                Capsule()
                                    .fill(swatch.border)
                                    .frame(width: max(10, geo.size.width * progress))
                            }
                        }
                        .frame(height: 8)
                        HStack {
                            Text("Il reste \(Self.duration(end - nowMin))")
                                .font(.footnote.weight(.bold))
                                .foregroundStyle(EduTheme.ink)
                            Spacer()
                            Text("\(Int(progress * 100)) %")
                                .font(.footnote.weight(.semibold).monospacedDigit())
                                .foregroundStyle(EduTheme.muted)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Il reste \(Self.duration(end - nowMin)) sur ce cours")
                } else {
                    Label("Commence dans \(Self.duration(start - nowMin))", systemImage: "hourglass")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(swatch.fill.opacity(0.6), in: Capsule())
                }

                HStack(spacing: 10) {
                    NavigationLink { CahierFeedView() } label: {
                        Label("Cahier de textes", systemImage: "book.fill")
                            .font(.body.weight(.bold))
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(
                                LinearGradient(
                                    colors: [EduTheme.teal, EduTheme.tealDark],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                in: RoundedRectangle(cornerRadius: 15, style: .continuous)
                            )
                            .foregroundStyle(.white)
                            .shadow(color: EduTheme.teal.opacity(0.3), radius: 8, y: 4)
                    }
                    .buttonStyle(.plain)

                    NavigationLink { TimetableView(mode: .student) } label: {
                        Image(systemName: "calendar")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(EduTheme.navy)
                            .frame(width: 56, height: 52)
                            .background(EduTheme.navy.opacity(0.08), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Emploi du temps")
                }
            }
            .padding(18)
            .padding(.leading, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack(alignment: .leading) {
                    Color.white
                    LinearGradient(
                        colors: [swatch.fill.opacity(0.55), .white.opacity(0)],
                        startPoint: .topTrailing,
                        endPoint: .bottomLeading
                    )
                    swatch.border.frame(width: 6)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(swatch.border.opacity(0.25), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.06), radius: 14, y: 6)
        } else {
            emptyNowCard
        }
    }

    private func statusCapsule(live: Bool) -> some View {
        let tint = live ? EduTheme.fasoRed : EduTheme.teal
        return HStack(spacing: 6) {
            if live {
                Image(systemName: "circle.fill")
                    .font(.system(size: 7))
                    .symbolEffect(.pulse, options: .repeating)
            } else {
                Image(systemName: "clock.fill")
                    .font(.caption2.weight(.bold))
            }
            Text(live ? "En cours" : "Prochain cours")
                .font(.caption.weight(.heavy))
                .tracking(0.6)
                .textCase(.uppercase)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(tint.opacity(0.12), in: Capsule())
        .accessibilityHidden(true)
    }

    private var emptyNowCard: some View {
        let weekday = EduDates.weekday()
        let icon = weekday == 7 ? "sun.max.fill" : (todaySlots.isEmpty ? "cup.and.saucer.fill" : "checkmark.seal.fill")
        let title = weekday == 7
            ? "Bon dimanche"
            : (todaySlots.isEmpty ? "Pas de cours aujourd’hui" : "Journée terminée")
        let message: String = {
            if weekday == 7 { return "Pas de cours le dimanche. Pense à préparer ta semaine." }
            if todaySlots.isEmpty { return "Aucun cours n’est planifié pour aujourd’hui." }
            return "Plus de cours pour aujourd’hui. Pense à tes devoirs !"
        }()

        return HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3.weight(.semibold))
                .foregroundStyle(EduTheme.teal)
                .frame(width: 48, height: 48)
                .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(EduTheme.ink)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                NavigationLink { TimetableView(mode: .student) } label: {
                    Label("Voir l’emploi du temps", systemImage: "arrow.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minHeight: 44, alignment: .leading)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(HomeCardStyle())
    }

    // MARK: - Day timeline

    private func dayTimeline(now: Date) -> some View {
        let nowMin = Self.minutes(of: now)
        let done = todaySlots.filter { slotStatus($0, nowMin: nowMin) == .done }.count

        return VStack(alignment: .leading, spacing: 14) {
            sectionHeader(
                title: "Ma journée",
                subtitle: "\(done) sur \(todaySlots.count) cours terminés"
            ) {
                NavigationLink { TimetableView(mode: .student) } label: {
                    Text("Semaine")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }

            VStack(spacing: 0) {
                ForEach(Array(todaySlots.enumerated()), id: \.element.id) { index, slot in
                    NavigationLink { TimetableView(mode: .student) } label: {
                        timelineRow(
                            slot: slot,
                            status: slotStatus(slot, nowMin: nowMin),
                            isFirst: index == 0,
                            isLast: index == todaySlots.count - 1
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func timelineRow(slot: TimetableSlot, status: StudentSlotStatus, isFirst: Bool, isLast: Bool) -> some View {
        let swatch = SubjectPalette.swatch(for: slot.matieres?.name)
        let isDone = status == .done
        let isLive = status == .current

        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(String(slot.startTime.prefix(5)))
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(isDone ? EduTheme.muted : EduTheme.ink)
                Text(String(slot.endTime.prefix(5)))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(EduTheme.muted)
            }
            .frame(width: 42, alignment: .trailing)

            VStack(spacing: 0) {
                Rectangle()
                    .fill(isFirst ? .clear : EduTheme.ink.opacity(0.1))
                    .frame(width: 2)
                timelineDot(status: status, color: swatch.border)
                Rectangle()
                    .fill(isLast ? .clear : EduTheme.ink.opacity(0.1))
                    .frame(width: 2)
            }
            .frame(width: 20)

            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(slot.matieres?.name ?? "Cours")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(isDone ? EduTheme.muted : EduTheme.ink)
                        .strikethrough(isDone, color: EduTheme.muted.opacity(0.6))
                        .lineLimit(1)
                    Text([slot.teacherName, formatRoom(slot.room)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                if isLive {
                    Text("Maintenant")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(EduTheme.fasoRed, in: Capsule())
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(isLive ? swatch.fill.opacity(0.7) : Self.softFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isLive ? swatch.border.opacity(0.5) : .clear, lineWidth: 1.5)
            )
            .padding(.vertical, 4)
            .opacity(isDone ? 0.75 : 1)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func timelineDot(status: StudentSlotStatus, color: Color) -> some View {
        ZStack {
            switch status {
            case .done:
                Circle().fill(EduTheme.fasoGreen)
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .heavy))
                    .foregroundStyle(.white)
            case .current:
                Circle().fill(EduTheme.fasoRed.opacity(0.2)).frame(width: 20, height: 20)
                Circle().fill(EduTheme.fasoRed).frame(width: 10, height: 10)
            case .upcoming:
                Circle().fill(.white)
                Circle().stroke(color, lineWidth: 2.5)
            }
        }
        .frame(width: status == .current ? 20 : 16, height: status == .current ? 20 : 16)
        .accessibilityHidden(true)
    }

    private func slotStatus(_ slot: TimetableSlot, nowMin: Int) -> StudentSlotStatus {
        if Self.minutes(slot.endTime) <= nowMin { return .done }
        if Self.minutes(slot.startTime) <= nowMin { return .current }
        return .upcoming
    }

    // MARK: - À préparer

    private var workSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(
                title: "À préparer",
                subtitle: workItems.isEmpty ? "Interrogations, devoirs et compositions" : "\(workItems.count) à venir"
            ) {
                NavigationLink {
                    EvaluationsBrowser(studentId: auth.userId, type: "interrogation", title: "Interrogations")
                } label: {
                    Text("Tout voir")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }

            if workItems.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.largeTitle)
                        .foregroundStyle(EduTheme.fasoGreen)
                        .accessibilityHidden(true)
                    Text("Rien à rendre pour le moment.")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            } else {
                VStack(spacing: 8) {
                    ForEach(workItems.prefix(5)) { item in
                        NavigationLink {
                            switch item.kind {
                            case .quiz:
                                EvaluationsBrowser(studentId: auth.userId, type: "interrogation", title: "Interrogations")
                            case .exam:
                                EvaluationsBrowser(studentId: auth.userId, type: "examen", confirmedOnly: true, title: "Devoirs")
                            case .composition:
                                StudentCompositionsView()
                            }
                        } label: {
                            workRow(item)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func workRow(_ item: WorkItem) -> some View {
        let badge: (title: String, color: Color) = {
            switch item.kind {
            case .quiz: return ("Interro", Self.sky)
            case .exam: return ("Devoir", EduTheme.navy)
            case .composition: return ("Compo", EduTheme.teal)
            }
        }()

        return HStack(spacing: 12) {
            dateBlock(item.day, color: badge.color)

            VStack(alignment: .leading, spacing: 4) {
                Text(badge.title)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(badge.color)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(badge.color.opacity(0.12), in: Capsule())
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let subject = item.subject, !subject.isEmpty, subject != item.title {
                    Text(subject)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 6) {
                if let day = item.day, let relative = relativeDay(day) {
                    Text(relative.text)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(relative.urgent ? EduTheme.fasoRed : EduTheme.muted)
                }
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.muted.opacity(0.6))
                    .accessibilityHidden(true)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Self.softFill))
        .accessibilityElement(children: .combine)
    }

    private func dateBlock(_ iso: String?, color: Color) -> some View {
        let parts = iso?.split(separator: "-") ?? []
        let dayNum = parts.count == 3 ? String(Int(parts[2]) ?? 0) : "—"
        let month: String = {
            guard parts.count == 3, let m = Int(parts[1]), (1...12).contains(m) else { return "" }
            return Self.monthAbbr[m - 1]
        }()
        return VStack(spacing: 0) {
            Text(month)
                .font(.system(size: 9, weight: .heavy))
                .tracking(0.5)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 3)
                .background(color)
            Text(dayNum)
                .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(EduTheme.ink)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.white)
        }
        .frame(width: 46, height: 50)
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(color.opacity(0.3), lineWidth: 1)
        )
        .accessibilityHidden(true)
    }

    // MARK: - Résultats

    private var resultsSection: some View {
        let trimesters = annual?.trimesters ?? []

        return VStack(alignment: .leading, spacing: 14) {
            sectionHeader(
                title: "Mes résultats",
                subtitle: gradeCount == 0 ? "Aucune note publiée" : "\(gradeCount) note\(gradeCount > 1 ? "s" : "") publiée\(gradeCount > 1 ? "s" : "")"
            ) {
                NavigationLink {
                    BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin")
                } label: {
                    Text("Bulletin")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }

            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { i in
                    averageChip(
                        label: "T\(i + 1)",
                        value: i < trimesters.count ? trimesters[i].generalAverage : nil,
                        footer: "/ 20",
                        highlight: false
                    )
                }
                averageChip(
                    label: "ANNÉE",
                    value: currentAverage,
                    footer: passLabel,
                    highlight: true
                )
            }

            if recentGrades.isEmpty {
                HomePanelEmpty(message: "Les notes publiées apparaîtront ici.")
            } else {
                VStack(spacing: 8) {
                    ForEach(recentGrades.prefix(4)) { grade in
                        NavigationLink { StudentGradesView() } label: {
                            gradeRow(grade)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private var passLabel: String {
        if let passed = annual?.passed { return passed ? "Admis" : "Ajourné" }
        if let avg = currentAverage { return avg >= 10 ? "Admis" : "Ajourné" }
        return "/ 20"
    }

    private func averageChip(label: String, value: Double?, footer: String, highlight: Bool) -> some View {
        let tone = Self.tone(value)
        return VStack(spacing: 4) {
            Text(label)
                .font(.caption2.weight(.bold))
                .tracking(0.4)
                .foregroundStyle(highlight ? EduTheme.teal : EduTheme.muted)
            Text(value.map { Self.format($0, digits: 1) } ?? "—")
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(value == nil ? EduTheme.muted : tone)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(footer)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(highlight && value != nil ? tone : EduTheme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(highlight ? EduTheme.brand50 : Self.softFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(highlight ? EduTheme.teal.opacity(0.2) : Color.clear, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    private func gradeRow(_ grade: GradeRow) -> some View {
        let on20 = scoreOn20(grade)
        let swatch = SubjectPalette.swatch(for: grade.matieres?.name)
        let tint = grade.isAbsent == true ? Color.orange : Self.tone(on20)

        return HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(swatch.border)
                .frame(width: 4, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(grade.matieres?.name ?? "Matière")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                Text([grade.evaluations?.title, grade.periodLabel].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if grade.isAbsent == true {
                Text("Absent")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(tint.opacity(0.12), in: Capsule())
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(on20.map { Self.format($0, digits: 1) } ?? "—")
                        .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(tint)
                    Text("/20")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(EduTheme.muted)
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Self.softFill))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Quick actions

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "Accès rapide", subtitle: nil) { EmptyView() }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                actionLink("Mes notes", systemImage: "chart.bar.fill", color: EduTheme.navy) { StudentGradesView() }
                actionLink("Interrogations", systemImage: "questionmark.circle.fill", color: Self.sky) {
                    EvaluationsBrowser(studentId: auth.userId, type: "interrogation", title: "Interrogations")
                }
                actionLink("Devoirs", systemImage: "doc.text.fill", color: Self.sky) {
                    EvaluationsBrowser(studentId: auth.userId, type: "examen", confirmedOnly: true, title: "Devoirs")
                }
                actionLink("Compositions", systemImage: "doc.on.doc.fill", color: EduTheme.teal) { StudentCompositionsView() }
                actionLink("Présences", systemImage: "checkmark.circle.fill", color: EduTheme.fasoGreen) { StudentAttendanceView() }
                actionLink("Bulletin", systemImage: "chart.bar.doc.horizontal.fill", color: Color.orange) {
                    BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin")
                }
                actionLink("Emploi du temps", systemImage: "calendar", color: EduTheme.navy) { TimetableView(mode: .student) }
                actionLink("Mes profs", systemImage: "person.2.fill", color: EduTheme.teal) { MyTeachersView() }
                actionLink("Messages", systemImage: "envelope.fill", color: EduTheme.fasoGreen, badge: unreadMessages) { MessagesView() }
            }
        }
    }

    private func actionLink<Destination: View>(
        _ title: String,
        systemImage: String,
        color: Color,
        badge: Int = 0,
        @ViewBuilder destination: () -> Destination
    ) -> some View {
        NavigationLink(destination: destination) {
            VStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(
                        LinearGradient(
                            colors: [color.opacity(0.85), color],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                    .shadow(color: color.opacity(0.3), radius: 6, y: 3)
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Text(badge > 99 ? "99+" : "\(badge)")
                                .font(.caption2.weight(.heavy).monospacedDigit())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 20, minHeight: 20)
                                .background(EduTheme.fasoRed, in: Capsule())
                                .overlay(Capsule().stroke(.white, lineWidth: 2))
                                .offset(x: 8, y: -8)
                        }
                    }
                    .accessibilityHidden(true)
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, minHeight: 104)
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
            .modifier(HomeCardStyle(cornerRadius: 18))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(badge > 0 ? "\(title), \(badge) non lus" : title)
            .accessibilityAddTraits(.isButton)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Section header

    private func sectionHeader<Trailing: View>(
        title: String,
        subtitle: String?,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(EduTheme.ink)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(EduTheme.muted)
                }
            }
            Spacer()
            trailing()
        }
    }

    // MARK: - Helpers

    private static let monthAbbr = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"]

    private static func todayCaption(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "EEEE d MMMM"
        return formatter.string(from: date)
    }

    private static func tone(_ value: Double?) -> Color {
        guard let value else { return EduTheme.muted }
        if value >= 12 { return EduTheme.fasoGreen }
        if value >= 10 { return sky }
        return EduTheme.fasoRed
    }

    private static func format(_ value: Double, digits: Int) -> String {
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "fr_FR")
        nf.minimumFractionDigits = digits
        nf.maximumFractionDigits = digits
        return nf.string(from: NSNumber(value: value)) ?? String(format: "%.\(digits)f", value)
    }

    private func scoreOn20(_ grade: GradeRow) -> Double? {
        if grade.isAbsent == true { return nil }
        guard let score = grade.score, let max = grade.maxScore, max > 0 else { return nil }
        return (score / max) * 20
    }

    private func timeRange(_ slot: TimetableSlot) -> String {
        "\(String(slot.startTime.prefix(5)))–\(String(slot.endTime.prefix(5)))"
    }

    private func formatRoom(_ room: String?) -> String? {
        guard let trimmed = room?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        if trimmed.lowercased().hasPrefix("salle") { return trimmed }
        if trimmed.first?.isNumber == true { return "Salle \(trimmed)" }
        return trimmed
    }

    private func eventDay(_ row: EvaluationRow) -> String? {
        let raw = row.evalDate ?? row.dueDate
        guard let raw, !raw.isEmpty else { return nil }
        return String(raw.prefix(10))
    }

    private func relativeDay(_ iso: String) -> (text: String, urgent: Bool)? {
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        guard let date = df.date(from: iso), let todayDate = df.date(from: today) else { return nil }
        let days = Calendar.current.dateComponents([.day], from: todayDate, to: date).day ?? 0
        switch days {
        case ..<0: return ("En cours", false)
        case 0: return ("Aujourd’hui", true)
        case 1: return ("Demain", true)
        default: return ("Dans \(days) j", days <= 3)
        }
    }

    private static func minutes(_ hhmm: String) -> Int {
        let parts = hhmm.split(separator: ":")
        guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return 0 }
        return h * 60 + m
    }

    private static func minutes(of date: Date) -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    private static func duration(_ minutes: Int) -> String {
        let m = max(minutes, 1)
        if m < 60 { return "\(m) min" }
        let h = m / 60, r = m % 60
        return r == 0 ? "\(h) h" : "\(h) h \(String(format: "%02d", r))"
    }

    // MARK: - Loading

    private func load() async {
        guard let sid = auth.userId else {
            ready = true
            auth.markPortalReady()
            return
        }
        let api = EduAPI()
        let today = EduDates.day()
        var failed = false
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
                async let quizzesTask = api.fetchEvaluations(classId: classId, type: "interrogation")
                async let compositionsTask = api.fetchCompositionSessions(classSectionId: classId)

                let slots = try await slotsTask
                todaySlots = slots.filter { $0.dayOfWeek == efDay }.sorted { $0.startTime < $1.startTime }

                let exams = (try? await examsTask) ?? []
                upcomingExams = exams
                    .filter { ($0.evalDate ?? $0.dueDate).map { $0 >= today } ?? true }
                    .prefix(5)
                    .map { $0 }

                let quizzes = (try? await quizzesTask) ?? []
                pendingQuizzes = quizzes
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
                pendingQuizzes = []
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
            failed = true
        }
        loadFailed = failed
        ready = true
        auth.markPortalReady()
    }
}

private enum StudentSlotStatus { case done, current, upcoming }
