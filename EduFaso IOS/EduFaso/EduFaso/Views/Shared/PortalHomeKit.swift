import SwiftUI

enum TimeGreeting {
    static func current(at date: Date = Date()) -> String {
        let hour = Calendar.current.component(.hour, from: date)
        switch hour {
        case 5..<12: return "Bonjour"
        case 12..<18: return "Bon après-midi"
        default: return "Bonsoir"
        }
    }
}

struct PortalHomeHeader: View {
    let systemImage: String
    let name: String
    let context: String
    var unreadMessages: Int = 0
    var unreadAnnouncements: Int = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: systemImage)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(
                        LinearGradient(
                            colors: [EduTheme.teal, EduTheme.navy],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                    )
                    .shadow(color: EduTheme.navy.opacity(0.22), radius: 12, y: 6)

                VStack(alignment: .leading, spacing: 2) {
                    Text("\(TimeGreeting.current()) 👋")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(EduTheme.teal)
                    Text(name.isEmpty ? "…" : name)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    Text(context)
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
            }

            if unreadMessages > 0 || unreadAnnouncements > 0 {
                HStack(spacing: 8) {
                    if unreadMessages > 0 {
                        Label(
                            "\(unreadMessages) message\(unreadMessages > 1 ? "s" : "") non lu\(unreadMessages > 1 ? "s" : "")",
                            systemImage: "envelope.fill"
                        )
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(EduTheme.navy, in: Capsule())
                        .foregroundStyle(.white)
                    }
                    if unreadAnnouncements > 0 {
                        Label(
                            "\(unreadAnnouncements) annonce\(unreadAnnouncements > 1 ? "s" : "")",
                            systemImage: "megaphone.fill"
                        )
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(EduTheme.brand50, in: Capsule())
                        .foregroundStyle(EduTheme.navy)
                    }
                }
            }
        }
    }
}

struct MetricCardView: View {
    let label: String
    let value: String
    let hint: String
    var valueColor: Color = EduTheme.ink

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased())
                .font(.caption2.weight(.semibold))
                .tracking(0.6)
                .foregroundStyle(EduTheme.muted)
            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(valueColor)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(hint)
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.05), radius: 10, y: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.black.opacity(0.04), lineWidth: 1)
        )
    }
}

struct HomePanel<Content: View>: View {
    let systemImage: String
    let title: String
    let subtitle: String
    @ViewBuilder var content: () -> Content
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: systemImage)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(EduTheme.teal)
                    .frame(width: 40, height: 40)
                    .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(EduTheme.ink)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                }
                Spacer(minLength: 0)
            }

            content()

            if let actionTitle, let action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(EduTheme.navy)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.05), radius: 10, y: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.black.opacity(0.04), lineWidth: 1)
        )
    }
}

struct HomePanelEmpty: View {
    let message: String
    var body: some View {
        Text(message)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(EduTheme.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                    .foregroundStyle(EduTheme.fieldBorder.opacity(0.7))
                    .background(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            )
    }
}

struct QuickLinkChip: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.footnote.weight(.semibold))
            Text(title)
                .font(.footnote.weight(.semibold))
                .lineLimit(1)
        }
        .foregroundStyle(EduTheme.navy)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(EduTheme.brand50, in: Capsule())
        .overlay(Capsule().stroke(EduTheme.teal.opacity(0.25), lineWidth: 1))
    }
}

struct HomeRowCard: View {
    let title: String
    var subtitle: String? = nil
    var trailing: String? = nil
    var trailingColor: Color = EduTheme.teal

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(2)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing)
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(trailingColor)
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(EduTheme.muted.opacity(0.7))
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
        )
    }
}
