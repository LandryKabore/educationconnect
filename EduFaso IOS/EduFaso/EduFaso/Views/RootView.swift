import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var deepLinks: DeepLinkCenter

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
