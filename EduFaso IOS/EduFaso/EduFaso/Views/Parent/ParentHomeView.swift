import SwiftUI

struct ParentHomeView: View {
    var title: String = "Accueil"
    @EnvironmentObject private var auth: AuthViewModel
    @State private var children: [ChildSummary] = []
    @State private var selected: ChildSummary?
    @State private var unreadMessages = 0
    @State private var unreadAnnouncements = 0
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?

    var body: some View {
        Group {
            if !ready {
                Color.clear
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        PortalHomeHeader(
                            systemImage: "figure.and.child.holdinghands",
                            name: auth.profile?.fullName ?? auth.profile?.firstName ?? "",
                            context: children.isEmpty
                                ? (auth.schools.first?.name ?? "Espace parent")
                                : "\(children.count) enfant\(children.count > 1 ? "s" : "") suivi\(children.count > 1 ? "s" : "")",
                            unreadMessages: unreadMessages,
                            unreadAnnouncements: unreadAnnouncements
                        )

                        if let error {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(EduTheme.fasoRed)
                        }

                        HomePanel(
                            systemImage: "person.2.fill",
                            title: "Mes enfants",
                            subtitle: "Suivi scolaire au quotidien",
                            content: {
                                if children.isEmpty {
                                    HomePanelEmpty(message: "Aucun enfant lié à ce compte pour le moment.")
                                } else {
                                    VStack(spacing: 10) {
                                        ForEach(children) { child in
                                            Button {
                                                selected = child
                                            } label: {
                                                HStack(spacing: 12) {
                                                    Text(initials(child.fullName))
                                                        .font(.subheadline.weight(.bold))
                                                        .foregroundStyle(.white)
                                                        .frame(width: 44, height: 44)
                                                        .background(EduTheme.navy, in: Circle())

                                                    VStack(alignment: .leading, spacing: 2) {
                                                        Text(child.fullName)
                                                            .font(.subheadline.weight(.semibold))
                                                            .foregroundStyle(EduTheme.ink)
                                                        Text(child.className ?? "Classe non renseignée")
                                                            .font(.caption)
                                                            .foregroundStyle(EduTheme.muted)
                                                    }
                                                    Spacer(minLength: 0)
                                                    Image(systemName: "chevron.right")
                                                        .font(.caption.weight(.semibold))
                                                        .foregroundStyle(EduTheme.muted)
                                                }
                                                .padding(12)
                                                .background(
                                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                        .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                                                )
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                        )

                        if let first = children.first {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Accès rapide · \(first.fullName.split(separator: " ").first.map(String.init) ?? "enfant")")
                                    .font(.headline)
                                    .foregroundStyle(EduTheme.ink)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        NavigationLink {
                                            StudentGradesView(studentIdOverride: first.id)
                                        } label: {
                                            QuickLinkChip(title: "Notes", systemImage: "book")
                                        }
                                        NavigationLink {
                                            StudentAttendanceView(studentIdOverride: first.id)
                                        } label: {
                                            QuickLinkChip(title: "Présences", systemImage: "checkmark.circle")
                                        }
                                        NavigationLink {
                                            EvaluationsBrowser(studentId: first.id, type: "examen", confirmedOnly: true, title: "Devoirs")
                                        } label: {
                                            QuickLinkChip(title: "Devoirs", systemImage: "doc.text")
                                        }
                                        NavigationLink {
                                            BulletinBoard(studentId: first.id, title: "Bulletin")
                                        } label: {
                                            QuickLinkChip(title: "Bulletin", systemImage: "chart.bar.doc.horizontal")
                                        }
                                        NavigationLink {
                                            TimetableView(mode: .student, studentIdOverride: first.id)
                                        } label: {
                                            QuickLinkChip(title: "Emploi du temps", systemImage: "calendar")
                                        }
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
        .navigationDestination(item: $selected) { child in
            ChildDetailView(child: child)
        }
        .preferredColorScheme(.light)
        .task { await load(isRefresh: false) }
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    private func load(isRefresh: Bool) async {
        if !isRefresh && !ready { loading = true }
        let api = EduAPI()
        do {
            async let childrenTask = api.fetchChildren()
            if let uid = auth.userId {
                async let inboxTask = api.fetchInbox(userId: uid, kind: .all, limit: 80)
                let inbox = try await inboxTask
                unreadMessages = inbox.filter { $0.readAt == nil && ($0.isAnnouncement != true) }.count
                unreadAnnouncements = inbox.filter { $0.readAt == nil && ($0.isAnnouncement == true) }.count
            }
            children = try await childrenTask
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
        ready = true
        auth.markPortalReady()
    }
}

struct ChildDetailView: View {
    let child: ChildSummary

    var body: some View {
        PremiumScreenChrome {
            List {
                Section {
                    HStack(spacing: 12) {
                        Text(initials(child.fullName))
                            .font(.headline.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 48, height: 48)
                            .background(EduTheme.navy, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(child.fullName).font(.headline).foregroundStyle(EduTheme.ink)
                            Text(child.className ?? "Classe non renseignée")
                                .font(.caption)
                                .foregroundStyle(EduTheme.muted)
                        }
                    }
                    .listRowBackground(EduTheme.brand50)
                }

                Section("Vie scolaire") {
                    NavigationLink("Notes") { StudentGradesView(studentIdOverride: child.id) }
                    NavigationLink("Présences") { StudentAttendanceView(studentIdOverride: child.id) }
                    NavigationLink("Devoirs") {
                        EvaluationsBrowser(studentId: child.id, type: "examen", confirmedOnly: true, title: "Devoirs")
                    }
                    NavigationLink("Exercices de maison") {
                        EvaluationsBrowser(studentId: child.id, type: "devoir", title: "Exercices")
                    }
                    NavigationLink("Compositions") {
                        StudentCompositionsView(studentIdOverride: child.id)
                    }
                    NavigationLink("Bulletin") { BulletinBoard(studentId: child.id) }
                    NavigationLink("Emploi du temps") {
                        TimetableView(mode: .student, studentIdOverride: child.id)
                    }
                    NavigationLink("Cahier de textes") { CahierFeedView(studentId: child.id) }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .premiumTitle(child.fullName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}
