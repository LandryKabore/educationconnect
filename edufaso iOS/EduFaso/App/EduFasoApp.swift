import SwiftUI

@main
struct EduFasoApp: App {
  @State private var auth = AuthStore()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(auth)
        .tint(Brand.teal)
        .onAppear { auth.start() }
    }
  }
}
