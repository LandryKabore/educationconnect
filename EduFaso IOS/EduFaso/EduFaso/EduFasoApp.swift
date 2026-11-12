import SwiftUI

@main
struct EduFasoApp: App {
    @StateObject private var auth = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .tint(EduTheme.teal)
        }
    }
}
