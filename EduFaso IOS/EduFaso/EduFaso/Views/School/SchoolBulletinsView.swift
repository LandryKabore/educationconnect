import SwiftUI

/// School admin « Bulletins », like the web Bulletins: search a student (all classes, or one
/// class), then open their bulletin — preview by Trimestre or the year, and download the PDF.
struct SchoolBulletinsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var classId = ""
    @State private var search = ""
    @State private var rows: [PersonRow] = []
    @State private var total = 0
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?
    @State private var searchTask: Task<Void, Never>?

    @State private var tour = TabTour(key: "bulletins-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "bu.search", icon: "magnifyingglass", title: "Trouver un élève",
                          message: "Cherchez par nom, prénom ou matricule, dans toutes les classes ou une seule."),
            CoachMarkStep(id: "bu.list", icon: "doc.text", title: "Le bulletin",
                          message: "Touchez un élève : son bulletin par Trimestre ou pour l’année, tel que le voient l’élève et ses parents, avec le PDF officiel."),
            CoachMarkStep(id: "bu.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        filters.coachMarkTarget("bu.search")
                        Text("Bulletin A4 officiel : moyenne, total, rang et appréciation automatique par matière ; mention et appréciation du conseil selon la moyenne générale.")
                            .font(.caption).foregroundStyle(EduTheme.muted)
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        list.coachMarkTarget("bu.list")
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load(reset: true) }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Bulletins")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await loadClasses(); await load(reset: true) }
        .onChange(of: classId) { _, _ in Task { await load(reset: true) } }
        .onChange(of: search) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 350_000_000)
                if !Task.isCancelled { await load(reset: true) }
            }
        }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Bulletins").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                    Text("Recherchez un élève (toutes classes, ou filtrez par classe), puis téléchargez le PDF.")
                        .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("bu.help")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var filters: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(EduTheme.subtle)
                TextField("Nom, prénom, matricule…", text: $search)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                if !search.isEmpty {
                    Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(EduTheme.subtle) }
                        .accessibilityLabel("Effacer")
                }
            }
            .font(.subheadline)
            .padding(.horizontal, 12).frame(minHeight: 40)
            .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            HStack {
                Text("Classe").font(.subheadline).foregroundStyle(EduTheme.ink)
                Spacer()
                Picker("Classe", selection: $classId) {
                    Text("Toutes les classes").tag("")
                    ForEach(classes) { Text($0.name).tag($0.id) }
                }
                .labelsHidden().tint(EduTheme.teal)
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(total) élève\(total > 1 ? "s" : "")").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            if loading && rows.isEmpty {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity).padding(24)
            } else if rows.isEmpty {
                Text(search.trimmingCharacters(in: .whitespaces).isEmpty ? "Aucun élève dans cette classe." : "Aucun élève ne correspond à « \(search.trimmingCharacters(in: .whitespaces)) ».")
                    .font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            } else {
                ForEach(rows) { r in
                    let name = "\(r.firstName ?? "") \(r.lastName ?? "")".trimmingCharacters(in: .whitespaces)
                    NavigationLink {
                        BulletinBoard(studentId: r.id, title: "Bulletin · \(name)")
                    } label: {
                        HStack(spacing: 12) {
                            Text("\((r.firstName ?? "").prefix(1))\((r.lastName ?? "").prefix(1))".uppercased())
                                .font(.system(size: 11, weight: .bold)).foregroundStyle(EduTheme.muted)
                                .frame(width: 34, height: 34)
                                .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(name.isEmpty ? "Élève" : name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                                Text([r.className ?? "Sans classe", r.matricule].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(EduTheme.muted)
                            }
                            Spacer()
                            Image(systemName: "doc.text").font(.subheadline).foregroundStyle(EduTheme.teal)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider().padding(.leading, 62)
                }
                if rows.count < total {
                    Button { Task { await load(reset: false) } } label: {
                        Text(loading ? "Chargement…" : "Afficher plus (\(total - rows.count) restants)")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.plain).disabled(loading)
                }
            }
        }
        .modifier(HomeCardStyle())
    }

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
        do {
            let page = try await EduAPI().fetchStudentsPage(schoolId: sid, classId: classId, search: search.trimmingCharacters(in: .whitespaces),
                                                           offset: reset ? 0 : rows.count)
            rows = reset ? page.rows : rows + page.rows
            total = page.total
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

extension EduAPI {
    func fetchStudentsPage(schoolId: String, classId: String, search: String, offset: Int) async throws -> PeoplePage {
        try await call("ef_students_page", params: StudentsPageParams(
            p_school: schoolId, p_class: classId, p_search: search, p_limit: 80, p_offset: offset
        ))
    }
}
