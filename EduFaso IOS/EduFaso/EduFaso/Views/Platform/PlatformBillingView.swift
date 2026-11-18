import SwiftUI
import Supabase

/// Super admin « Abonnements », like the web AdminBilling: each school with its plan, billing
/// status and end of subscription, changed in a modal (saved to the audit log).
struct PlatformBillingView: View {
    @State private var schools: [PlatformSchool] = []
    @State private var filter = "toutes"
    @State private var editing: PlatformSchool?
    @State private var plan = "essai"
    @State private var status = "trial"
    @State private var hasEnd = false
    @State private var endDate = Date()
    @State private var saving = false
    @State private var formError: String?
    @State private var notice: String?
    @State private var error: String?
    @State private var ready = false

    @State private var tour = TabTour(key: "admin-abonnements")
    @State private var coach = CoachMarkRegistry()

    static let plans: [(String, String)] = [("essai", "Essai"), ("standard", "Standard"), ("premium", "Premium")]
    static let statuses: [(String, String)] = [("trial", "Essai"), ("active", "Actif"), ("past_due", "Impayé"), ("cancelled", "Annulé")]

    static func statusChip(_ s: String?) -> PlatformChip {
        let label = statuses.first { $0.0 == s }?.1 ?? s ?? "—"
        switch s {
        case "active": return PlatformChip(text: label, fg: Platform.H.emerald, bg: Platform.H.emerald50)
        case "trial": return PlatformChip(text: label, fg: Platform.sky, bg: Platform.sky100)
        case "past_due": return PlatformChip(text: label, fg: Platform.H.amber, bg: Platform.H.amber50)
        case "cancelled": return PlatformChip(text: label, fg: Platform.rose, bg: Platform.rose100)
        default: return PlatformChip(text: label, fg: EduTheme.muted, bg: Platform.H.slate100)
        }
    }

    private func count(_ s: String) -> Int { schools.filter { ($0.billing_status ?? "trial") == s }.count }
    private var visible: [PlatformSchool] { filter == "toutes" ? schools : schools.filter { ($0.billing_status ?? "trial") == filter } }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ab.stats", icon: "creditcard", title: "Facturation", message: "Combien d’écoles paient, sont en essai, en retard de paiement ou ont annulé."),
            CoachMarkStep(id: "ab.list", icon: "building.2", title: "Par école", message: "Le plan, le statut et la fin d’abonnement. « Modifier » pour les changer."),
            CoachMarkStep(id: "ab.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        PlatformScreen(title: "Abonnements", tour: tour, coach: coach, ready: ready, onRefresh: { await load() }) {
            PlatformBanner(title: "Abonnements", subtitle: "Plans et statuts de facturation par école.",
                           onHelp: { tour.start(tourSteps, registry: coach) }, helpId: "ab.help") {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    PlatformBannerStat(label: "Actifs", value: "\(count("active"))")
                    PlatformBannerStat(label: "En essai", value: "\(count("trial"))")
                    PlatformBannerStat(label: "Impayés", value: "\(count("past_due"))")
                    PlatformBannerStat(label: "Annulés", value: "\(count("cancelled"))")
                }
                .coachMarkTarget("ab.stats")
            }
            PlatformFilterBar(options: [("toutes", "Toutes", schools.count)] + Self.statuses.map { ($0.0, $0.1, count($0.0)) }, selection: $filter)
            if let notice { Label(notice, systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Platform.H.emerald) }
            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
            VStack(spacing: 10) {
                if visible.isEmpty {
                    PlatformEmpty(text: schools.isEmpty ? "Aucune école enregistrée." : "Aucune école dans ce statut.")
                } else {
                    ForEach(visible) { card($0) }
                }
            }
            .coachMarkTarget("ab.list")
        }
        .task { await load() }
        .onChange(of: ready) { _, r in if r { tour.autoStartOnce({ tourSteps }, registry: coach) } }
        .sheet(item: $editing) { s in
            EduFormSheet(title: "Abonnement", subtitle: s.name, primary: saving ? "Enregistrement…" : "Enregistrer",
                         primaryDisabled: !dirty(s), busy: saving, onPrimary: { Task { await save(s) } }) {
                Section("Abonnement") {
                    Picker("Plan", selection: $plan) { ForEach(Self.plans, id: \.0) { Text($0.1).tag($0.0) } }
                    Picker("Statut", selection: $status) { ForEach(Self.statuses, id: \.0) { Text($0.1).tag($0.0) } }
                }
                Section("Fin d’abonnement") {
                    Toggle("Date de fin", isOn: $hasEnd).tint(EduTheme.teal)
                    if hasEnd {
                        DatePicker("Jusqu’au", selection: $endDate, displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "fr_FR"))
                    }
                }
                if let formError { Text(formError).font(.footnote.weight(.semibold)).foregroundStyle(EduTheme.fasoRed) }
            }
        }
    }

    private func card(_ s: PlatformSchool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                NavigationLink { PlatformSchoolDetailView(schoolId: s.id) } label: {
                    Text(s.name).font(.headline).foregroundStyle(EduTheme.ink).multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
                Spacer()
                PlatformChip.active(s.isActive)
            }
            HStack(spacing: 8) {
                info("Plan", Self.plans.first { $0.0 == (s.plan ?? "essai") }?.1 ?? (s.plan ?? "—"))
                VStack(alignment: .leading, spacing: 3) {
                    Text("STATUT").font(.system(size: 10, weight: .semibold)).tracking(0.6).foregroundStyle(EduTheme.muted)
                    Self.statusChip(s.billing_status ?? "trial")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                info("Fin", s.subscription_ends_at.map { Platform.format($0, "d MMM yyyy") } ?? "—")
            }
            PlatformButton(title: "Modifier", icon: "pencil", outline: true) {
                plan = s.plan ?? "essai"
                status = s.billing_status ?? "trial"
                let end = s.subscription_ends_at.flatMap(Platform.date)
                hasEnd = end != nil
                endDate = end ?? Date()
                formError = nil
                editing = s
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private func info(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.6).foregroundStyle(EduTheme.muted)
            Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func dirty(_ s: PlatformSchool) -> Bool {
        let base = s.subscription_ends_at.map { String($0.prefix(10)) }
        let now = hasEnd ? EduDates.day(endDate) : nil
        return plan != (s.plan ?? "essai") || status != (s.billing_status ?? "trial") || base != now
    }

    private func load() async {
        do {
            schools = try await SupabaseManager.client.from("ecoles")
                .select("id, name, active, plan, billing_status, subscription_ends_at").order("name").execute().value
            error = nil
        } catch {
            if !error.isCancellation { self.error = "Impossible de charger les abonnements." }
        }
        ready = true
    }

    private struct Payload: Encodable {
        let plan: String; let billing_status: String; let subscription_ends_at: String?
        enum K: String, CodingKey { case plan, billing_status, subscription_ends_at }
        func encode(to e: Encoder) throws {
            var c = e.container(keyedBy: K.self)
            try c.encode(plan, forKey: .plan); try c.encode(billing_status, forKey: .billing_status); try c.encode(subscription_ends_at, forKey: .subscription_ends_at)
        }
    }

    private func save(_ s: PlatformSchool) async {
        saving = true
        defer { saving = false }
        var end: String? = nil
        if hasEnd {
            var cal = Calendar.current
            cal.timeZone = .current
            let d = cal.date(bySettingHour: 23, minute: 59, second: 59, of: endDate) ?? endDate
            end = ISO8601DateFormatter().string(from: d)
        }
        let p = Payload(plan: plan, billing_status: status, subscription_ends_at: end)
        do {
            try await SupabaseManager.client.from("ecoles").update(p).eq("id", value: s.id).execute()
            await Platform.audit("update_billing", entityType: "school", entityId: s.id,
                                 details: ["plan": .string(plan), "billing_status": .string(status), "subscription_ends_at": end.map { .string($0) } ?? .null])
            editing = nil
            notice = "Abonnement mis à jour : \(s.name)."
            await load()
        } catch {
            formError = "Impossible d'enregistrer l'abonnement"
        }
    }
}
