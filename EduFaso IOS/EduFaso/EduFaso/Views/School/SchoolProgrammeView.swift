import SwiftUI

/// School admin « Programme par classe », like the web ProgrammeClasses: apply a template
/// (Primaire, Collège, Série A / C / D, Technique, Personnalisé) to several classes with its
/// coefficients, and adjust one class (coefficient, add or remove a subject).
struct SchoolProgrammeView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var subjects: [SubjectRow] = []
    @State private var counts: [String: Int] = [:]
    @State private var yearId = ""
    @State private var ready = false
    @State private var error: String?
    @State private var template: Template?
    @State private var adjustClassId = ""

    @State private var tour = TabTour(key: "programmes-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct Spec { let code: String; let name: String; let coef: Double }
    struct Template: Identifiable { let id: String; let label: String; let description: String; let specs: [Spec] }

    static let collegeCore: [Spec] = [
        Spec(code: "FR", name: "Français", coef: 4), Spec(code: "ANG", name: "Anglais", coef: 3), Spec(code: "MATH", name: "Mathématiques", coef: 4),
        Spec(code: "PC", name: "Physique-Chimie", coef: 3), Spec(code: "SVT", name: "Sciences de la Vie et de la Terre", coef: 3),
        Spec(code: "HG", name: "Histoire-Géographie", coef: 3), Spec(code: "ECM", name: "Éducation civique et morale", coef: 1),
        Spec(code: "EPS", name: "Éducation Physique et Sportive", coef: 1),
    ]

    /// Same templates and coefficients as the web `PROGRAMME_TEMPLATES`.
    static let templates: [Template] = [
        Template(id: "primaire", label: "Primaire (CP–CM)", description: "Curriculum primaire — langues, calcul, éveil, APE…",
                 specs: SchoolSubjectsView.catalog.filter { $0.2 == "Primaire" }.map { Spec(code: $0.1, name: $0.0, coef: ["FR", "CAL", "LEC"].contains($0.1) ? 3 : 1) }),
        Template(id: "college", label: "Collège (6e–3e)", description: "Tronc commun collège avec coefficients usuels.",
                 specs: collegeCore + [Spec(code: "INFO", name: "Informatique", coef: 1), Spec(code: "ART", name: "Arts plastiques", coef: 1)]),
        Template(id: "lycee-a", label: "Lycée — Série A", description: "Littéraire : français, langues, HG, philo…", specs: [
            Spec(code: "FR", name: "Français", coef: 5), Spec(code: "ANG", name: "Anglais", coef: 4), Spec(code: "PHILO", name: "Philosophie", coef: 4),
            Spec(code: "HG", name: "Histoire-Géographie", coef: 4), Spec(code: "MATH", name: "Mathématiques", coef: 2),
            Spec(code: "SVT", name: "Sciences de la Vie et de la Terre", coef: 2), Spec(code: "EPS", name: "Éducation Physique et Sportive", coef: 1),
            Spec(code: "ECM", name: "Éducation civique et morale", coef: 1)]),
        Template(id: "lycee-c", label: "Lycée — Série C", description: "Scientifique : maths, physique-chimie…", specs: [
            Spec(code: "MATH", name: "Mathématiques", coef: 5), Spec(code: "PC", name: "Physique-Chimie", coef: 5), Spec(code: "FR", name: "Français", coef: 3),
            Spec(code: "ANG", name: "Anglais", coef: 2), Spec(code: "HG", name: "Histoire-Géographie", coef: 2), Spec(code: "PHILO", name: "Philosophie", coef: 2),
            Spec(code: "SVT", name: "Sciences de la Vie et de la Terre", coef: 2), Spec(code: "EPS", name: "Éducation Physique et Sportive", coef: 1)]),
        Template(id: "lycee-d", label: "Lycée — Série D", description: "Sciences naturelles : SVT, PC, maths…", specs: [
            Spec(code: "SVT", name: "Sciences de la Vie et de la Terre", coef: 5), Spec(code: "PC", name: "Physique-Chimie", coef: 4),
            Spec(code: "MATH", name: "Mathématiques", coef: 4), Spec(code: "FR", name: "Français", coef: 3), Spec(code: "ANG", name: "Anglais", coef: 2),
            Spec(code: "HG", name: "Histoire-Géographie", coef: 2), Spec(code: "PHILO", name: "Philosophie", coef: 2), Spec(code: "EPS", name: "Éducation Physique et Sportive", coef: 1)]),
        Template(id: "technique", label: "Technique / commercial", description: "Comptabilité, gestion, commerce, langues…", specs: [
            Spec(code: "FR", name: "Français", coef: 3), Spec(code: "ANG", name: "Anglais", coef: 3), Spec(code: "MATH", name: "Mathématiques", coef: 3),
            Spec(code: "COMPTA", name: "Comptabilité", coef: 4), Spec(code: "GEST", name: "Gestion", coef: 4), Spec(code: "COM", name: "Commerce", coef: 3),
            Spec(code: "ECO", name: "Économie", coef: 3), Spec(code: "INFO", name: "Informatique", coef: 2), Spec(code: "EPS", name: "Éducation Physique et Sportive", coef: 1)]),
        Template(id: "custom", label: "Personnalisé", description: "Choisissez librement les matières du catalogue école.", specs: []),
    ]

    /// Classes that usually use a template (same rules as the web).
    static func classMatches(_ c: ClassRow, _ t: Template) -> Bool {
        func compact(_ s: String) -> String { SchoolSubjectsView.key(s).replacingOccurrences(of: " ", with: "") }
        let key = compact([c.gradeLevel, c.name].compactMap { $0 }.joined(separator: " "))
        let name = compact(c.name)
        let words = SchoolSubjectsView.key(c.name).split(separator: " ").map(String.init)
        let lycee = key.contains("seconde") || key.contains("premiere") || key.contains("terminale")
        let tech = name.contains("g1") || name.contains("g2") || name.contains("technique")
        switch t.id {
        case "custom": return true
        case "primaire": return key.hasPrefix("cp") || key.hasPrefix("ce") || key.hasPrefix("cm") || name.hasPrefix("cp") || name.hasPrefix("ce") || name.hasPrefix("cm")
        case "college": return ["6eme", "5eme", "4eme", "3eme"].contains { key.hasPrefix($0) || name.hasPrefix($0) }
        case "technique": return tech
        case "lycee-a": return !tech && lycee && (words.last == "a" || name.hasSuffix("a"))
        case "lycee-c": return !tech && lycee && (words.last == "c" || name.hasSuffix("c"))
        case "lycee-d": return !tech && lycee && (words.last == "d" || name.hasSuffix("d"))
        default: return false
        }
    }

    /// The school subject a template line points to (by code, else by name).
    static func match(_ spec: Spec, in subjects: [SubjectRow]) -> SubjectRow? {
        let byCode = subjects.filter { ($0.code ?? "").uppercased() == spec.code.uppercased() }
        if byCode.count == 1 { return byCode[0] }
        if let hit = byCode.first(where: { SchoolSubjectsView.key($0.name) == SchoolSubjectsView.key(spec.name) }) { return hit }
        if let first = byCode.first { return first }
        return subjects.first { SchoolSubjectsView.key($0.name) == SchoolSubjectsView.key(spec.name) }
    }

    private var yearClasses: [ClassRow] {
        classes.filter { yearId.isEmpty || $0.academicYearId == yearId }.sorted { a, b in
            let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
            let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
            return ra != rb ? ra < rb : a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }
    private var done: Int { yearClasses.filter { (counts[$0.id] ?? 0) > 0 }.count }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "pg.templates", icon: "square.stack.3d.up", title: "Appliquer un modèle",
                          message: "Choisissez un modèle (Primaire, Collège, Série…) : ses matières et coefficients sont proposés, cochez les classes puis « Appliquer »."),
            CoachMarkStep(id: "pg.adjust", icon: "slider.horizontal.3", title: "Ajuster une classe",
                          message: "Corrigez un coefficient, ajoutez ou retirez une matière pour une classe en particulier."),
            CoachMarkStep(id: "pg.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        templatesCard.coachMarkTarget("pg.templates")
                        adjustCard.coachMarkTarget("pg.adjust")
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await load() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Programmes")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(item: $template) { t in
            ApplyTemplateSheet(template: t, subjects: subjects, classes: yearClasses, counts: counts) { Task { await load() } }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Programme par classe").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                        Text("Appliquez un modèle à plusieurs classes, ou ajustez une classe en particulier.")
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("pg.help")
                }
                HStack(spacing: 8) {
                    stat("Avec programme", "\(done)", "sur \(yearClasses.count) classes")
                    stat("À faire", "\(yearClasses.count - done)", yearClasses.count - done > 0 ? "classes sans programme" : "tout est prêt")
                    stat("Matières", "\(subjects.count)", "dans l’école")
                }
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, _ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.5).foregroundStyle(.white.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.7)
            Text(value).font(.title2.weight(.bold).monospacedDigit()).foregroundStyle(.white)
            Text(hint).font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    private var templatesCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Appliquer un modèle").font(.headline).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            ForEach(Self.templates) { t in
                Button { template = t } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.label).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                            Text(t.description).font(.caption).foregroundStyle(EduTheme.muted)
                        }
                        Spacer()
                        let n = yearClasses.filter { Self.classMatches($0, t) }.count
                        if t.id != "custom" && n > 0 { Text("\(n) classe\(n > 1 ? "s" : "")").font(.caption).foregroundStyle(EduTheme.muted) }
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 11)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Divider().padding(.leading, 16)
            }
        }
        .modifier(HomeCardStyle())
    }

    private var adjustCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Ajuster une classe").font(.headline).foregroundStyle(EduTheme.ink)
            Text("Corrigez un coefficient, ajoutez ou retirez une matière.").font(.caption).foregroundStyle(EduTheme.muted)
            Picker("Classe", selection: $adjustClassId) {
                Text("Choisir une classe…").tag("")
                ForEach(yearClasses) { c in Text(c.name + ((counts[c.id] ?? 0) > 0 ? " — \(counts[c.id]!) matière(s)" : " — À faire")).tag(c.id) }
            }
            .tint(EduTheme.teal)
            if !adjustClassId.isEmpty {
                ClassProgrammeEditor(classId: adjustClassId, subjects: subjects) { Task { await loadCounts() } }
                    .id(adjustClassId)
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func load() async {
        guard let sid = auth.schoolId else { ready = true; return }
        let api = EduAPI()
        do {
            let years = try await api.fetchYears(schoolId: sid)
            yearId = years.first { $0.isCurrent }?.id ?? ""
            classes = try await api.fetchClasses(schoolId: sid)
            subjects = try await api.fetchSubjects(schoolId: sid)
            await loadCounts()
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    private func loadCounts() async {
        let map = (try? await EduAPI().fetchProgrammeMap(classIds: classes.map(\.id))) ?? [:]
        counts = map.mapValues(\.count)
    }
}

// MARK: - Apply a template

private struct ApplyTemplateSheet: View {
    let template: SchoolProgrammeView.Template
    let subjects: [SubjectRow]
    let classes: [ClassRow]
    let counts: [String: Int]
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var picked: Set<String> = []
    @State private var coefs: [String: String] = [:]
    @State private var classIds: Set<String> = []
    @State private var showAll = false
    @State private var saving = false
    @State private var error: String?

    private var matched: [(SubjectRow, Double)] {
        var used = Set<String>()
        return template.specs.compactMap { spec in
            guard let s = SchoolProgrammeView.match(spec, in: subjects), used.insert(s.id).inserted else { return nil }
            return (s, spec.coef)
        }
    }
    private var missing: [SchoolProgrammeView.Spec] { template.specs.filter { SchoolProgrammeView.match($0, in: subjects) == nil } }
    private var listedSubjects: [SubjectRow] {
        template.id == "custom" ? subjects : matched.map(\.0) + subjects.filter { s in !matched.contains { $0.0.id == s.id } }
    }
    private var suggested: [ClassRow] { classes.filter { SchoolProgrammeView.classMatches($0, template) } }
    private var shownClasses: [ClassRow] { template.id == "custom" || showAll || suggested.isEmpty ? classes : suggested }

    var body: some View {
        EduFormSheet(title: template.label, primary: saving ? "…" : "Appliquer (\(picked.count) × \(classIds.count))", primaryDisabled: saving || picked.isEmpty || classIds.isEmpty, busy: saving, onPrimary: { Task { await apply() } }) {
                if !missing.isEmpty && template.id != "custom" {
                    Section {
                        Text("Absentes du catalogue de l’école : " + missing.map(\.name).joined(separator: ", ") + ". Ajoutez-les dans « Matières » si vous les enseignez.")
                            .font(.caption).foregroundStyle(TeacherHomeView.amber)
                    }
                }
                Section("Matières et coefficients") {
                    ForEach(listedSubjects) { s in
                        HStack {
                            Button {
                                if picked.contains(s.id) { picked.remove(s.id) } else { picked.insert(s.id); if coefs[s.id] == nil { coefs[s.id] = "1" } }
                            } label: {
                                HStack {
                                    Image(systemName: picked.contains(s.id) ? "checkmark.square.fill" : "square").foregroundStyle(picked.contains(s.id) ? EduTheme.teal : EduTheme.subtle)
                                    Text(s.name).foregroundStyle(EduTheme.ink)
                                }
                            }
                            Spacer()
                            if picked.contains(s.id) {
                                TextField("1", text: Binding(get: { coefs[s.id] ?? "1" }, set: { coefs[s.id] = $0 }))
                                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 50)
                                Text("coef").font(.caption).foregroundStyle(EduTheme.muted)
                            }
                        }
                    }
                }
                Section {
                    ForEach(shownClasses) { c in
                        Button {
                            if classIds.contains(c.id) { classIds.remove(c.id) } else { classIds.insert(c.id) }
                        } label: {
                            HStack {
                                Image(systemName: classIds.contains(c.id) ? "checkmark.square.fill" : "square").foregroundStyle(classIds.contains(c.id) ? EduTheme.teal : EduTheme.subtle)
                                Text(c.name).foregroundStyle(EduTheme.ink)
                                Spacer()
                                Text((counts[c.id] ?? 0) > 0 ? "\(counts[c.id]!) matière(s)" : "À faire")
                                    .font(.caption).foregroundStyle((counts[c.id] ?? 0) > 0 ? EduTheme.muted : TeacherHomeView.amber)
                            }
                        }
                    }
                    if template.id != "custom" && !suggested.isEmpty && suggested.count < classes.count {
                        Button(showAll ? "Voir seulement les classes suggérées" : "Voir toutes les classes") { showAll.toggle() }
                    }
                } header: {
                    HStack {
                        Text("Classes")
                        Spacer()
                        Button("Tout cocher") { classIds = Set(shownClasses.map(\.id)) }.font(.caption)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .onAppear {
            picked = Set(matched.map(\.0.id))
            for (s, c) in matched { coefs[s.id] = c.rounded() == c ? String(Int(c)) : String(c) }
        }
    }

    private func apply() async {
        for id in picked {
            let v = Double((coefs[id] ?? "1").replacingOccurrences(of: ",", with: ".")) ?? 0
            if v <= 0 { error = "Coefficient invalide pour « \(subjects.first { $0.id == id }?.name ?? "une matière") » (doit être > 0)."; return }
        }
        saving = true
        defer { saving = false }
        let rows = classIds.flatMap { cid in picked.map { sid in (cid, sid, Double((coefs[sid] ?? "1").replacingOccurrences(of: ",", with: ".")) ?? 1) } }
        do {
            try await EduAPI().upsertProgramme(rows: rows)
            onDone()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - One class

private struct ClassProgrammeEditor: View {
    let classId: String
    let subjects: [SubjectRow]
    var onChanged: () -> Void

    typealias Line = ProgrammeLine

    @State private var lines: [Line] = []
    @State private var coefs: [String: String] = [:]
    @State private var adding = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if lines.isEmpty { Text("Aucune matière au programme de cette classe.").font(.caption).foregroundStyle(EduTheme.muted) }
            ForEach(lines) { l in
                HStack(spacing: 8) {
                    Text(l.matieres?.name ?? "Matière").font(.subheadline).foregroundStyle(EduTheme.ink)
                    Spacer()
                    TextField("1", text: Binding(get: { coefs[l.id] ?? "1" }, set: { coefs[l.id] = $0 }))
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 46)
                        .onSubmit { Task { await saveCoef(l) } }
                    Text("coef").font(.caption).foregroundStyle(EduTheme.muted)
                    Button { Task { await saveCoef(l) } } label: { Image(systemName: "checkmark.circle") }.tint(EduTheme.teal)
                    Button(role: .destructive) { Task { await remove(l) } } label: { Image(systemName: "trash") }
                        .tint(Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255))
                }
                .padding(.vertical, 2)
            }
            let available = subjects.filter { s in !lines.contains { $0.subject_id == s.id } }
            if !available.isEmpty {
                HStack {
                    Picker("Ajouter une matière", selection: $adding) {
                        Text("Ajouter une matière…").tag("")
                        ForEach(available) { Text($0.name).tag($0.id) }
                    }
                    .tint(EduTheme.teal)
                    Button("Ajouter") { Task { await add() } }.disabled(adding.isEmpty).font(.subheadline.weight(.semibold)).tint(EduTheme.teal)
                }
            }
            if let error { Text(error).font(.caption).foregroundStyle(EduTheme.fasoRed) }
        }
        .task { await load() }
    }

    private func load() async {
        lines = (try? await EduAPI().fetchProgrammeLines(classId: classId)) ?? []
        coefs = Dictionary(uniqueKeysWithValues: lines.map { ($0.id, $0.coefficient.map { $0.rounded() == $0 ? String(Int($0)) : String($0) } ?? "1") })
    }

    private func saveCoef(_ l: Line) async {
        guard let v = Double((coefs[l.id] ?? "").replacingOccurrences(of: ",", with: ".")), v > 0 else { error = "Coefficient invalide (doit être > 0)."; return }
        do { try await EduAPI().upsertProgramme(rows: [(classId, l.subject_id, v)]); error = nil; onChanged() } catch { self.error = error.localizedDescription }
    }

    private func remove(_ l: Line) async {
        do { try await EduAPI().deleteProgrammeLine(id: l.id); await load(); onChanged() } catch { self.error = error.localizedDescription }
    }

    private func add() async {
        do { try await EduAPI().upsertProgramme(rows: [(classId, adding, 1)]); adding = ""; await load(); onChanged() } catch { self.error = error.localizedDescription }
    }
}

extension EduAPI {
    func upsertProgramme(rows: [(String, String, Double)]) async throws {
        struct P: Encodable { let class_section_id: String; let subject_id: String; let coefficient: Double }
        try await client.from("programme_classe").upsert(rows.map { P(class_section_id: $0.0, subject_id: $0.1, coefficient: $0.2) },
                                                          onConflict: "class_section_id,subject_id").execute()
    }

    func fetchProgrammeLines(classId: String) async throws -> [ProgrammeLine] {
        try await client.from("programme_classe").select("id, subject_id, coefficient, matieres(id, name)")
            .eq("class_section_id", value: classId).order("created_at").execute().value
    }

    func deleteProgrammeLine(id: String) async throws {
        try await client.from("programme_classe").delete().eq("id", value: id).execute()
    }
}

struct ProgrammeLine: Decodable, Identifiable { let id: String; let subject_id: String; let coefficient: Double?; let matieres: NamedEntity? }
