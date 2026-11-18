import SwiftUI
import Supabase

/// School admin « Présences », like the web PresencesEcole: filter a period (last 30 days by
/// default), class, subject and status; attendance rate and totals; the matching lines, and
/// justifying absences (or removing a justification) one by one or in a batch.
struct SchoolAttendanceView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var subjects: [NamedEntity] = []
    @State private var from = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var to = Date()
    @State private var classId = ""
    @State private var subjectId = ""
    @State private var status: StatusFilter = .absent
    @State private var totals = Totals()
    @State private var rows: [Row] = []
    @State private var total = 0
    @State private var page = 0
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?

    @State private var selecting = false
    @State private var selected: Set<String> = []
    @State private var dialog: Dialog?

    @State private var tour = TabTour(key: "presences-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)
    private let rose100 = Color(red: 255 / 255, green: 228 / 255, blue: 230 / 255)
    private let sky = Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)
    private let sky100 = Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255)
    private static let pageSize = 50

    enum StatusFilter: String, CaseIterable, Identifiable {
        case absent, late, excused, exceptions, all
        var id: String { rawValue }
        var label: String {
            switch self {
            case .absent: return "À justifier"
            case .late: return "Retards"
            case .excused: return "Justifiées"
            case .exceptions: return "Toutes les absences et retards"
            case .all: return "Tout, présents compris"
            }
        }
    }

    struct Totals { var total = 0, absent = 0, late = 0, excused = 0 }

    struct Row: Decodable, Identifiable, Hashable {
        struct P: Decodable, Hashable { let first_name: String?; let last_name: String? }
        let id: String
        let date: String
        let status: String
        let note: String?
        let profils: P?
        let classes: NamedEntity?
        let matieres: NamedEntity?
        var name: String { "\(profils?.first_name ?? "") \(profils?.last_name ?? "")".trimmingCharacters(in: .whitespaces) }
    }

    struct Dialog: Identifiable {
        enum Kind { case justify, undo }
        let id = UUID()
        let kind: Kind
        let rows: [Row]
    }

    static let reasons = ["Maladie", "Certificat médical", "Rendez-vous médical", "Raison familiale", "Problème de transport", "Autre"]

    private var rate: Double? {
        totals.total == 0 ? nil : (Double(totals.total - totals.absent) / Double(totals.total) * 1000).rounded() / 10
    }

    private var selectedRows: [Row] { rows.filter { selected.contains($0.id) } }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "pe.filters", icon: "line.3.horizontal.decrease.circle", title: "Filtres",
                          message: "Choisissez la période, la classe, la matière et le statut. Par défaut : les absences à justifier des 30 derniers jours."),
            CoachMarkStep(id: "pe.kpi", icon: "chart.bar.fill", title: "Sur la période",
                          message: "Le taux de présence, les absences à justifier, les retards et les absences déjà justifiées."),
            CoachMarkStep(id: "pe.list", icon: "list.bullet", title: "Justifier",
                          message: "« Justifier » une absence avec son motif, ou « Sélectionner » pour en justifier plusieurs d’un coup."),
            CoachMarkStep(id: "pe.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        filters.coachMarkTarget("pe.filters")
                        if from > to {
                            Text("Choisissez une période valide (la date de début doit précéder la date de fin).")
                                .font(.subheadline).foregroundStyle(EduTheme.muted).padding(16).modifier(HomeCardStyle())
                        } else {
                            kpis.coachMarkTarget("pe.kpi")
                            if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                            list.coachMarkTarget("pe.list")
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, selecting && !selected.isEmpty ? 110 : 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await reload() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .safeAreaInset(edge: .bottom) { if selecting && !selected.isEmpty { bulkBar } }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Présences")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await loadLists(); await reload() }
        .onChange(of: from) { _, _ in Task { await reload() } }
        .onChange(of: to) { _, _ in Task { await reload() } }
        .onChange(of: classId) { _, _ in Task { await reload() } }
        .onChange(of: subjectId) { _, _ in Task { await reload() } }
        .onChange(of: status) { _, _ in Task { await reload() } }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(item: $dialog) { d in
            JustifySheet(dialog: d) { Task { selected = []; selecting = false; await reload() } }
                .environmentObject(auth)
        }
    }

    // MARK: - Pieces

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Présences").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                    Text("Passez en revue les absences et justifiez-les en lot.")
                        .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                }
                Spacer()
                TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                    .coachMarkTarget("pe.help")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var filters: some View {
        VStack(spacing: 0) {
            DatePicker("Du", selection: $from, displayedComponents: .date).padding(.vertical, 6)
            Divider()
            DatePicker("Au", selection: $to, displayedComponents: .date).padding(.vertical, 6)
            Divider()
            pickerRow("Classe", selection: $classId, options: [("", "Toutes les classes")] + classes.map { ($0.id, $0.name) })
            Divider()
            pickerRow("Matière", selection: $subjectId, options: [("", "Toutes les matières")] + subjects.map { ($0.id ?? "", $0.name) })
            Divider()
            HStack {
                Text("Statut").foregroundStyle(EduTheme.ink)
                Spacer()
                Picker("Statut", selection: $status) {
                    ForEach(StatusFilter.allCases) { Text($0.label).tag($0) }
                }
                .labelsHidden()
            }
            .padding(.vertical, 2)
        }
        .font(.subheadline)
        .environment(\.locale, Locale(identifier: "fr_FR"))
        .tint(EduTheme.teal)
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .modifier(HomeCardStyle())
    }

    private func pickerRow(_ label: String, selection: Binding<String>, options: [(String, String)]) -> some View {
        HStack {
            Text(label).foregroundStyle(EduTheme.ink)
            Spacer()
            Picker(label, selection: selection) {
                ForEach(options, id: \.0) { Text($0.1).tag($0.0) }
            }
            .labelsHidden()
        }
        .padding(.vertical, 2)
    }

    private var kpis: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            kpi("Présence", rate.map { String(format: "%.1f %%", $0).replacingOccurrences(of: ".", with: ",") } ?? "—", "\(totals.total) cours", H.emerald)
            kpi("À justifier", "\(totals.absent)", "absences non justifiées", rose)
            kpi("Retards", "\(totals.late)", "sur la période", H.amber)
            kpi("Justifiées", "\(totals.excused)", "ne comptent pas comme absences", sky)
        }
    }

    private func kpi(_ label: String, _ value: String, _ hint: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.6).foregroundStyle(EduTheme.muted)
            Text(value).font(.title2.weight(.bold).monospacedDigit()).foregroundStyle(color)
            Text(hint).font(.caption2).foregroundStyle(EduTheme.muted).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .modifier(HomeCardStyle())
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("\(total) ligne\(total > 1 ? "s" : "")").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Spacer()
                if total > 0 {
                    Button(selecting ? "Terminer" : "Sélectionner") {
                        withAnimation { selecting.toggle(); if !selecting { selected = [] } }
                    }
                    .font(.subheadline.weight(.semibold))
                    .tint(EduTheme.teal)
                }
            }
            .padding(16)
            if selecting {
                HStack {
                    Button(selected.count == rows.count ? "Tout désélectionner" : "Tout sélectionner (\(rows.count))") {
                        selected = selected.count == rows.count ? [] : Set(rows.map(\.id))
                    }
                    .font(.caption.weight(.semibold))
                    .tint(EduTheme.teal)
                    Spacer()
                }
                .padding(.horizontal, 16).padding(.bottom, 8)
            }
            Divider()
            if loading && rows.isEmpty {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity).padding(24)
            } else if rows.isEmpty {
                Text(status == .absent ? "Aucune absence à justifier sur cette période." : "Aucune ligne pour ces filtres.")
                    .font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            } else {
                ForEach(rows) { r in
                    row(r)
                    Divider().padding(.leading, 16)
                }
                if rows.count < total {
                    Button { Task { await loadMore() } } label: {
                        Text(loading ? "Chargement…" : "Afficher plus (\(total - rows.count) restantes)")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .disabled(loading)
                }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func row(_ r: Row) -> some View {
        let on = selected.contains(r.id)
        return HStack(alignment: .top, spacing: 10) {
            if selecting {
                Image(systemName: on ? "checkmark.square.fill" : "square")
                    .font(.title3).foregroundStyle(on ? EduTheme.teal : EduTheme.subtle)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(r.name.isEmpty ? "Élève" : r.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Text([Self.fmtDay(r.date), r.classes?.name, r.matieres?.name].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(EduTheme.muted)
                if let note = r.note, !note.isEmpty {
                    Text(note).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 6) {
                statusBadge(r.status)
                if !selecting {
                    if r.status == "absent" {
                        smallButton("Justifier") { dialog = Dialog(kind: .justify, rows: [r]) }
                    } else if r.status == "excused" {
                        smallButton("Retirer") { dialog = Dialog(kind: .undo, rows: [r]) }
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture {
            guard selecting else { return }
            if on { selected.remove(r.id) } else { selected.insert(r.id) }
        }
    }

    private func statusBadge(_ s: String) -> some View {
        let (label, fg, bg): (String, Color, Color) = switch s {
        case "absent": ("À justifier", rose, rose100)
        case "late": ("Retard", H.amber, H.amber50)
        case "excused": ("Justifiée", sky, sky100)
        default: ("Présent", H.emerald, H.emerald50)
        }
        return Text(label).font(.caption.weight(.bold)).foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(bg, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func smallButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                .padding(.horizontal, 10).frame(minHeight: 28)
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var bulkBar: some View {
        let absent = selectedRows.filter { $0.status == "absent" }
        let excused = selectedRows.filter { $0.status == "excused" }
        let ignored = selected.count - absent.count - excused.count
        return VStack(spacing: 8) {
            Text("\(selected.count) ligne\(selected.count > 1 ? "s" : "") sélectionnée\(selected.count > 1 ? "s" : "")"
                 + (ignored > 0 ? " · \(ignored) retard(s) ou présence(s) ignoré(s)" : ""))
                .font(.caption).foregroundStyle(EduTheme.muted)
            HStack(spacing: 8) {
                Button { dialog = Dialog(kind: .justify, rows: absent) } label: {
                    Text("Justifier (\(absent.count))").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain).disabled(absent.isEmpty).opacity(absent.isEmpty ? 0.5 : 1)
                if !excused.isEmpty {
                    Button { dialog = Dialog(kind: .undo, rows: excused) } label: {
                        Text("Retirer la justification (\(excused.count))").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(12)
        .background(.white)
        .overlay(alignment: .top) { Divider() }
    }

    static func fmtDay(_ iso: String) -> String {
        let p = iso.prefix(10).split(separator: "-")
        return p.count == 3 ? "\(p[2])/\(p[1])/\(p[0])" : iso
    }

    // MARK: - Loading

    private var query: EduAPI.AttendanceQuery {
        EduAPI.AttendanceQuery(from: EduDates.day(from), to: EduDates.day(to), classId: classId.isEmpty ? nil : classId,
                               subjectId: subjectId.isEmpty ? nil : subjectId, status: status.rawValue)
    }

    private func loadLists() async {
        guard let sid = auth.schoolId else { return }
        let api = EduAPI()
        classes = ((try? await api.fetchClasses(schoolId: sid)) ?? []).sorted { a, b in
            let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
            let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
            return ra != rb ? ra < rb : a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
        subjects = (try? await api.fetchSchoolSubjects(schoolId: sid)) ?? []
    }

    private func reload() async {
        guard let sid = auth.schoolId else { ready = true; return }
        guard from <= to else { ready = true; return }
        loading = true
        page = 0
        let q = query
        let api = EduAPI()
        do {
            async let t = api.attendanceTotals(schoolId: sid, q)
            async let p = api.attendancePage(schoolId: sid, q, page: 0, size: Self.pageSize)
            let (tt, pp) = try await (t, p)
            totals = tt
            rows = pp.rows
            total = pp.total
            selected = selected.intersection(Set(rows.map(\.id)))
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        loading = false
        ready = true
    }

    private func loadMore() async {
        guard let sid = auth.schoolId else { return }
        loading = true
        do {
            let next = try await EduAPI().attendancePage(schoolId: sid, query, page: page + 1, size: Self.pageSize)
            page += 1
            rows += next.rows
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        loading = false
    }
}

// MARK: - Justify sheet

private struct JustifySheet: View {
    let dialog: SchoolAttendanceView.Dialog
    var onDone: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var reason = SchoolAttendanceView.reasons[0]
    @State private var extra = ""
    @State private var busy = false
    @State private var error: String?

    private var ids: [String] {
        dialog.rows.filter { dialog.kind == .justify ? $0.status == "absent" : $0.status == "excused" }.map(\.id)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(dialog.kind == .justify
                         ? "\(ids.count) absence\(ids.count > 1 ? "s" : "") à justifier."
                         : "\(ids.count) justification\(ids.count > 1 ? "s" : "") à retirer : \(ids.count > 1 ? "elles redeviendront" : "elle redeviendra") des absences à justifier.")
                }
                if dialog.kind == .justify {
                    Section("Motif") {
                        Picker("Motif", selection: $reason) {
                            ForEach(SchoolAttendanceView.reasons, id: \.self) { Text($0).tag($0) }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    }
                    Section("Précision (facultatif)") {
                        TextField("Ex. : certificat reçu le 3 novembre", text: $extra)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }
            .navigationTitle(dialog.kind == .justify ? "Justifier les absences" : "Retirer la justification")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Enregistrement…" : (dialog.kind == .justify ? "Justifier" : "Retirer")) { Task { await apply() } }
                        .fontWeight(.semibold).disabled(busy || ids.isEmpty)
                }
            }
        }
        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
    }

    private func apply() async {
        guard let uid = auth.userId else { return }
        busy = true
        defer { busy = false }
        let note = dialog.kind == .justify ? [reason, String(extra.trimmingCharacters(in: .whitespaces).prefix(200))].filter { !$0.isEmpty }.joined(separator: " — ") : nil
        do {
            try await EduAPI().setPresenceStatus(ids: ids, status: dialog.kind == .justify ? "excused" : "absent", note: note, recordedBy: uid)
            onDone()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - API

extension EduAPI {
    struct AttendanceQuery {
        let from: String
        let to: String
        let classId: String?
        let subjectId: String?
        let status: String
    }

    private func filtered(_ q: PostgrestFilterBuilder, schoolId: String, _ a: AttendanceQuery, withStatus: Bool) -> PostgrestFilterBuilder {
        var r = q.eq("classes.school_id", value: schoolId).gte("date", value: a.from).lte("date", value: a.to)
        if let c = a.classId { r = r.eq("class_section_id", value: c) }
        if let s = a.subjectId { r = r.eq("subject_id", value: s) }
        if withStatus {
            if a.status == "exceptions" { r = r.neq("status", value: "present") }
            else if a.status != "all" { r = r.eq("status", value: a.status) }
        }
        return r
    }

    /// Totals of the period (not affected by the status filter).
    func attendanceTotals(schoolId: String, _ a: AttendanceQuery) async throws -> SchoolAttendanceView.Totals {
        func count(_ status: String?) async throws -> Int {
            var q = filtered(client.from("presences").select("id, classes:classes!presences_class_section_id_fkey!inner(school_id)", head: true, count: .exact),
                             schoolId: schoolId, a, withStatus: false)
            if let status { q = q.eq("status", value: status) }
            return try await q.execute().count ?? 0
        }
        async let t = count(nil)
        async let ab = count("absent")
        async let l = count("late")
        async let e = count("excused")
        return try await SchoolAttendanceView.Totals(total: t, absent: ab, late: l, excused: e)
    }

    func attendancePage(schoolId: String, _ a: AttendanceQuery, page: Int, size: Int) async throws -> (rows: [SchoolAttendanceView.Row], total: Int) {
        let res = try await filtered(
            client.from("presences").select("id, date, status, note, profils:profils!presences_student_id_fkey(first_name, last_name), classes:classes!presences_class_section_id_fkey!inner(id, name, school_id), matieres(name)", count: .exact),
            schoolId: schoolId, a, withStatus: true)
            .order("date", ascending: false).order("id")
            .range(from: page * size, to: page * size + size - 1)
            .execute()
        let rows = try JSONDecoder().decode([SchoolAttendanceView.Row].self, from: res.data)
        return (rows, res.count ?? rows.count)
    }

    func setPresenceStatus(ids: [String], status: String, note: String?, recordedBy: String) async throws {
        struct P: Encodable {
            let status: String; let note: String?; let recorded_by: String
            func encode(to e: Encoder) throws {
                var c = e.container(keyedBy: K.self)
                try c.encode(status, forKey: .status); try c.encode(note, forKey: .note); try c.encode(recorded_by, forKey: .recorded_by)
            }
            enum K: String, CodingKey { case status, note, recorded_by }
        }
        var i = 0
        while i < ids.count {
            let chunk = Array(ids[i..<min(i + 100, ids.count)])
            try await client.from("presences").update(P(status: status, note: note, recorded_by: recordedBy)).in("id", values: chunk).execute()
            i += 100
        }
    }
}
