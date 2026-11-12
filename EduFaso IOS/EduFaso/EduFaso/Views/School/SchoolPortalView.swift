import SwiftUI

struct SchoolPortalView: View {
    var open: (AppScreen) -> Void
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classCount = 0
    @State private var subjectCount = 0
    @State private var studentTotal = 0
    @State private var teacherCount = 0
    @State private var stats: SchoolHomeStats?
    @State private var withoutClass = 0
    @State private var yearLabel: String?
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0
    @State private var loading = true
    @State private var ready = false

    var body: some View {
        Group {
            if !ready {
                Color.clear
            } else {
                portalContent
                    .refreshable { await load(isRefresh: true) }
            }
        }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load(isRefresh: false) }
    }

    private var portalContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PortalHomeHeader(
                    systemImage: "building.2.fill",
                    name: auth.profile?.fullName ?? auth.profile?.firstName ?? "",
                    context: [
                        auth.schools.first?.name,
                        yearLabel.map { "Année · \($0)" },
                    ].compactMap { $0 }.joined(separator: " · "),
                    unreadMessages: unreadMessages,
                    unreadAnnouncements: unreadAnnouncements
                )

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    Button { open(.students) } label: {
                        MetricCardView(label: "Élèves", value: "\(studentTotal)", hint: withoutClass > 0 ? "\(withoutClass) sans classe" : "Effectif", valueColor: EduTheme.navy)
                    }.buttonStyle(.plain)
                    Button { open(.teachers) } label: {
                        MetricCardView(label: "Enseignants", value: "\(teacherCount)", hint: "Corps enseignant", valueColor: EduTheme.teal)
                    }.buttonStyle(.plain)
                    Button { open(.classes) } label: {
                        MetricCardView(label: "Classes", value: "\(classCount)", hint: "Sections", valueColor: Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255))
                    }.buttonStyle(.plain)
                    Button { open(.subjects) } label: {
                        MetricCardView(label: "Matières", value: "\(subjectCount)", hint: "Programme", valueColor: EduTheme.fasoYellow)
                    }.buttonStyle(.plain)
                }

                HomePanel(
                    systemImage: "checklist",
                    title: "Présences du jour",
                    subtitle: EduDates.day(),
                    content: {
                        HStack(spacing: 10) {
                            dayChip("Absents", stats?.absent ?? 0, EduTheme.fasoRed)
                            dayChip("Retards", stats?.late ?? 0, Color.orange)
                            dayChip("Excusés", stats?.excused ?? 0, EduTheme.teal)
                        }
                    },
                    actionTitle: "Voir les présences",
                    action: { open(.schoolAttendance) }
                )

                HomePanel(
                    systemImage: "calendar",
                    title: "Emploi du temps",
                    subtitle: "Couverture aujourd’hui",
                    content: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("\(stats?.todaySlotCount ?? 0) créneau(x) aujourd’hui")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.ink)
                            Text("\(stats?.classesWithEdt ?? 0) classe(s) avec emploi du temps")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                            if withoutClass > 0 {
                                Text("\(withoutClass) élève(s) sans classe")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Color.orange)
                            }
                        }
                    },
                    actionTitle: "Emplois du temps",
                    action: { open(.schoolTimetable) }
                )

                VStack(alignment: .leading, spacing: 10) {
                    Text("Raccourcis")
                        .font(.headline)
                        .foregroundStyle(EduTheme.ink)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button { open(.schoolConfig) } label: { QuickLinkChip(title: "Configuration", systemImage: "checklist") }
                            Button { open(.schoolHomework) } label: { QuickLinkChip(title: "Devoirs", systemImage: "doc.text") }
                            Button { open(.bulletins) } label: { QuickLinkChip(title: "Bulletins", systemImage: "chart.bar.doc.horizontal") }
                            Button { open(.statistics) } label: { QuickLinkChip(title: "Statistiques", systemImage: "chart.bar") }
                            Button { open(.messages) } label: { QuickLinkChip(title: "Messages", systemImage: "envelope") }
                            Button { open(.schoolSettings) } label: { QuickLinkChip(title: "Paramètres", systemImage: "gearshape") }
                        }
                    }
                }
            }
            .padding(20)
        }
    }

    private func dayChip(_ title: String, _ value: Int, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }

    private func load(isRefresh: Bool) async {
        guard let schoolId = auth.schoolId else {
            loading = false
            ready = true
            auth.markPortalReady()
            return
        }
        if !isRefresh && !ready { loading = true }
        let api = EduAPI()
        async let classes = api.countRows(table: "classes", schoolId: schoolId)
        async let subjects = api.countRows(table: "matieres", schoolId: schoolId)
        async let teachers = api.fetchRolePeople(role: "teacher", schoolId: schoolId)
        async let students = api.fetchStudentsPage(schoolId: schoolId, search: "", offset: 0)
        async let home = api.homeStats(schoolId: schoolId)
        async let missing = api.studentsWithoutClass(schoolId: schoolId)
        async let years = api.fetchYears(schoolId: schoolId)
        classCount = (try? await classes) ?? 0
        subjectCount = (try? await subjects) ?? 0
        teacherCount = (try? await teachers.count) ?? 0
        studentTotal = (try? await students.total) ?? 0
        stats = try? await home
        withoutClass = (try? await missing) ?? 0
        let yrs = (try? await years) ?? []
        yearLabel = yrs.first(where: \.isCurrent)?.label ?? yrs.first?.label
        if let uid = auth.userId, let inbox = try? await api.fetchInbox(userId: uid, kind: .all, limit: 80) {
            unreadMessages = inbox.filter { $0.readAt == nil && ($0.isAnnouncement != true) }.count
            unreadAnnouncements = inbox.filter { $0.readAt == nil && ($0.isAnnouncement == true) }.count
        }
        loading = false
        ready = true
        auth.markPortalReady()
    }
}

struct PlatformPortalView: View {
    var open: (AppScreen) -> Void
    @EnvironmentObject private var auth: AuthViewModel
    @State private var schools: [School] = []
    @State private var invites: [InviteRow] = []
    @State private var signals: [SignalRow] = []
    @State private var loading = true
    @State private var ready = false

    private var activeSchools: Int { schools.filter { $0.active != false }.count }
    private var pendingInvites: Int {
        invites.filter { $0.acceptedAt == nil && $0.cancelledAt == nil }.count
    }

    var body: some View {
        Group {
            if !ready {
                Color.clear
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        PortalHomeHeader(
                            systemImage: "globe.europe.africa.fill",
                            name: auth.profile?.fullName ?? "Administration",
                            context: "Plateforme EduFaso"
                        )

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            Button { open(.adminSchools) } label: {
                                MetricCardView(label: "Écoles", value: "\(schools.count)", hint: "\(activeSchools) actives", valueColor: EduTheme.navy)
                            }.buttonStyle(.plain)
                            Button { open(.adminInvites) } label: {
                                MetricCardView(label: "Invitations", value: "\(pendingInvites)", hint: "En attente", valueColor: pendingInvites > 0 ? Color.orange : EduTheme.muted)
                            }.buttonStyle(.plain)
                            Button { open(.signalements) } label: {
                                MetricCardView(label: "Signalements", value: "\(signals.count)", hint: "Ouverts / récents", valueColor: EduTheme.fasoRed)
                            }.buttonStyle(.plain)
                            Button { open(.adminUsers) } label: {
                                MetricCardView(label: "Utilisateurs", value: "—", hint: "Annuaire plateforme", valueColor: EduTheme.teal)
                            }.buttonStyle(.plain)
                        }

                        HomePanel(
                            systemImage: "building.2",
                            title: "Écoles récentes",
                            subtitle: "Accès rapide",
                            content: {
                                if schools.isEmpty {
                                    HomePanelEmpty(message: "Aucune école enregistrée.")
                                } else {
                                    VStack(spacing: 8) {
                                        ForEach(schools.prefix(6)) { school in
                                            NavigationLink {
                                                SchoolDetailView(schoolId: school.id)
                                            } label: {
                                                HomeRowCard(
                                                    title: school.name,
                                                    subtitle: [school.city, school.active == false ? "Inactive" : "Active"].compactMap { $0 }.joined(separator: " · ")
                                                )
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            },
                            actionTitle: "Toutes les écoles",
                            action: { open(.adminSchools) }
                        )

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Administration")
                                .font(.headline)
                                .foregroundStyle(EduTheme.ink)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    Button { open(.adminReports) } label: { QuickLinkChip(title: "Rapports", systemImage: "list.clipboard") }
                                    Button { open(.adminBilling) } label: { QuickLinkChip(title: "Abonnements", systemImage: "creditcard") }
                                    Button { open(.adminSettings) } label: { QuickLinkChip(title: "Paramètres", systemImage: "gearshape") }
                                    Button { open(.adminAudit) } label: { QuickLinkChip(title: "Audit", systemImage: "doc.text.magnifyingglass") }
                                    Button { open(.adminSuperAdmins) } label: { QuickLinkChip(title: "Super admins", systemImage: "person.badge.key") }
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

    private func load(isRefresh: Bool) async {
        if !isRefresh && !ready { loading = true }
        let api = EduAPI()
        schools = (try? await api.fetchSchools()) ?? []
        invites = (try? await api.fetchInvites()) ?? []
        signals = (try? await api.fetchSignals(schoolId: nil)) ?? []
        loading = false
        ready = true
        auth.markPortalReady()
    }
}
