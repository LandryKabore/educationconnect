import SwiftUI

/// Shared chrome for list / detail screens after Accueil.
struct PremiumScreenChrome<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .scrollContentBackground(.hidden)
            .background(EduTheme.loginBackground.ignoresSafeArea())
            .preferredColorScheme(.light)
            .tint(EduTheme.navy)
    }
}

struct PremiumCardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .listRowBackground(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.white)
                    .padding(.vertical, 2)
            )
    }
}

extension View {
    func premiumCardRow() -> some View {
        modifier(PremiumCardBackground())
    }
}

struct PremiumNavTitle: ViewModifier {
    let title: String
    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}

extension View {
    func premiumTitle(_ title: String) -> some View {
        modifier(PremiumNavTitle(title: title))
    }
}

struct PremiumEmpty: View {
    let title: String
    var systemImage: String = "tray"
    var message: String = "Aucune donnée pour le moment."

    var body: some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text(message))
            .foregroundStyle(EduTheme.muted)
    }
}

struct PremiumListRow<Leading: View, Trailing: View>: View {
    @ViewBuilder var leading: () -> Leading
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            leading()
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.vertical, 6)
        .listRowBackground(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.white)
                .padding(.vertical, 3)
        )
    }
}

extension View {
    func premiumListStyle() -> some View {
        self
            .listStyle(.plain)
            .listRowSeparator(.hidden)
            .scrollContentBackground(.hidden)
    }
}

/// Same trimester control as Mon bulletin (iOS segmented / liquid-glass pill).
struct EduPeriodSegmentPicker<Value: Hashable>: View {
    let options: [(value: Value, title: String)]
    @Binding var selection: Value

    init(options: [(Value, String)], selection: Binding<Value>) {
        self.options = options.map { (value: $0.0, title: $0.1) }
        self._selection = selection
    }

    var body: some View {
        Picker("", selection: $selection) {
            ForEach(options, id: \.value) { option in
                Text(option.title).tag(option.value)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
    }
}
