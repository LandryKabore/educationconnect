import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var deepLinks: DeepLinkCenter
    @ObservedObject private var release = ReleaseCheck.shared
    @Environment(\.scenePhase) private var scenePhase

    /// One continuous opening screen through auth + first portal load.
    private var showOpening: Bool {
        if auth.loading { return true }
        guard auth.session != nil else { return false }
        if auth.needsPasswordChange || auth.needsProfileCompletion { return false }
        return !auth.portalReady
    }

    private var routeKey: String {
        if showOpening { return "opening" }
        if auth.session == nil { return "login" }
        if auth.needsPasswordChange { return "password" }
        if auth.needsProfileCompletion { return "profile" }
        return "main-\(auth.primaryRole?.rawValue ?? "none")"
    }

    var body: some View {
        ZStack {
            Group {
                if auth.loading {
                    Color.clear
                } else if auth.session == nil {
                    LoginView()
                } else if auth.needsPasswordChange {
                    FirstLoginView()
                } else if auth.needsProfileCompletion {
                    CompleteProfileView()
                } else {
                    RoleShellView()
                }
            }

            if showOpening {
                OpeningScreen()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .animation(.easeOut(duration: 0.22), value: routeKey)
        // new version: « Mise à jour disponible » / « Nouveautés »
        .task { await release.check() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await release.check() } } }
        .sheet(item: Binding(get: { release.required ? nil : release.update }, set: { if $0 == nil { release.later() } })) { r in
            ReleaseSheet(release: r, mode: .update, onLater: { release.later() })
        }
        .fullScreenCover(item: Binding(get: { release.required ? release.update : nil }, set: { _ in })) { r in
            ReleaseSheet(release: r, mode: .required).background(EduTheme.page.ignoresSafeArea())
        }
        .sheet(item: Binding(get: { release.update == nil ? release.whatsNew : nil }, set: { if $0 == nil { release.seen() } })) { r in
            ReleaseSheet(release: r, mode: .whatsNew, onDone: { release.seen() })
        }
        .sheet(item: $deepLinks.verifyRequest) { request in
            NavigationStack {
                VerifyDocumentView(initialCode: request.code)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Fermer") { deepLinks.verifyRequest = nil }
                        }
                    }
            }
            .preferredColorScheme(.light)
        }
    }
}
