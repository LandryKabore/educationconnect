import SwiftUI

struct RootView: View {
  @Environment(AuthStore.self) private var auth

  var body: some View {
    Group {
      if !auth.bootstrapped || (auth.loading && auth.session == nil && auth.profile == nil) {
        LaunchView()
      } else if auth.session == nil {
        LoginView()
      } else if auth.profile?.mustChangePassword == true {
        ChangePasswordView()
      } else if ProfileCompletion.needsCompletion(profile: auth.profile, role: auth.primaryRole) {
        CompleteProfileView()
      } else {
        switch auth.primaryRole {
        case .student:
          StudentTabView()
        case .parent:
          ParentTabView()
        case .teacher:
          TeacherTabView()
        case .schoolAdmin, .superAdmin:
          AdminPlaceholderView()
        case .none:
          NoRoleView()
        }
      }
    }
    .animation(.easeInOut(duration: 0.2), value: auth.session?.user.id)
  }
}

private struct LaunchView: View {
  var body: some View {
    ZStack {
      Brand.teal.ignoresSafeArea()
      VStack(spacing: 16) {
        Image("BrandLogo")
          .resizable()
          .scaledToFit()
          .frame(width: 120)
        ProgressView()
          .tint(.white)
      }
    }
  }
}

private struct NoRoleView: View {
  @Environment(AuthStore.self) private var auth

  var body: some View {
    ContentUnavailableView {
      Label("Aucun rôle", systemImage: "person.crop.circle.badge.exclamationmark")
    } description: {
      Text("Votre compte n’a pas encore de rôle actif. Contactez votre école.")
    } actions: {
      Button("Se déconnecter", role: .destructive) {
        Task { await auth.signOut() }
      }
    }
  }
}

struct AdminPlaceholderView: View {
  @Environment(AuthStore.self) private var auth

  var body: some View {
    NavigationStack {
      VStack(spacing: 20) {
        Image(systemName: "laptopcomputer")
          .font(.system(size: 48))
          .foregroundStyle(Brand.teal)
        Text("Espace administration")
          .font(.title2.bold())
        Text(
          "L’app iOS native couvre pour l’instant les rôles élève, parent et enseignant. Les consoles admin restent sur le web."
        )
        .multilineTextAlignment(.center)
        .foregroundStyle(Brand.muted)
        .padding(.horizontal)

        if let school = auth.currentSchool {
          Text(school.name)
            .font(.headline)
        }

        Button("Se déconnecter", role: .destructive) {
          Task { await auth.signOut() }
        }
        .buttonStyle(.bordered)
      }
      .padding()
      .navigationTitle(Brand.name)
    }
  }
}
