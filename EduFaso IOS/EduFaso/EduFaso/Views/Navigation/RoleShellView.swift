import SwiftUI

struct RoleShellView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var selection: AppScreen = .dashboard
    @State private var menuOpen = false
    @State private var showProfile = false
    @State private var contentID = UUID()
    /// Blocks card taps once a horizontal portal swipe is clearly underway.
    @State private var suppressContentClicks = false
    /// NavigationLink pushes (Présences, etc.) keep selection on dashboard — track real stack depth.
    @State private var navigationDepth = 1

    private var canSwipeToProfile: Bool {
        selection == .dashboard && navigationDepth <= 1 && !showProfile
    }

    var body: some View {
        Group {
            if sizeClass == .compact {
                phoneShell
            } else {
                padShell
            }
        }
    }

    private var phoneShell: some View {
        ZStack(alignment: .leading) {
            NavigationStack {
                ScreenHost(screen: selection, open: openScreen)
                    .id(contentID)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .allowsHitTesting(!suppressContentClicks)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button {
                                menuOpen = true
                            } label: {
                                Image(systemName: "line.3.horizontal")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(EduTheme.ink)
                            }
                            .accessibilityLabel("Ouvrir le menu")
                        }
                        ToolbarItem(placement: .principal) {
                            if selection == .dashboard {
                                Image("EduFasoLogo")
                                    .resizable()
                                    .scaledToFit()
                                    .frame(height: 28)
                                    .accessibilityLabel("EduFaso")
                            }
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            Button {
                                showProfile = true
                            } label: {
                                Image(systemName: "person.crop.circle")
                                    .font(.title3)
                                    .foregroundStyle(EduTheme.navy)
                            }
                            .accessibilityLabel("Profil")
                        }
                    }
                    .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
                    .toolbarBackground(.visible, for: .navigationBar)
                    .navigationBarTitleDisplayMode(.inline)
                    .navigationDestination(isPresented: $showProfile) {
                        ProfileView()
                    }
                    .background {
                        NavigationDepthObserver(depth: $navigationDepth)
                    }
            }
            .disabled(menuOpen)
            .simultaneousGesture(portalSwipeGesture)

            if menuOpen {
                Color.black.opacity(0.4)
                    .ignoresSafeArea()
                    .transition(.opacity)
                    .onTapGesture { closeMenu() }
                    .gesture(
                        DragGesture(minimumDistance: 40)
                            .onEnded { value in
                                if value.translation.width < -50 {
                                    closeMenu()
                                }
                            }
                    )
                    .zIndex(1)

                SideDrawerView(
                    selection: selection,
                    onSelect: { screen in
                        openScreen(screen)
                        closeMenu()
                    },
                    onClose: closeMenu
                )
                .transition(.move(edge: .leading))
                .zIndex(2)
            }
        }
        .animation(.easeInOut(duration: 0.22), value: menuOpen)
        .preferredColorScheme(.light)
    }

    /// Anywhere: swipe right → menu · swipe left → profile.
    /// Mid-swipe we disable content hits so cards don't open at the same time.
    private var portalSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 20, coordinateSpace: .local)
            .onChanged { value in
                guard !menuOpen, !showProfile else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > 28, abs(dx) > abs(dy) * 1.5 else { return }
                // Only claim the gesture when it can open menu (anywhere) or profile (root dashboard)
                if dx > 0 || canSwipeToProfile {
                    suppressContentClicks = true
                }
            }
            .onEnded { value in
                defer { suppressContentClicks = false }
                guard !menuOpen, !showProfile else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > abs(dy) * 1.5, abs(dx) > 64 else { return }
                if dx > 0 {
                    menuOpen = true
                } else if canSwipeToProfile {
                    showProfile = true
                }
            }
    }

    private var padShell: some View {
        NavigationSplitView {
            List(selection: Binding(
                get: { Optional(selection) },
                set: { if let value = $0 { selection = value } }
            )) {
                ForEach(appNavSections(for: auth.primaryRole)) { section in
                    if let title = section.title {
                        Section(title) { sectionRows(section) }
                    } else {
                        Section { sectionRows(section) }
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task { await auth.signOut() }
                    } label: {
                        Label("Déconnexion", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("EduFaso")
            .listStyle(.sidebar)
        } detail: {
            NavigationStack {
                ScreenHost(screen: selection, open: openScreen)
                    .id(contentID)
            }
        }
        .tint(EduTheme.navy)
    }

    @ViewBuilder
    private func sectionRows(_ section: AppNavSection) -> some View {
        ForEach(section.screens) { screen in
            Label(menuTitle(screen, role: auth.primaryRole), systemImage: screen.systemImage)
                .tag(screen)
        }
    }

    private func openScreen(_ screen: AppScreen) {
        selection = screen
        showProfile = false
        navigationDepth = 1
        contentID = UUID()
    }

    private func closeMenu() {
        menuOpen = false
    }
}

struct SideDrawerView: View {
    @EnvironmentObject private var auth: AuthViewModel
    let selection: AppScreen
    var onSelect: (AppScreen) -> Void
    var onClose: () -> Void
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0

    private var schoolName: String? {
        auth.schools.first?.name
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Image("EduFasoLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 48)
                        .frame(maxWidth: 160, alignment: .leading)
                    if let schoolName {
                        Text(schoolName)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 8)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .frame(width: 36, height: 36)
                        .background(
                            Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255),
                            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                        )
                }
                .accessibilityLabel("Fermer le menu")
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 14)
            .overlay(alignment: .bottom) { Divider() }

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(appNavSections(for: auth.primaryRole)) { section in
                        VStack(alignment: .leading, spacing: 4) {
                            if let title = section.title {
                                Text(title.uppercased())
                                    .font(.caption2.weight(.semibold))
                                    .tracking(0.8)
                                    .foregroundStyle(EduTheme.muted)
                                    .padding(.horizontal, 12)
                                    .padding(.bottom, 2)
                            }

                            ForEach(section.screens) { screen in
                                drawerRow(screen)
                            }
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 14)
                .padding(.bottom, 16)
            }

            VStack(spacing: 0) {
                Divider()
                Button {
                    onClose()
                    Task { await auth.signOut() }
                } label: {
                    Label("Déconnexion", systemImage: "rectangle.portrait.and.arrow.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.fasoRed)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .background(.white)
        }
        .frame(width: 300)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(.white)
        .safeAreaPadding(.bottom, 8)
        .task { await loadBadges() }
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(Color.black.opacity(0.06))
                .frame(width: 1)
        }
        .ignoresSafeArea(edges: .bottom)
        .shadow(color: .black.opacity(0.18), radius: 24, x: 8, y: 0)
    }

    private func drawerRow(_ screen: AppScreen) -> some View {
        let active = screen == selection
        let badge = badgeCount(for: screen)
        return Button {
            onSelect(screen)
        } label: {
            HStack(spacing: 10) {
                Label(menuTitle(screen, role: auth.primaryRole), systemImage: screen.systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(active ? EduTheme.tealDark : EduTheme.ink.opacity(0.78))
                    .labelStyle(.titleAndIcon)
                Spacer(minLength: 0)
                if let badge, badge > 0 {
                    Text(badge > 99 ? "99+" : "\(badge)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(EduTheme.fasoRed, in: Capsule())
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(active ? EduTheme.brand50 : .clear)
            )
        }
        .buttonStyle(.plain)
    }

    private func badgeCount(for screen: AppScreen) -> Int? {
        switch screen {
        case .messages: return unreadMessages > 0 ? unreadMessages : nil
        case .announcements: return unreadAnnouncements > 0 ? unreadAnnouncements : nil
        default: return nil
        }
    }

    private func loadBadges() async {
        guard let uid = auth.userId else { return }
        guard let inbox = try? await EduAPI().fetchInbox(userId: uid, kind: .all, limit: 80) else { return }
        unreadMessages = inbox.filter { $0.readAt == nil && ($0.isAnnouncement != true) }.count
        unreadAnnouncements = inbox.filter { $0.readAt == nil && ($0.isAnnouncement == true) }.count
    }
}

/// Reads UINavigationController stack depth so profile swipe only fires on the true Accueil root
/// (NavigationLink destinations like Présences keep `selection == .dashboard`).
private struct NavigationDepthObserver: UIViewControllerRepresentable {
    @Binding var depth: Int

    func makeUIViewController(context: Context) -> Controller {
        Controller(depth: $depth)
    }

    func updateUIViewController(_ uiViewController: Controller, context: Context) {
        uiViewController.depth = $depth
        uiViewController.publish()
    }

    final class Controller: UIViewController {
        var depth: Binding<Int>
        private var token: NSObjectProtocol?

        init(depth: Binding<Int>) {
            self.depth = depth
            super.init(nibName: nil, bundle: nil)
            view.isUserInteractionEnabled = false
            view.backgroundColor = .clear
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError() }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            publish()
            guard token == nil else { return }
            token = NotificationCenter.default.addObserver(
                forName: NSNotification.Name("UINavigationControllerDidShowViewControllerNotification"),
                object: nil,
                queue: .main
            ) { [weak self] note in
                guard let self,
                      let nav = note.object as? UINavigationController,
                      self.isSameNavigationStack(nav) else { return }
                self.publish(nav)
            }
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            publish()
        }

        deinit {
            if let token { NotificationCenter.default.removeObserver(token) }
        }

        func publish(_ nav: UINavigationController? = nil) {
            let count = (nav ?? resolveNavigationController())?.viewControllers.count ?? 1
            if depth.wrappedValue != count {
                depth.wrappedValue = count
            }
        }

        private func isSameNavigationStack(_ nav: UINavigationController) -> Bool {
            if let mine = resolveNavigationController() { return mine === nav }
            return view.window != nil && view.window === nav.view.window
        }

        private func resolveNavigationController() -> UINavigationController? {
            if let navigationController { return navigationController }
            var parent = parent
            while let current = parent {
                if let nav = current as? UINavigationController { return nav }
                if let nav = current.navigationController { return nav }
                parent = current.parent
            }
            var responder: UIResponder? = view
            while let current = responder {
                if let nav = current as? UINavigationController { return nav }
                responder = current.next
            }
            return nil
        }
    }
}

struct ScreenHost: View {
    let screen: AppScreen
    var open: (AppScreen) -> Void
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        switch screen {
        case .dashboard:
            switch auth.primaryRole {
            case .student: StudentHomeView()
            case .teacher: TeacherHomeView()
            case .parent: ParentHomeView(title: "Accueil")
            case .schoolAdmin: SchoolPortalView(open: open)
            case .superAdmin: PlatformPortalView(open: open)
            case .none: ProfileView()
            }
        case .profile:
            ProfileView()
        case .messages:
            MessagesView()
        case .announcements:
            MessagesView(announcementsOnly: true)
        case .adminSchools:
            SchoolsListView()
        case .adminUsers:
            AdminUsersView()
        case .adminInvites:
            InvitesView()
        case .adminReports:
            AdminReportsView()
        case .adminBilling:
            BillingView()
        case .adminSettings:
            PlatformSettingsView()
        case .adminAudit:
            AuditView()
        case .adminSuperAdmins:
            RolePeopleView(role: "super_admin", title: "Super admins", schoolScoped: false)
        case .schoolConfig:
            SchoolConfigView(open: open)
        case .schoolSettings:
            SchoolSettingsView()
        case .years:
            YearsView()
        case .periods:
            PeriodsView()
        case .subjects:
            SubjectsView()
        case .classes:
            ClassesAdminView()
        case .programmes:
            ProgrammeView()
        case .schoolTimetable:
            SchoolTimetableMenu()
        case .schoolAttendance:
            SchoolAttendanceView()
        case .schoolHomework:
            SchoolEvalMenu(type: "examen", title: "Devoirs")
        case .schoolCompositions:
            SessionsView()
        case .teacherEntry:
            TeacherEntryView()
        case .bulletins:
            BulletinsMenu()
        case .schoolCahier:
            SchoolCahierView()
        case .statistics:
            StatisticsView()
        case .teachers:
            RolePeopleView(role: "teacher", title: "Enseignants")
        case .students:
            PeopleListView(kind: .students)
        case .parents:
            PeopleListView(kind: .parents)
        case .signalements:
            SignalsView(schoolId: auth.primaryRole == .superAdmin ? nil : auth.schoolId)
        case .teacherClasses:
            TeacherClassesView()
        case .teacherStudents:
            TeacherStudentsView()
        case .teacherAttendance:
            TeacherAttendanceOverview()
        case .timetable:
            TimetableView(mode: auth.primaryRole == .teacher ? .teacher : .student)
        case .teacherCahier:
            TeacherCahierView()
        case .teacherEvaluations:
            EvaluationsBrowser(teacherId: auth.userId, allowEntry: true, title: "Devoirs & évaluations")
        case .cahier:
            CahierFeedView()
        case .grades:
            StudentGradesView()
        case .exercises:
            EvaluationsBrowser(studentId: auth.userId, type: "devoir", title: "Exercices de maison")
        case .exams:
            EvaluationsBrowser(studentId: auth.userId, type: "examen", confirmedOnly: true, title: "Devoirs")
        case .compositions:
            StudentCompositionsView()
        case .attendance:
            StudentAttendanceView()
        case .myTeachers:
            MyTeachersView()
        case .bulletin:
            BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin")
        case .childNotes:
            ChildGate(title: "Notes") { StudentGradesView(studentIdOverride: $0.id) }
        case .childAttendance:
            ChildGate(title: "Présences") { StudentAttendanceView(studentIdOverride: $0.id) }
        case .childExams:
            ChildGate(title: "Devoirs") { EvaluationsBrowser(studentId: $0.id, type: "examen", confirmedOnly: true, title: "Devoirs") }
        case .childExercises:
            ChildGate(title: "Exercices de maison") { EvaluationsBrowser(studentId: $0.id, type: "devoir", title: "Exercices") }
        case .childCompositions:
            ChildGate(title: "Compositions") { StudentCompositionsView(studentIdOverride: $0.id) }
        case .childBulletin:
            ChildGate(title: "Bulletins") { BulletinBoard(studentId: $0.id, title: "Bulletin") }
        case .childTimetable:
            ChildGate(title: "Emploi du temps") { TimetableView(mode: .student, studentIdOverride: $0.id) }
        case .childCahier:
            ChildGate(title: "Cahier de textes") { CahierFeedView(studentId: $0.id) }
        }
    }
}
