import SwiftUI

/// New app version (table app_releases): « Mise à jour disponible » (required below the minimum
/// version), and « Nouveautés » once after updating. Checked at launch and when the app comes back.
@MainActor
final class ReleaseCheck: ObservableObject {
    static let shared = ReleaseCheck()

    struct Release: Decodable, Identifiable {
        var id: String { version }
        let version: String
        let title: String
        let notes: String
        let downloadUrl: String?
        let minVersion: String?
    }

    @Published var update: Release?
    @Published var required = false
    @Published var whatsNew: Release?

    static var current: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0" }
    private let seenKey = "edufaso.release.seen"
    private let snoozeKey = "edufaso.release.snoozed"
    private var lastCheck: Date?

    func check() async {
        if let lastCheck, Date().timeIntervalSince(lastCheck) < 600, update == nil { return }
        lastCheck = Date()
        guard let all: [String: Release] = try? await SupabaseManager.client.rpc("ef_latest_releases").execute().value,
              let ios = all["ios"] else { return }
        let current = Self.current
        if Self.compare(ios.version, current) > 0 {
            required = ios.minVersion.map { Self.compare(current, $0) < 0 } ?? false
            let snoozed = UserDefaults.standard.string(forKey: snoozeKey) == "\(ios.version)|\(Self.today)"
            if required || !snoozed { update = ios }
        } else if Self.compare(ios.version, current) == 0, UserDefaults.standard.string(forKey: seenKey) != current {
            whatsNew = ios
        }
    }

    func later() {
        guard let u = update, !required else { return }
        UserDefaults.standard.set("\(u.version)|\(Self.today)", forKey: snoozeKey)
        update = nil
    }

    func seen() {
        UserDefaults.standard.set(Self.current, forKey: seenKey)
        whatsNew = nil
    }

    private static var today: String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date())
    }

    /// 1.10 > 1.9.2 ; -1, 0 or 1
    static func compare(_ a: String, _ b: String) -> Int {
        let pa = a.split(separator: ".").map { Int($0) ?? 0 }, pb = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(pa.count, pb.count) {
            let d = (i < pa.count ? pa[i] : 0) - (i < pb.count ? pb[i] : 0)
            if d != 0 { return d > 0 ? 1 : -1 }
        }
        return 0
    }
}

/// « Mise à jour disponible » / « Nouveautés » card.
struct ReleaseSheet: View {
    let release: ReleaseCheck.Release
    let mode: Mode
    var onLater: () -> Void = {}
    var onDone: () -> Void = {}
    @Environment(\.openURL) private var openURL

    enum Mode { case update, required, whatsNew }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(systemName: mode == .whatsNew ? "sparkles" : "arrow.down.app.fill")
                    .font(.title2).foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                VStack(alignment: .leading, spacing: 2) {
                    Text(mode == .whatsNew ? "Nouveautés · version \(release.version)" : (mode == .required ? "Mise à jour obligatoire" : "Mise à jour disponible"))
                        .font(.caption.weight(.bold)).foregroundStyle(EduTheme.teal)
                    Text(release.title).font(.title3.weight(.bold)).foregroundStyle(EduTheme.ink)
                    if mode != .whatsNew {
                        Text("Version \(release.version) · vous avez la \(ReleaseCheck.current)").font(.caption).foregroundStyle(EduTheme.muted)
                    }
                }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(release.notes.split(separator: "\n").map { $0.trimmingCharacters(in: CharacterSet(charactersIn: "•-* ")) }.filter { !$0.isEmpty }, id: \.self) { line in
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(EduTheme.teal).frame(width: 6, height: 6).padding(.top, 7)
                            Text(line).font(.subheadline).foregroundStyle(EduTheme.ink)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if mode == .required {
                Text("Cette version n’est plus prise en charge : installez la nouvelle pour continuer.")
                    .font(.caption).foregroundStyle(Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255))
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(red: 255 / 255, green: 251 / 255, blue: 235 / 255), in: RoundedRectangle(cornerRadius: EduTheme.radius))
            }
            VStack(spacing: 8) {
                if mode == .whatsNew {
                    primary("C’est parti", icon: "checkmark") { onDone() }
                } else {
                    if let s = release.downloadUrl, let url = URL(string: s) {
                        primary("Mettre à jour", icon: "arrow.down.circle.fill") { openURL(url) }
                    } else {
                        Text("Demandez la nouvelle version à votre école.").font(.subheadline).foregroundStyle(EduTheme.muted)
                    }
                    if mode == .update {
                        Button("Plus tard") { onLater() }.font(.subheadline.weight(.semibold)).tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 40)
                    }
                }
            }
        }
        .padding(20)
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(mode == .required)
    }

    private func primary(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.headline).foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius))
        }
        .buttonStyle(.plain)
    }
}
