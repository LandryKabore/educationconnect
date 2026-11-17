import SwiftUI
import Supabase

/// Teacher « Mes élèves », like the web MesEleves: the students of every class taught, filtered by
/// class or name; tapping one opens a short profile in the teacher's subject (average, absences,
/// lates, latest grades).
struct TeacherStudentsView: View {
    /// Opened from « Mes classes »: start on that class.
    var initialClassId: String? = nil

    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassTab] = []
    @State private var students: [StudentRow] = []
    @State private var selectedClassId: String?
    @State private var search = ""
    @State private var ready = false
    @State private var error: String?

    @State private var tour = TabTour(key: "mes-eleves-enseignant")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    struct ClassTab: Identifiable, Hashable {
        var id: String { classId }
        let classId: String
        let className: String
        let gradeLevel: String?
        var subjects: [(id: String, name: String)]

        static func == (a: ClassTab, b: ClassTab) -> Bool { a.classId == b.classId }
        func hash(into h: inout Hasher) { h.combine(classId) }
    }

    struct StudentRow: Identifiable, Hashable {
        let id: String
        let studentId: String
        let classId: String
        let className: String
        let firstName: String
        let lastName: String
        var fullName: String { [firstName, lastName].filter { !$0.isEmpty }.joined(separator: " ") }
        var initials: String {
            let s = "\(firstName.trimmingCharacters(in: .whitespaces).prefix(1))\(lastName.trimmingCharacters(in: .whitespaces).prefix(1))".uppercased()
            return s.isEmpty ? "?" : s
        }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "eleves.stats", icon: "chart.bar.fill", title: "En un coup d’œil",
                          message: "Le nombre d’élèves dans vos classes, vos classes, et combien sont affichés."),
            CoachMarkStep(id: "eleves.classes", icon: "rectangle.3.group", title: "Filtrer par classe",
                          message: "Touchez une classe pour ne voir que ses élèves, ou « Toutes »."),
            CoachMarkStep(id: "eleves.search", icon: "magnifyingglass", title: "Chercher un élève",
                          message: "Tapez un nom ou une classe."),
            CoachMarkStep(id: "eleves.list", icon: "person.crop.circle", title: "Fiche de l’élève",
                          message: "Touchez un élève pour voir sa moyenne, ses dernières notes et ses absences dans votre matière."),
            CoachMarkStep(id: "eleves.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    private var selectedClass: ClassTab? { classes.first { $0.classId == selectedClassId } }

    private var filtered: [StudentRow] {
        var list = students
        if let selectedClassId { list = list.filter { $0.classId == selectedClassId } }
        let q = Self.fold(search.trimmingCharacters(in: .whitespacesAndNewlines))
        if !q.isEmpty {
            list = list.filter { Self.fold("\($0.fullName) \($0.className)").contains(q) }
        }
        return list
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 16) {
                        banner
                        if let error {
                            Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed)
                        }
                        if classes.isEmpty {
                            Text("Aucune classe assignée — aucun élève à afficher.")
                                .font(.subheadline)
                                .foregroundStyle(EduTheme.muted)
                                .frame(maxWidth: .infinity)
                                .padding(24)
                                .modifier(HomeCardStyle())
                        } else {
                            classChips.coachMarkTarget("eleves.classes")
                            listCard
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Mes élèves")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    // MARK: - Banner

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Mes élèves")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                        Text("Les élèves des classes où vous enseignez, avec leur suivi dans votre matière.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("eleves.help")
                }
                HStack(spacing: 8) {
                    stat("Élèves", "\(students.count)", "dans vos classes")
                    stat("Classes", "\(classes.count)", "où vous enseignez")
                    stat(selectedClass?.className ?? "Affichés", "\(filtered.count)",
                         selectedClass != nil ? "dans cette classe" : (search.trimmingCharacters(in: .whitespaces).isEmpty ? "toutes classes" : "résultats"))
                }
                .coachMarkTarget("eleves.stats")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }
                .frame(height: 4)
                .accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, _ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold)).tracking(0.6)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
            Text(hint)
                .font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    // MARK: - Classes

    private var classChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(nil, label: "Toutes", sub: nil, count: students.count)
                ForEach(classes) { c in
                    chip(c.classId, label: c.className, sub: c.subjects.map(\.name).joined(separator: ", "),
                         count: students.filter { $0.classId == c.classId }.count)
                }
            }
        }
    }

    private func chip(_ id: String?, label: String, sub: String?, count: Int) -> some View {
        let on = selectedClassId == id
        return Button {
            withAnimation(.easeInOut(duration: 0.15)) { selectedClassId = id }
        } label: {
            HStack(spacing: 8) {
                if let id {
                    Circle().fill(Self.classColor(id: id, name: label)).frame(width: 8, height: 8)
                } else {
                    Image(systemName: "person.3").font(.caption2).foregroundStyle(on ? .white : EduTheme.muted)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(label).font(.subheadline.weight(.semibold)).lineLimit(1)
                    if let sub, !sub.isEmpty {
                        Text(sub).font(.system(size: 10)).lineLimit(1)
                            .foregroundStyle(on ? .white.opacity(0.85) : EduTheme.muted)
                    }
                }
                Text("\(count)")
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(on ? .white.opacity(0.9) : EduTheme.muted)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .foregroundStyle(on ? .white : EduTheme.ink)
            .background(on ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(on ? .clear : EduTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    private var listCard: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.subheadline).foregroundStyle(EduTheme.subtle)
                    TextField("Chercher un élève…", text: $search)
                        .font(.subheadline)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !search.isEmpty {
                        Button { search = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(EduTheme.subtle)
                        }
                        .accessibilityLabel("Effacer")
                    }
                }
                .padding(.horizontal, 10)
                .frame(height: 38)
                .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
                Text("\(filtered.count) élève\(filtered.count > 1 ? "s" : "")")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize()
            }
            .padding(12)
            .coachMarkTarget("eleves.search")
            Divider()

            if filtered.isEmpty {
                Text(search.trimmingCharacters(in: .whitespaces).isEmpty
                     ? "Aucun élève dans cette sélection."
                     : "Aucun élève ne correspond à la recherche.")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(Array(filtered.enumerated()), id: \.element.id) { i, s in
                        let row = studentRow(s)
                        if i == 0 { row.coachMarkTarget("eleves.list") } else { row }
                    }
                }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func studentRow(_ s: StudentRow) -> some View {
        NavigationLink {
            TeacherStudentProfileView(student: s, subjects: classes.first { $0.classId == s.classId }?.subjects ?? [])
        } label: {
            HStack(spacing: 12) {
                Text(s.initials)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(EduTheme.muted)
                    .frame(width: 34, height: 34)
                    .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.fullName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    if selectedClassId == nil {
                        HStack(spacing: 5) {
                            Circle().fill(Self.classColor(id: s.classId, name: s.className)).frame(width: 7, height: 7)
                            Text(s.className).font(.caption).foregroundStyle(EduTheme.muted)
                        }
                    }
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().opacity(0.6) }
    }

    // MARK: - Helpers

    static func classColor(id: String, name: String) -> Color {
        SubjectPalette.swatch(for: name).border
    }

    static func fold(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr_FR")).lowercased()
    }

    // MARK: - Loading

    private func load() async {
        guard let tid = auth.userId else { ready = true; return }
        do {
            let api = EduAPI()
            let rows = try await api.fetchTeachingAssignments(teacherId: tid)
            var map: [String: ClassTab] = [:]
            for r in rows {
                let cid = r.classSectionId
                var c = map[cid] ?? ClassTab(classId: cid, className: r.classes?.name ?? "Classe",
                                             gradeLevel: r.classes?.gradeLevel, subjects: [])
                let sid = r.subjectId ?? r.matieres?.id ?? r.id
                if !c.subjects.contains(where: { $0.id == sid }) {
                    c.subjects.append((id: sid, name: r.matieres?.name ?? "Matière"))
                }
                map[cid] = c
            }
            let ordered = map.values.sorted { a, b in
                let ra = TeacherClassesView.gradeRank(name: a.className, gradeLevel: a.gradeLevel)
                let rb = TeacherClassesView.gradeRank(name: b.className, gradeLevel: b.gradeLevel)
                if ra != rb { return ra < rb }
                return a.className.localizedStandardCompare(b.className) == .orderedAscending
            }
            let names = Dictionary(uniqueKeysWithValues: ordered.map { ($0.classId, $0.className) })
            let enrolled = try await api.fetchTeacherStudentRows(classIds: ordered.map(\.classId))
            classes = ordered
            students = enrolled.map { e in
                StudentRow(id: e.id, studentId: e.studentId, classId: e.classId,
                           className: names[e.classId] ?? "Classe", firstName: e.firstName, lastName: e.lastName)
            }
            .sorted { $0.fullName.localizedCaseInsensitiveCompare($1.fullName) == .orderedAscending }
            if !ready, let initialClassId, map[initialClassId] != nil { selectedClassId = initialClassId }
            if let selectedClassId, map[selectedClassId] == nil { self.selectedClassId = nil }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }
}

// MARK: - Student profile

/// Average, latest grades and attendance of one student, in the teacher's subjects for that class.
struct TeacherStudentProfileView: View {
    let student: TeacherStudentsView.StudentRow
    let subjects: [(id: String, name: String)]

    @EnvironmentObject private var auth: AuthViewModel
    @State private var notes: [EduAPI.StudentNote] = []
    @State private var presences: [String] = []
    @State private var loading = true
    @State private var error: String?

    private typealias H = TeacherHomeView
    private let rose = Color(red: 225 / 255, green: 29 / 255, blue: 72 / 255)
    private let amber600 = Color(red: 217 / 255, green: 119 / 255, blue: 6 / 255)

    private var graded: [EduAPI.StudentNote] { notes.filter { !$0.isAbsent && ($0.maxScore ?? 0) > 0 } }
    private var average: Double? {
        guard !graded.isEmpty else { return nil }
        return graded.reduce(0) { $0 + ($1.score ?? 0) / ($1.maxScore ?? 1) * 20 } / Double(graded.count)
    }
    private var absences: Int { presences.filter { $0 == "absent" }.count }
    private var lates: Int { presences.filter { $0 == "late" }.count }
    private var excused: Int { presences.filter { $0 == "excused" }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let error {
                    Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed)
                }
                notesCard
                HStack(spacing: 8) {
                    NavigationLink {
                        EvaluationsBrowser(classId: student.classId, teacherId: auth.userId, allowEntry: true,
                                           recordedBy: auth.userId, title: "Notes · \(student.className)")
                    } label: {
                        Label("Notes", systemImage: "square.and.pencil")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(.white)
                            .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    NavigationLink {
                        TeacherAttendanceView(initialClassId: student.classId)
                    } label: {
                        Label("Présences", systemImage: "checklist")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(EduTheme.ink)
                            .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .refreshable { await load() }
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle(student.fullName)
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Text(student.initials)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(H.brand800)
                    .frame(width: 48, height: 48)
                    .background(Color(red: 204 / 255, green: 251 / 255, blue: 241 / 255),
                                in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(student.fullName)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    HStack(spacing: 5) {
                        Circle().fill(TeacherStudentsView.classColor(id: student.classId, name: student.className))
                            .frame(width: 7, height: 7)
                        Text(([student.className] + subjects.map(\.name)).joined(separator: " · "))
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                            .lineLimit(2)
                    }
                }
            }
            HStack(spacing: 8) {
                tile(average.map { Self.fmt(($0 * 10).rounded() / 10) } ?? "—", "moyenne /20",
                     average == nil ? EduTheme.subtle : ((average ?? 0) < 10 ? rose : EduTheme.ink))
                tile("\(absences)", "absence\(absences > 1 ? "s" : "")", absences > 0 ? rose : EduTheme.ink)
                tile("\(lates)", "retard\(lates > 1 ? "s" : "")", lates > 0 ? amber600 : EduTheme.ink)
            }
            Text("\(presences.count) cours enregistré\(presences.count > 1 ? "s" : "")"
                 + (excused > 0 ? " · \(excused) absence\(excused > 1 ? "s" : "") justifiée\(excused > 1 ? "s" : "")" : ""))
                .font(.system(size: 11))
                .foregroundStyle(EduTheme.muted)
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func tile(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(loading ? EduTheme.subtle : color)
            Text(label).font(.system(size: 11)).foregroundStyle(EduTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(H.slate100.opacity(0.7), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var notesCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("DERNIÈRES NOTES")
                .font(.system(size: 11, weight: .bold)).tracking(0.8)
                .foregroundStyle(EduTheme.muted)
                .padding(16)
            Divider()
            if loading {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity).padding(20)
            } else if notes.isEmpty {
                Text("Aucune note pour le moment.")
                    .font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            } else {
                ForEach(notes.prefix(8)) { n in
                    let on20 = n.isAbsent || (n.maxScore ?? 0) <= 0 ? nil : (n.score ?? 0) / (n.maxScore ?? 1) * 20
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(n.evaluations?.title ?? "Note")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.ink)
                                .lineLimit(1)
                            Text(meta(n)).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        Text(n.isAbsent ? "Absent" : "\(Self.fmt(n.score ?? 0))/\(Self.fmt(n.maxScore ?? 0))")
                            .font(.subheadline.weight(.bold).monospacedDigit())
                            .foregroundStyle(on20 == nil ? EduTheme.subtle : ((on20 ?? 0) < 10 ? rose : EduTheme.ink))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .overlay(alignment: .bottom) { Divider().opacity(0.6) }
                }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func meta(_ n: EduAPI.StudentNote) -> String {
        let type: String? = switch n.evaluations?.type {
        case "interrogation": "Interrogation"
        case "devoir": "Exercice de maison"
        case "composition": "Composition"
        case "examen": "Examen"
        default: n.evaluations?.type
        }
        let day = n.evaluations?.eval_date ?? n.created_at.map { String($0.prefix(10)) }
        return [type, n.period_label, day.map { Self.shortDate($0) }].compactMap { $0 }.joined(separator: " · ")
    }

    static func fmt(_ v: Double) -> String {
        v.rounded() == v ? String(Int(v)) : String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
    }

    /// « 2026-11-03 » → « 3 nov. »
    static func shortDate(_ iso: String) -> String {
        guard let d = EduDates.parseDay(String(iso.prefix(10))) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d MMM"
        return f.string(from: d)
    }

    private func load() async {
        let ids = subjects.map(\.id)
        guard !ids.isEmpty else { loading = false; return }
        do {
            let api = EduAPI()
            async let n = api.fetchStudentNotes(studentId: student.studentId, subjectIds: ids)
            async let p = api.fetchStudentPresenceStatuses(studentId: student.studentId, subjectIds: ids)
            notes = try await n
            presences = try await p
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        loading = false
    }
}

// MARK: - API

extension EduAPI {
    struct TeacherStudentEnrolment {
        let id: String
        let studentId: String
        let classId: String
        let firstName: String
        let lastName: String
    }

    /// Active enrolments of the given classes, with the student's name.
    func fetchTeacherStudentRows(classIds: [String]) async throws -> [TeacherStudentEnrolment] {
        guard !classIds.isEmpty else { return [] }
        struct P: Decodable { let id: String; let first_name: String?; let last_name: String? }
        struct Row: Decodable { let id: String; let class_section_id: String; let profils: P? }
        let rows: [Row] = try await client.from("inscriptions")
            .select("id, class_section_id, profils:profils!inscriptions_student_id_fkey(id, first_name, last_name)")
            .in("class_section_id", values: classIds)
            .eq("status", value: "active")
            .limit(5000)
            .execute()
            .value
        return rows.compactMap { r in
            guard let p = r.profils else { return nil }
            return TeacherStudentEnrolment(id: r.id, studentId: p.id, classId: r.class_section_id,
                                           firstName: p.first_name ?? "", lastName: p.last_name ?? "")
        }
    }

    struct StudentNote: Decodable, Identifiable {
        struct Eval: Decodable { let title: String?; let type: String?; let eval_date: String? }
        let id: String
        let score: Double?
        let maxScore: Double?
        let isAbsent: Bool
        let period_label: String?
        let created_at: String?
        let evaluations: Eval?

        enum CodingKeys: String, CodingKey { case id, score, max_score, is_absent, period_label, created_at, evaluations }

        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            score = Self.number(c, .score)
            maxScore = Self.number(c, .max_score)
            isAbsent = (try? c.decodeIfPresent(Bool.self, forKey: .is_absent)) ?? false
            period_label = try? c.decodeIfPresent(String.self, forKey: .period_label)
            created_at = try? c.decodeIfPresent(String.self, forKey: .created_at)
            evaluations = try? c.decodeIfPresent(Eval.self, forKey: .evaluations)
        }

        private static func number(_ c: KeyedDecodingContainer<CodingKeys>, _ k: CodingKeys) -> Double? {
            if let v = try? c.decodeIfPresent(Double.self, forKey: k) { return v }
            if let s = try? c.decodeIfPresent(String.self, forKey: k) { return Double(s) }
            return nil
        }
    }

    func fetchStudentNotes(studentId: String, subjectIds: [String]) async throws -> [StudentNote] {
        try await client.from("notes")
            .select("id, score, max_score, is_absent, period_label, created_at, subject_id, evaluations(title, type, eval_date)")
            .eq("student_id", value: studentId)
            .in("subject_id", values: subjectIds)
            .order("created_at", ascending: false)
            .limit(200)
            .execute()
            .value
    }

    func fetchStudentPresenceStatuses(studentId: String, subjectIds: [String]) async throws -> [String] {
        struct Row: Decodable { let status: String? }
        let rows: [Row] = try await client.from("presences")
            .select("status, date")
            .eq("student_id", value: studentId)
            .in("subject_id", values: subjectIds)
            .limit(2000)
            .execute()
            .value
        return rows.compactMap(\.status)
    }
}
