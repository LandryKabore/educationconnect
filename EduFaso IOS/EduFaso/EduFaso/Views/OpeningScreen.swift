import SwiftUI

/// Branded opening + loading screen (auth session and first portal load).
struct OpeningScreen: View {
    var body: some View {
        ZStack {
            background

            VStack(spacing: 0) {
                Spacer(minLength: 0)

                VStack(spacing: 20) {
                    Image("EduFasoMark")
                        .resizable()
                        .interpolation(.high)
                        .scaledToFit()
                        .frame(maxWidth: 180)

                    VStack(spacing: 8) {
                        HStack(spacing: 0) {
                            Text("Edu")
                                .foregroundStyle(EduTheme.navy)
                            Text("Faso")
                                .foregroundStyle(EduTheme.fasoRed)
                        }
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .tracking(-0.4)

                        Text("Système de gestion scolaire")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(EduTheme.muted)
                    }
                }

                Spacer(minLength: 0)

                ProgressView()
                    .controlSize(.regular)
                    .tint(EduTheme.navy.opacity(0.55))
                    .padding(.bottom, 40)
            }
            .padding(.horizontal, 28)
        }
        .ignoresSafeArea()
        .preferredColorScheme(.light)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("EduFaso, chargement")
    }

    private var background: some View {
        LinearGradient(
            colors: [
                Color(red: 236 / 255, green: 246 / 255, blue: 253 / 255),
                Color(red: 220 / 255, green: 236 / 255, blue: 250 / 255),
                Color(red: 245 / 255, green: 247 / 255, blue: 250 / 255)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}
