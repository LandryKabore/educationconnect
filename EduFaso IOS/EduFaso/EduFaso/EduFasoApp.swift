import SwiftUI

@main
struct EduFasoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthViewModel()
    @StateObject private var deepLinks = DeepLinkCenter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(deepLinks)
                .tint(EduTheme.teal)
                .onOpenURL { deepLinks.handle($0) }
        }
    }
}
