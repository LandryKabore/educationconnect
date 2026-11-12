import SwiftUI

struct TeacherHomeView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var assignments: [TeachingAssignment] = []
    @State private var todaySlots: [TimetableSlot] = []
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0
    @State private var loading = true
    @State private var ready = false

    private var nowSlot: TimetableSlot? {
        let now = Self.minutesNow()
        return todaySlots.first { slot in
            Self.minutes(slot.startTime) <= now && now < Self.minutes(slot.endTime)
        }
    }

    private var nextSlot: TimetableSlot? {
        let now = Self.minutesNow()
        return todaySlots.first { Self.minutes($0.startTime) > now }
    }

    var body: some View {
        Group {
            if !ready {
                Color.clear
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        PortalHomeHeader(
                            systemImage: "person.fill.checkmark",
                            name: auth.profile?.fullName ?? auth.profile?.firstName ?? "",
                            context: auth.schools.first?.name ?? "Enseignant",
                            unreadMessages: unreadMessages,
                            unreadAnnouncements: unreadAnnouncements
                        )

                        nowSection

                        HomePanel(
                            systemImage: "calendar",
                            title: "Ensuite aujourd’hui",
                            subtitle: "Tes cours restants"
                        ) {
                            let rest: [TimetableSlot] = {
                                if let now = nowSlot {
                                    return todaySlots.filter { $0.id != now.id && Self.minutes($0.startTime) >= Self.minutes(now.endTime) }
                                }
                                if let next = nextSlot {
                                    return todaySlots.filter { Self.minutes($0.startTime) >= Self.minutes(next.startTime) }
                                }
                                return todaySlots
                            }()

                            if rest.isEmpty {
                                HomePanelEmpty(message: todaySlots.isEmpty
                                    ? "Pas de cours planifié aujourd’hui."
                                    : "Plus de cours aujourd’hui.")
                            } else {
                                VStack(spacing: 8) {
                                    ForEach(rest) { slot in
                                        HomeRowCard(
                                            title: slot.matieres?.name ?? "Cours",
                                            subtitle: slot.room.map { "Salle \($0)" },
                                            trailing: "\(String(slot.startTime.prefix(5)))–\(String(slot.endTime.prefix(5)))"
                                        )
                                    }
                                }
                            }
                        }

                        HomePanel(
                            systemImage: "rectangle.3.group",
                            title: "Mes classes",
                            subtitle: "Accès rapide à tes classes"
                        ) {
                            if assignments.isEmpty {
                                HomePanelEmpty(message: "Aucune classe affectée pour le moment.")
                            } else {
                                VStack(spacing: 8) {
                                    ForEach(assignments) { assignment in
                                        NavigationLink {
                                            ClassHubView(
                                                classId: assignment.classSectionId,
                                                className: assignment.classes?.name ?? "Classe"
                                            )
                                        } label: {
                                            HomeRowCard(
                                                title: assignment.classes?.name ?? "Classe",
                                                subtitle: assignment.matieres?.name
                                            )
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Accès rapide")
                                .font(.headline)
                                .foregroundStyle(EduTheme.ink)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    NavigationLink { TeacherClassesView() } label: {
                                        QuickLinkChip(title: "Classes", systemImage: "rectangle.3.group")
                                    }
                                    NavigationLink { TeacherAttendanceOverview() } label: {
                                        QuickLinkChip(title: "Présences", systemImage: "checklist")
                                    }
                                    NavigationLink {
                                        EvaluationsBrowser(teacherId: auth.userId, allowEntry: true, title: "Devoirs & évaluations")
                                    } label: {
                                        QuickLinkChip(title: "Notes", systemImage: "pencil.line")
                                    }
                                    NavigationLink { TimetableView(mode: .teacher) } label: {
                                        QuickLinkChip(title: "Emploi du temps", systemImage: "calendar")
                                    }
                                    NavigationLink { TeacherCahierView() } label: {
                                        QuickLinkChip(title: "Cahier", systemImage: "book")
                                    }
                                }
                            }
                        }
                    }
                    .padding(20)
                }
                .refreshable { await load(isRefresh: true) }
            }
        }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load(isRefresh: false) }
    }

    @ViewBuilder
    private var nowSection: some View {
        if let slot = nowSlot ?? nextSlot {
            let isCurrent = nowSlot != nil
            VStack(alignment: .leading, spacing: 12) {
                Text(isCurrent ? "En cours · \(String(slot.startTime.prefix(5)))–\(String(slot.endTime.prefix(5)))" : "Prochain · \(String(slot.startTime.prefix(5)))–\(String(slot.endTime.prefix(5)))")
                    .font(.caption.weight(.semibold))
                    .tracking(0.4)
                    .foregroundStyle(EduTheme.tealDark)
                    .textCase(.uppercase)

                Text(slot.matieres?.name ?? "Cours")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(EduTheme.ink)

                if let room = slot.room, !room.isEmpty {
                    Text("Salle \(room)")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                }

                NavigationLink {
                    TeacherAttendanceOverview()
                } label: {
                    Text("Faire l’appel")
                        .font(.body.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(EduTheme.teal)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                HStack(spacing: 8) {
                    NavigationLink {
                        EvaluationsBrowser(teacherId: auth.userId, allowEntry: true, title: "Saisir des notes")
                    } label: {
                        Text("Saisir des notes")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(.white)
                            .foregroundStyle(EduTheme.tealDark)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .stroke(EduTheme.teal, lineWidth: 2)
                            )
                    }
                    NavigationLink {
                        EvaluationsBrowser(teacherId: auth.userId, allowEntry: true, title: "Devoirs")
                    } label: {
                        Text("Devoir")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(.white)
                            .foregroundStyle(EduTheme.tealDark)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .stroke(EduTheme.teal, lineWidth: 2)
                            )
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(EduTheme.teal, lineWidth: 2)
            )
        } else {
            HomePanel(systemImage: "sun.max", title: "Maintenant", subtitle: "Pas de cours en ce moment") {
                HomePanelEmpty(message: emptyNowMessage)
                NavigationLink { TimetableView(mode: .teacher) } label: {
                    Text("Voir l’emploi du temps")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.teal)
                        .underline()
                }
            }
        }
    }

    private var emptyNowMessage: String {
        let weekday = EduDates.weekday()
        if weekday == 7 { return "Pas de cours le dimanche. L’école reprend lundi." }
        if todaySlots.isEmpty { return "Aucun cours n’est planifié pour aujourd’hui." }
        return "Tous les créneaux du jour sont passés."
    }

    private func load(isRefresh: Bool) async {
        guard let tid = auth.userId else {
            ready = true
            loading = false
            auth.markPortalReady()
            return
        }
        if !isRefresh && !ready { loading = true }
        let api = EduAPI()
        do {
            async let assignmentsTask = api.fetchTeachingAssignments(teacherId: tid)
            async let slotsTask = api.fetchTeacherTimetable(teacherId: tid)
            async let inboxTask = api.fetchInbox(userId: tid, kind: .all, limit: 80)
            assignments = try await assignmentsTask
            let slots = try await slotsTask
            let efDay = EduDates.weekday()
            todaySlots = slots.filter { $0.dayOfWeek == efDay }.sorted { $0.startTime < $1.startTime }
            let inbox = try await inboxTask
            unreadMessages = inbox.filter { $0.readAt == nil && ($0.isAnnouncement != true) }.count
            unreadAnnouncements = inbox.filter { $0.readAt == nil && ($0.isAnnouncement == true) }.count
        } catch {}
        loading = false
        ready = true
        auth.markPortalReady()
    }

    private static func minutes(_ hhmm: String) -> Int {
        let parts = hhmm.split(separator: ":")
        guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return 0 }
        return h * 60 + m
    }

    private static func minutesNow() -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: Date())
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }
}
