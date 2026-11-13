import SwiftUI

struct TeacherHomeView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.scenePhase) private var scenePhase

    @State private var assignments: [TeachingAssignment] = []
    @State private var todaySlots: [TimetableSlot] = []
    @State private var evaluations: [EvaluationRow] = []
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0
    @State private var ready = false
    @State private var loadFailed = false
    @State private var showCreateEval = false

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

    private var upcomingEvals: [EvaluationRow] {
        evaluations
            .filter { eventDay($0).map { $0 >= today } ?? true }
            .sorted { (eventDay($0) ?? "9999") < (eventDay($1) ?? "9999") }
    }

    private var needsConfirm: [EvaluationRow] {
        evaluations.filter { isPendingConfirm($0) }
    }

    /// Confirmations first, then soonest upcoming (capped on screen).
    private var priorityEvals: [EvaluationRow] {
        var seen = Set<String>()
        var out: [EvaluationRow] = []
        for row in needsConfirm + upcomingEvals {
            if seen.insert(row.id).inserted { out.append(row) }
        }
        return out
    }

    private var uniqueClasses: [(id: String, name: String, subjects: [String])] {
        var order: [String] = []
        var names: [String: String] = [:]
        var subjects: [String: [String]] = [:]
        for a in assignments {
            let id = a.classSectionId
            if names[id] == nil {
                order.append(id)
                names[id] = a.classes?.name ?? "Classe"
            }
            if let subject = a.matieres?.name, !subject.isEmpty {
                var list = subjects[id] ?? []
                if !list.contains(subject) { list.append(subject) }
                subjects[id] = list
            }
        }
        return order.map { id in (id, names[id] ?? "Classe", subjects[id] ?? []) }
    }

    private func isPendingConfirm(_ row: EvaluationRow) -> Bool {
        row.adminConfirmed == false && (row.type == "examen" || row.type == "composition")
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

                    quickActions
                    prioritiesSection
                    classesSection
                } else {
                    loadingSkeleton
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .refreshable { await load(isRefresh: true) }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .sheet(isPresented: $showCreateEval) {
            CreateEvaluationSheet {
                showCreateEval = false
                Task { await load(isRefresh: true) }
            }
            .environmentObject(auth)
        }
        .task { await load(isRefresh: false) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && ready {
                Task { await load(isRefresh: true) }
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
                    Label(auth.schools.first?.name ?? "Espace enseignant", systemImage: "building.columns.fill")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "person.fill.checkmark")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .accessibilityHidden(true)
            }
            .accessibilityElement(children: .combine)

            HStack(spacing: 10) {
                heroStat(
                    value: todaySlots.isEmpty ? "0" : "\(remaining)",
                    label: todaySlots.isEmpty ? "Cours aujourd’hui" : "Cours restants",
                    systemImage: "clock.fill"
                )
                heroStat(value: "\(uniqueClasses.count)", label: "Classes", systemImage: "person.3.fill")
                heroStat(value: "\(upcomingEvals.count)", label: "Évals à venir", systemImage: "doc.text.fill")
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
                    Task { await load(isRefresh: true) }
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
                        if let className = slot.classes?.name, !className.isEmpty {
                            Label(className, systemImage: "person.3.fill")
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
                .accessibilityLabel(
                    "\(isCurrent ? "En cours" : "Prochain cours") : \(slot.matieres?.name ?? "Cours"), \(spokenRange(slot))"
                        + ((slot.classes?.name?.isEmpty == false) ? ", \(slot.classes!.name!)" : "")
                        + ((slot.room?.isEmpty == false) ? ", salle \(slot.room!)" : "")
                )

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
                    NavigationLink {
                        TeacherAttendanceView(
                            initialClassId: slot.classSectionId,
                            initialSubjectId: slot.subjectId
                        )
                    } label: {
                        Label("Faire l’appel", systemImage: "checklist")
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
                    .accessibilityHint("Ouvre l’appel pour ce cours")

                    if let classId = slot.classSectionId {
                        NavigationLink {
                            ClassHubView(classId: classId, className: slot.classes?.name ?? "Classe")
                        } label: {
                            Image(systemName: "person.3.sequence.fill")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(EduTheme.navy)
                                .frame(width: 56, height: 52)
                                .background(EduTheme.navy.opacity(0.08), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Ouvrir la classe")
                        .accessibilityHint("Ouvre la fiche de la classe")
                    }
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
                Text(emptyNowMessage)
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                NavigationLink { TimetableView(mode: .teacher) } label: {
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
                NavigationLink { TimetableView(mode: .teacher) } label: {
                    Text("Semaine")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }

            VStack(spacing: 0) {
                ForEach(Array(todaySlots.enumerated()), id: \.element.id) { index, slot in
                    NavigationLink {
                        TeacherAttendanceView(
                            initialClassId: slot.classSectionId,
                            initialSubjectId: slot.subjectId
                        )
                    } label: {
                        timelineRow(
                            slot: slot,
                            status: slotStatus(slot, nowMin: nowMin),
                            isFirst: index == 0,
                            isLast: index == todaySlots.count - 1
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Ouvre l’appel pour ce cours")
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func timelineRow(slot: TimetableSlot, status: SlotStatus, isFirst: Bool, isLast: Bool) -> some View {
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
                    Text([slot.classes?.name, formatRoom(slot.room)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
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
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EduTheme.muted.opacity(0.6))
                    .accessibilityHidden(true)
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
        .accessibilityLabel(slotSpoken(slot, status: status))
    }

    private func timelineDot(status: SlotStatus, color: Color) -> some View {
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

    private func slotSpoken(_ slot: TimetableSlot, status: SlotStatus) -> String {
        let state: String
        switch status {
        case .done: state = "terminé"
        case .current: state = "en cours"
        case .upcoming: state = "à venir"
        }
        var label = "\(slot.matieres?.name ?? "Cours"), \(spokenRange(slot))"
        if let className = slot.classes?.name, !className.isEmpty { label += ", \(className)" }
        return "\(label), \(state)"
    }

    private func slotStatus(_ slot: TimetableSlot, nowMin: Int) -> SlotStatus {
        if Self.minutes(slot.endTime) <= nowMin { return .done }
        if Self.minutes(slot.startTime) <= nowMin { return .current }
        return .upcoming
    }

    // MARK: - Quick actions

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "Actions rapides", subtitle: nil) { EmptyView() }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                NavigationLink { TeacherAttendanceOverview() } label: {
                    actionTile("Présences", systemImage: "checklist", color: EduTheme.teal)
                }
                .buttonStyle(.plain)

                Button { showCreateEval = true } label: {
                    actionTile("Nouvelle éval", systemImage: "plus.square.fill", color: EduTheme.fasoRed)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Crée une interrogation")

                NavigationLink {
                    EvaluationsBrowser(teacherId: auth.userId, allowEntry: true, title: "Devoirs & évaluations")
                } label: {
                    actionTile("Notes", systemImage: "pencil.and.list.clipboard", color: EduTheme.navy)
                }
                .buttonStyle(.plain)

                NavigationLink { TeacherCahierView() } label: {
                    actionTile("Cahier", systemImage: "book.fill", color: EduTheme.fasoYellow)
                }
                .buttonStyle(.plain)

                NavigationLink { TimetableView(mode: .teacher) } label: {
                    actionTile("Emploi du temps", systemImage: "calendar", color: Self.sky)
                }
                .buttonStyle(.plain)

                NavigationLink { MessagesView() } label: {
                    actionTile("Messages", systemImage: "envelope.fill", color: EduTheme.fasoGreen, badge: unreadMessages)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func actionTile(_ title: String, systemImage: String, color: Color, badge: Int = 0) -> some View {
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

    // MARK: - Priorities

    private var prioritiesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Priorités", subtitle: prioritySubtitle) {
                NavigationLink {
                    EvaluationsBrowser(teacherId: auth.userId, allowEntry: true, title: "Devoirs & évaluations")
                } label: {
                    Text("Tout voir")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
            }

            if priorityEvals.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.largeTitle)
                        .foregroundStyle(EduTheme.fasoGreen)
                        .accessibilityHidden(true)
                    Text("Rien d’urgent pour le moment.")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    Button { showCreateEval = true } label: {
                        Label("Planifier une évaluation", systemImage: "plus")
                            .font(.subheadline.weight(.bold))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 44)
                            .foregroundStyle(EduTheme.navy)
                            .background(EduTheme.navy.opacity(0.08), in: Capsule())
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            } else {
                VStack(spacing: 8) {
                    ForEach(priorityEvals.prefix(4)) { row in
                        NavigationLink {
                            if row.classSectionId != nil, row.subjectId != nil {
                                GradeEntryView(evaluation: row, recordedBy: auth.userId)
                            } else {
                                EvaluationsBrowser(teacherId: auth.userId, allowEntry: true, title: "Devoirs & évaluations")
                            }
                        } label: {
                            priorityRow(row)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private var prioritySubtitle: String {
        let confirm = needsConfirm.count
        let soon = upcomingEvals.count
        if confirm == 0 && soon == 0 { return "Notes et devoirs à suivre" }
        if confirm > 0 { return "\(confirm) à confirmer · \(soon) à venir" }
        return "\(soon) à venir"
    }

    private func priorityRow(_ row: EvaluationRow) -> some View {
        let badge = typeBadge(row)
        let pending = isPendingConfirm(row)
        let title = (row.title?.isEmpty == false) ? row.title! : row.typeLabel
        let day = eventDay(row)

        return HStack(spacing: 12) {
            dateBlock(day, color: badge.color)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(badge.title)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(badge.color)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(badge.color.opacity(0.12), in: Capsule())
                    if pending {
                        Label("À confirmer", systemImage: "exclamationmark.circle.fill")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.orange)
                    }
                }
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text([row.matieres?.name, row.classes?.name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 6) {
                if let day, let relative = relativeDay(day) {
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
        .accessibilityHint(
            row.classSectionId != nil && row.subjectId != nil ? "Ouvre la saisie des notes" : "Ouvre la liste"
        )
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

    private func typeBadge(_ row: EvaluationRow) -> (title: String, color: Color) {
        switch row.type {
        case "interrogation": return ("Interro", Self.sky)
        case "devoir": return ("Exercice", EduTheme.fasoRed)
        case "examen": return ("Devoir", EduTheme.navy)
        case "composition": return ("Compo", EduTheme.teal)
        default: return (row.typeLabel, EduTheme.muted)
        }
    }

    // MARK: - Classes

    private var classesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(
                title: "Mes classes",
                subtitle: uniqueClasses.isEmpty ? nil : "\(uniqueClasses.count) classe\(uniqueClasses.count > 1 ? "s" : "") affectée\(uniqueClasses.count > 1 ? "s" : "")"
            ) {
                NavigationLink { TeacherClassesView() } label: {
                    Text("Tout voir")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(EduTheme.teal)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }

            if uniqueClasses.isEmpty {
                HomePanelEmpty(message: "Aucune classe affectée pour le moment.")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(uniqueClasses, id: \.id) { item in
                            NavigationLink {
                                ClassHubView(classId: item.id, className: item.name)
                            } label: {
                                classCard(name: item.name, subjects: item.subjects)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Ouvre la classe")
                        }
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 2)
                }
                .scrollClipDisabled()
            }
        }
    }

    private func classCard(name: String, subjects: [String]) -> some View {
        let swatch = SubjectPalette.swatch(for: name)
        return VStack(alignment: .leading, spacing: 10) {
            Text(Self.classInitials(name))
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 46, height: 46)
                .background(
                    LinearGradient(
                        colors: [swatch.border.opacity(0.8), swatch.border],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.headline)
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                Text(subjects.isEmpty ? "Classe" : subjects.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(2, reservesSpace: true)
            }

            HStack(spacing: 4) {
                Text("Ouvrir")
                Image(systemName: "arrow.right")
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(swatch.border)
            .accessibilityHidden(true)
        }
        .padding(14)
        .frame(width: 168, alignment: .leading)
        .background {
            ZStack(alignment: .topTrailing) {
                Color.white
                Circle()
                    .fill(swatch.fill.opacity(0.6))
                    .frame(width: 110, height: 110)
                    .offset(x: 40, y: -45)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.black.opacity(0.05), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.05), radius: 10, y: 4)
        .accessibilityElement(children: .combine)
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

    // MARK: - Text helpers

    private static let monthAbbr = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"]

    private static func todayCaption(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "EEEE d MMMM"
        return formatter.string(from: date)
    }

    private static func classInitials(_ name: String) -> String {
        let compact = name.replacingOccurrences(of: " ", with: "")
        return String(compact.prefix(3)).uppercased()
    }

    private var emptyNowMessage: String {
        let weekday = EduDates.weekday()
        if weekday == 7 { return "Pas de cours le dimanche. L’école reprend lundi." }
        if todaySlots.isEmpty { return "Aucun cours n’est planifié pour aujourd’hui." }
        return "Tous les créneaux du jour sont passés. Beau travail !"
    }

    private func timeRange(_ slot: TimetableSlot) -> String {
        "\(String(slot.startTime.prefix(5)))–\(String(slot.endTime.prefix(5)))"
    }

    private func formatRoom(_ room: String?) -> String? {
        guard let trimmed = room?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        if trimmed.lowercased().hasPrefix("salle") { return trimmed }
        return "Salle \(trimmed)"
    }

    private func spokenRange(_ slot: TimetableSlot) -> String {
        "de \(String(slot.startTime.prefix(5))) à \(String(slot.endTime.prefix(5)))"
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
        case ..<0: return ("Passé", false)
        case 0: return ("Aujourd’hui", true)
        case 1: return ("Demain", true)
        default: return ("Dans \(days) j", days <= 3)
        }
    }

    // MARK: - Loading

    private func load(isRefresh: Bool) async {
        guard let tid = auth.userId else {
            ready = true
            auth.markPortalReady()
            return
        }
        let api = EduAPI()

        async let assignmentsResult = Self.capture { try await api.fetchTeachingAssignments(teacherId: tid) }
        async let slotsResult = Self.capture { try await api.fetchTeacherTimetable(teacherId: tid) }
        async let inboxResult = Self.capture { try await api.fetchInbox(userId: tid, kind: .all, limit: 80) }
        async let evalsResult = Self.capture { try await api.fetchEvaluations(teacherId: tid) }

        var failures = 0

        switch await assignmentsResult {
        case .success(let value): assignments = value
        case .failure: failures += 1
        }

        switch await slotsResult {
        case .success(let slots):
            let weekday = EduDates.weekday()
            todaySlots = slots.filter { $0.dayOfWeek == weekday }.sorted { $0.startTime < $1.startTime }
        case .failure:
            failures += 1
        }

        switch await inboxResult {
        case .success(let inbox):
            unreadMessages = inbox.filter { $0.readAt == nil && ($0.isAnnouncement != true) }.count
            unreadAnnouncements = inbox.filter { $0.readAt == nil && ($0.isAnnouncement == true) }.count
        case .failure:
            failures += 1
        }

        switch await evalsResult {
        case .success(let value): evaluations = value
        case .failure: failures += 1
        }

        loadFailed = failures > 0
        ready = true
        auth.markPortalReady()
    }

    private static func capture<T>(_ work: @escaping () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await work()) } catch { return .failure(error) }
    }

    // MARK: - Time math

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
}

private enum SlotStatus { case done, current, upcoming }

struct HomeCardStyle: ViewModifier {
    var cornerRadius: CGFloat = 22

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.white)
                    .shadow(color: .black.opacity(0.05), radius: 12, y: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.black.opacity(0.04), lineWidth: 1)
            )
    }
}

struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.title
            configuration.icon
        }
    }
}
