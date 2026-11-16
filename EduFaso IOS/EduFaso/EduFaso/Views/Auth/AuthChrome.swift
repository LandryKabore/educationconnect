import SwiftUI

/// Shared sign-in layout: flat page, small logo, one white bordered card.
struct AuthChrome<Content: View>: View {
    var showsLogo: Bool = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            EduTheme.page.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if showsLogo {
                        AuthBrand()
                            .padding(.top, 8)
                    }

                    content()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .eduSurface(padding: 20)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 36)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .preferredColorScheme(.light)
    }
}

/// Logo, left aligned, with the flag line under it.
struct AuthBrand: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image("EduFasoLogo")
                .resizable()
                .scaledToFit()
                .frame(height: 40)
                .accessibilityLabel("EduFaso")
            EduFlagStripe(width: 18)
        }
    }
}

struct AuthTextField: View {
    let title: String
    var placeholder: String = ""
    @Binding var text: String
    var isSecure: Bool = false
    var showSecureToggle: Bool = false
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var submitLabel: SubmitLabel = .next
    var onSubmit: (() -> Void)?

    @State private var reveal = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(EduTheme.ink)

            HStack(spacing: 10) {
                Group {
                    if isSecure && !reveal {
                        SecureField(placeholder.isEmpty ? title : placeholder, text: $text)
                    } else {
                        TextField(placeholder.isEmpty ? title : placeholder, text: $text)
                    }
                }
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .emailAddress ? .never : .sentences)
                .autocorrectionDisabled(keyboard == .emailAddress || isSecure)
                .textContentType(contentType)
                .foregroundStyle(EduTheme.ink)
                .tint(EduTheme.accent)
                .focused($focused)
                .submitLabel(submitLabel)
                .onSubmit { onSubmit?() }

                if isSecure && showSecureToggle {
                    Button {
                        reveal.toggle()
                    } label: {
                        Image(systemName: reveal ? "eye.slash" : "eye")
                            .foregroundStyle(EduTheme.subtle)
                            .frame(width: 28, height: 28)
                    }
                    .accessibilityLabel(reveal ? "Masquer le mot de passe" : "Afficher le mot de passe")
                }
            }
            .modifier(AuthFieldBox(focused: focused))
        }
    }
}

/// White field with a thin border that turns teal while typing.
struct AuthFieldBox: ViewModifier {
    var focused: Bool
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(focused ? EduTheme.accent : EduTheme.borderStrong, lineWidth: 1)
            )
            .animation(.easeOut(duration: 0.15), value: focused)
    }
}

struct AuthPrimaryButton: View {
    let title: String
    var busyTitle: String = "Enregistrement…"
    var busy: Bool = false
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if busy { ProgressView().tint(.white) }
                Text(busy ? busyTitle : title)
                    .font(.body.weight(.medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill((enabled && !busy) ? EduTheme.accent : EduTheme.accent.opacity(0.4))
            )
            .foregroundStyle(.white)
        }
        .disabled(!enabled || busy)
    }
}
