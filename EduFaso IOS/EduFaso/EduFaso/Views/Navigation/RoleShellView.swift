import SwiftUI

struct RoleShellView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var selection: AppScreen = .dashboard
    @State private var menuOpen = false
    /// Set as soon as a drag is clearly a sideways menu/profile swipe, so the card under the
    /// finger does not also count it as a tap when the finger lifts.
    @State private var swipeLocked = false
    @State private var showProfile = false
    @State private var contentID = UUID()
    /// NavigationLink pushes (Présences, etc.) keep selection on dashboard — track real stack depth.
    @State private var navigationDepth = 1

    /// Root of the stack (Accueil / a menu screen) — not a pushed detail.
    private var isAtRoot: Bool {
        navigationDepth <= 1 && !showProfile
    }

    private var canSwipeToProfile: Bool {
        selection == .dashboard && isAtRoot
    }

    private var canSwipeToMenu: Bool {
        isAtRoot && !menuOpen
    }

    var body: some View {
        Group {
            if sizeClass == .compact {
                phoneShell
            } else {
                padShell
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if let s = auth.supportSchool, auth.inSupport { supportBanner(s) }
        }
        // tapped notification: open its screen
        // (kept until the portal is ready: a tap that launches the app arrives during the opening screen)
        .onReceive(PushManager.shared.$pendingScreen) { _ in openPendingScreen() }
        .onChange(of: auth.portalReady) { _, _ in openPendingScreen() }
        // students and parents: the ones the server sends notifications to
        .task(id: auth.primaryRole) {
            if auth.primaryRole == .student || auth.primaryRole == .parent { await PushManager.shared.requestAndRegister() }
        }
        .onChange(of: auth.supportSchool?.id) { _, _ in
            selection = .dashboard
            showProfile = false
            menuOpen = false
            contentID = UUID()
        }
    }

    /// Like the web: « Mode support — vous consultez l’école comme administrateur ».
    private func supportBanner(_ s: School) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "headphones").font(.subheadline.weight(.semibold))
            VStack(alignment: .leading, spacing: 1) {
                Text("Mode support").font(.caption.weight(.bold))
                Text("Vous consultez « \(s.name) » comme administrateur.").font(.caption2).lineLimit(2)
            }
            Spacer(minLength: 6)
            Button { auth.exitSupportMode() } label: {
                Text("Quitter").font(.caption.weight(.bold)).foregroundStyle(TeacherHomeView.amber)
                    .padding(.horizontal, 10).frame(minHeight: 30)
                    .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quitter le mode support")
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(TeacherHomeView.amber)
    }

    private var phoneShell: some View {
        ZStack(alignment: .leading) {
            NavigationStack {
                ScreenHost(screen: selection, open: openScreen)
                    .id(contentID)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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
                            // already on Profil: no shortcut to itself
                            if selection != .profile {
                            Button {
                                showProfile = true
                            } label: {
                                UserAvatarView(
                                    url: auth.profile?.avatarUrl,
                                    firstName: auth.profile?.firstName,
                                    lastName: auth.profile?.lastName,
                                    size: 28
                                )
                            }
                            .accessibilityLabel("Profil")
                            }
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
            .disabled(menuOpen || swipeLocked)
            // Only at root: swipe right → menu, swipe left → profile.
            // On pushed pages we leave the left edge alone so interactive pop works.
            // Never disable hit-testing mid-drag — that froze ScrollView with a white gap.
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

    private var portalSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 28, coordinateSpace: .global)
            .onChanged { value in
                guard !swipeLocked, !menuOpen, !showProfile else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > abs(dy) * 2, abs(dx) > 44 else { return }
                guard dx > 0 ? canSwipeToMenu : canSwipeToProfile else { return }
                guard !HorizontalScrollProbe.startsOnHorizontalScroller(value.startLocation) else { return }
                swipeLocked = true
            }
            .onEnded { value in
                if swipeLocked {
                    // Unlock after the lift, once the card has missed its tap.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { swipeLocked = false }
                }
                guard !menuOpen, !showProfile else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                // Strictly horizontal — ignore scroll / pull-to-refresh.
                guard abs(dx) > abs(dy) * 2, abs(dx) > 72 else { return }
                // Carousels and chip rows own their horizontal swipes.
                guard !HorizontalScrollProbe.startsOnHorizontalScroller(value.startLocation) else { return }
                if dx > 0, canSwipeToMenu {
                    menuOpen = true
                } else if dx < 0, canSwipeToProfile {
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

    /// Read on the next turn of the main loop: @Published announces a change before storing it.
    private func openPendingScreen() {
        DispatchQueue.main.async {
            guard let screen = PushManager.shared.pendingScreen else { return }
            guard auth.portalReady, auth.primaryRole != nil else {
                print("[push] waiting for the portal to open \(screen.rawValue)")
                return
            }
            PushManager.shared.pendingScreen = nil
            menuOpen = false
            // a parent: the child's own screen, showing that child
            if auth.primaryRole == .parent {
                if let child = PushManager.shared.pendingChild {
                    UserDefaults.standard.set(child, forKey: "edufaso.parent.selectedChild")
                }
                PushManager.shared.pendingChild = nil
                let parentScreen = Self.parentScreen[screen] ?? screen
                print("[push] opening \(parentScreen.rawValue) child=\(UserDefaults.standard.string(forKey: "edufaso.parent.selectedChild") ?? "-")")
                openScreen(parentScreen)
                return
            }
            print("[push] opening \(screen.rawValue)")
            openScreen(screen)
        }
    }

    /// A student's screen → the same screen for one child, on the parent's side.
    private static let parentScreen: [AppScreen: AppScreen] = [
        .grades: .childNotes, .exercises: .childExercises, .exams: .childExams,
        .compositions: .childCompositions, .timetable: .childTimetable, .bulletin: .childBulletin,
        .attendance: .childAttendance, .cahier: .childCahier,
    ]

    private func closeMenu() {
        menuOpen = false
    }
}

private enum HorizontalScrollProbe {
    /// `point` is in window coordinates (SwiftUI `.global`).
    @MainActor
    static func startsOnHorizontalScroller(_ point: CGPoint) -> Bool {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
        var current = window?.hitTest(point, with: nil)
        while let view = current {
            if let scroll = view as? UIScrollView,
               scroll.isScrollEnabled,
               scroll.contentSize.width > scroll.bounds.width + 1 {
                return true
            }
            current = view.superview
        }
        return false
    }
}

struct SideDrawerView: View {
    @EnvironmentObject private var auth: AuthViewModel
    let selection: AppScreen
    var onSelect: (AppScreen) -> Void
    var onClose: () -> Void
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0

    /// A super admin belongs to no school: the school shows only in Mode support.
    private var schoolName: String? {
        if let s = auth.supportSchool, auth.inSupport { return s.name }
        if auth.primaryRole == .superAdmin { return nil }
        return auth.schools.first?.name
    }

    /// School admins appear as « Administration », never by name.
    private var displayName: String {
        if auth.primaryRole == .schoolAdmin { return "Administration" }
        return "\(auth.profile?.firstName ?? "") \(auth.profile?.lastName ?? "")".trimmingCharacters(in: .whitespaces)
    }

    private var roleLine: String {
        let role = auth.primaryRole?.label ?? ""
        guard let schoolName else { return role }
        return role.isEmpty ? schoolName : "\(role) · \(schoolName)"
    }

    private static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    private static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image("EduFasoLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 36)
                    .frame(maxWidth: 130, alignment: .leading)
                Spacer(minLength: 8)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .frame(width: 36, height: 36)
                        .background(EduTheme.sand, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .accessibilityLabel("Fermer le menu")
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 10)

            identityCard
                .padding(.horizontal, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(appNavSections(for: auth.primaryRole)) { section in
                        VStack(alignment: .leading, spacing: 6) {
                            if let title = section.title {
                                // a section title, not a link: small teal caps and a rule
                                HStack(spacing: 8) {
                                    Text(title.uppercased())
                                        .font(.system(size: 10, weight: .heavy))
                                        .tracking(1.6)
                                        .foregroundStyle(EduTheme.teal.opacity(0.85))
                                    Rectangle().fill(EduTheme.border).frame(height: 1)
                                }
                                .padding(.horizontal, 4)
                                .accessibilityAddTraits(.isHeader)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(section.screens) { screen in
                                    drawerRow(screen)
                                }
                            }
                            // the section's items hang off a thin line
                            .padding(.leading, section.title == nil ? 0 : 6)
                            .overlay(alignment: .leading) {
                                if section.title != nil { Rectangle().fill(EduTheme.border).frame(width: 1) }
                            }
                            .padding(.leading, section.title == nil ? 0 : 8)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 16)
                .padding(.bottom, 16)
            }

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
            .overlay(alignment: .top) { Rectangle().fill(EduTheme.border).frame(height: 1) }
            .background(.white)
        }
        .frame(width: 300)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(.white)
        .safeAreaPadding(.bottom, 8)
        .task { await loadBadges() }
        .overlay(alignment: .trailing) {
            Rectangle().fill(EduTheme.border).frame(width: 1)
        }
        .ignoresSafeArea(edges: .bottom)
        .shadow(color: .black.opacity(0.18), radius: 24, x: 8, y: 0)
    }

    /// Same teal card as the web sidebar: photo, name, role · school, Faso stripe; opens Profil.
    private var identityCard: some View {
        Button { onSelect(.profile) } label: {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    UserAvatarView(
                        url: auth.primaryRole == .schoolAdmin ? nil : auth.profile?.avatarUrl,
                        firstName: auth.primaryRole == .schoolAdmin ? "Administration" : auth.profile?.firstName,
                        lastName: auth.primaryRole == .schoolAdmin ? nil : auth.profile?.lastName,
                        size: 42,
                        cornerRadius: EduTheme.radius
                    )
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.3), lineWidth: 1))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(displayName.isEmpty ? "Mon compte" : displayName)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text(roleLine)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.85))
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                HStack(spacing: 0) {
                    EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen
                }
                .frame(height: 4)
            }
            .background(alignment: .topTrailing) {
                ZStack(alignment: .topTrailing) {
                    LinearGradient(colors: [Self.brand800, EduTheme.teal, Self.brand600], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Circle().fill(.white.opacity(0.07)).frame(width: 130, height: 130).offset(x: 40, y: -50)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .shadow(color: Self.brand800.opacity(0.25), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Profil : \(displayName), \(roleLine)")
    }

    private func drawerRow(_ screen: AppScreen) -> some View {
        let active = screen == selection
        let badge = badgeCount(for: screen)
        return Button {
            onSelect(screen)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: screen.systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(active ? EduTheme.teal : EduTheme.subtle)
                    .frame(width: 22)
                Text(menuTitle(screen, role: auth.primaryRole))
                    .font(.subheadline.weight(active ? .bold : .semibold))
                    .foregroundStyle(active ? EduTheme.tealDark : EduTheme.ink.opacity(0.75))
                    .lineLimit(1)
                Spacer(minLength: 0)
                if let badge, badge > 0 {
                    Text(badge > 99 ? "99+" : "\(badge)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 20, minHeight: 20)
                        .padding(.horizontal, 4)
                        .background(EduTheme.fasoRed, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(active ? EduTheme.brand50 : .clear)
            )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
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
            case .schoolAdmin: SchoolHomeView(open: open)
            case .superAdmin: PlatformHomeView(open: open)
            case .none: ProfileView()
            }
        case .profile:
            ProfileView()
        case .messages:
            MessagesView()
        case .announcements:
            MessagesView(announcementsOnly: true)
        case .adminSchools:
            PlatformSchoolsView()
        case .adminUsers:
            PlatformUsersView()
        case .adminInvites:
            PlatformInvitesView()
        case .adminReports:
            PlatformReportsView(open: open)
        case .adminBilling:
            PlatformBillingView()
        case .adminSettings:
            PlatformSettingsScreen()
        case .adminAudit:
            PlatformAuditView()
        case .adminSuperAdmins:
            PlatformSuperAdminsView()
        case .schoolConfig:
            SchoolConfigView(open: open)
        case .schoolSettings:
            SchoolSettingsView()
        case .years:
            SchoolYearsView()
        case .periods:
            SchoolPeriodsView()
        case .subjects:
            SchoolSubjectsView()
        case .classes:
            SchoolClassesView()
        case .programmes:
            SchoolProgrammeView()
        case .schoolTimetable:
            SchoolTimetableView()
        case .schoolAttendance:
            SchoolAttendanceView()
        case .schoolHomework:
            SchoolExamsView()
        case .schoolCompositions:
            SchoolCompositionsView()
        case .teacherEntry:
            SchoolTeacherEntryView()
        case .bulletins:
            SchoolBulletinsView()
        case .schoolCahier:
            SchoolCahierView()
        case .statistics:
            SchoolStatisticsView()
        case .teachers:
            SchoolTeachersView()
        case .students:
            SchoolStudentsView()
        case .parents:
            SchoolParentsView()
        case .signalements:
            SchoolSignalsView()
        case .teacherTodo:
            TeacherTodoView()
        case .teacherClasses:
            TeacherClassesView()
        case .teacherStudents:
            TeacherStudentsView()
        case .teacherAttendance:
            TeacherAppelView()
        case .timetable:
            TimetableView(mode: auth.primaryRole == .teacher ? .teacher : .student)
        case .teacherCahier:
            TeacherCahierView()
        case .teacherExercises:
            TeacherExercisesView()
        case .teacherEvaluations:
            TeacherEvaluationsView()
        case .cahier:
            CahierFeedView()
        case .grades:
            StudentGradesView()
        case .exercises:
            ExercisesBoardView()
        case .exams:
            ExamsBoardView()
        case .compositions:
            StudentCompositionsView()
        case .attendance:
            StudentAttendanceView()
        case .myTeachers:
            MyTeachersView()
        case .bulletin:
            BulletinBoard(studentId: auth.userId ?? "", title: "Mon bulletin")
        case .childNotes:
            ChildGate(title: "Notes", keepsContentOnSwitch: true) { StudentGradesView(studentIdOverride: $0.id, childName: $0.firstName ?? $0.fullName) }
        case .childAttendance:
            ChildGate(title: "Présences", keepsContentOnSwitch: true) { StudentAttendanceView(studentIdOverride: $0.id, childName: $0.firstName ?? $0.fullName) }
        case .childExams:
            ChildGate(title: "Examens", keepsContentOnSwitch: true) { ExamsBoardView(studentIdOverride: $0.id, childName: $0.firstName ?? $0.fullName) }
        case .childExercises:
            ChildGate(title: "Exercices", keepsContentOnSwitch: true) { ExercisesBoardView(studentIdOverride: $0.id, childName: $0.firstName ?? $0.fullName) }
        case .childCompositions:
            ChildGate(title: "Compositions", keepsContentOnSwitch: true) { StudentCompositionsView(studentIdOverride: $0.id, childName: $0.firstName ?? $0.fullName) }
        case .childBulletin:
            ChildGate(title: "Bulletin", keepsContentOnSwitch: true) { BulletinBoard(studentId: $0.id, title: "Bulletin", childName: $0.firstName ?? $0.fullName) }
        case .childTimetable:
            ChildGate(title: "Emploi du temps", keepsContentOnSwitch: true) { TimetableView(mode: .student, studentIdOverride: $0.id, childName: $0.firstName ?? $0.fullName) }
        case .childCahier:
            ChildGate(title: "Cahier de textes", keepsContentOnSwitch: true) { CahierFeedView(studentId: $0.id, childName: $0.firstName ?? $0.fullName) }
        }
    }
}
