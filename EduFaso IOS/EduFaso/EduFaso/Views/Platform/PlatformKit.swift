import SwiftUI
import Supabase

/// Shared pieces of the super admin screens: the teal banner, white panels, list rows,
/// status chips, the audit log and date helpers.
enum Platform {
    typealias H = TeacherHomeView
    static let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)
    static let rose100 = Color(red: 255 / 255, green: 228 / 255, blue: 230 / 255)
    static let sky = Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)
    static let sky100 = Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255)

    /// Like the web logAudit: one row in audit_logs for the signed-in user.
    static func audit(_ action: String, entityType: String? = nil, entityId: String? = nil, details: [String: AnyJSON] = [:]) async {
        guard let uid = try? await SupabaseManager.client.auth.session.user.id.uuidString.lowercased() else { return }
        struct Row: Encodable {
            let actor_id: String; let action: String; let entity_type: String?; let entity_id: String?; let details: [String: AnyJSON]
        }
        _ = try? await SupabaseManager.client.from("audit_logs")
            .insert(Row(actor_id: uid, action: action, entity_type: entityType, entity_id: entityId, details: details)).execute()
    }

    static func date(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: iso) { return d }
        return EduDates.parseDay(String(iso.prefix(10)))
    }

    static func relative(_ iso: String) -> String {
        guard let d = date(iso) else { return "" }
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.unitsStyle = .full
        return f.localizedString(for: d, relativeTo: Date())
    }

    static func format(_ iso: String?, _ pattern: String = "d MMM yyyy") -> String {
        guard let iso, let d = date(iso) else { return "—" }
        return TeacherExercisesView.format(d, pattern)
    }

    static func typeLabel(_ t: String?) -> String? { SchoolSettingsView.types.first { $0.0 == t }?.1 }

    static func normalized(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
    }

    static func inviteSite() async -> String {
        let site = (try? await EduAPI().fetchPlatformSettings())??.inviteSiteUrl ?? "https://edufaso.lovable.app"
        return site.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}

/// The teal banner on top of every super admin screen (title, subtitle, help, extra content).
struct PlatformBanner<Extra: View>: View {
    let title: String
    let subtitle: String
    var onHelp: () -> Void
    var helpId: String
    @ViewBuilder var extra: Extra

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title).font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                        Text(subtitle).font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true, action: onHelp).coachMarkTarget(helpId)
                }
                extra
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [Platform.H.brand800, EduTheme.teal, Platform.H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }
}

extension PlatformBanner where Extra == EmptyView {
    init(title: String, subtitle: String, onHelp: @escaping () -> Void, helpId: String) {
        self.init(title: title, subtitle: subtitle, onHelp: onHelp, helpId: helpId) { EmptyView() }
    }
}

/// A figure on the teal banner.
struct PlatformBannerStat: View {
    let label: String
    let value: String
    var hint: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.6)
                .foregroundStyle(.white.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.8)
            Text(value).font(.title3.weight(.bold).monospacedDigit()).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.7)
            if let hint { Text(hint).font(.caption2).foregroundStyle(.white.opacity(0.85)).lineLimit(1).minimumScaleFactor(0.8) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }
}

/// White panel with an icon header.
struct PlatformPanel<Content: View>: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var count: Int? = nil
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                    .frame(width: 36, height: 36)
                    .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(EduTheme.ink)
                    if let subtitle { Text(subtitle).font(.caption).foregroundStyle(EduTheme.muted).fixedSize(horizontal: false, vertical: true) }
                }
                Spacer(minLength: 0)
                if let count {
                    Text("\(count)").font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(EduTheme.teal)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
            }
            content
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }
}

/// Grey tile row inside a panel.
struct PlatformRow<Trailing: View>: View {
    let title: String
    var subtitle: String? = nil
    var chevron = true
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).lineLimit(1)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(2)
                }
            }
            Spacer(minLength: 6)
            trailing
            if chevron { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.muted) }
        }
        .padding(10)
        .background(Platform.H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .contentShape(Rectangle())
    }
}

extension PlatformRow where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, chevron: Bool = true) {
        self.init(title: title, subtitle: subtitle, chevron: chevron) { EmptyView() }
    }
}

struct PlatformChip: View {
    let text: String
    var fg: Color = EduTheme.teal
    var bg: Color = EduTheme.brand50
    var body: some View {
        Text(text).font(.caption.weight(.bold)).foregroundStyle(fg).lineLimit(1)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    static func active(_ on: Bool) -> PlatformChip {
        on ? PlatformChip(text: "Active", fg: Platform.H.emerald, bg: Platform.H.emerald50)
           : PlatformChip(text: "Inactive", fg: Platform.rose, bg: Platform.rose100)
    }
}

struct PlatformEmpty: View {
    let text: String
    var body: some View {
        Text(text).font(.subheadline).foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Platform.H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }
}

/// Solid teal (or outlined) square button.
struct PlatformButton: View {
    let title: String
    var icon: String? = nil
    var outline = false
    var danger = false
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if busy { ProgressView().tint(outline ? EduTheme.teal : .white) }
                else if let icon { Image(systemName: icon) }
                Text(title).lineLimit(1).minimumScaleFactor(0.8)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(outline ? (danger ? EduTheme.fasoRed : EduTheme.ink) : .white)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(outline ? Color.white : (danger ? EduTheme.fasoRed : EduTheme.teal),
                        in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .stroke(outline ? (danger ? EduTheme.fasoRed.opacity(0.4) : EduTheme.borderStrong) : .clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }
}

/// Segmented filter chips (horizontal scroll), with counts.
struct PlatformFilterBar: View {
    let options: [(key: String, label: String, count: Int?)]
    @Binding var selection: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(options, id: \.key) { o in
                    let on = selection == o.key
                    Button { selection = o.key } label: {
                        HStack(spacing: 5) {
                            Text(o.label)
                            if let c = o.count { Text("\(c)").monospacedDigit().foregroundStyle(on ? .white.opacity(0.75) : EduTheme.muted) }
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(on ? .white : EduTheme.ink)
                        .padding(.horizontal, 12).frame(minHeight: 34)
                        .background(on ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(on ? .clear : EduTheme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct PlatformSearchField: View {
    let placeholder: String
    @Binding var text: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(EduTheme.muted)
            TextField(placeholder, text: $text).textInputAutocapitalization(.never).autocorrectionDisabled()
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(EduTheme.muted) }.buttonStyle(.plain)
            }
        }
        .font(.subheadline)
        .padding(.horizontal, 12).frame(minHeight: 42)
        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
    }
}

/// Wraps a super admin screen: page background, scroll, tour, refresh.
struct PlatformScreen<Content: View>: View {
    let title: String
    let tour: TabTour
    let coach: CoachMarkRegistry
    let ready: Bool
    var onRefresh: (() async -> Void)? = nil
    @ViewBuilder var content: Content

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) { content }
                        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await onRefresh?() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
    }
}
