import SwiftUI

/// School admin « Matières », like the web Matieres: the school's catalogue of subjects; add them
/// from the national catalogue (tick, or a whole category), add a custom subject, rename, delete
/// (admin password, with what is linked to it).
struct SchoolSubjectsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var subjects: [SubjectRow] = []
    @State private var selected: Set<String> = []
    @State private var ready = false
    @State private var error: String?
    @State private var saving = false
    @State private var editing: Draft?
    @State private var deleting: SubjectRow?
    @State private var deleteHint = ""
    @State private var password = ""
    @State private var showCatalog = false

    @State private var tour = TabTour(key: "matieres-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct Draft: Identifiable { var id: String { subjectId ?? "new" }; var subjectId: String?; var name: String; var code: String }

    /// Same catalogue as the web `SUBJECT_CATALOG` (name, code, category).
    static let catalog: [(String, String, String)] = [
        ("Français", "FR", "Primaire"),
        ("Calcul", "CAL", "Primaire"),
        ("Anglais", "ANG", "Primaire"),
        ("Exercices d’observation", "OBS", "Primaire"),
        ("Histoire", "HIST", "Primaire"),
        ("Géographie", "GEO", "Primaire"),
        ("Éducation civique et morale", "ECM", "Primaire"),
        ("Activités physiques et éducatives", "APE", "Primaire"),
        ("Dessin", "DESS", "Primaire"),
        ("Chant", "CHANT", "Primaire"),
        ("Activités pratiques et productives", "APP", "Primaire"),
        ("Technologies de l’information et de la communication", "TIC", "Primaire"),
        ("Langue nationale", "LNAT", "Primaire"),
        ("Lecture", "LEC", "Primaire"),
        ("Écriture", "ECR", "Primaire"),
        ("Expression orale", "EO", "Primaire"),
        ("Éveil scientifique", "EVEIL", "Primaire"),
        ("Français", "FR", "Langues (collège / lycée)"),
        ("Anglais", "ANG", "Langues (collège / lycée)"),
        ("Allemand", "ALL", "Langues (collège / lycée)"),
        ("Espagnol", "ESP", "Langues (collège / lycée)"),
        ("Arabe", "ARA", "Langues (collège / lycée)"),
        ("Latin", "LAT", "Langues (collège / lycée)"),
        ("Moore", "MOO", "Langues (collège / lycée)"),
        ("Dioula", "DIO", "Langues (collège / lycée)"),
        ("Mathématiques", "MATH", "Sciences (collège / lycée)"),
        ("Physique-Chimie", "PC", "Sciences (collège / lycée)"),
        ("Sciences de la Vie et de la Terre", "SVT", "Sciences (collège / lycée)"),
        ("Sciences Physiques", "SP", "Sciences (collège / lycée)"),
        ("Informatique", "INFO", "Sciences (collège / lycée)"),
        ("Technologie", "TECH", "Sciences (collège / lycée)"),
        ("Histoire-Géographie", "HG", "Sciences humaines (collège / lycée)"),
        ("Philosophie", "PHILO", "Sciences humaines (collège / lycée)"),
        ("Éducation civique et morale", "ECM", "Sciences humaines (collège / lycée)"),
        ("Éducation à la citoyenneté", "EC", "Sciences humaines (collège / lycée)"),
        ("Économie", "ECO", "Sciences humaines (collège / lycée)"),
        ("Sciences économiques et sociales", "SES", "Sciences humaines (collège / lycée)"),
        ("Éducation Physique et Sportive", "EPS", "Arts & sport"),
        ("Arts plastiques", "ART", "Arts & sport"),
        ("Musique", "MUS", "Arts & sport"),
        ("Théâtre", "THE", "Arts & sport"),
        ("Comptabilité", "COMPTA", "Techniques & options"),
        ("Gestion", "GEST", "Techniques & options"),
        ("Secrétariat", "SEC", "Techniques & options"),
        ("Commerce", "COM", "Techniques & options"),
        ("Électrotechnique", "ELEC", "Techniques & options"),
        ("Mécanique", "MEC", "Techniques & options"),
        ("Dessin technique", "DT", "Techniques & options"),
        ("Agriculture", "AGRI", "Techniques & options"),
        ("Conduite accompagnée", "COND", "Techniques & options")
    ]

    static func key(_ s: String) -> String {
        s.folding(options: .diacriticInsensitive, locale: .current).lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }

    private func added(_ item: (String, String, String)) -> Bool {
        subjects.contains { Self.key($0.name) == Self.key(item.0) || ($0.code ?? "").uppercased() == item.1.uppercased() }
    }

    private var categories: [String] {
        var seen: [String] = []
        for c in Self.catalog where !seen.contains(c.2) { seen.append(c.2) }
        return seen
    }

    private var availableCount: Int { Set(Self.catalog.filter { !added($0) }.map(\.1)).count }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "ma.catalog", icon: "books.vertical", title: "Catalogue national",
                          message: "Cochez les matières enseignées dans l’école (ou toute une catégorie), puis « Ajouter au catalogue »."),
            CoachMarkStep(id: "ma.list", icon: "book", title: "Matières de l’école",
                          message: "Le programme et les coefficients se règlent ensuite dans chaque classe (« Programmes »). Touchez une matière pour la renommer."),
            CoachMarkStep(id: "ma.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        catalogCard.coachMarkTarget("ma.catalog")
                        listCard.coachMarkTarget("ma.list")
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
        .navigationTitle("Matières")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(item: $editing) { d in
            SubjectFormSheet(draft: d, existing: subjects) { Task { await load() } }.environmentObject(auth)
        }
        .alert(deleting.map { "Supprimer « \($0.name) » ?" } ?? "", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            SecureField("Mot de passe", text: $password)
            Button("Annuler", role: .cancel) { password = ""; deleting = nil }
            Button("Supprimer la matière", role: .destructive) { if let s = deleting { Task { await delete(s) } } }
        } message: {
            Text(deleteHint.isEmpty ? "Saisissez votre mot de passe administrateur pour confirmer." : deleteHint)
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Matières").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Catalogue de l’école — le programme se règle ensuite dans chaque classe.")
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("ma.help")
                }
                Button { editing = Draft(subjectId: nil, name: "", code: "") } label: {
                    Label("Matière personnalisée", systemImage: "plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var catalogCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { withAnimation { showCatalog.toggle() } } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Catalogue national").font(.headline).foregroundStyle(EduTheme.ink)
                        Text("\(availableCount) matière\(availableCount > 1 ? "s" : "") disponible\(availableCount > 1 ? "s" : "")").font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    Spacer()
                    Image(systemName: showCatalog ? "chevron.up" : "chevron.down").foregroundStyle(EduTheme.muted)
                }
            }
            .buttonStyle(.plain)
            if showCatalog {
                ForEach(categories, id: \.self) { cat in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(cat.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(0.5).foregroundStyle(EduTheme.muted)
                            Spacer()
                            Button("Tout cocher") {
                                for item in Self.catalog where item.2 == cat && !added(item) { selected.insert(item.1) }
                            }
                            .font(.caption.weight(.semibold)).tint(EduTheme.teal)
                        }
                        FlowChips(items: Self.catalog.filter { $0.2 == cat }.map { ($0.1, $0.0, added($0)) }, selected: $selected)
                    }
                }
                Button { Task { await addSelected() } } label: {
                    Text(saving ? "Ajout…" : "Ajouter au catalogue (\(selected.count))")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain).disabled(selected.isEmpty || saving).opacity(selected.isEmpty ? 0.5 : 1)
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private var listCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(subjects.count) matière\(subjects.count > 1 ? "s" : "") dans l’école").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            if subjects.isEmpty {
                Text("Aucune matière : ajoutez-les depuis le catalogue national.").font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            }
            ForEach(subjects) { s in
                HStack(spacing: 10) {
                    Circle().fill(SubjectPalette.swatch(for: s.name).border).frame(width: 8, height: 8)
                    Button { editing = Draft(subjectId: s.id, name: s.name, code: s.code ?? "") } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                            if let c = s.code, !c.isEmpty { Text(c).font(.caption).foregroundStyle(EduTheme.muted) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    Button(role: .destructive) { Task { await requestDelete(s) } } label: { Image(systemName: "trash") }
                        .tint(Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255))
                        .accessibilityLabel("Supprimer \(s.name)")
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider().padding(.leading, 34)
            }
        }
        .modifier(HomeCardStyle())
    }

    private func load() async {
        guard let sid = auth.schoolId else { ready = true; return }
        do {
            subjects = try await EduAPI().fetchSubjects(schoolId: sid)
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    private func addSelected() async {
        guard let sid = auth.schoolId else { return }
        saving = true
        defer { saving = false }
        var seen = Set<String>()
        let rows = Self.catalog.filter { selected.contains($0.1) && !added($0) && seen.insert($0.1).inserted }
        guard !rows.isEmpty else { return }
        do {
            try await EduAPI().insertCatalogSubjects(schoolId: sid, rows: rows.map { ($0.0, $0.1) })
            selected = []
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func requestDelete(_ s: SubjectRow) async {
        let c = (try? await EduAPI().subjectLinks(id: s.id)) ?? (0, 0, 0)
        var parts: [String] = []
        if c.0 > 0 { parts.append("\(c.0) note(s)") }
        if c.1 > 0 { parts.append("\(c.1) programme(s) de classe") }
        if c.2 > 0 { parts.append("\(c.2) affectation(s)") }
        deleteHint = parts.isEmpty ? "" : "Attention : cette matière est liée à " + parts.joined(separator: ", ") + ". Saisissez votre mot de passe administrateur pour confirmer."
        deleting = s
    }

    private func delete(_ s: SubjectRow) async {
        guard let sid = auth.schoolId else { return }
        let pw = password
        password = ""
        deleting = nil
        do {
            guard let email = SupabaseManager.client.auth.currentUser?.email else { error = "Session expirée."; return }
            _ = try await SupabaseManager.client.auth.signIn(email: email, password: pw)
        } catch {
            self.error = "Mot de passe incorrect."
            return
        }
        do {
            try await EduAPI().deleteSubject(id: s.id, schoolId: sid)
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

/// Tappable chips that wrap onto several lines.
private struct FlowChips: View {
    let items: [(code: String, name: String, added: Bool)]
    @Binding var selected: Set<String>

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(items, id: \.code) { item in
                let on = selected.contains(item.code)
                Button {
                    guard !item.added else { return }
                    if on { selected.remove(item.code) } else { selected.insert(item.code) }
                } label: {
                    HStack(spacing: 4) {
                        if item.added { Image(systemName: "checkmark").font(.caption2.weight(.bold)) }
                        Text(item.name).font(.caption.weight(.semibold))
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .foregroundStyle(item.added ? TeacherHomeView.emerald : (on ? .white : EduTheme.ink))
                    .background(item.added ? TeacherHomeView.emerald50 : (on ? EduTheme.teal : .white), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(on || item.added ? .clear : EduTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(item.added)
            }
        }
    }
}

/// Minimal wrapping layout.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
        return CGSize(width: width, height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}

private struct SubjectFormSheet: View {
    @State var draft: SchoolSubjectsView.Draft
    let existing: [SubjectRow]
    var onSaved: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nom de la matière", text: $draft.name)
                    TextField("Code (facultatif, ex. SVT)", text: $draft.code).textInputAutocapitalization(.characters)
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }
            .navigationTitle(draft.subjectId == nil ? "Matière personnalisée" : "Modifier la matière")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Enregistrement…" : "Enregistrer") { Task { await save() } }.fontWeight(.semibold)
                        .disabled(saving || draft.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
    }

    private func save() async {
        guard let sid = auth.schoolId else { return }
        let name = draft.name.trimmingCharacters(in: .whitespaces)
        let code = draft.code.trimmingCharacters(in: .whitespaces)
        let dup = existing.contains { $0.id != draft.subjectId && (SchoolSubjectsView.key($0.name) == SchoolSubjectsView.key(name) || (!code.isEmpty && ($0.code ?? "").uppercased() == code.uppercased())) }
        if dup { error = "Cette matière existe déjà dans le catalogue."; return }
        saving = true
        defer { saving = false }
        do {
            try await EduAPI().saveSubject(id: draft.subjectId, schoolId: sid, name: name, code: code.isEmpty ? nil : code)
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

extension EduAPI {
    func insertCatalogSubjects(schoolId: String, rows: [(String, String)]) async throws {
        struct P: Encodable { let school_id: String; let name: String; let code: String; let coefficient: Double }
        try await client.from("matieres").insert(rows.map { P(school_id: schoolId, name: $0.0, code: $0.1, coefficient: 1) }).execute()
    }

    func saveSubject(id: String?, schoolId: String, name: String, code: String?) async throws {
        struct U: Encodable {
            let name: String; let code: String?
            func encode(to e: Encoder) throws { var c = e.container(keyedBy: K.self); try c.encode(name, forKey: .name); try c.encode(code, forKey: .code) }
            enum K: String, CodingKey { case name, code }
        }
        struct I: Encodable { let school_id: String; let name: String; let code: String?; let coefficient: Double }
        if let id { try await client.from("matieres").update(U(name: name, code: code)).eq("id", value: id).eq("school_id", value: schoolId).execute() }
        else { try await client.from("matieres").insert(I(school_id: schoolId, name: name, code: code, coefficient: 1)).execute() }
    }

    func subjectLinks(id: String) async throws -> (Int, Int, Int) {
        async let n = client.from("notes").select("id", head: true, count: .exact).eq("subject_id", value: id).execute().count
        async let p = client.from("programme_classe").select("id", head: true, count: .exact).eq("subject_id", value: id).execute().count
        async let a = client.from("affectations_enseignement").select("id", head: true, count: .exact).eq("subject_id", value: id).execute().count
        return try await ((n ?? 0), (p ?? 0), (a ?? 0))
    }

    func deleteSubject(id: String, schoolId: String) async throws {
        try await client.from("matieres").delete().eq("id", value: id).eq("school_id", value: schoolId).execute()
    }
}
