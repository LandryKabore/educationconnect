import SwiftUI

/// Shared light auth layout: brand gradient + white navy-top card.
struct AuthChrome<Content: View>: View {
    var showsLogo: Bool = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            EduTheme.loginBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    if showsLogo {
                        Image("EduFasoLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: 132)
                            .accessibilityLabel("EduFaso")
                            .padding(.top, 12)
                    }

                    content()
                        .padding(22)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(.white)
                                .shadow(color: Color.black.opacity(0.08), radius: 24, y: 10)
                        )
                        .overlay(alignment: .top) {
                            UnevenRoundedRectangle(
                                topLeadingRadius: 22,
                                bottomLeadingRadius: 0,
                                bottomTrailingRadius: 0,
                                topTrailingRadius: 22,
                                style: .continuous
                            )
                            .fill(EduTheme.navy)
                            .frame(height: 4)
                        }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 36)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .preferredColorScheme(.light)
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
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
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
                .tint(EduTheme.navy)
                .focused($focused)
                .submitLabel(submitLabel)
                .onSubmit { onSubmit?() }

                if isSecure && showSecureToggle {
                    Button {
                        reveal.toggle()
                    } label: {
                        Image(systemName: reveal ? "eye.slash" : "eye")
                            .font(.body.weight(.medium))
                            .foregroundStyle(EduTheme.muted)
                            .frame(width: 28, height: 28)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(EduTheme.fieldBorder.opacity(0.85), lineWidth: 1)
                    )
            )
        }
    }
}

struct AuthPrimaryButton: View {
    let title: String
    var busy: Bool = false
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if busy { ProgressView().tint(.white) }
                Text(busy ? "Enregistrement…" : title)
                    .font(.body.weight(.bold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background((enabled && !busy) ? EduTheme.navy : EduTheme.navy.opacity(0.45))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .disabled(!enabled || busy)
    }
}
