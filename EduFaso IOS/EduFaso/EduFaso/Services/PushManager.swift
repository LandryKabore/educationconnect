import SwiftUI
import UIKit
import UserNotifications
import Supabase

/// Push notifications: asks permission, registers this iPhone on the account
/// (ef_register_push_token) and opens the right screen when a notification is tapped.
@MainActor
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    /// Screen to open after a tap (RoleShellView opens it, then clears it).
    @Published var pendingScreen: AppScreen?
    @Published private(set) var status: UNAuthorizationStatus = .notDetermined

    private var token: String?

    private static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    /// Asks once (iOS shows the question only the first time), then registers the phone.
    func requestAndRegister() async {
        let center = UNUserNotificationCenter.current()
        var settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            settings = await center.notificationSettings()
        }
        status = settings.authorizationStatus
        if status == .authorized || status == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func refreshStatus() async {
        status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    func didRegister(_ deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        token = hex
        Task { await upload() }
    }

    private func upload() async {
        guard let token, SupabaseManager.client.auth.currentSession != nil else { return }
        _ = try? await SupabaseManager.client
            .rpc("ef_register_push_token", params: ["p_token": token, "p_environment": Self.environment])
            .execute()
    }

    /// Before signing out: this phone stops receiving the account's notifications.
    func unregister() async {
        guard let token else { return }
        _ = try? await SupabaseManager.client.rpc("ef_unregister_push_token", params: ["p_token": token]).execute()
    }

    /// Screen of each kind, used when the payload's screen is missing or unknown to this build.
    private static let screenOfKind: [String: AppScreen] = [
        "note": .grades, "exercice": .exercises, "rappel": .exercises,
        "evaluation": .compositions, "composition": .compositions,
        "edt": .timetable, "matin": .timetable, "bulletin": .bulletin,
        "message": .messages, "annonce": .announcements, "absence": .attendance,
        "confirmation": .teacherEvaluations, "saisie": .teacherEvaluations, "appel": .teacherAttendance,
        "aconfirmer": .schoolHomework, "bilan": .schoolAttendance, "periode": .bulletins, "signalement": .signalements,
        "classe": .classSpace, "moderation": .schoolClassSpace,
    ]

    func open(_ userInfo: [AnyHashable: Any]) {
        let raw = userInfo["screen"] as? String
        let kind = userInfo["kind"] as? String
        let refs = userInfo["refs"] as? [String] ?? []
        // a parent's notification: which child it is about
        pendingChild = userInfo["child"] as? String
        // the account it was sent to, and the portal it belongs to
        pendingFor = userInfo["for"] as? String
        pendingPortal = Self.portal(kind: kind, child: pendingChild, refs: refs)
        print("[push] tapped screen=\(raw ?? "nil") kind=\(kind ?? "nil") refs=\(refs)")
        // an évaluation is shown with its exact date on Examens
        let override: AppScreen? = kind == "evaluation" ? .exams : nil
        if let screen = override ?? raw.flatMap(AppScreen.init(rawValue:)) ?? (raw == "notes" ? .grades : nil) ?? kind.flatMap({ Self.screenOfKind[$0] }) {
            focus = PushFocus(kind: kind ?? "", refs: refs)
            pendingScreen = screen
        }
    }

    /// The items the tapped notification is about, until the screen showing them takes it.
    @Published var focus: PushFocus?
    /// Parents: the child the tapped notification is about.
    var pendingChild: String?
    /// The account the tapped notification was sent to (nil for older notifications).
    var pendingFor: String?
    /// The portal the tapped notification belongs to, when its kind tells (nil: any).
    var pendingPortal: AppRole?

    private static func portal(kind: String?, child: String?, refs: [String]) -> AppRole? {
        if child != nil { return .parent }
        switch kind {
        case "appel", "saisie", "confirmation": return .teacher
        case "aconfirmer", "bilan", "periode", "signalement", "moderation": return .schoolAdmin
        case "classe": return .student
        case "absence": return .parent
        case "note", "exercice", "rappel", "evaluation", "bulletin": return .student
        case "edt", "composition", "matin":
            if refs.contains(where: { $0.hasPrefix("edt-t") || $0.hasPrefix("compo-t") }) { return .teacher }
            return refs.isEmpty ? nil : .student
        default: return nil
        }
    }
}

/// What a tapped notification points at. Refs look like « note:<id> », « eval:<id> »,
/// « cahier:<id> », « edt:<slot>[:<student>] », « compo:<id> », « bulletin:<period> »,
/// « msg:<id> », « rappel:<date>:<id> ».
struct PushFocus: Equatable {
    let kind: String
    let refs: [String]
    var at = Date()

    /// Not taken within a minute and a half: a later visit of the screen is not about it.
    var isFresh: Bool { Date().timeIntervalSince(at) < 90 }

    /// The ids of the refs of these types (a reminder's id is its last part).
    func ids(_ types: String...) -> [String] {
        refs.compactMap { ref in
            let parts = ref.split(separator: ":").map(String.init)
            guard parts.count >= 2, types.contains(parts[0]) else { return nil }
            return parts[0] == "rappel" ? parts.last : parts[1]
        }
    }
}

/// Scrolls to the item a tapped notification points at and highlights it for a moment.
private struct PushFocusModifier: ViewModifier {
    let kinds: Set<String>
    let ready: Bool
    let proxy: ScrollViewProxy?
    @Binding var highlighted: Set<String>
    /// Puts the screen on the right tab / period / day and returns where to scroll and what to
    /// highlight (nil: nothing to point at, e.g. a removed lesson).
    let reveal: (PushFocus) -> (scrollTo: String, highlight: Set<String>)?
    @State private var waiting: PushFocus?

    func body(content: Content) -> some View {
        content
            .onReceive(PushManager.shared.$focus) { f in
                guard let f, f.isFresh, kinds.contains(f.kind) else { return }
                waiting = f
                apply()
            }
            .onChange(of: ready) { _, _ in apply() }
    }

    private func apply() {
        guard ready, let f = waiting else { return }
        waiting = nil
        DispatchQueue.main.async { if PushManager.shared.focus == f { PushManager.shared.focus = nil } }
        guard let hit = reveal(f) else { return }
        // after the tab / period switch has been laid out
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            withAnimation(.easeInOut(duration: 0.4)) { proxy?.scrollTo(hit.scrollTo, anchor: .center) }
            withAnimation(.easeOut(duration: 0.25)) { highlighted = hit.highlight }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.8) {
                withAnimation(.easeOut(duration: 0.7)) { highlighted = [] }
            }
        }
    }
}

extension View {
    func pushFocus(_ kinds: Set<String>, ready: Bool, proxy: ScrollViewProxy?, highlighted: Binding<Set<String>>,
                   reveal: @escaping (PushFocus) -> (scrollTo: String, highlight: Set<String>)?) -> some View {
        modifier(PushFocusModifier(kinds: kinds, ready: ready, proxy: proxy, highlighted: highlighted, reveal: reveal))
    }

    /// Teal wash and outline on the item a notification opened.
    func pushHighlight(_ on: Bool, cornerRadius: CGFloat = EduTheme.radius) -> some View {
        overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(EduTheme.teal.opacity(on ? 0.10 : 0))
                .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(EduTheme.teal.opacity(on ? 0.9 : 0), lineWidth: 2))
                .allowsHitTesting(false)
        }
    }
}

extension PushManager {
}

extension PushManager: UNUserNotificationCenterDelegate {
    // app open: still show the banner
    // completion-handler versions: the async ones finish off the main thread, and iOS ends the app
    // (« Call must be made on main thread »)
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        nonisolated(unsafe) let payload = info
        DispatchQueue.main.async {
            MainActor.assumeIsolated { PushManager.shared.open(payload) }
            completionHandler()
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = PushManager.shared
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.didRegister(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Push registration failed: \(error.localizedDescription)")
    }
}

/// Profil « Notifications »: what this student receives (stored in ef_push_prefs).
struct PushPrefsCard: View {
    @EnvironmentObject private var auth: AuthViewModel
    @ObservedObject private var push = PushManager.shared
    @Environment(\.openURL) private var openURL
    @State private var prefs: [String: Bool] = [:]

    private struct Kind: Identifiable { let id: String; let icon: String; let title: String; let detail: String; let defaultOn: Bool }
    private var kinds: [Kind] {
        switch auth.primaryRole {
        case .parent: return parentKinds
        case .teacher: return teacherKinds
        case .schoolAdmin: return adminKinds
        default: return studentKinds
        }
    }
    private let adminKinds: [Kind] = [
        Kind(id: "aconfirmer", icon: "checkmark.seal.fill", title: "Évaluations à confirmer", detail: "Quand un enseignant propose une évaluation", defaultOn: true),
        Kind(id: "bilan", icon: "chart.bar.doc.horizontal", title: "Bilan du jour", detail: "À 17h30 : absences, retards et appels non faits", defaultOn: true),
        Kind(id: "periode", icon: "calendar.badge.exclamationmark", title: "Fin de Trimestre", detail: "3 jours avant : évaluations encore sans notes", defaultOn: true),
        Kind(id: "signalement", icon: "exclamationmark.bubble.fill", title: "Signalements", detail: "Un problème signalé dans l’application", defaultOn: true),
        Kind(id: "moderation", icon: "flag.fill", title: "Espace classe", detail: "Un message d’élève signalé", defaultOn: true),
        Kind(id: "message", icon: "envelope.fill", title: "Messages", detail: "Messages des parents, élèves et enseignants", defaultOn: true),
        Kind(id: "annonce", icon: "megaphone.fill", title: "Annonces", detail: "Annonces reçues", defaultOn: true),
    ]
    private let teacherKinds: [Kind] = [
        Kind(id: "appel", icon: "checklist", title: "Appel non fait", detail: "10 minutes après la fin d’un cours sans appel", defaultOn: true),
        Kind(id: "saisie", icon: "square.and.pencil", title: "Notes à saisir", detail: "3 jours après une évaluation sans notes", defaultOn: true),
        Kind(id: "confirmation", icon: "checkmark.seal.fill", title: "Évaluations confirmées", detail: "Quand l’administration confirme une évaluation", defaultOn: true),
        Kind(id: "edt", icon: "calendar", title: "Emploi du temps", detail: "Vos cours ajoutés, déplacés ou retirés", defaultOn: true),
        Kind(id: "composition", icon: "doc.text.fill", title: "Compositions", detail: "Dates des compositions de vos classes", defaultOn: true),
        Kind(id: "message", icon: "envelope.fill", title: "Messages", detail: "Messages des parents, élèves et de l’administration", defaultOn: true),
        Kind(id: "annonce", icon: "megaphone.fill", title: "Annonces", detail: "Annonces de l’école", defaultOn: true),
        Kind(id: "matin", icon: "sunrise.fill", title: "Résumé du matin", detail: "À 6h15 : vos cours du jour", defaultOn: false),
    ]
    private let parentKinds: [Kind] = [
        Kind(id: "absence", icon: "person.crop.circle.badge.xmark", title: "Absences et retards", detail: "Dès que l’appel est fait", defaultOn: true),
        Kind(id: "note", icon: "chart.bar.fill", title: "Notes", detail: "Chaque nouvelle note de vos enfants", defaultOn: true),
        Kind(id: "exercice", icon: "book.fill", title: "Exercices", detail: "Nouveaux exercices et devoirs", defaultOn: true),
        Kind(id: "rappel", icon: "bell.badge.fill", title: "Rappels de la veille", detail: "À 18h, ce qui est à rendre demain", defaultOn: true),
        Kind(id: "evaluation", icon: "pencil.and.list.clipboard", title: "Évaluations", detail: "Évaluations confirmées par l’école", defaultOn: true),
        Kind(id: "composition", icon: "doc.text.fill", title: "Compositions", detail: "Dates des compositions", defaultOn: true),
        Kind(id: "edt", icon: "calendar", title: "Emploi du temps", detail: "Cours ajoutés, déplacés ou retirés", defaultOn: true),
        Kind(id: "bulletin", icon: "rosette", title: "Bulletins", detail: "Quand un bulletin est disponible", defaultOn: true),
        Kind(id: "message", icon: "envelope.fill", title: "Messages", detail: "Messages reçus", defaultOn: true),
        Kind(id: "annonce", icon: "megaphone.fill", title: "Annonces", detail: "Annonces de l’école", defaultOn: true),
    ]
    private let studentKinds: [Kind] = [
        Kind(id: "note", icon: "chart.bar.fill", title: "Notes", detail: "Chaque nouvelle note", defaultOn: true),
        Kind(id: "exercice", icon: "book.fill", title: "Exercices", detail: "Nouveaux exercices et devoirs", defaultOn: true),
        Kind(id: "rappel", icon: "bell.badge.fill", title: "Rappels de la veille", detail: "À 18h, ce qui est à rendre demain", defaultOn: true),
        Kind(id: "evaluation", icon: "pencil.and.list.clipboard", title: "Évaluations", detail: "Évaluations confirmées par l’école", defaultOn: true),
        Kind(id: "composition", icon: "doc.text.fill", title: "Compositions", detail: "Dates des compositions", defaultOn: true),
        Kind(id: "edt", icon: "calendar", title: "Emploi du temps", detail: "Cours ajoutés, déplacés ou retirés", defaultOn: true),
        Kind(id: "bulletin", icon: "rosette", title: "Bulletins", detail: "Quand ton bulletin est disponible", defaultOn: true),
        Kind(id: "message", icon: "envelope.fill", title: "Messages", detail: "Messages reçus", defaultOn: true),
        Kind(id: "classe", icon: "bubble.left.and.bubble.right.fill", title: "Espace classe", detail: "Réponses à tes questions et messages de tes groupes", defaultOn: true),
        Kind(id: "annonce", icon: "megaphone.fill", title: "Annonces", detail: "Annonces de l’école", defaultOn: true),
        Kind(id: "matin", icon: "sunrise.fill", title: "Résumé du matin", detail: "À 6h15 : tes cours du jour", defaultOn: false),
    ]

    private struct Pref: Codable { let user_id: String; let kind: String; let enabled: Bool }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Notifications")
                .font(.headline)
                .foregroundStyle(EduTheme.ink)
                .padding(.bottom, 6)
            if push.status == .denied {
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "bell.slash.fill").foregroundStyle(EduTheme.fasoRed)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Notifications désactivées").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                            Text(auth.primaryRole == .parent ? "Activez-les dans Réglages pour être prévenu des notes et absences."
                                 : auth.primaryRole == .teacher ? "Activez-les dans Réglages pour être prévenu des appels et des messages."
                                 : auth.primaryRole == .schoolAdmin ? "Activez-les dans Réglages pour être prévenu des évaluations à confirmer et des messages."
                                 : "Active-les dans Réglages pour recevoir tes notes et exercices.").font(.caption).foregroundStyle(EduTheme.muted)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(EduTheme.subtle)
                    }
                    .padding(10)
                    .background(EduTheme.fasoRed.opacity(0.07), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.bottom, 6)
            }
            ForEach(Array(kinds.enumerated()), id: \.element.id) { i, k in
                if i > 0 { Divider() }
                Toggle(isOn: Binding(
                    get: { prefs[k.id] ?? k.defaultOn },
                    set: { on in prefs[k.id] = on; Task { await save(k.id, on) } }
                )) {
                    HStack(spacing: 12) {
                        Image(systemName: k.icon).font(.subheadline).foregroundStyle(EduTheme.teal).frame(width: 18)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(k.title).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                            Text(k.detail).font(.caption).foregroundStyle(EduTheme.muted)
                        }
                    }
                }
                .tint(EduTheme.teal)
                .padding(.vertical, 6)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).fill(.white)
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
        )
        .task {
            await push.refreshStatus()
            await load()
        }
    }

    private func load() async {
        guard let uid = auth.userId else { return }
        let rows: [Pref] = (try? await SupabaseManager.client.from("ef_push_prefs").select("user_id, kind, enabled")
            .eq("user_id", value: uid).execute().value) ?? []
        prefs = Dictionary(uniqueKeysWithValues: rows.map { ($0.kind, $0.enabled) })
    }

    private func save(_ kind: String, _ on: Bool) async {
        guard let uid = auth.userId else { return }
        _ = try? await SupabaseManager.client.from("ef_push_prefs")
            .upsert(Pref(user_id: uid, kind: kind, enabled: on), onConflict: "user_id,kind").execute()
    }
}
