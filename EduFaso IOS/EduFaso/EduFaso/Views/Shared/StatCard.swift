import SwiftUI

struct StatCard: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
            Text(value)
                .font(.title2.bold())
                .foregroundStyle(EduTheme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
    }
}

struct EmptyState: View {
    let text: String
    var body: some View {
        ContentUnavailableView(text, systemImage: "tray", description: Text("Aucune donnée pour le moment."))
    }
}

struct LoadingBlock: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(EduTheme.navy)
                .scaleEffect(1.1)
            Text("Chargement…")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(EduTheme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(EduTheme.loginBackground.ignoresSafeArea())
    }
}
