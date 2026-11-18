import SwiftUI

/// Teacher « À faire », like the web AFaire: everything still to do (late roll calls, cahiers
/// to fill, grades to enter), exams waiting for the school, and unread messages.
struct TeacherTodoView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var snapshot = TeacherLessons.Snapshot()
    @State private var unreadMessages = 0
    @State private var ready = false

    @State private var tour = TabTour(key: "a-faire-enseignant")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "todo.stats", icon: "chart.bar.fill", title: "En un coup d’œil",
                          message: "Le nombre d’appels, de cahiers et de notes qui vous attendent."),
            CoachMarkStep(id: "todo.appels", icon: "checklist", title: "Appels à faire",
                          message: "Les cours commencés ou terminés sans appel. Touchez « Faire l’appel » pour le rattraper."),
            CoachMarkStep(id: "todo.cahiers", icon: "book", title: "Cahiers de textes",
                          message: "Les cours terminés sans cahier de textes, des 7 derniers jours."),
            CoachMarkStep(id: "todo.notes", icon: "pencil.and.list.clipboard", title: "Notes à saisir",
                          message: "Les interrogations et examens passés dont il manque des notes."),
            CoachMarkStep(id: "todo.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    TimelineView(.everyMinute) { context in
                        content(now: context.date)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await load() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("À faire")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        let late = TeacherLessons.late(TeacherLessons.lessons(snapshot, now: now), now: now)
        let appels = late.filter { $0.appelDue && $0.appel != .done }
        let cahiers = late.filter { $0.cahierDue && $0.cahier != .done }
        let total = appels.count + cahiers.count + snapshot.ungraded.count

        VStack(alignment: .leading, spacing: 16) {
            banner(total: total, appels: appels.count, cahiers: cahiers.count)

            group(icon: "checklist", title: "Appels à faire", hint: "Cours commencés ou terminés sans appel validé",
                  count: appels.count, empty: "Tous les appels sont faits.") {
                ForEach(Self.byDay(appels, now: now), id: \.title) { group in
                    dayHeader(group.title, group.items.count)
                    ForEach(group.items) { l in
                        item(title: "\(l.subjectName) · \(l.className)",
                             meta: "\(H.shortDay(l.date)) · \(l.start.prefix(5)) – \(l.end.prefix(5))",
                             cta: "Faire l’appel") {
                            TeacherAttendanceView(initialClassId: l.classId, initialSubjectId: l.subjectId, initialDate: l.date)
                        }
                    }
                }
            }
            .coachMarkTarget("todo.appels")

            group(icon: "book", title: "Cahiers de textes à remplir", hint: "Cours terminés sans cahier de textes",
                  count: cahiers.count, empty: "Tous les cahiers sont remplis.") {
                ForEach(Self.byDay(cahiers, now: now), id: \.title) { group in
                    dayHeader(group.title, group.items.count)
                    ForEach(group.items) { l in
                        item(title: "\(l.subjectName) · \(l.className)",
                             meta: "\(H.shortDay(l.date)) · \(l.start.prefix(5)) – \(l.end.prefix(5))",
                             cta: "Remplir") {
                            TeacherCahierView(initialClassId: l.classId, initialSubjectId: l.subjectId, initialDate: l.date)
                        }
                    }
                }
            }
            .coachMarkTarget("todo.cahiers")

            group(icon: "pencil.and.list.clipboard", title: "Notes à saisir",
                  hint: "Interrogations et examens passés sans toutes les notes",
                  count: snapshot.ungraded.count, empty: "Toutes les notes sont saisies.") {
                ForEach(snapshot.ungraded) { u in
                    let e = u.evaluation
                    item(title: e.title?.isEmpty == false ? e.title! : e.typeLabel,
                         meta: [e.typeLabel, e.matieres?.name, e.classes?.name, e.evalDate.map { H.shortDay($0) }]
                            .compactMap { $0 }.joined(separator: " · "),
                         badge: "\(u.missing) note\(u.missing > 1 ? "s" : "") manquante\(u.missing > 1 ? "s" : "")",
                         cta: "Saisir") {
                        GradeEntryView(evaluation: e, recordedBy: auth.userId)
                    }
                }
            }
            .coachMarkTarget("todo.notes")

            group(icon: "hourglass", title: "Examens en attente",
                  hint: "Proposés, en attente de confirmation par l’administration",
                  count: snapshot.pendingExams.count, empty: "Aucun examen en attente.", muted: true) {
                ForEach(snapshot.pendingExams) { e in
                    item(title: e.title?.isEmpty == false ? e.title! : e.typeLabel,
                         meta: [e.matieres?.name, e.classes?.name, e.evalDate.map { H.shortDay($0) }]
                            .compactMap { $0 }.joined(separator: " · "),
                         cta: "Voir", quiet: true) {
                        TeacherEvaluationsView(initialClassId: e.classSectionId)
                    }
                }
            }

            NavigationLink { MessagesView() } label: {
                HStack(spacing: 12) {
                    iconBox("message", fg: EduTheme.teal, bg: H.brand50)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Messages").font(.headline).foregroundStyle(EduTheme.ink)
                        Text(unreadMessages > 0 ? "\(unreadMessages) non lu\(unreadMessages > 1 ? "s" : "")" : "Tout est lu")
                            .font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    Spacer()
                    Image(systemName: "arrow.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.muted)
                }
                .padding(16)
                .modifier(HomeCardStyle())
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Pieces

    /// « Aujourd’hui » first, then « Jours précédents » (only the groups that have lessons).
    static func byDay(_ lessons: [TeacherLessons.Lesson], now: Date) -> [(title: String, items: [TeacherLessons.Lesson])] {
        let today = EduDates.day(now)
        let todays = lessons.filter { $0.date == today }
        let before = lessons.filter { $0.date < today }
        return [("Aujourd’hui", todays), ("Jours précédents", before)].filter { !$0.1.isEmpty }
    }

    private func dayHeader(_ title: String, _ count: Int) -> some View {
        HStack {
            Text(title).font(.footnote.weight(.bold)).foregroundStyle(EduTheme.ink)
            Spacer()
            Text("\(count)").font(.caption.weight(.semibold).monospacedDigit()).foregroundStyle(EduTheme.muted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 7)
        .background(H.slate100.opacity(0.8))
    }

    private func banner(total: Int, appels: Int, cahiers: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("À faire")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                        Text(total == 0 ? "Tout est à jour. Bravo !" : "\(total) tâche\(total > 1 ? "s" : "") en attente")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("todo.help")
                }
                HStack(spacing: 8) {
                    stat("Appels", "\(appels)", "à faire")
                    stat("Cahiers", "\(cahiers)", "à remplir")
                    stat("Notes", "\(snapshot.ungraded.count)", "à noter")
                }
                .coachMarkTarget("todo.stats")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }
                .frame(height: 4)
                .accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, _ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold)).tracking(0.6)
                .foregroundStyle(.white.opacity(0.7))
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
            Text(hint)
                .font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    private func iconBox(_ icon: String, fg: Color, bg: Color) -> some View {
        Image(systemName: icon)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(fg)
            .frame(width: 36, height: 36)
            .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func group<Content: View>(
        icon: String, title: String, hint: String, count: Int, empty: String, muted: Bool = false,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                iconBox(count == 0 ? "checkmark.circle" : icon,
                        fg: count == 0 ? H.emerald : (muted ? EduTheme.muted : H.amber),
                        bg: count == 0 ? H.emerald50 : (muted ? H.slate100 : H.amber50))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(EduTheme.ink)
                    Text(hint).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(2)
                }
                Spacer(minLength: 4)
                Text("\(count)").font(.title3.weight(.bold).monospacedDigit()).foregroundStyle(EduTheme.ink)
            }
            .padding(16)
            Divider()
            if count == 0 {
                Text(empty)
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .padding(16)
            } else {
                VStack(spacing: 0) { content() }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func item<Destination: View>(
        title: String, meta: String, badge: String? = nil, cta: String, quiet: Bool = false,
        @ViewBuilder destination: @escaping () -> Destination
    ) -> some View {
        NavigationLink { destination() } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    Text(meta)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(1)
                    if let badge {
                        Text(badge)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(H.amber)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(H.amber50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                }
                Spacer(minLength: 4)
                Label(cta, systemImage: "arrow.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .frame(minHeight: 32)
                    .foregroundStyle(quiet ? EduTheme.ink : .white)
                    .background(quiet ? .white : EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(quiet ? EduTheme.borderStrong : .clear, lineWidth: 1))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { Divider().opacity(0.6) }
    }

    private func load() async {
        guard let tid = auth.userId else { ready = true; return }
        if let snap = try? await TeacherLessons.load(teacherId: tid) { snapshot = snap }
        if let rows = try? await EduAPI().fetchInbox(userId: tid, kind: .all, limit: 80) {
            unreadMessages = rows.filter { $0.readAt == nil && $0.isAnnouncement != true }.count
        }
        ready = true
    }
}
