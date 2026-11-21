import SwiftUI

/// School admin « Statistiques annuelles », like the web Statistiques: headcount by sex, level and
/// class, indicative pass rate, absences and lates, ages and departures, for any school year.
struct SchoolStatisticsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var years: [YearRow] = []
    @State private var yearId = ""
    @State private var stats: Stats?
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "statistiques-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let sky = Color(red: 3 / 255, green: 105 / 255, blue: 161 / 255)
    private let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)

    struct Stats: Decodable {
        struct Year: Decodable { let id: String?; let label: String? }
        struct Totals: Decodable { let students: Int?; let male: Int?; let female: Int?; let unknownSex: Int?; let unknownBirth: Int?; let classes: Int? }
        struct ClassStat: Decodable, Identifiable {
            var id: String { classId }
            let classId: String; let name: String; let grade: String?
            let total: Int; let male: Int; let female: Int; let absent: Int; let late: Int
            let graded: Int; let passed: Int; let average: Double?
        }
        struct LevelStat: Decodable, Identifiable {
            var id: String { grade ?? "-" }
            let grade: String?; let classes: Int; let total: Int; let male: Int; let female: Int
            let graded: Int; let passed: Int; let average: Double?
            let gradedMale: Int; let passedMale: Int; let gradedFemale: Int; let passedFemale: Int
        }
        struct Age: Decodable, Identifiable { var id: Int { age }; let age: Int; let male: Int; let female: Int; let unknownSex: Int }
        struct Departures: Decodable { let total: Int; let male: Int; let female: Int; let unknownSex: Int; let byReason: [String: Int] }
        struct Results: Decodable { let graded: Int; let passed: Int; let gradedMale: Int; let passedMale: Int; let gradedFemale: Int; let passedFemale: Int; let average: Double? }
        let year: Year?
        let totals: Totals?
        let byClass: [ClassStat]?
        let byLevel: [LevelStat]?
        let ages: [Age]?
        let departures: Departures?
        let results: Results?
    }

    static let levels: [(String, String)] = [("cp2", "CP2"), ("ce1", "CE1"), ("ce2", "CE2"), ("cm1", "CM1"), ("cm2", "CM2"), ("6eme", "6e"), ("5eme", "5e"), ("4eme", "4e"), ("3eme", "3e"), ("seconde", "Seconde"), ("premiere", "Première"), ("terminale", "Terminale")]
    static let exitReasons: [(String, String)] = [("transfert", "Transfert vers une autre école"), ("abandon", "Abandon"), ("demenagement", "Déménagement"), ("exclusion", "Exclusion"), ("deces", "Décès"), ("autre", "Autre motif")]

    static func levelOrder(_ g: String?) -> Int { levels.firstIndex { $0.0 == g } ?? 99 }
    static func levelLabel(_ g: String?) -> String { g.map { v in levels.first { $0.0 == v }?.1 ?? v } ?? "Niveau non précisé" }
    static func pct(_ a: Int, _ b: Int) -> String { b > 0 ? "\(Int((Double(a) / Double(b) * 100).rounded())) %" : "—" }
    static func avg(_ v: Double?) -> String { v.map { String(format: "%.2f", $0).replacingOccurrences(of: ".", with: ",") } ?? "—" }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "st.totals", icon: "person.3.fill", title: "Effectif",
                          message: "Les élèves en classe, garçons et filles, et ceux sortis de l’école cette année."),
            CoachMarkStep(id: "st.levels", icon: "chart.bar.fill", title: "Par niveau et par classe",
                          message: "Effectifs, taux de réussite indicatif (moyenne annuelle ≥ 10) et moyenne ; par classe, les absences et retards."),
            CoachMarkStep(id: "st.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
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
                        if let s = stats, s.year != nil {
                            totals(s).coachMarkTarget("st.totals")
                            levelsCard(s).coachMarkTarget("st.levels")
                            Text("* Taux de réussite indicatif : élèves dont la moyenne annuelle est d’au moins 10/20, parmi ceux qui ont des notes. La décision officielle de passage reste celle du conseil de classe.")
                                .font(.caption).foregroundStyle(EduTheme.muted)
                            classesCard(s)
                            Text("Absences et retards : nombre de fois marqués dans les présences depuis le début de l’année (pas un pourcentage).")
                                .font(.caption).foregroundStyle(EduTheme.muted)
                            agesCard(s)
                            departuresCard(s)
                            Text("Édité le \(TeacherExercisesView.format(Date(), "d MMMM yyyy"))").font(.caption2).foregroundStyle(EduTheme.subtle)
                        } else {
                            Text("Aucune année scolaire n’est définie. Créez-en une dans « Années scolaires ».")
                                .font(.subheadline).foregroundStyle(EduTheme.muted).padding(16).modifier(HomeCardStyle())
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
        .navigationTitle("Statistiques")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: yearId) { _, _ in Task { await load() } }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Statistiques annuelles").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                        Text("\(auth.schools.first?.name ?? "École")" + (stats?.year?.label.map { " · année \($0)" } ?? ""))
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("st.help")
                }
                if years.count > 1 {
                    Menu {
                        Button("Année en cours") { yearId = "" }
                        ForEach(years) { y in Button(y.label) { yearId = y.id } }
                    } label: {
                        Label(years.first { $0.id == yearId }?.label ?? "Année en cours", systemImage: "calendar")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            .padding(.horizontal, 12).frame(minHeight: 36)
                            .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.25), lineWidth: 1))
                    }
                }
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func totals(_ s: Stats) -> some View {
        let t = s.totals
        let students = t?.students ?? 0
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            tile("Élèves en classe", "\(students)", "\(t?.classes ?? 0) classe(s)", EduTheme.ink)
            tile("Garçons", "\(t?.male ?? 0)", Self.pct(t?.male ?? 0, students), sky)
            tile("Filles", "\(t?.female ?? 0)", Self.pct(t?.female ?? 0, students), rose)
            tile("Sexe non renseigné", "\(t?.unknownSex ?? 0)", nil, (t?.unknownSex ?? 0) > 0 ? H.amber : EduTheme.muted)
            tile("Sortis de l’école", "\(s.departures?.total ?? 0)", "Non comptés dans l’effectif", EduTheme.ink)
        }
    }

    private func tile(_ label: String, _ value: String, _ hint: String?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.5).foregroundStyle(EduTheme.muted).lineLimit(2)
            Text(value).font(.title.weight(.bold).monospacedDigit()).foregroundStyle(color)
            if let hint { Text(hint).font(.caption2).foregroundStyle(EduTheme.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .modifier(HomeCardStyle())
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.headline).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            content()
        }
        .modifier(HomeCardStyle())
    }

    private func pair(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.system(size: 10)).foregroundStyle(EduTheme.muted)
            Text(value).font(.caption.weight(.semibold).monospacedDigit()).foregroundStyle(EduTheme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func levelsCard(_ s: Stats) -> some View {
        let rows = (s.byLevel ?? []).sorted { Self.levelOrder($0.grade) != Self.levelOrder($1.grade) ? Self.levelOrder($0.grade) < Self.levelOrder($1.grade) : Self.levelLabel($0.grade) < Self.levelLabel($1.grade) }
        return section("Par niveau") {
            ForEach(rows) { l in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(Self.levelLabel(l.grade)).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                        Spacer()
                        Text("\(l.classes) classe\(l.classes > 1 ? "s" : "") · \(l.total) élèves").font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    HStack(spacing: 6) {
                        pair("Garçons", "\(l.male)"); pair("Filles", "\(l.female)"); pair("Admis*", Self.pct(l.passed, l.graded)); pair("Moyenne", Self.avg(l.average))
                    }
                    HStack(spacing: 6) {
                        pair("dont garçons", Self.pct(l.passedMale, l.gradedMale)); pair("dont filles", Self.pct(l.passedFemale, l.gradedFemale)); Spacer(); Spacer()
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider().padding(.leading, 16)
            }
            if let r = s.results {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Total école").font(.subheadline.weight(.bold)).foregroundStyle(EduTheme.ink)
                    HStack(spacing: 6) {
                        pair("Admis*", Self.pct(r.passed, r.graded)); pair("dont garçons", Self.pct(r.passedMale, r.gradedMale))
                        pair("dont filles", Self.pct(r.passedFemale, r.gradedFemale)); pair("Moyenne", Self.avg(r.average))
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(H.slate100.opacity(0.7))
            }
        }
    }

    private func classesCard(_ s: Stats) -> some View {
        let rows = (s.byClass ?? []).sorted { Self.levelOrder($0.grade) != Self.levelOrder($1.grade) ? Self.levelOrder($0.grade) < Self.levelOrder($1.grade) : $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        return section("Par classe") {
            ForEach(rows) { c in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(c.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                        Spacer()
                        Text("\(c.total) élèves").font(.caption).foregroundStyle(EduTheme.muted)
                    }
                    HStack(spacing: 6) {
                        pair("Garçons", "\(c.male)"); pair("Filles", "\(c.female)"); pair("Absences", "\(c.absent)"); pair("Retards", "\(c.late)")
                    }
                    HStack(spacing: 6) {
                        pair("Admis*", Self.pct(c.passed, c.graded)); pair("Moyenne", Self.avg(c.average)); Spacer(); Spacer()
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider().padding(.leading, 16)
            }
        }
    }

    private func agesCard(_ s: Stats) -> some View {
        let ages = s.ages ?? []
        let peak = max(1, ages.map { $0.male + $0.female + $0.unknownSex }.max() ?? 1)
        return section("Âges des élèves") {
            VStack(alignment: .leading, spacing: 6) {
                if ages.isEmpty {
                    Text("Aucune date de naissance renseignée.").font(.subheadline).foregroundStyle(EduTheme.subtle)
                }
                ForEach(ages) { a in
                    let total = a.male + a.female + a.unknownSex
                    HStack(spacing: 8) {
                        Text("\(a.age) ans").font(.caption).foregroundStyle(EduTheme.muted).frame(width: 50, alignment: .leading)
                        GeometryReader { geo in
                            HStack(spacing: 0) {
                                sky.frame(width: geo.size.width * CGFloat(a.male) / CGFloat(peak))
                                rose.frame(width: geo.size.width * CGFloat(a.female) / CGFloat(peak))
                                EduTheme.subtle.frame(width: geo.size.width * CGFloat(a.unknownSex) / CGFloat(peak))
                                Spacer(minLength: 0)
                            }
                            .background(H.slate100)
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                        }
                        .frame(height: 14)
                        Text("\(total)").font(.caption.weight(.semibold).monospacedDigit()).frame(width: 30, alignment: .trailing)
                    }
                }
                HStack(spacing: 12) {
                    legend(sky, "Garçons"); legend(rose, "Filles"); legend(EduTheme.subtle, "Non précisé")
                }
                .padding(.top, 4)
            }
            .padding(16)
        }
    }

    private func legend(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { Circle().fill(c).frame(width: 8, height: 8); Text(t).font(.caption2).foregroundStyle(EduTheme.muted) }
    }

    private func departuresCard(_ s: Stats) -> some View {
        section("Sorties de l’école") {
            VStack(alignment: .leading, spacing: 8) {
                if let d = s.departures, d.total > 0 {
                    Text("\(d.total) sortie(s) : \(d.male) garçon(s), \(d.female) fille(s)\(d.unknownSex > 0 ? ", \(d.unknownSex) non précisé" : "").")
                        .font(.subheadline).foregroundStyle(EduTheme.muted)
                    ForEach(Self.exitReasons.filter { (d.byReason[$0.0] ?? 0) > 0 }, id: \.0) { r in
                        HStack {
                            Text(r.1).font(.subheadline).foregroundStyle(EduTheme.ink)
                            Spacer()
                            Text("\(d.byReason[r.0] ?? 0)").font(.caption.weight(.bold)).foregroundStyle(EduTheme.muted)
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        }
                    }
                } else {
                    Text("Aucun élève sorti cette année.").font(.subheadline).foregroundStyle(EduTheme.subtle)
                }
            }
            .padding(16)
        }
    }

    private func load() async {
        guard let sid = auth.schoolId else { ready = true; return }
        let api = EduAPI()
        if years.isEmpty { years = ((try? await api.fetchYears(schoolId: sid)) ?? []) }
        do {
            stats = try await api.fetchSchoolStatisticsFull(schoolId: sid, yearId: yearId.isEmpty ? nil : yearId)
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }
}

extension EduAPI {
    func fetchSchoolStatisticsFull(schoolId: String, yearId: String?) async throws -> SchoolStatisticsView.Stats {
        struct P: Encodable {
            let p_school: String; let p_year: String?
            func encode(to e: Encoder) throws {
                var c = e.container(keyedBy: K.self)
                try c.encode(p_school, forKey: .p_school); try c.encode(p_year, forKey: .p_year)
            }
            enum K: String, CodingKey { case p_school, p_year }
        }
        return try await call("ef_school_statistics", params: P(p_school: schoolId, p_year: yearId))
    }
}
