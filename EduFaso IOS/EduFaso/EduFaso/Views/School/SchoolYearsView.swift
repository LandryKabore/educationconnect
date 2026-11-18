import SwiftUI

/// School admin « Années scolaires », like the web Annees: create, edit, set the current year and
/// delete (only without classes, admin password).
struct SchoolYearsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var years: [YearRow] = []
    @State private var ready = false
    @State private var error: String?
    @State private var editing: Draft?
    @State private var deleting: YearRow?
    @State private var password = ""

    @State private var tour = TabTour(key: "annees-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct Draft: Identifiable { var id: String { yearId ?? "new" }; var yearId: String?; var label: String; var start: Date; var end: Date }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "an.new", icon: "plus", title: "Nouvelle année",
                          message: "Créez l’année scolaire avec ses dates de début et de fin. La première créée devient l’année courante."),
            CoachMarkStep(id: "an.list", icon: "calendar", title: "Année courante",
                          message: "Les classes, notes et bulletins se rapportent à l’année courante. « Définir courante » pour en changer."),
            CoachMarkStep(id: "an.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
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
                            Text("Aucune année scolaire. Créez l’année en cours.").font(.subheadline).foregroundStyle(EduTheme.muted)
                                .frame(maxWidth: .infinity).padding(24).modifier(HomeCardStyle()).coachMarkTarget("an.list")
                        } else {
                            VStack(spacing: 10) { ForEach(years) { y in row(y) } }.coachMarkTarget("an.list")
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
        .navigationTitle("Années scolaires")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(item: $editing) { d in
            YearFormSheet(draft: d, isFirst: years.isEmpty) { Task { await load() } }.environmentObject(auth)
        }
        .passwordConfirm(item: $deleting, password: $password, title: { "Supprimer « \($0.label) » ?" }, message: "Cette année scolaire sera supprimée. Saisissez votre mot de passe administrateur pour confirmer.", confirm: "Supprimer l’année") { y in await delete(y) }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Années scolaires").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Créez, modifiez ou définissez l’année courante.").font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("an.help")
                }
                Button { openCreate() } label: {
                    Label("Nouvelle année", systemImage: "plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain).coachMarkTarget("an.new")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func row(_ y: YearRow) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(y.label).font(.headline).foregroundStyle(EduTheme.ink)
                if y.isCurrent {
                    Text("Courante").font(.caption.weight(.bold)).foregroundStyle(H.emerald)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(H.emerald50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                Spacer()
            }
            Text("\(SchoolCompositionsView.date(y.startDate, "d MMM yyyy")) → \(SchoolCompositionsView.date(y.endDate, "d MMM yyyy"))")
                .font(.caption).foregroundStyle(EduTheme.muted)
            HStack(spacing: 8) {
                if !y.isCurrent {
                    small("Définir courante", primary: true) { Task { await setCurrent(y) } }
                }
                small("Modifier", primary: false) {
                    editing = Draft(yearId: y.id, label: y.label, start: EduDates.parseDay(y.startDate) ?? Date(), end: EduDates.parseDay(y.endDate) ?? Date())
                }
                Spacer()
                Button(role: .destructive) { Task { await requestDelete(y) } } label: { Image(systemName: "trash") }
                    .tint(Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255))
                    .accessibilityLabel("Supprimer \(y.label)")
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private func small(_ t: String, primary: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(t).font(.caption.weight(.semibold)).foregroundStyle(primary ? .white : EduTheme.ink)
                .padding(.horizontal, 12).frame(minHeight: 32)
                .background(primary ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(primary ? .clear : EduTheme.borderStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func openCreate() {
        let cal = Calendar.current
        let y = cal.component(.year, from: Date())
        let startYear = cal.component(.month, from: Date()) >= 8 ? y : y - 1
        let start = cal.date(from: DateComponents(year: startYear, month: 10, day: 1)) ?? Date()
        let end = cal.date(from: DateComponents(year: startYear + 1, month: 6, day: 30)) ?? Date()
        editing = Draft(yearId: nil, label: "\(startYear)-\(startYear + 1)", start: start, end: end)
    }

    private func load() async {
        guard let sid = auth.schoolId else { ready = true; return }
        do {
            years = try await EduAPI().fetchYears(schoolId: sid).sorted { $0.startDate > $1.startDate }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    private func setCurrent(_ y: YearRow) async {
        guard let sid = auth.schoolId else { return }
        do {
            try await EduAPI().setCurrentYear(id: y.id, schoolId: sid)
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func requestDelete(_ y: YearRow) async {
        let n = (try? await EduAPI().countClasses(yearId: y.id)) ?? 0
        if n > 0 { error = "Impossible de supprimer : \(n) classe(s) sont liées à « \(y.label) »."; return }
        deleting = y
    }

    private func delete(_ y: YearRow) async {
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
            try await EduAPI().deleteYear(id: y.id, schoolId: sid)
            await load()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

private struct YearFormSheet: View {
    @State var draft: SchoolYearsView.Draft
    let isFirst: Bool
    var onSaved: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        EduFormSheet(title: draft.yearId == nil ? "Nouvelle année scolaire" : "Modifier l’année scolaire", primary: saving ? "Enregistrement…" : "Enregistrer", primaryDisabled: saving || draft.label.trimmingCharacters(in: .whitespaces).isEmpty, busy: saving, onPrimary: { Task { await save() } }) {
                Section {
                    TextField("Libellé (ex. 2026-2027)", text: $draft.label)
                    DatePicker("Début", selection: $draft.start, displayedComponents: .date)
                    DatePicker("Fin", selection: $draft.end, in: draft.start..., displayedComponents: .date)
                }
                .environment(\.locale, Locale(identifier: "fr_FR"))
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
    }

    private func save() async {
        guard let sid = auth.schoolId else { return }
        guard draft.end > draft.start else { error = "La date de fin doit être après la date de début."; return }
        saving = true
        defer { saving = false }
        do {
            try await EduAPI().saveYear(id: draft.yearId, schoolId: sid, label: draft.label.trimmingCharacters(in: .whitespaces),
                                        start: EduDates.day(draft.start), end: EduDates.day(draft.end), makeCurrent: draft.yearId == nil && isFirst)
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}

extension EduAPI {
    func saveYear(id: String?, schoolId: String, label: String, start: String, end: String, makeCurrent: Bool) async throws {
        struct U: Encodable { let label: String; let start_date: String; let end_date: String }
        struct I: Encodable { let school_id: String; let label: String; let start_date: String; let end_date: String; let is_current: Bool }
        if let id {
            try await client.from("annees_scolaires").update(U(label: label, start_date: start, end_date: end))
                .eq("id", value: id).eq("school_id", value: schoolId).execute()
        } else {
            try await client.from("annees_scolaires").insert(I(school_id: schoolId, label: label, start_date: start, end_date: end, is_current: makeCurrent)).execute()
        }
    }

    func setCurrentYear(id: String, schoolId: String) async throws {
        struct P: Encodable { let is_current: Bool }
        try await client.from("annees_scolaires").update(P(is_current: false)).eq("school_id", value: schoolId).execute()
        try await client.from("annees_scolaires").update(P(is_current: true)).eq("id", value: id).execute()
    }

    func countClasses(yearId: String) async throws -> Int {
        try await client.from("classes").select("id", head: true, count: .exact).eq("academic_year_id", value: yearId).execute().count ?? 0
    }

    func deleteYear(id: String, schoolId: String) async throws {
        try await client.from("annees_scolaires").delete().eq("id", value: id).eq("school_id", value: schoolId).execute()
    }
}
