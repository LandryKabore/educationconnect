import SwiftUI
import Supabase

/// Super admin « Journal d'audit », like the web AdminAudit: the 200 latest super admin
/// actions with their date, author, action, entity and details, filtered by text.
struct PlatformAuditView: View {
    @State private var logs: [Log] = []
    @State private var actors: [String: String] = [:]
    @State private var search = ""
    @State private var expanded: Set<String> = []
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "admin-audit")
    @State private var coach = CoachMarkRegistry()

    struct Log: Decodable, Identifiable {
        let id: String
        let created_at: String
        let actor_id: String?
        let action: String
        let entity_type: String?
        let entity_id: String?
        let details: AnyJSON?
        var detailsText: String {
            guard let details, case .object(let o) = details, !o.isEmpty else { return "—" }
            let data = (try? JSONEncoder().encode(details)) ?? Data()
            return String(data: data, encoding: .utf8) ?? "—"
        }
    }
    private struct Person: Decodable { let id: String; let first_name: String?; let last_name: String? }

    static let actionLabels: [String: String] = [
        "module_active": "Module activé", "module_desactive": "Module désactivé", "permission_modifiee": "Permission modifiée",
        "update_billing": "Abonnement modifié", "update_settings": "Paramètres modifiés",
    ]

    private var filtered: [Log] {
        let q = Platform.normalized(search.trimmed)
        guard !q.isEmpty else { return logs }
        return logs.filter { l in
            Platform.normalized([l.action, Self.actionLabels[l.action] ?? "", l.entity_type ?? "", l.entity_id ?? "", actors[l.actor_id ?? ""] ?? ""].joined(separator: " ")).contains(q)
        }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "aa.search", icon: "magnifyingglass", title: "Filtrer", message: "Par action, entité ou auteur."),
            CoachMarkStep(id: "aa.list", icon: "list.bullet.rectangle", title: "Historique", message: "Les 200 dernières actions des super administrateurs. Touchez une ligne pour voir les détails."),
            CoachMarkStep(id: "aa.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: "Journal d’audit", tour: tour, coach: coach, ready: ready, onRefresh: { await load() }) {
            PlatformBanner(title: "Journal d’audit", subtitle: "Historique des actions super administrateur.",
                           onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "aa.help") {
                HStack(spacing: 8) {
                    PlatformBannerStat(label: "Entrées", value: "\(logs.count)", hint: "les 200 dernières")
                    PlatformBannerStat(label: "Dernière", value: logs.first.map { Platform.relative($0.created_at) } ?? "—")
                }
            }
            PlatformSearchField(placeholder: "Filtrer par action, entité ou acteur…", text: $search).coachMarkTarget("aa.search")
            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
            VStack(spacing: 8) {
                if filtered.isEmpty {
                    PlatformEmpty(text: "Aucune entrée dans le journal.")
                } else {
                    ForEach(filtered) { row($0) }
                }
            }
            .coachMarkTarget("aa.list")
        }
        .task { await load() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
    }

    private func row(_ l: Log) -> some View {
        let open = expanded.contains(l.id)
        return Button {
            withAnimation(.snappy(duration: 0.2)) { if open { expanded.remove(l.id) } else { expanded.insert(l.id) } }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Self.actionLabels[l.action] ?? l.action).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                        Text([actors[l.actor_id ?? ""] ?? "—", Platform.format(l.created_at, "d MMM yyyy, HH:mm")].joined(separator: " · "))
                            .font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    Spacer()
                    Image(systemName: open ? "chevron.up" : "chevron.down").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.muted)
                }
                let entity = [l.entity_type, l.entity_id].compactMap { $0 }.joined(separator: " · ")
                if !entity.isEmpty { Text(entity).font(.caption2.monospaced()).foregroundStyle(EduTheme.muted).lineLimit(open ? nil : 1) }
                if open {
                    Text(l.detailsText).font(.caption2.monospaced()).foregroundStyle(EduTheme.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(Platform.H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        .textSelection(.enabled)
                }
            }
            .padding(12)
            .modifier(HomeCardStyle())
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        let client = SupabaseManager.client
        do {
            logs = try await client.from("audit_logs").select("id, created_at, actor_id, action, entity_type, entity_id, details")
                .order("created_at", ascending: false).limit(200).execute().value
            let ids = Array(Set(logs.compactMap(\.actor_id)))
            if !ids.isEmpty {
                let people: [Person] = (try? await client.from("profils").select("id, first_name, last_name").in("id", values: ids).execute().value) ?? []
                actors = Dictionary(uniqueKeysWithValues: people.map { ($0.id, "\($0.first_name ?? "") \($0.last_name ?? "")".trimmingCharacters(in: .whitespaces)) })
            }
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger le journal." }
        }
        ready = true
    }
}
