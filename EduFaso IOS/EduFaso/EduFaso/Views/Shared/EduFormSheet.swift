import SwiftUI

/// The app's modal form, like the web modals: a teal banner with the title (Faso stripe), square
/// white field cards on the page background, « Annuler » at the top, and one solid teal button
/// at the bottom.
struct EduFormSheet<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    let primary: String
    var primaryDisabled: Bool = false
    /// While saving: the buttons are disabled and a spinner shows.
    var busy: Bool = false
    var destructive: Bool = false
    var cancelTitle: String = "Annuler"
    let onPrimary: () -> Void
    @ViewBuilder var content: Content

    @Environment(\.dismiss) private var dismiss
    private typealias H = TeacherHomeView

    var body: some View {
        NavigationStack {
            // A grouped list (not a Form): its rows stay square, drawn as white cards inset from the edges.
            List {
                Section {
                    banner
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
                Group { content }
                    .listRowBackground(
                        Rectangle().fill(.white)
                            .overlay(alignment: .bottom) { Rectangle().fill(EduTheme.border).frame(height: 0.5).padding(.horizontal, 16) }
                            .padding(.horizontal, 16)
                    )
                    .listRowInsets(EdgeInsets(top: 10, leading: 32, bottom: 10, trailing: 32))
                    .listRowSeparator(.hidden)
            }
            .listStyle(.grouped)
            .scrollContentBackground(.hidden)
            .background(EduTheme.page.ignoresSafeArea())
            .environment(\.defaultMinListRowHeight, 46)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(cancelTitle) { dismiss() }.disabled(busy)
                }
            }
            .safeAreaInset(edge: .bottom) { footer }
        }
        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
    }

    private var banner: some View { EduSheetBanner(title: title, subtitle: subtitle) }

    private var footer: some View {
        Button(action: onPrimary) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(.white) }
                Text(primary).lineLimit(1).minimumScaleFactor(0.8)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(destructive ? EduTheme.fasoRed : EduTheme.teal,
                        in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .opacity(primaryDisabled || busy ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(primaryDisabled || busy)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }
}

/// Like the web ConfirmPasswordDialog: a destructive action is confirmed with the admin password,
/// in the app's modal style. The typed password is handed to `password` before `action` runs
/// (the action checks it).
struct PasswordConfirmModifier<Item: Identifiable>: ViewModifier {
    @Binding var item: Item?
    @Binding var password: String
    let title: (Item) -> String
    let message: String
    let confirm: String
    let action: (Item) async -> Void

    func body(content: Content) -> some View {
        content.sheet(item: $item) { it in
            PasswordConfirmSheet(title: title(it), message: message, confirm: confirm) { typed in
                password = typed
                item = nil
                Task { await action(it) }
            }
        }
    }
}

private struct PasswordConfirmSheet: View {
    let title: String
    let message: String
    let confirm: String
    var onConfirm: (String) -> Void
    @State private var typed = ""

    var body: some View {
        EduFormSheet(title: title, primary: confirm, primaryDisabled: typed.isEmpty, destructive: true, onPrimary: { onConfirm(typed) }) {
            Section {
                Text(message).font(.subheadline).foregroundStyle(EduTheme.muted)
            }
            Section("Mot de passe administrateur") {
                SecureField("Mot de passe", text: $typed)
                    .textContentType(.password)
                    .submitLabel(.done)
                    .onSubmit { if !typed.isEmpty { onConfirm(typed) } }
            }
        }
        .presentationDetents([.medium])
    }
}

extension View {
    func passwordConfirm<Item: Identifiable>(item: Binding<Item?>, password: Binding<String>, title: @escaping (Item) -> String,
                                            message: String, confirm: String, action: @escaping (Item) async -> Void) -> some View {
        modifier(PasswordConfirmModifier(item: item, password: password, title: title, message: message, confirm: confirm, action: action))
    }
}

/// The teal banner at the top of every modal (title, optional subtitle, Faso stripe).
struct EduSheetBanner: View {
    let title: String
    var subtitle: String? = nil
    private typealias H = TeacherHomeView

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }
                .frame(height: 4)
                .accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }
}

/// A message in the app's modal style (replaces the system alerts): title, text, and an
/// optional « Copier » for credentials or links.
struct EduNotice: Identifiable, Equatable {
    let title: String
    let message: String
    var copy: String? = nil
    var id: String { title + "\u{1}" + message }
}

extension View {
    func eduNotice(_ notice: Binding<EduNotice?>) -> some View {
        sheet(item: notice) { n in
            EduFormSheet(title: n.title, primary: n.copy == nil ? "OK" : "Copier", cancelTitle: "Fermer", onPrimary: {
                if let c = n.copy { UIPasteboard.general.string = c }
                notice.wrappedValue = nil
            }) {
                Text(n.message).font(.subheadline).foregroundStyle(EduTheme.ink).textSelection(.enabled)
            }
            .presentationDetents([.medium])
        }
    }

    /// A confirmation in the app's modal style (replaces the system alerts and action sheets).
    func eduConfirm(isPresented: Binding<Bool>, title: String, message: String? = nil, confirm: String,
                    destructive: Bool = true, action: @escaping () -> Void) -> some View {
        sheet(isPresented: isPresented) {
            EduFormSheet(title: title, primary: confirm, destructive: destructive, onPrimary: {
                action() // reads the item before the binding clears it
                isPresented.wrappedValue = false
            }) {
                if let message { Text(message).font(.subheadline).foregroundStyle(EduTheme.ink) }
            }
            .presentationDetents([.medium])
        }
    }
}
