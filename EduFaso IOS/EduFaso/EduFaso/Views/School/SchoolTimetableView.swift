import SwiftUI
import Supabase

/// School admin « Emplois du temps », like the web EmploisDuTemps (phone layout): the week by
/// class, teacher or room, conflicts (same class, teacher or room at the same time), hours per
/// subject, PDF, and adding / editing / removing slots.
struct SchoolTimetableView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var classes: [ClassRow] = []
    @State private var subjects: [NamedEntity] = []
    @State private var teachers: [Person] = []
    @State private var assignments: [Assignment] = []
    @State private var slots: [Slot] = []
    @State private var ready = false
    @State private var error: String?

    @State private var mode: Mode = .classe
    @State private var classId = ""
    @State private var teacherFilter = ""
    @State private var teacherId = ""
    @State private var room = ""
    @State private var day = SchoolTimetableView.todayDow() ?? 1

    @State private var editing: Draft?
    @State private var exporting = false

    @State private var tour = TabTour(key: "emplois-du-temps-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)
    private let rose50 = Color(red: 255 / 255, green: 241 / 255, blue: 242 / 255)

    enum Mode: String, CaseIterable { case classe = "Classe", enseignant = "Enseignant", salle = "Salle" }

    struct Person: Identifiable, Hashable { let id: String; let name: String }
    struct Assignment: Decodable, Hashable { let teacher_id: String; let class_section_id: String; let subject_id: String }

    struct Slot: Decodable, Identifiable, Hashable {
        let id: String
        let day_of_week: Int
        let start_time: String
        let end_time: String
        let room: String?
        let class_section_id: String
        let subject_id: String?
        let teacher_id: String?
        let classes: NamedEntity?
        let matieres: NamedEntity?
        let profils: PersonName?
        var teacherName: String? { profils.map(\.fullName).flatMap { $0.isEmpty ? nil : $0 } }
    }

    /// The slot being created or edited (sheet).
    struct Draft: Identifiable {
        var id: String { slotId ?? "new" }
        var slotId: String?
        var classId: String
        var subjectId: String
        var teacherId: String
        var day: Int
        var start: String
        var end: String
        var room: String
    }

    struct Conflict: Identifiable, Hashable {
        enum Kind { case classe, teacher, room }
        let id: String
        let kind: Kind
        let message: String
        let slotId: String
        let otherSlotId: String
        let day: Int
        let start: String
    }

    /// A plain copy of the data, for the conflict rules and the editor sheet.
    struct Model {
        let classes: [ClassRow]
        let subjects: [NamedEntity]
        let teachers: [Person]
        let assignments: [Assignment]
        let slots: [Slot]
        let classNames: [String: String]

        func describe(_ s: Slot) -> String {
            [s.matieres?.name ?? "Matière", s.teacherName ?? "sans enseignant", s.room.flatMap { $0.isEmpty ? nil : "salle \($0)" }]
                .compactMap { $0 }.joined(separator: " · ")
        }

        /// Same rules and messages as the web `findTimetableConflicts`.
        func conflicts(for d: Draft, excluding: String?) -> [(kind: Conflict.Kind, message: String, otherSlotId: String)] {
            let s = SchoolTimetableView.minutes(d.start), e = SchoolTimetableView.minutes(d.end)
            guard e > s else { return [] }
            let roomKey = d.room.trimmingCharacters(in: .whitespaces).lowercased()
            var out: [(Conflict.Kind, String, String)] = []
            for slot in slots where slot.id != excluding && slot.day_of_week == d.day {
                guard s < SchoolTimetableView.minutes(slot.end_time) && SchoolTimetableView.minutes(slot.start_time) < e else { continue }
                let when = "\(SchoolTimetableView.clockFr(slot.start_time))–\(SchoolTimetableView.clockFr(slot.end_time))"
                let other = classNames[slot.class_section_id] ?? "une autre classe"
                let detail = " : \(describe(slot))"
                if slot.class_section_id == d.classId {
                    out.append((.classe, "Cette classe a déjà un cours à \(when)\(detail).", slot.id))
                }
                if !d.teacherId.isEmpty, slot.teacher_id == d.teacherId {
                    let who = teachers.first { $0.id == d.teacherId }?.name ?? "Cet enseignant"
                    out.append((.teacher, "\(who) est déjà en cours (\(other)) à \(when)\(detail).", slot.id))
                }
                if !roomKey.isEmpty, slot.room?.trimmingCharacters(in: .whitespaces).lowercased() == roomKey, slot.class_section_id != d.classId {
                    out.append((.room, "La salle « \(d.room.trimmingCharacters(in: .whitespaces)) » est déjà prise (\(other)) à \(when)\(detail).", slot.id))
                }
            }
            return out.map { (kind: $0.0, message: $0.1, otherSlotId: $0.2) }
        }

        func subjects(forClass id: String, keeping current: String) -> [NamedEntity] {
            var ids = Set(assignments.filter { $0.class_section_id == id }.map(\.subject_id))
            if !current.isEmpty { ids.insert(current) }
            return subjects.filter { ids.contains($0.id ?? "") }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        }

        func teachers(forClass id: String, subject: String, keeping current: String) -> [Person] {
            var ids = Set(assignments.filter { $0.class_section_id == id && $0.subject_id == subject }.map(\.teacher_id))
            if !current.isEmpty { ids.insert(current) }
            return teachers.filter { ids.contains($0.id) }
        }

        func freeSlotsText(_ d: Draft) -> String? {
            guard !d.teacherId.isEmpty, let t = teachers.first(where: { $0.id == d.teacherId }) else { return nil }
            let busy = slots.filter { $0.teacher_id == d.teacherId && $0.day_of_week == d.day && $0.id != d.slotId }
                .map { (SchoolTimetableView.minutes($0.start_time), SchoolTimetableView.minutes($0.end_time)) }.sorted { $0.0 < $1.0 }
            var free: [(Int, Int)] = []
            var cursor = 7 * 60
            for (s, e) in busy {
                if min(s, 17 * 60) - cursor >= 30 { free.append((cursor, min(s, 17 * 60))) }
                cursor = max(cursor, e)
            }
            if 17 * 60 - cursor >= 30 { free.append((cursor, 17 * 60)) }
            if free.isEmpty { return "Aucun créneau libre pour \(t.name) ce jour (07:00–17:00)." }
            return "Créneaux libres pour \(t.name) ce jour : " + free.map { "\(SchoolTimetableView.clockFr($0.0))–\(SchoolTimetableView.clockFr($0.1))" }.joined(separator: ", ")
        }
    }

    private var model: Model {
        Model(classes: classes, subjects: subjects, teachers: teachers, assignments: assignments, slots: slots, classNames: classNames)
    }

    static let days = [(1, "Lun", "Lundi"), (2, "Mar", "Mardi"), (3, "Mer", "Mercredi"), (4, "Jeu", "Jeudi"), (5, "Ven", "Vendredi"), (6, "Sam", "Samedi")]
    static let timeOptions: [String] = (6...23).flatMap { h in [0, 15, 30, 45].map { String(format: "%02d:%02d", h, $0) } }

    static func todayDow() -> Int? { let d = EduDates.weekday(); return (1...6).contains(d) ? d : nil }
    static func minutes(_ t: String) -> Int { TeacherLessons.minutes(String(t.prefix(5))) }
    static func clock(_ m: Int) -> String { String(format: "%02d:%02d", m / 60, m % 60) }
    /// Displayed times, like the other timetables: « 7h », « 7h30 » (clock() stays HH:MM for the form).
    static func clockFr(_ m: Int) -> String { m % 60 == 0 ? "\(m / 60)h" : String(format: "%dh%02d", m / 60, m % 60) }
    static func clockFr(_ t: String) -> String { clockFr(minutes(t)) }
    static func dayName(_ d: Int) -> String { days.first { $0.0 == d }?.2 ?? "Jour" }

    // MARK: - Derived

    private var rooms: [String] {
        Array(Set(slots.compactMap { $0.room?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }))
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    private var classNames: [String: String] {
        var m = Dictionary(uniqueKeysWithValues: classes.map { ($0.id, $0.name) })
        for s in slots { if let n = s.classes?.name { m[s.class_section_id] = n } }
        return m
    }

    private var filterTeachers: [Person] {
        guard !classId.isEmpty else { return teachers }
        let ids = Set(assignments.filter { $0.class_section_id == classId }.map(\.teacher_id)
                      + slots.filter { $0.class_section_id == classId }.compactMap(\.teacher_id))
        return teachers.filter { ids.contains($0.id) }
    }

    private var filtered: [Slot] {
        switch mode {
        case .enseignant: return teacherId.isEmpty ? [] : slots.filter { $0.teacher_id == teacherId }
        case .salle: return room.isEmpty ? [] : slots.filter { ($0.room?.trimmingCharacters(in: .whitespaces) ?? "") == room }
        case .classe:
            guard !classId.isEmpty else { return [] }
            return slots.filter { $0.class_section_id == classId && (teacherFilter.isEmpty || $0.teacher_id == teacherFilter) }
        }
    }

    private var plannedMinutes: Int { filtered.reduce(0) { $0 + max(0, Self.minutes($1.end_time) - Self.minutes($1.start_time)) } }

    private var visibleConflicts: [Conflict] {
        var seen = Set<String>()
        var out: [Conflict] = []
        let m = model
        for s in filtered {
            for c in m.conflicts(for: draft(of: s), excluding: s.id) {
                let key = "\(c.kind)|\([s.id, c.otherSlotId].sorted().joined(separator: ":"))"
                if seen.insert(key).inserted { out.append(Conflict(id: key, kind: c.kind, message: c.message, slotId: s.id, otherSlotId: c.otherSlotId, day: s.day_of_week, start: s.start_time)) }
            }
        }
        return out.sorted { $0.day != $1.day ? $0.day < $1.day : Self.minutes($0.start) < Self.minutes($1.start) }
    }

    private func badges(_ slotId: String, in list: [Conflict]) -> [Conflict.Kind] {
        let kinds = Set(list.filter { $0.slotId == slotId || $0.otherSlotId == slotId }.map(\.kind))
        return [Conflict.Kind.teacher, .room, .classe].filter { kinds.contains($0) }
    }

    private func draft(of s: Slot) -> Draft {
        Draft(slotId: s.id, classId: s.class_section_id, subjectId: s.subject_id ?? "", teacherId: s.teacher_id ?? "",
              day: s.day_of_week, start: String(s.start_time.prefix(5)), end: String(s.end_time.prefix(5)), room: s.room ?? "")
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "edtadm.mode", icon: "square.grid.3x1.below.line.grid.1x2", title: "Classe, enseignant ou salle",
                          message: "Voyez la semaine d’une classe, d’un enseignant ou d’une salle, puis choisissez laquelle juste en dessous."),
            CoachMarkStep(id: "edtadm.days", icon: "calendar", title: "Choisir un jour",
                          message: "Le chiffre indique le nombre de cours ; un point rouge signale un conflit ce jour-là."),
            CoachMarkStep(id: "edtadm.list", icon: "list.bullet", title: "Les cours",
                          message: "Touchez un cours pour le modifier ou le retirer. Les étiquettes rouges signalent un conflit : prof, salle ou classe déjà occupés."),
            CoachMarkStep(id: "edtadm.add", icon: "plus", title: "Ajouter un cours",
                          message: "Choisissez la classe, la matière, l’enseignant affecté, le jour et l’horaire. Les conflits s’affichent avant d’enregistrer."),
            CoachMarkStep(id: "edtadm.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    // MARK: - Body

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        if classes.isEmpty {
                            emptyCard("Créez d’abord des classes pour planifier l’emploi du temps.")
                        } else {
                            controls.coachMarkTarget("edtadm.mode")
                            let conflicts = visibleConflicts
                            infoRow(conflicts: conflicts.count, proxy: proxy)
                            if mode == .salle && rooms.isEmpty {
                                emptyCard("Aucune salle renseignée sur les créneaux.")
                            } else if mode == .enseignant && teachers.isEmpty {
                                emptyCard("Aucun enseignant actif dans l’école.")
                            } else {
                                dayStrip(conflicts).coachMarkTarget("edtadm.days")
                                dayList(conflicts).coachMarkTarget("edtadm.list")
                                if !conflicts.isEmpty { conflictsCard(conflicts).id("conflits") }
                                hoursCard
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await load() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Emplois du temps")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load() }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(item: $editing) { d in
            SlotEditorSheet(draft: d, parent: model) { Task { await load() } }
                .environmentObject(auth)
        }
    }

    private func emptyCard(_ text: String) -> some View {
        Text(text).font(.subheadline).foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity).padding(24).modifier(HomeCardStyle())
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Emplois du temps").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Lundi à samedi · touchez un cours pour le modifier.")
                            .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("edtadm.help")
                }
                HStack(spacing: 8) {
                    Button { exportPdf() } label: {
                        Label(exporting ? "Export…" : "PDF", systemImage: "arrow.down.doc")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.25), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(filtered.isEmpty || exporting)
                    Button { openCreate() } label: {
                        Label("Ajouter un créneau", systemImage: "plus")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(classes.isEmpty)
                    .coachMarkTarget("edtadm.add")
                }
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 2) {
                ForEach(Mode.allCases, id: \.self) { m in
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { switchMode(m) }
                    } label: {
                        Text(m.rawValue).font(.subheadline.weight(.semibold))
                            .foregroundStyle(mode == m ? EduTheme.ink : EduTheme.muted)
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .background(mode == m ? .white : .clear, in: RoundedRectangle(cornerRadius: EduTheme.radius - 1, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))

            switch mode {
            case .classe:
                HStack(spacing: 8) {
                    menu(classNames[classId] ?? "Classe", icon: "person.3") {
                        ForEach(classes) { c in Button(c.name) { classId = c.id; teacherFilter = "" } }
                    }
                    menu(teachers.first { $0.id == teacherFilter }?.name ?? "Tous les enseignants", icon: "person") {
                        Button("Tous les enseignants") { teacherFilter = "" }
                        ForEach(filterTeachers) { t in Button(t.name) { teacherFilter = t.id } }
                    }
                }
            case .enseignant:
                menu(teachers.first { $0.id == teacherId }?.name ?? "Enseignant", icon: "person") {
                    ForEach(teachers) { t in Button(t.name) { teacherId = t.id } }
                }
            case .salle:
                menu(room.isEmpty ? "Salle" : "Salle \(room)", icon: "door.left.hand.open") {
                    ForEach(rooms, id: \.self) { r in Button(r) { room = r } }
                }
            }
        }
    }

    private func menu<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        Menu { content() } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.caption)
                Text(title).font(.subheadline.weight(.semibold)).lineLimit(1)
                Spacer(minLength: 2)
                Image(systemName: "chevron.up.chevron.down").font(.caption2)
            }
            .foregroundStyle(EduTheme.ink)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
        }
    }

    private func infoRow(conflicts: Int, proxy: ScrollViewProxy) -> some View {
        HStack(spacing: 8) {
            if conflicts > 0 {
                Button { withAnimation { proxy.scrollTo("conflits", anchor: .top) } } label: {
                    Label("\(conflicts) conflit\(conflicts > 1 ? "s" : "")", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(rose)
                        .padding(.horizontal, 10).frame(minHeight: 28)
                        .background(rose50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            Text("\(Self.hours(plannedMinutes)) planifiées").font(.caption).foregroundStyle(EduTheme.muted)
            Spacer()
        }
    }

    static func hours(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "\(h) h" : "\(h) h \(String(format: "%02d", m))"
    }

    private func dayStrip(_ conflicts: [Conflict]) -> some View {
        HStack(spacing: 6) {
            ForEach(Self.days, id: \.0) { d in
                let on = day == d.0
                let n = filtered.filter { $0.day_of_week == d.0 }.count
                let clash = conflicts.contains { $0.day == d.0 }
                Button { withAnimation(.easeInOut(duration: 0.15)) { day = d.0 } } label: {
                    VStack(spacing: 3) {
                        Text(d.1).font(.caption.weight(.semibold))
                        Text("\(n)").font(.subheadline.weight(.bold).monospacedDigit())
                    }
                    .foregroundStyle(on ? .white : EduTheme.ink)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(on ? EduTheme.teal : (d.0 == Self.todayDow() ? EduTheme.brand50 : .white),
                                in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(on ? .clear : EduTheme.border, lineWidth: 1))
                    .overlay(alignment: .topTrailing) {
                        if clash { Circle().fill(rose).frame(width: 7, height: 7).padding(5) }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func dayList(_ conflicts: [Conflict]) -> some View {
        let items = filtered.filter { $0.day_of_week == day }.sorted { $0.start_time < $1.start_time }
        return VStack(alignment: .leading, spacing: 0) {
            Text(Self.dayName(day)).font(.headline).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            if items.isEmpty {
                Text("Aucun cours ce jour sur cette vue.").font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            }
            ForEach(Array(items.enumerated()), id: \.element.id) { i, s in
                if i > 0 { Divider().padding(.leading, 16) }
                slotRow(s, badges: badges(s.id, in: conflicts))
            }
            Divider()
            Button { openCreate(day: day, startMin: nextStart(day)) } label: {
                Label("Ajouter un cours \(Self.dayName(day).lowercased())", systemImage: "plus")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
        }
        .modifier(HomeCardStyle())
    }

    private func slotRow(_ s: Slot, badges: [Conflict.Kind]) -> some View {
        let swatch = SubjectPalette.swatch(for: s.matieres?.name)
        let sub: [String?] = [
            mode == .enseignant ? nil : s.teacherName,
            mode == .classe ? nil : classNames[s.class_section_id],
            s.room.flatMap { $0.isEmpty ? nil : "Salle \($0)" },
        ]
        return Button { editing = draft(of: s) } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 1) {
                    Text(Self.clockFr(s.start_time)).font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(EduTheme.ink).fixedSize()
                    Text(Self.clockFr(s.end_time)).font(.caption.monospacedDigit()).foregroundStyle(EduTheme.muted).fixedSize()
                }
                .frame(minWidth: 48)
                RoundedRectangle(cornerRadius: 2).fill(swatch.border).frame(width: 4, height: 40)
                VStack(alignment: .leading, spacing: 3) {
                    Text(s.matieres?.name ?? "Matière").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                    Text(sub.compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(2)
                    if !badges.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(badges, id: \.self) { b in
                                Text(b == .teacher ? "Prof" : (b == .room ? "Salle" : "Classe"))
                                    .font(.system(size: 10, weight: .bold)).foregroundStyle(rose)
                                    .padding(.horizontal, 5).padding(.vertical, 2)
                                    .background(rose50, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
                            }
                        }
                    }
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle).padding(.top, 10)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func conflictsCard(_ conflicts: [Conflict]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Label("\(conflicts.count) conflit\(conflicts.count > 1 ? "s" : "")", systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.bold)).foregroundStyle(rose).padding(16)
            Divider()
            ForEach(conflicts) { c in
                Button {
                    if let s = slots.first(where: { $0.id == c.slotId }) { editing = draft(of: s) }
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(Self.dayName(c.day)) · \(Self.clockFr(c.start))").font(.caption.weight(.semibold)).foregroundStyle(rose)
                            Text(c.message).font(.caption).foregroundStyle(EduTheme.ink).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 4)
                        Text("Ouvrir").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .overlay(alignment: .top) { Divider().opacity(0.5) }
            }
        }
        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(rose.opacity(0.3), lineWidth: 1))
    }

    private var hoursCard: some View {
        var by: [String: Int] = [:]
        for s in filtered { by[s.matieres?.name ?? "Matière", default: 0] += max(0, Self.minutes(s.end_time) - Self.minutes(s.start_time)) }
        let rows = by.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
        let peak = max(rows.first?.value ?? 1, 1)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Heures par matière").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Spacer()
                Text("\(Self.hours(plannedMinutes)) planifiées").font(.caption).foregroundStyle(EduTheme.muted)
            }
            if rows.isEmpty {
                Text("Aucune heure planifiée.").font(.subheadline).foregroundStyle(EduTheme.muted)
            }
            ForEach(rows, id: \.key) { r in
                HStack(spacing: 8) {
                    Text(r.key).font(.caption.weight(.medium)).foregroundStyle(EduTheme.ink).lineLimit(1).frame(width: 110, alignment: .leading)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(H.slate100)
                            Capsule().fill(SubjectPalette.swatch(for: r.key).border)
                                .frame(width: max(6, geo.size.width * CGFloat(r.value) / CGFloat(peak)))
                        }
                    }
                    .frame(height: 8)
                    Text(Self.hours(r.value)).font(.caption.monospacedDigit()).foregroundStyle(EduTheme.muted).frame(width: 52, alignment: .trailing)
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    // MARK: - Actions

    private func switchMode(_ m: Mode) {
        mode = m
        if m == .classe { teacherFilter = "" }
        if m == .enseignant, teacherId.isEmpty || !teachers.contains(where: { $0.id == teacherId }) { teacherId = teachers.first?.id ?? "" }
        if m == .salle, room.isEmpty || !rooms.contains(room) { room = rooms.first ?? "" }
    }

    private func nextStart(_ d: Int) -> Int {
        let last = filtered.filter { $0.day_of_week == d }.map { Self.minutes($0.end_time) }.max() ?? 0
        if last <= 0 { return 8 * 60 }
        return min(((last + 14) / 15) * 15, 23 * 60)
    }

    private func openCreate(day d: Int? = nil, startMin: Int = 8 * 60) {
        let start = min(23 * 60, max(6 * 60, (startMin / 15) * 15))
        let end = min(start + 60, 23 * 60 + 45)
        editing = Draft(slotId: nil, classId: mode == .classe ? classId : "", subjectId: "",
                        teacherId: mode == .enseignant ? teacherId : "",
                        day: d ?? Self.todayDow() ?? 1, start: Self.clock(start), end: Self.clock(end),
                        room: mode == .salle ? room : "")
    }

    private func exportPdf() {
        guard !filtered.isEmpty else { return }
        exporting = true
        defer { exporting = false }
        let label: String = {
            switch mode {
            case .classe: return classNames[classId] ?? "—"
            case .enseignant: return teachers.first { $0.id == teacherId }?.name ?? "Enseignant"
            case .salle: return room.isEmpty ? "Salle" : "Salle \(room)"
            }
        }()
        let extra = mode == .classe && !teacherFilter.isEmpty ? teachers.first { $0.id == teacherFilter }.map { "Enseignant : \($0.name)" } : nil
        let pdfSlots = filtered.map { s in
            TimetableSlot(id: s.id, dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time, room: s.room,
                          classSectionId: s.class_section_id, subjectId: s.subject_id, matieres: s.matieres,
                          classes: ClassLite(id: s.class_section_id, name: classNames[s.class_section_id], gradeLevel: nil),
                          profils: s.profils)
        }
        let data = EmploiDuTempsPdf.make(.init(schoolName: auth.schools.first?.name ?? "École", className: label,
                                               studentName: nil, extraLine: extra, slots: pdfSlots,
                                               classInsteadOfTeacher: mode == .enseignant))
        let safe = label.replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "[^A-Za-z0-9\\-_àâäéèêëïîôùûüç]", with: "", options: .regularExpression)
        PdfShare.present(data: data, fileName: "emploi-du-temps-\(safe.isEmpty ? "vue" : safe).pdf")
    }

    // MARK: - Loading

    private func load() async {
        guard let schoolId = auth.schoolId else { ready = true; return }
        let api = EduAPI()
        do {
            async let cls = api.fetchClasses(schoolId: schoolId)
            async let subs = api.fetchSchoolSubjects(schoolId: schoolId)
            async let tch = api.fetchActiveTeachers(schoolId: schoolId)
            async let aff = api.fetchSchoolAssignments(schoolId: schoolId)
            async let sl = api.fetchSchoolSlots(schoolId: schoolId)
            let (c, s, t, a, l) = try await (cls, subs, tch, aff, sl)
            classes = c.sorted { a, b in
                let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
                let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
                return ra != rb ? ra < rb : a.name.localizedStandardCompare(b.name) == .orderedAscending
            }
            subjects = s
            teachers = t
            assignments = a
            slots = l
            if classId.isEmpty || !classes.contains(where: { $0.id == classId }) { classId = classes.first?.id ?? "" }
            if mode == .enseignant, teacherId.isEmpty { teacherId = teachers.first?.id ?? "" }
            if mode == .salle, room.isEmpty { room = rooms.first ?? "" }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }
}

// MARK: - Editor

private struct RemoveTarget: Identifiable { let id = "remove" }

private struct SlotEditorSheet: View {
    @State var draft: SchoolTimetableView.Draft
    let parent: SchoolTimetableView.Model
    var onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var error: String?
    @State private var confirmingRemove = false
    @State private var password = ""
    @State private var removing = false

    private typealias T = SchoolTimetableView
    private var subjects: [NamedEntity] { parent.subjects(forClass: draft.classId, keeping: draft.subjectId) }
    private var teachers: [T.Person] { parent.teachers(forClass: draft.classId, subject: draft.subjectId, keeping: draft.teacherId) }
    private var live: [(kind: T.Conflict.Kind, message: String, otherSlotId: String)] {
        draft.classId.isEmpty ? [] : parent.conflicts(for: draft, excluding: draft.slotId)
    }
    private var badRange: Bool { T.minutes(draft.end) <= T.minutes(draft.start) }

    var body: some View {
        EduFormSheet(title: draft.slotId == nil ? "Nouveau créneau" : "Modifier le créneau", primary: saving ? "Enregistrement…" : "Enregistrer", primaryDisabled: saving || draft.classId.isEmpty || draft.subjectId.isEmpty || draft.teacherId.isEmpty, busy: saving, onPrimary: { Task { await save() } }) {
                Section {
                    Picker("Classe", selection: $draft.classId) {
                        Text("Choisir…").tag("")
                        ForEach(parent.classes) { c in Text(c.name).tag(c.id) }
                    }
                    .onChange(of: draft.classId) { _, _ in draft.subjectId = ""; draft.teacherId = "" }
                    Picker("Matière", selection: $draft.subjectId) {
                        Text("Choisir…").tag("")
                        ForEach(subjects, id: \.id) { s in Text(s.name).tag(s.id ?? "") }
                    }
                    .disabled(draft.classId.isEmpty)
                    .onChange(of: draft.subjectId) { _, _ in
                        if !teachers.contains(where: { $0.id == draft.teacherId }) { draft.teacherId = "" }
                    }
                    Picker("Enseignant", selection: $draft.teacherId) {
                        Text("Choisir…").tag("")
                        ForEach(teachers) { t in Text(t.name).tag(t.id) }
                    }
                    .disabled(draft.subjectId.isEmpty)
                } footer: {
                    if !draft.classId.isEmpty && subjects.isEmpty {
                        Text("Aucune matière affectée à cette classe — créez une affectation dans Enseignants.")
                    } else if !draft.subjectId.isEmpty && teachers.isEmpty {
                        Text("Aucun enseignant n’est affecté à cette matière pour cette classe.")
                    }
                }
                Section {
                    Picker("Jour", selection: $draft.day) {
                        ForEach(T.days, id: \.0) { d in Text(d.2).tag(d.0) }
                    }
                    Picker("Début", selection: $draft.start) {
                        ForEach(T.timeOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Fin", selection: $draft.end) {
                        ForEach(T.timeOptions, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Salle (facultatif)", text: $draft.room)
                } footer: {
                    if let free = parent.freeSlotsText(draft) { Text(free) }
                }
                if badRange || !live.isEmpty {
                    Section("Conflits") {
                        if badRange { Text("L’heure de fin doit être après l’heure de début.").foregroundStyle(EduTheme.fasoRed) }
                        ForEach(Array(live.enumerated()), id: \.offset) { _, c in
                            Text(c.message).font(.subheadline).foregroundStyle(EduTheme.fasoRed)
                        }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
                if draft.slotId != nil {
                    Section {
                        Button(role: .destructive) { confirmingRemove = true } label: {
                            Label("Retirer le créneau", systemImage: "trash")
                        }
                    }
                }
            }
            
            
            
            .passwordConfirm(item: Binding(get: { confirmingRemove ? RemoveTarget() : nil }, set: { if $0 == nil { confirmingRemove = false } }),
                             password: $password, title: { _ in "Retirer ce créneau ?" },
                             message: "Ce créneau sera retiré de l’emploi du temps. Saisissez votre mot de passe administrateur pour confirmer.",
                             confirm: "Retirer le créneau") { _ in await remove() }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
    }

    private func save() async {
        guard !draft.classId.isEmpty, !draft.subjectId.isEmpty, !draft.teacherId.isEmpty else {
            error = "Choisissez classe, matière et enseignant"; return
        }
        if badRange { error = "L’heure de fin doit être après l’heure de début."; return }
        if let first = live.first { error = first.message; return }
        saving = true
        defer { saving = false }
        do {
            try await EduAPI().saveSlot(id: draft.slotId, classId: draft.classId, subjectId: draft.subjectId, teacherId: draft.teacherId,
                                        day: draft.day, start: draft.start, end: draft.end,
                                        room: draft.room.trimmingCharacters(in: .whitespaces))
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func remove() async {
        guard let id = draft.slotId else { return }
        let pw = password
        password = ""
        removing = true
        defer { removing = false }
        do {
            guard let email = SupabaseManager.client.auth.currentUser?.email else { error = "Session expirée."; return }
            _ = try await SupabaseManager.client.auth.signIn(email: email, password: pw)
        } catch {
            self.error = "Mot de passe incorrect."
            return
        }
        do {
            try await EduAPI().deleteSlot(id: id)
            onSaved()
            dismiss()
        } catch {
            if !error.isCancellation { self.error = "Suppression impossible." }
        }
    }
}

// MARK: - API

extension EduAPI {
    func fetchSchoolSubjects(schoolId: String) async throws -> [NamedEntity] {
        try await client.from("matieres").select("id, name").eq("school_id", value: schoolId).order("name").execute().value
    }

    func fetchActiveTeachers(schoolId: String) async throws -> [SchoolTimetableView.Person] {
        struct P: Decodable { let id: String?; let first_name: String?; let last_name: String? }
        struct Row: Decodable { let profils: P? }
        let rows: [Row] = try await client.from("roles_utilisateurs").select("profils(id, first_name, last_name)")
            .eq("school_id", value: schoolId).eq("role", value: "teacher").eq("active", value: true).execute().value
        var seen = Set<String>()
        return rows.compactMap { r in
            guard let p = r.profils, let id = p.id, seen.insert(id).inserted else { return nil }
            return SchoolTimetableView.Person(id: id, name: "\(p.first_name ?? "") \(p.last_name ?? "")".trimmingCharacters(in: .whitespaces))
        }
        .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    func fetchSchoolAssignments(schoolId: String) async throws -> [SchoolTimetableView.Assignment] {
        struct Cls: Decodable { let affectations_enseignement: [SchoolTimetableView.Assignment]? }
        let rows: [Cls] = try await client.from("classes")
            .select("id, affectations_enseignement(teacher_id, class_section_id, subject_id)")
            .eq("school_id", value: schoolId).execute().value
        return rows.flatMap { $0.affectations_enseignement ?? [] }
    }

    func fetchSchoolSlots(schoolId: String) async throws -> [SchoolTimetableView.Slot] {
        try await client.from("creneaux_edt")
            .select("id, day_of_week, start_time, end_time, room, class_section_id, subject_id, teacher_id, classes!inner(name, school_id), matieres(name), profils(first_name, last_name)")
            .eq("classes.school_id", value: schoolId)
            .order("day_of_week").order("start_time")
            .execute().value
    }

    func saveSlot(id: String?, classId: String, subjectId: String, teacherId: String, day: Int, start: String, end: String, room: String) async throws {
        struct P: Encodable {
            let class_section_id: String; let subject_id: String; let teacher_id: String
            let day_of_week: Int; let start_time: String; let end_time: String; let room: String?
            func encode(to e: Encoder) throws {
                var c = e.container(keyedBy: K.self)
                try c.encode(class_section_id, forKey: .class_section_id)
                try c.encode(subject_id, forKey: .subject_id)
                try c.encode(teacher_id, forKey: .teacher_id)
                try c.encode(day_of_week, forKey: .day_of_week)
                try c.encode(start_time, forKey: .start_time)
                try c.encode(end_time, forKey: .end_time)
                try c.encode(room, forKey: .room)
            }
            enum K: String, CodingKey { case class_section_id, subject_id, teacher_id, day_of_week, start_time, end_time, room }
        }
        let p = P(class_section_id: classId, subject_id: subjectId, teacher_id: teacherId, day_of_week: day,
                  start_time: start, end_time: end, room: room.isEmpty ? nil : room)
        if let id { try await client.from("creneaux_edt").update(p).eq("id", value: id).execute() }
        else { try await client.from("creneaux_edt").insert(p).execute() }
    }

    func deleteSlot(id: String) async throws {
        try await client.from("creneaux_edt").delete().eq("id", value: id).execute()
    }
}
