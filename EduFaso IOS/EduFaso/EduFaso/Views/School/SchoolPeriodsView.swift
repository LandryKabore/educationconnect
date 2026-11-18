import SwiftUI

/// School admin « Périodes et clôture », like the web Periodes: per school year, the three
/// Trimestres with their dates and status; closing one locks its grades (with a summary first),
/// reopening asks for a reason, dates can be set, and the journal lists every change.
struct SchoolPeriodsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var years: [YearRow] = []
    @State private var yearId = ""
    @State private var stored: [Period] = []
    @State private var bounds: [String: Bounds] = [:]
    @State private var log: [LogRow] = []
    @State private var ready = false
    @State private var error: String?
    @State private var action: Action?

    @State private var tour = TabTour(key: "periodes-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    static let labels = ["Trimestre 1", "Trimestre 2", "Trimestre 3"]

    struct Period: Decodable { let id: String; let label: String; let status: String?; let start_date: String?; let end_date: String?; let closed_at: String?; let reopened_at: String?; let reopen_reason: String? }
    struct Bounds: Decodable { let start_date: String?; let end_date: String? }
    struct LogRow: Decodable, Identifiable { let id: String; let action: String; let actor_id: String?; let reason: String?; let created_at: String; let period_id: String; var actor: String? }

    struct Action: Identifiable {
        enum Kind { case close, reopen, dates }
        let id = UUID()
        let kind: Kind
        let label: String
        let start: Date
        let end: Date
    }

    private var year: YearRow? { years.first { $0.id == yearId } }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "pe.year", icon: "calendar", title: "Année scolaire", message: "Choisissez l’année : ses trois Trimestres s’affichent."),
            CoachMarkStep(id: "pe.list", icon: "lock", title: "Clôturer",
                          message: "Clôturer un Trimestre verrouille ses notes : plus personne ne peut les modifier, sauf en le rouvrant avec une raison. Les dates servent à compter les absences de chaque bulletin."),
            CoachMarkStep(id: "pe.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        if years.isEmpty {
                            Text("Créez d’abord une année scolaire.").font(.subheadline).foregroundStyle(EduTheme.muted)
                                .frame(maxWidth: .infinity).padding(24).modifier(HomeCardStyle())
                        } else {
                            HStack {
                                Text("Année scolaire").foregroundStyle(EduTheme.ink)
                                Spacer()
                                Picker("Année", selection: $yearId) {
                                    ForEach(years) { y in Text(y.label + (y.isCurrent ? " (courante)" : "")).tag(y.id) }
                                }
                                .labelsHidden().tint(EduTheme.teal)
                            }
                            .font(.subheadline).padding(.horizontal, 16).padding(.vertical, 6).modifier(HomeCardStyle())
                            .coachMarkTarget("pe.year")
                            VStack(spacing: 10) { ForEach(Self.labels, id: \.self) { periodCard($0) } }.coachMarkTarget("pe.list")
                            Text("Les dates servent à compter les absences de chaque bulletin : seules les absences de la période comptent. Tant que vous n’avez pas saisi de dates, l’année est divisée en trois parts égales.")
                                .font(.caption).foregroundStyle(EduTheme.muted)
                            if !log.isEmpty { journal }
                        }
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await loadPeriods() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Périodes et clôture")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await loadYears() }
        .onChange(of: yearId) { _, _ in Task { await loadPeriods() } }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(item: $action) { a in
            PeriodActionSheet(action: a, yearId: yearId, yearLabel: year?.label ?? "") { Task { await loadPeriods() } }.environmentObject(auth)
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Périodes et clôture").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                    Text("Clôturez un Trimestre pour verrouiller ses notes. Chaque modification de note est gardée dans l’historique.")
                        .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("pe.help")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func periodCard(_ label: String) -> some View {
        let p = stored.first { $0.label == label }
        let closed = p?.status == "cloturee"
        let start = p?.start_date ?? bounds[label]?.start_date
        let end = p?.end_date ?? bounds[label]?.end_date
        let fromDefault = !(p?.start_date != nil && p?.end_date != nil)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(label).font(.headline).foregroundStyle(EduTheme.ink)
                if closed {
                    Label("Clôturé", systemImage: "lock.fill").font(.caption.weight(.bold)).foregroundStyle(H.amber)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(H.amber50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                } else {
                    Text("Ouvert").font(.caption.weight(.bold)).foregroundStyle(H.emerald)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(H.emerald50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                Spacer()
            }
            Text(start != nil && end != nil
                 ? "Du \(SchoolAttendanceView.fmtDay(start!)) au \(SchoolAttendanceView.fmtDay(end!))" + (fromDefault ? " (dates par défaut : année divisée en 3)" : "")
                 : "Dates non définies")
                .font(.caption).foregroundStyle(EduTheme.muted)
            if closed, let c = p?.closed_at { Text("Clôturé le \(Self.dateTime(c))").font(.caption).foregroundStyle(EduTheme.muted) }
            if !closed, let r = p?.reopened_at { Text("Rouvert le \(Self.dateTime(r))" + (p?.reopen_reason.map { " — \($0)" } ?? "")).font(.caption).foregroundStyle(EduTheme.muted) }
            HStack(spacing: 8) {
                let s = start.flatMap { EduDates.parseDay(String($0.prefix(10))) } ?? Date()
                let e = end.flatMap { EduDates.parseDay(String($0.prefix(10))) } ?? Date()
                button("Dates", icon: "pencil", primary: false) { action = Action(kind: .dates, label: label, start: s, end: e) }
                if closed {
                    button("Rouvrir", icon: "lock.open", primary: false) { action = Action(kind: .reopen, label: label, start: s, end: e) }
                } else {
                    button("Clôturer", icon: "lock", primary: true) { action = Action(kind: .close, label: label, start: s, end: e) }
                }
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private func button(_ t: String, icon: String, primary: Bool, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Label(t, systemImage: icon).font(.caption.weight(.semibold)).foregroundStyle(primary ? .white : EduTheme.ink)
                .padding(.horizontal, 12).frame(minHeight: 34)
                .background(primary ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(primary ? .clear : EduTheme.borderStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var journal: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Journal").font(.headline).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            ForEach(log) { l in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(l.action == "close" ? "Clôture" : (l.action == "reopen" ? "Réouverture" : "Dates modifiées"))
                            .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                        Text("· \(stored.first { $0.id == l.period_id }?.label ?? "")").font(.subheadline).foregroundStyle(EduTheme.muted)
                        Spacer()
                        Text(Self.dateTime(l.created_at)).font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    Text("Par \(l.actor ?? "Système")" + (l.reason.map { " — \($0)" } ?? "")).font(.caption).foregroundStyle(EduTheme.muted)
                }
                .padding(.horizontal, 16).padding(.vertical, 8)
                Divider().padding(.leading, 16)
            }
        }
        .modifier(HomeCardStyle())
    }

    static func dateTime(_ iso: String) -> String {
        let p1 = ISO8601DateFormatter(); p1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let p2 = ISO8601DateFormatter(); p2.formatOptions = [.withInternetDateTime]
        guard let d = p1.date(from: iso) ?? p2.date(from: iso) else { return iso }
        return TeacherExercisesView.format(d, "dd/MM/yy HH:mm")
    }

    private func loadYears() async {
        guard let sid = auth.schoolId else { ready = true; return }
        years = ((try? await EduAPI().fetchYears(schoolId: sid)) ?? []).sorted { $0.startDate > $1.startDate }
        if yearId.isEmpty { yearId = (years.first { $0.isCurrent } ?? years.first)?.id ?? "" }
        if yearId.isEmpty { ready = true } else { await loadPeriods() }
    }

    private func loadPeriods() async {
        guard let sid = auth.schoolId, !yearId.isEmpty else { ready = true; return }
        let api = EduAPI()
        do {
            stored = try await api.fetchPeriodRows(schoolId: sid, yearId: yearId)
            var b: [String: Bounds] = [:]
            for l in Self.labels { if let x = try? await api.periodBounds(yearId: yearId, label: l) { b[l] = x } }
            bounds = b
            log = stored.isEmpty ? [] : ((try? await api.periodLog(periodIds: stored.map(\.id))) ?? [])
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }
}

private struct PeriodActionSheet: View {
    let action: SchoolPeriodsView.Action
    let yearId: String
    let yearLabel: String
    var onDone: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var start = Date()
    @State private var end = Date()
    @State private var reason = ""
    @State private var summary: EduAPI.CloseSummary?
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        EduFormSheet(title: action.kind == .close ? "Clôturer le \(action.label) ?" : (action.kind == .reopen ? "Rouvrir le \(action.label) ?" : "Dates — \(action.label)"), primary: saving ? "…" : (action.kind == .close ? "Clôturer" : (action.kind == .reopen ? "Rouvrir" : "Enregistrer")), primaryDisabled: saving, busy: saving, onPrimary: { Task { await submit() } }) {
                switch action.kind {
                case .close:
                    Section {
                        Text("Année scolaire \(yearLabel). Après la clôture, plus personne (même l’administration) ne peut ajouter, modifier ou supprimer une note ou une évaluation de cette période, sauf si vous la rouvrez avec une raison.")
                            .font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    if let s = summary {
                        Section("Résumé") {
                            Text("\(s.notes) note(s) dans \(s.evaluations) évaluation(s)")
                            Text("\(s.classes_with_notes) classe(s) sur \(s.classes) ont des notes")
                            if s.classes_without_notes > 0 { Text("\(s.classes_without_notes) classe(s) sans aucune note pour cette période").foregroundStyle(TeacherHomeView.amber) }
                            if s.invalid_notes > 0 { Text("\(s.invalid_notes) note(s) hors limites (par ex. supérieure au maximum). Corrigez-les avant de clôturer.").foregroundStyle(EduTheme.fasoRed) }
                        }
                        .font(.subheadline)
                    } else {
                        Section { ProgressView() }
                    }
                    dates
                case .reopen:
                    Section {
                        Text("Les notes de cette période pourront de nouveau être modifiées. La raison est gardée dans le journal. Pensez à clôturer de nouveau après la correction.")
                            .font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    Section("Raison de la réouverture") {
                        TextField("Ex. : erreur de saisie en Mathématiques, 6e A", text: $reason, axis: .vertical).lineLimit(2...5)
                    }
                case .dates:
                    dates
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }
            .navigationTitle(action.kind == .close ? "Clôturer le \(action.label) ?" : (action.kind == .reopen ? "Rouvrir le \(action.label) ?" : "Dates — \(action.label)"))

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .task {
            start = action.start
            end = action.end
            if action.kind == .close, let sid = auth.schoolId {
                summary = try? await EduAPI().periodCloseSummary(schoolId: sid, yearId: yearId, label: action.label)
            }
        }
    }

    private var dates: some View {
        Section("Dates") {
            DatePicker("Début de la période", selection: $start, displayedComponents: .date)
            DatePicker("Fin de la période", selection: $end, in: start..., displayedComponents: .date)
        }
        .environment(\.locale, Locale(identifier: "fr_FR"))
    }

    private func submit() async {
        guard let sid = auth.schoolId else { return }
        if action.kind != .reopen && end < start { error = "La date de fin doit être après la date de début"; return }
        if action.kind == .reopen && reason.trimmingCharacters(in: .whitespaces).count < 5 { error = "Indiquez la raison (5 caractères minimum)"; return }
        saving = true
        defer { saving = false }
        let api = EduAPI()
        do {
            switch action.kind {
            case .close: try await api.closePeriod(schoolId: sid, yearId: yearId, label: action.label, start: EduDates.day(start), end: EduDates.day(end))
            case .reopen: try await api.reopenPeriod(schoolId: sid, yearId: yearId, label: action.label, reason: reason.trimmingCharacters(in: .whitespaces))
            case .dates: try await api.setPeriodDates(schoolId: sid, yearId: yearId, label: action.label, start: EduDates.day(start), end: EduDates.day(end))
            }
            onDone()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

extension EduAPI {
    struct CloseSummary: Decodable { let classes: Int; let classes_with_notes: Int; let classes_without_notes: Int; let notes: Int; let evaluations: Int; let invalid_notes: Int }
    struct PeriodArgs: Encodable { let p_school_id: String; let p_academic_year_id: String; let p_label: String }
    struct PeriodDatesArgs: Encodable { let p_school_id: String; let p_academic_year_id: String; let p_label: String; let p_start: String; let p_end: String }
    struct PeriodReopenArgs: Encodable { let p_school_id: String; let p_academic_year_id: String; let p_label: String; let p_reason: String }

    func fetchPeriodRows(schoolId: String, yearId: String) async throws -> [SchoolPeriodsView.Period] {
        try await client.from("periodes_scolaires")
            .select("id, label, status, start_date, end_date, closed_at, reopened_at, reopen_reason")
            .eq("school_id", value: schoolId).eq("academic_year_id", value: yearId).execute().value
    }

    func periodBounds(yearId: String, label: String) async throws -> SchoolPeriodsView.Bounds? {
        struct P: Encodable { let p_academic_year_id: String; let p_label: String }
        let rows: [SchoolPeriodsView.Bounds] = try await client.rpc("ef_period_bounds_for_year", params: P(p_academic_year_id: yearId, p_label: label)).execute().value
        return rows.first
    }

    func periodLog(periodIds: [String]) async throws -> [SchoolPeriodsView.LogRow] {
        var rows: [SchoolPeriodsView.LogRow] = try await client.from("periodes_scolaires_log")
            .select("id, action, actor_id, reason, created_at, period_id")
            .in("period_id", values: periodIds).order("created_at", ascending: false).limit(30).execute().value
        let ids = Array(Set(rows.compactMap(\.actor_id)))
        if !ids.isEmpty {
            struct P: Decodable { let id: String; let first_name: String?; let last_name: String? }
            let people: [P] = try await client.from("profils").select("id, first_name, last_name").in("id", values: ids).execute().value
            let names = Dictionary(people.map { ($0.id, "\($0.first_name ?? "") \($0.last_name ?? "")".trimmingCharacters(in: .whitespaces)) }, uniquingKeysWith: { a, _ in a })
            for i in rows.indices { rows[i].actor = rows[i].actor_id.flatMap { names[$0] } ?? (rows[i].actor_id == nil ? "Système" : "—") }
        }
        return rows
    }

    func periodCloseSummary(schoolId: String, yearId: String, label: String) async throws -> CloseSummary {
        try await call("ef_period_close_summary", params: PeriodArgs(p_school_id: schoolId, p_academic_year_id: yearId, p_label: label))
    }

    func closePeriod(schoolId: String, yearId: String, label: String, start: String, end: String) async throws {
        try await client.rpc("ef_close_period", params: PeriodDatesArgs(p_school_id: schoolId, p_academic_year_id: yearId, p_label: label, p_start: start, p_end: end)).execute()
    }

    func reopenPeriod(schoolId: String, yearId: String, label: String, reason: String) async throws {
        try await client.rpc("ef_reopen_period", params: PeriodReopenArgs(p_school_id: schoolId, p_academic_year_id: yearId, p_label: label, p_reason: reason)).execute()
    }

    func setPeriodDates(schoolId: String, yearId: String, label: String, start: String, end: String) async throws {
        try await client.rpc("ef_set_period_dates", params: PeriodDatesArgs(p_school_id: schoolId, p_academic_year_id: yearId, p_label: label, p_start: start, p_end: end)).execute()
    }
}
