import SwiftUI

/// School admin « Classes », like the web Classes: the classes of a school year, created from the
/// catalogue (tick, or a whole category) or by hand; removing one asks for the admin password.
struct SchoolClassesView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var years: [YearRow] = []
    @State private var yearId = ""
    @State private var classes: [ClassRow] = []
    @State private var selected: Set<String> = []
    @State private var ready = false
    @State private var error: String?
    @State private var saving = false
    @State private var custom = false
    @State private var removing: ClassRow?
    @State private var password = ""

    @State private var tour = TabTour(key: "classes-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct Item { let id: String; let name: String; let grade: String; let category: String }

    /// Same catalogue as the web `CLASS_CATALOG`.
    static let catalog: [Item] = {
        func sections(_ cat: String, _ grade: String, _ letters: [String]) -> [Item] {
            letters.map { Item(id: "\(cat)-\(grade)-\($0)".lowercased(), name: "\(grade) \($0)", grade: grade, category: cat) }
        }
        var out: [Item] = []
        for g in ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"] { out += sections("Primaire", g, ["A", "B", "C"]) }
        for g in ["6ème", "5ème", "4ème", "3ème"] { out += sections("Collège", g, ["A", "B", "C"]) }
        for g in ["Seconde", "Première", "Terminale"] { out += sections("Lycée", g, ["A", "C", "D"]) }
        for (g, n) in [("Seconde", "Seconde"), ("Première", "Première"), ("Terminale", "Terminale")] {
            out += ["G1", "G2"].map { Item(id: "tech-\(n)-\($0)".lowercased(), name: "\(n) \($0)", grade: g, category: "Technique") }
        }
        return out
    }()
    static let categories = ["Primaire", "Collège", "Lycée", "Technique"]

    private var yearClasses: [ClassRow] { classes.filter { $0.academicYearId == yearId } }
    private func existing(_ item: Item) -> ClassRow? {
        yearClasses.first { SchoolSubjectsView.key($0.name) == SchoolSubjectsView.key(item.name) }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "cl.catalog", icon: "rectangle.3.group", title: "Créer les classes",
                          message: "Choisissez l’année, cochez les classes (ou toute une catégorie), puis « Ajouter ». Une classe déjà créée apparaît en vert."),
            CoachMarkStep(id: "cl.list", icon: "list.bullet", title: "Classes de l’année",
                          message: "Le programme se règle ensuite dans « Programmes ». Une classe se retire avec votre mot de passe."),
            CoachMarkStep(id: "cl.help", icon: "questionmark.circle.fill", title: "Revoir ce guide", message: "Touchez ce bouton à tout moment pour relancer la visite."),
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
                                Picker("Année", selection: $yearId) { ForEach(years) { y in Text(y.label + (y.isCurrent ? " (courante)" : "")).tag(y.id) } }
                                    .labelsHidden().tint(EduTheme.teal)
                            }
                            .font(.subheadline).padding(.horizontal, 16).padding(.vertical, 6).modifier(HomeCardStyle())
                            catalogCard.coachMarkTarget("cl.catalog")
                            listCard.coachMarkTarget("cl.list")
                        }
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
        .navigationTitle("Classes")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: yearId) { _, _ in selected = [] }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(isPresented: $custom) {
            CustomClassSheet(yearId: yearId, existing: yearClasses) { Task { await load() } }.environmentObject(auth)
        }
        .alert(removing.map { "Retirer « \($0.name) » ?" } ?? "", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            SecureField("Mot de passe", text: $password)
            Button("Annuler", role: .cancel) { password = ""; removing = nil }
            Button("Retirer la classe", role: .destructive) { if let c = removing { Task { await remove(c) } } }
        } message: {
            Text("La classe sera retirée de l’année. Saisissez votre mot de passe administrateur pour confirmer.")
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Classes").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Créez les classes de l’année — le programme se fait à l’étape suivante.")
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("cl.help")
                }
                Button { custom = true } label: {
                    Label("Classe personnalisée", systemImage: "plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain).disabled(yearId.isEmpty)
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var catalogCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            let available = Self.catalog.filter { existing($0) == nil }.count
            Text("Catalogue · \(available) disponible\(available > 1 ? "s" : "")\(available < Self.catalog.count ? " · \(Self.catalog.count - available) déjà créée(s)" : "")")
                .font(.headline).foregroundStyle(EduTheme.ink)
            ForEach(Self.categories, id: \.self) { cat in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(cat.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(0.5).foregroundStyle(EduTheme.muted)
                        Spacer()
                        Button("Tout cocher") { for i in Self.catalog where i.category == cat && existing(i) == nil { selected.insert(i.id) } }
                            .font(.caption.weight(.semibold)).tint(EduTheme.teal)
                    }
                    FlowLayout(spacing: 6) {
                        ForEach(Self.catalog.filter { $0.category == cat }, id: \.id) { item in
                            let done = existing(item) != nil
                            let on = selected.contains(item.id)
                            Button {
                                if let c = existing(item) { removing = c; return }
                                if on { selected.remove(item.id) } else { selected.insert(item.id) }
                            } label: {
                                HStack(spacing: 4) {
                                    if done { Image(systemName: "checkmark").font(.caption2.weight(.bold)) }
                                    Text(item.name).font(.caption.weight(.semibold))
                                }
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .foregroundStyle(done ? H.emerald : (on ? .white : EduTheme.ink))
                                .background(done ? H.emerald50 : (on ? EduTheme.teal : .white), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(on || done ? .clear : EduTheme.border, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            Button { Task { await addSelected() } } label: {
                Text(saving ? "Ajout…" : "Ajouter (\(selected.count))")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 42)
                    .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            .buttonStyle(.plain).disabled(selected.isEmpty || saving).opacity(selected.isEmpty ? 0.5 : 1)
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private var listCard: some View {
        let sorted = yearClasses.sorted { a, b in
            let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
            let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
            return ra != rb ? ra < rb : a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
        return VStack(alignment: .leading, spacing: 0) {
            Text("\(sorted.count) classe\(sorted.count > 1 ? "s" : "") cette année").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            if sorted.isEmpty { Text("Aucune classe pour cette année.").font(.subheadline).foregroundStyle(EduTheme.muted).padding(16) }
            ForEach(sorted) { c in
                HStack(spacing: 10) {
                    Circle().fill(TeacherStudentsView.classColor(id: c.id, name: c.name)).frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(c.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                        if let g = c.gradeLevel, !g.isEmpty, g != c.name { Text(g).font(.caption).foregroundStyle(EduTheme.muted) }
                    }
                    Spacer()
                    Button(role: .destructive) { removing = c } label: { Image(systemName: "trash") }
                        .tint(Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255))
                        .accessibilityLabel("Retirer \(c.name)")
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider().padding(.leading, 34)
            }
        }
        .modifier(HomeCardStyle())
    }

    private func load() async {
        guard let sid = auth.schoolId else { ready = true; return }
        let api = EduAPI()
        do {
            years = try await api.fetchYears(schoolId: sid).sorted { $0.startDate > $1.startDate }
            if yearId.isEmpty { yearId = (years.first { $0.isCurrent } ?? years.first)?.id ?? "" }
            classes = try await api.fetchClasses(schoolId: sid)
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    private func addSelected() async {
        guard let sid = auth.schoolId, !yearId.isEmpty else { return }
        let rows = Self.catalog.filter { selected.contains($0.id) && existing($0) == nil }
        guard !rows.isEmpty else { return }
        saving = true
        defer { saving = false }
        do {
            try await EduAPI().insertClasses(schoolId: sid, yearId: yearId, rows: rows.map { ($0.name, $0.grade) })
            selected = []
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func remove(_ c: ClassRow) async {
        guard let sid = auth.schoolId else { return }
        let pw = password
        password = ""
        removing = nil
        do {
            guard let email = SupabaseManager.client.auth.currentUser?.email else { error = "Session expirée."; return }
            _ = try await SupabaseManager.client.auth.signIn(email: email, password: pw)
        } catch {
            self.error = "Mot de passe incorrect."
            return
        }
        do {
            try await EduAPI().deleteClass(id: c.id, schoolId: sid)
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

private struct CustomClassSheet: View {
    let yearId: String
    let existing: [ClassRow]
    var onSaved: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var grade = ""
    @State private var capacity = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nom de la classe (ex. 6ème D)", text: $name)
                    TextField("Niveau (facultatif, ex. 6ème)", text: $grade)
                    TextField("Effectif maximum (facultatif)", text: $capacity).keyboardType(.numberPad)
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }
            .navigationTitle("Classe personnalisée")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Création…" : "Créer") { Task { await save() } }.fontWeight(.semibold)
                        .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
    }

    private func save() async {
        guard let sid = auth.schoolId else { return }
        let n = name.trimmingCharacters(in: .whitespaces)
        if existing.contains(where: { SchoolSubjectsView.key($0.name) == SchoolSubjectsView.key(n) }) { error = "Cette classe existe déjà pour cette année."; return }
        saving = true
        defer { saving = false }
        let g = grade.trimmingCharacters(in: .whitespaces)
        do {
            try await EduAPI().insertClasses(schoolId: sid, yearId: yearId, rows: [(n, g.isEmpty ? n : g)], capacity: Int(capacity))
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

extension EduAPI {
    func insertClasses(schoolId: String, yearId: String, rows: [(String, String)], capacity: Int? = nil) async throws {
        struct P: Encodable {
            let school_id: String; let academic_year_id: String; let name: String; let grade_level: String; let capacity: Int?
            func encode(to e: Encoder) throws {
                var c = e.container(keyedBy: K.self)
                try c.encode(school_id, forKey: .school_id); try c.encode(academic_year_id, forKey: .academic_year_id)
                try c.encode(name, forKey: .name); try c.encode(grade_level, forKey: .grade_level); try c.encode(capacity, forKey: .capacity)
            }
            enum K: String, CodingKey { case school_id, academic_year_id, name, grade_level, capacity }
        }
        try await client.from("classes").insert(rows.map { P(school_id: schoolId, academic_year_id: yearId, name: $0.0, grade_level: $0.1, capacity: capacity) }).execute()
    }

    func deleteClass(id: String, schoolId: String) async throws {
        try await client.from("classes").delete().eq("id", value: id).eq("school_id", value: schoolId).execute()
    }
}
