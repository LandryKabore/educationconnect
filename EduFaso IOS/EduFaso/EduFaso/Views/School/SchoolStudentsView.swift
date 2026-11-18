import SwiftUI
import UIKit

/// School admin « Élèves », like the web Eleves (without the CSV import, done on the web): every
/// student, by class, without a class or former students; the student file; creating a student
/// account; assigning students without a class to a class in a batch.
struct SchoolStudentsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var classFilter = ""
    @State private var search = ""
    @State private var rows: [PersonRow] = []
    @State private var total = 0
    @State private var withoutClass = 0
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?
    @State private var searchTask: Task<Void, Never>?

    @State private var selecting = false
    @State private var selected: Set<String> = []
    @State private var bulkClassId = ""
    @State private var creating = false
    @State private var notice: (title: String, message: String, copy: String?)?

    @State private var tour = TabTour(key: "eleves-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    private var filterLabel: String {
        switch classFilter {
        case "": return "Toutes les classes"
        case "__none__": return "Sans classe"
        case "__former__": return "Anciens élèves"
        default: return classes.first { $0.id == classFilter }?.name ?? "Classe"
        }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "el.new", icon: "person.badge.plus", title: "Nouvel élève",
                          message: "Créez le compte d’un élève dans sa classe : l’identifiant et le mot de passe temporaire s’affichent. L’import CSV / Excel se fait sur le site."),
            CoachMarkStep(id: "el.filters", icon: "line.3.horizontal.decrease.circle", title: "Classe",
                          message: "Toutes les classes, une classe, les élèves sans classe ou les anciens élèves. Cherchez par nom ou matricule."),
            CoachMarkStep(id: "el.list", icon: "person.text.rectangle", title: "Fiche élève",
                          message: "Touchez un élève pour ouvrir sa fiche. Pour les élèves sans classe : « Sélectionner », puis affectez-les à une classe d’un coup."),
            CoachMarkStep(id: "el.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        if withoutClass > 0 && classFilter != "__none__" { withoutClassCard }
                        filters.coachMarkTarget("el.filters")
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        list.coachMarkTarget("el.list")
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, selecting ? 130 : 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load(reset: true) }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .safeAreaInset(edge: .bottom) { if selecting { bulkBar } }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Élèves")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await loadClasses(); await load(reset: true) }
        .onChange(of: classFilter) { _, _ in selected = []; Task { await load(reset: true) } }
        .onChange(of: search) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                if !Task.isCancelled { await load(reset: true) }
            }
        }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(isPresented: $creating) {
            NewStudentSheet(classes: classes, initialClassId: classes.contains { $0.id == classFilter } ? classFilter : "") { res in
                Task {
                    await load(reset: true)
                    if let res {
                        notice = ("Compte créé", "Identifiant : \(res.username)\nMot de passe temporaire : \(res.tempPassword)", "\(res.username)\n\(res.tempPassword)")
                    }
                }
            }
            .environmentObject(auth)
        }
        .alert(notice?.title ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            if let copy = notice?.copy { Button("Copier") { UIPasteboard.general.string = copy } }
            Button("OK", role: .cancel) {}
        } message: { Text(notice?.message ?? "") }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Élèves").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Comptes, identifiants, anciens élèves.").font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("el.help")
                }
                Button { creating = true } label: {
                    Label("Nouvel élève", systemImage: "person.badge.plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain).disabled(classes.isEmpty).coachMarkTarget("el.new")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var withoutClassCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(withoutClass) élève\(withoutClass > 1 ? "s" : "") sans classe").font(.subheadline.weight(.semibold)).foregroundStyle(H.amber)
            Text("Filtrez sur « Sans classe », sélectionnez les élèves, puis affectez-les en masse à une classe.")
                .font(.caption).foregroundStyle(H.amber.opacity(0.9))
            Button { classFilter = "__none__" } label: {
                Text("Voir sans classe").font(.caption.weight(.semibold)).foregroundStyle(H.amber)
                    .padding(.horizontal, 12).frame(minHeight: 32)
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(H.amberDot.opacity(0.6), lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(H.amber50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(H.amberDot.opacity(0.35), lineWidth: 1))
    }

    private var filters: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(EduTheme.subtle)
                TextField("Nom, prénom, matricule…", text: $search).textInputAutocapitalization(.never).autocorrectionDisabled()
                if !search.isEmpty { Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(EduTheme.subtle) } }
            }
            .font(.subheadline)
            .padding(.horizontal, 12).frame(minHeight: 40)
            .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            HStack {
                Text("Classe").font(.subheadline).foregroundStyle(EduTheme.ink)
                Spacer()
                Picker("Classe", selection: $classFilter) {
                    Text("Toutes les classes").tag("")
                    ForEach(classes) { Text($0.name).tag($0.id) }
                    Text("Sans classe (\(withoutClass))").tag("__none__")
                    Text("Anciens élèves").tag("__former__")
                }
                .labelsHidden().tint(EduTheme.teal)
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("\(total) élève\(total > 1 ? "s" : "") · \(filterLabel)").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Spacer()
                if classFilter == "__none__" && total > 0 {
                    Button(selecting ? "Terminer" : "Sélectionner") { withAnimation { selecting.toggle(); if !selecting { selected = [] } } }
                        .font(.subheadline.weight(.semibold)).tint(EduTheme.teal)
                }
            }
            .padding(16)
            Divider()
            if loading && rows.isEmpty {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity).padding(24)
            } else if rows.isEmpty {
                Text(classFilter == "__none__" ? "Aucun élève sans classe." : (search.isEmpty ? "Aucun élève dans cette sélection." : "Aucun élève ne correspond à la recherche."))
                    .font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            }
            ForEach(rows) { r in
                let name = r.fullName.isEmpty ? "Élève" : r.fullName
                Group {
                    if selecting {
                        Button {
                            if selected.contains(r.id) { selected.remove(r.id) } else { selected.insert(r.id) }
                        } label: { rowLabel(r, name: name, checked: selected.contains(r.id)) }
                    } else {
                        NavigationLink {
                            StudentFileView(studentId: r.id, name: name, className: r.className, phone: r.phone, matricule: r.matricule)
                        } label: { rowLabel(r, name: name, checked: nil) }
                    }
                }
                .buttonStyle(.plain)
                Divider().padding(.leading, 62)
            }
            if rows.count < total {
                Button { Task { await load(reset: false) } } label: {
                    Text(loading ? "Chargement…" : "Afficher plus (\(total - rows.count) restants)")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain).disabled(loading)
            }
        }
        .modifier(HomeCardStyle())
    }

    private func rowLabel(_ r: PersonRow, name: String, checked: Bool?) -> some View {
        HStack(spacing: 12) {
            if let checked {
                Image(systemName: checked ? "checkmark.square.fill" : "square").font(.title3).foregroundStyle(checked ? EduTheme.teal : EduTheme.subtle)
            }
            Text("\((r.firstName ?? "").prefix(1))\((r.lastName ?? "").prefix(1))".uppercased())
                .font(.system(size: 11, weight: .bold)).foregroundStyle(EduTheme.muted)
                .frame(width: 34, height: 34)
                .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                HStack(spacing: 6) {
                    if let c = r.className { Text(c).font(.caption).foregroundStyle(EduTheme.muted) }
                    else { Text("Sans classe").font(.caption.weight(.medium)).foregroundStyle(H.amber) }
                    if let m = r.matricule, !m.isEmpty { Text("· \(m)").font(.caption).foregroundStyle(EduTheme.muted) }
                }
            }
            Spacer()
            if checked == nil { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle) }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    private var bulkBar: some View {
        VStack(spacing: 8) {
            Text("\(selected.count) élève\(selected.count > 1 ? "s" : "") sélectionné\(selected.count > 1 ? "s" : "")").font(.caption).foregroundStyle(EduTheme.muted)
            HStack(spacing: 8) {
                Picker("Classe", selection: $bulkClassId) {
                    Text("Choisir une classe").tag("")
                    ForEach(classes) { Text($0.name).tag($0.id) }
                }
                .tint(EduTheme.teal)
                .frame(maxWidth: .infinity)
                Button { Task { await bulkAssign() } } label: {
                    Text("Affecter").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 16).frame(minHeight: 42)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(selected.isEmpty || bulkClassId.isEmpty)
                .opacity(selected.isEmpty || bulkClassId.isEmpty ? 0.5 : 1)
            }
        }
        .padding(12)
        .background(.white)
        .overlay(alignment: .top) { Divider() }
    }

    // MARK: - Data

    private func loadClasses() async {
        guard let sid = auth.schoolId else { return }
        classes = ((try? await EduAPI().fetchClasses(schoolId: sid)) ?? []).sorted { a, b in
            let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
            let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
            return ra != rb ? ra < rb : a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }

    private func load(reset: Bool) async {
        guard let sid = auth.schoolId else { ready = true; return }
        loading = true
        defer { loading = false; ready = true }
        let api = EduAPI()
        do {
            async let page = api.fetchStudentsPage(schoolId: sid, classId: classFilter, search: search.trimmingCharacters(in: .whitespaces), offset: reset ? 0 : rows.count)
            async let missing = api.studentsWithoutClass(schoolId: sid)
            let p = try await page
            rows = reset ? p.rows : rows + p.rows
            total = p.total
            withoutClass = (try? await missing) ?? withoutClass
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func bulkAssign() async {
        guard let target = classes.first(where: { $0.id == bulkClassId }) else { return }
        guard let yearId = target.academicYearId else { error = "Cette classe n’a pas d’année scolaire"; return }
        do {
            try await EduAPI().enrolStudents(ids: Array(selected), classId: target.id, yearId: yearId)
            notice = ("Affectation enregistrée", "\(selected.count) élève\(selected.count > 1 ? "s" : "") affecté\(selected.count > 1 ? "s" : "") en \(target.name).", nil)
            selected = []
            selecting = false
            bulkClassId = ""
            await load(reset: true)
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

// MARK: - New student

private struct NewStudentSheet: View {
    struct Created { let username: String; let tempPassword: String }
    let classes: [ClassRow]
    let initialClassId: String
    var onDone: (Created?) -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var first = ""
    @State private var last = ""
    @State private var classId = ""
    @State private var hasBirth = false
    @State private var birth = Calendar.current.date(byAdding: .year, value: -12, to: Date()) ?? Date()
    @State private var gender = ""
    @State private var phone = ""
    @State private var matricule = ""
    @State private var address = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        EduFormSheet(title: "Nouvel élève", primary: saving ? "Création…" : "Créer", primaryDisabled: saving || first.trimmingCharacters(in: .whitespaces).isEmpty || last.trimmingCharacters(in: .whitespaces).isEmpty || classId.isEmpty, busy: saving, onPrimary: { Task { await save() } }) {
                Section {
                    TextField("Prénom", text: $first).textContentType(.givenName)
                    TextField("Nom", text: $last).textContentType(.familyName)
                    Picker("Classe", selection: $classId) {
                        Text("Choisir…").tag("")
                        ForEach(classes) { Text($0.name).tag($0.id) }
                    }
                }
                Section("Facultatif") {
                    Toggle("Date de naissance", isOn: $hasBirth).tint(EduTheme.teal)
                    if hasBirth {
                        DatePicker("Née / né le", selection: $birth, in: ...Date(), displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "fr_FR"))
                    }
                    Picker("Sexe", selection: $gender) {
                        Text("—").tag("")
                        Text("Masculin").tag("M")
                        Text("Féminin").tag("F")
                    }
                    TextField("Téléphone", text: $phone).keyboardType(.phonePad)
                    TextField("Matricule", text: $matricule)
                    TextField("Adresse", text: $address)
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .onAppear { classId = initialClassId }
    }

    private func save() async {
        guard let sid = auth.schoolId, let cls = classes.first(where: { $0.id == classId }) else { return }
        saving = true
        defer { saving = false }
        var extra: [String: String] = ["classId": classId]
        if let y = cls.academicYearId { extra["academicYearId"] = y }
        if hasBirth { extra["dateOfBirth"] = EduDates.day(birth) }
        if !gender.isEmpty { extra["gender"] = gender }
        for (k, v) in [("phone", phone), ("matricule", matricule), ("address", address)] {
            let t = v.trimmingCharacters(in: .whitespaces)
            if !t.isEmpty { extra[k] = t }
        }
        do {
            let res = try await EduAPI().createUserAccount(role: "student", schoolId: sid, firstName: first.trimmingCharacters(in: .whitespaces),
                                                          lastName: last.trimmingCharacters(in: .whitespaces), extra: extra)
            if let e = res.error { error = e; return }
            onDone(res.username.map { Created(username: $0, tempPassword: res.tempPassword ?? "—") })
            dismiss()
        } catch {
            self.error = "La création a échoué"
        }
    }
}

extension EduAPI {
    func enrolStudents(ids: [String], classId: String, yearId: String) async throws {
        struct P: Encodable { let student_id: String; let class_section_id: String; let academic_year_id: String; let status = "active" }
        try await client.from("inscriptions").insert(ids.map { P(student_id: $0, class_section_id: classId, academic_year_id: yearId) }).execute()
    }
}
