import SwiftUI

/// Shared face: remote photo or initials on the brand gradient.
struct UserAvatarView: View {
    var url: String?
    var firstName: String?
    var lastName: String?
    var size: CGFloat = 64
    var preview: UIImage? = nil
    var showCameraBadge: Bool = false
    var busy: Bool = false

    private var initials: String {
        let f = firstName?.trimmingCharacters(in: .whitespaces).prefix(1) ?? ""
        let l = lastName?.trimmingCharacters(in: .whitespaces).prefix(1) ?? ""
        let s = "\(f)\(l)".uppercased()
        return s.isEmpty ? "?" : s
    }

    private var fontSize: CGFloat {
        size >= 88 ? 28 : size >= 48 ? 18 : 12
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let preview {
                    Image(uiImage: preview)
                        .resizable()
                        .scaledToFill()
                } else if let url, let parsed = URL(string: url) {
                    AsyncImage(url: parsed) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        case .failure:
                            initialsView
                        case .empty:
                            ZStack {
                                initialsView
                                ProgressView().tint(.white.opacity(0.85))
                            }
                        @unknown default:
                            initialsView
                        }
                    }
                } else {
                    initialsView
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(
                Circle()
                    .strokeBorder(Color.white.opacity(0.85), lineWidth: size >= 72 ? 3 : 1.5)
            )
            .shadow(color: EduTheme.navy.opacity(0.12), radius: size >= 72 ? 10 : 4, y: 3)

            if busy {
                Circle()
                    .fill(.black.opacity(0.4))
                    .frame(width: size, height: size)
                    .overlay(ProgressView().tint(.white))
            }

            if showCameraBadge && !busy {
                Image(systemName: "camera.fill")
                    .font(.system(size: max(10, size * 0.14), weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: max(22, size * 0.28), height: max(22, size * 0.28))
                    .background(EduTheme.teal, in: Circle())
                    .overlay(Circle().strokeBorder(.white, lineWidth: 2))
                    .offset(x: 2, y: 2)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Photo de profil")
    }

    private var initialsView: some View {
        Text(initials)
            .font(.system(size: fontSize, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                LinearGradient(
                    colors: [EduTheme.teal, EduTheme.navy],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
    }
}
