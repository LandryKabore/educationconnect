import SwiftUI
import Supabase

/// Teacher « Appel », like the web MesPresencesProf: the roll calls of one day, taken from the
/// timetable (one per lesson), the late ones of the last days, and a way to call the roll of any
/// class (replacement, moved or extra lesson).
struct TeacherAppelView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var snapshot = TeacherLessons.Snapshot()
    @State private var classes: [(id: String, name: String, gradeLevel: String?)] = []
    @State private var date = EduDates.day()
    @State private var day: [DayRow] = []
    @State private var dayLoading = true
    @State private var ready = false
    @State private var error: String?
    @State private var pickingDate = false

    @State private var tour = TabTour(key: "appel-enseignant")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let rose = Color(red: 190 / 255, green: 18 / 255, blue: 60 / 255)

    struct DayRow: Decodable { let class_section_id: String; let subject_id: String?; let status: String? }

    struct DayLesson: Identifiable {
        let id: String
        let classId: String
        let className: String
        let subjectId: String
        let subjectName: String
        let start: String
        let end: String
        let studentCount: Int
        let recorded: Int
        let absent: Int
        let late: Int
        let upcoming: Bool
        var done: Bool { studentCount > 0 && recorded >= studentCount }
        var partial: Bool { !done && recorded > 0 }
        var present: Int { max(0, recorded - absent - late) }
    }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "appel.stats", icon: "chart.bar.fill", title: "La journée",
                          message: "Vos cours du jour, les appels déjà faits et ceux qui restent à faire."),
            CoachMarkStep(id: "appel.day", icon: "calendar", title: "Jour de l’appel",
                          message: "Changez de jour avec les flèches, ou touchez la date pour en choisir une autre."),
            CoachMarkStep(id: "appel.lessons", icon: "checklist", title: "Un appel par cours",
                          message: "Chaque cours de votre emploi du temps, avec le nombre de présents, d’absents et de retards. Touchez « Faire l’appel »."),
            CoachMarkStep(id: "appel.other", icon: "person.3", title: "Autre classe",
                          message: "Pour un remplacement ou un cours déplacé ou rattrapé : faites l’appel de n’importe laquelle de vos classes."),
            CoachMarkStep(id: "appel.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    TimelineView(.everyMinute) { ctx in
                        content(now: ctx.date)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .refreshable { await load(); await loadDay() }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Appel")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load(); await loadDay() }
        .onChange(of: date) { _, _ in Task { await loadDay() } }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(isPresented: $pickingDate) { datePickerSheet }
    }

    // MARK: - Content

    @ViewBuilder
    private func content(now: Date) -> some View {
        let today = EduDates.day(now)
        let lessons = dayLessons(now: now)
        let done = lessons.filter(\.done).count
        let toDo = lessons.filter { !$0.done && !$0.upcoming }.count
        let late = TeacherLessons.late(TeacherLessons.lessons(snapshot, now: now), now: now)
            .filter { $0.appelDue && $0.appel != .done && $0.date < today }

        VStack(alignment: .leading, spacing: 16) {
            banner(lessons: lessons.count, done: done, toDo: toDo, isToday: date == today)
            if let error {
                Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed)
            }
            if date == today && !late.isEmpty { lateCard(late) }
            lessonsCard(lessons, isToday: date == today).coachMarkTarget("appel.lessons")
            otherClassCard.coachMarkTarget("appel.other")
        }
    }

    private func dayLessons(now: Date) -> [DayLesson] {
        guard let d = EduDates.parseDay(date) else { return [] }
        let dow = EduDates.weekday(d)
        guard dow != 7 else { return [] }
        let today = EduDates.day(now)
        let nowMin = TeacherLessons.minutes(of: now)
        return snapshot.slots
            .filter { $0.dayOfWeek == dow && CompositionSchedule.session(of: $0.classSectionId, on: date, in: snapshot.compositions) == nil }
            .sorted { $0.startTime < $1.startTime }
            .compactMap { s in
                guard let cid = s.classSectionId else { return nil }
                let sid = s.subjectId ?? ""
                let rows = day.filter { $0.class_section_id == cid && ($0.subject_id ?? "") == sid }
                return DayLesson(
                    id: s.id, classId: cid, className: s.classes?.name ?? "Classe",
                    subjectId: sid, subjectName: s.matieres?.name ?? "Cours",
                    start: s.startTime, end: s.endTime,
                    studentCount: snapshot.students[cid] ?? 0, recorded: rows.count,
                    absent: rows.filter { $0.status == "absent" }.count,
                    late: rows.filter { $0.status == "late" }.count,
                    upcoming: date > today || (date == today && nowMin < TeacherLessons.minutes(s.startTime))
                )
            }
    }

    // MARK: - Banner

    private func banner(lessons: Int, done: Int, toDo: Int, isToday: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Appel")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                        Text("\(isToday ? "Aujourd’hui, " : "")\(Self.dayLabel(date).lowercased()) — un appel par cours de votre emploi du temps.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("appel.help")
                }
                HStack(spacing: 8) {
                    stat("Cours", "\(lessons)", isToday ? "aujourd’hui" : "ce jour-là")
                    stat("Appels faits", "\(done)", "sur \(lessons)")
                    stat("À faire", "\(toDo)", toDo > 0 ? "cours commencés" : "rien en attente")
                }
                .coachMarkTarget("appel.stats")
                dayPicker(isToday: isToday).coachMarkTarget("appel.day")
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
                .lineLimit(1).minimumScaleFactor(0.8)
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

    private func dayPicker(isToday: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("JOUR DE L’APPEL")
                .font(.system(size: 11, weight: .semibold)).tracking(0.5)
                .foregroundStyle(EduTheme.muted)
            HStack(spacing: 8) {
                navButton("chevron.left", label: "Jour précédent") { shift(-1) }
                Button { pickingDate = true } label: {
                    Text(Self.dayLabel(date))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityHint("Choisir une date")
                navButton("chevron.right", label: "Jour suivant") { shift(1) }
            }
            if isToday {
                Text("Touchez la date pour en choisir une autre.")
                    .font(.caption).foregroundStyle(EduTheme.muted)
            } else {
                Button { date = EduDates.day() } label: {
                    Text("Revenir à aujourd’hui")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .foregroundStyle(.white)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func navButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(EduTheme.ink)
                .frame(width: 38, height: 38)
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var datePickerSheet: some View {
        NavigationStack {
            DatePicker("Date", selection: Binding(
                get: { EduDates.parseDay(date) ?? Date() },
                set: { date = EduDates.day($0) }
            ), displayedComponents: .date)
            .datePickerStyle(.graphical)
            .environment(\.locale, Locale(identifier: "fr_FR"))
            .tint(EduTheme.teal)
            .padding()
            .navigationTitle("Jour de l’appel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("OK") { pickingDate = false }.fontWeight(.semibold) }
            }
        }
        .presentationDetents([.medium, .large])
        .preferredColorScheme(.light)
    }

    private func shift(_ days: Int) {
        guard var d = EduDates.parseDay(date) else { return }
        d = Calendar.current.date(byAdding: .day, value: days, to: d) ?? d
        // no lessons on Sunday
        if EduDates.weekday(d) == 7 { d = Calendar.current.date(byAdding: .day, value: days > 0 ? 1 : -1, to: d) ?? d }
        date = EduDates.day(d)
    }

    // MARK: - Late roll calls

    private func lateCard(_ late: [TeacherLessons.Lesson]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                Text("\(late.count) appel\(late.count > 1 ? "s" : "") en retard").fontWeight(.bold)
                Text("· jours précédents").foregroundStyle(H.amber.opacity(0.8))
                Spacer()
            }
            .font(.subheadline)
            .foregroundStyle(H.amber)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            Divider().overlay(H.amberDot.opacity(0.3))
            ForEach(late.prefix(6)) { l in
                NavigationLink {
                    TeacherAttendanceView(initialClassId: l.classId, initialSubjectId: l.subjectId, initialDate: l.date)
                } label: {
                    HStack(spacing: 10) {
                        Text(H.shortDay(l.date))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(H.amber)
                            .frame(width: 84, alignment: .leading)
                        Text("\(l.className) · \(l.subjectName)")
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.ink)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(H.amber)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if late.count > 6 {
                Divider().overlay(H.amberDot.opacity(0.3))
                NavigationLink { TeacherTodoView() } label: {
                    Text("Voir tous les appels dans « À faire »")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(H.amber)
                        .frame(maxWidth: .infinity)
                        .padding(12)
                }
                .buttonStyle(.plain)
            }
        }
        .background(H.amber50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(H.amberDot.opacity(0.35), lineWidth: 1))
    }

    // MARK: - Lessons of the day

    private func lessonsCard(_ lessons: [DayLesson], isToday: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Label(isToday ? "Cours d’aujourd’hui" : "Cours du \(Self.dayLabel(date).lowercased())", systemImage: "calendar")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(EduTheme.ink)
                .padding(16)
            Divider()
            if dayLoading && day.isEmpty && !lessons.isEmpty {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity).padding(20)
            } else if lessons.isEmpty {
                VStack(spacing: 8) {
                    Text("Pas de cours ce jour dans votre emploi du temps")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                    Text("Pour un remplacement ou un cours rattrapé, choisissez la classe dans « Autre classe ».")
                        .font(.caption).foregroundStyle(EduTheme.muted)
                        .multilineTextAlignment(.center)
                    if let next = nextLessonDay {
                        Button { date = next } label: {
                            Label("Prochains cours : \(Self.dayLabel(next).lowercased())", systemImage: "chevron.right")
                                .labelStyle(TrailingIconLabelStyle())
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.teal)
                                .padding(.horizontal, 12)
                                .frame(minHeight: 38)
                                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 6)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(20)
            } else {
                ForEach(Array(lessons.enumerated()), id: \.element.id) { i, l in
                    if i > 0 { Divider().padding(.leading, 16) }
                    lessonRow(l)
                }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func lessonRow(_ l: DayLesson) -> some View {
        NavigationLink {
            TeacherAttendanceView(initialClassId: l.classId, initialSubjectId: l.subjectId, initialDate: date)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 1) {
                        Text(l.start.prefix(5)).font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(EduTheme.ink)
                            .lineLimit(1).fixedSize()
                        Text(l.end.prefix(5)).font(.caption.monospacedDigit()).foregroundStyle(EduTheme.muted)
                            .lineLimit(1).fixedSize()
                    }
                    .frame(minWidth: 48)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(l.done ? H.emerald : (l.upcoming ? EduTheme.border : H.amberDot))
                        .frame(width: 4, height: 40)
                    VStack(alignment: .leading, spacing: 3) {
                        (Text(l.className).fontWeight(.semibold).foregroundColor(EduTheme.ink)
                         + Text(" · \(l.subjectName)").foregroundColor(EduTheme.muted))
                            .font(.subheadline)
                            .lineLimit(1)
                        Label("\(l.studentCount) élève\(l.studentCount > 1 ? "s" : "")", systemImage: "person.2")
                            .font(.caption).foregroundStyle(EduTheme.muted)
                        if l.recorded > 0 {
                            (Text("\(l.present) présent\(l.present > 1 ? "s" : "")").foregroundColor(H.emerald)
                             + Text(" · ").foregroundColor(EduTheme.muted)
                             + Text("\(l.absent) absent\(l.absent > 1 ? "s" : "")").foregroundColor(l.absent > 0 ? rose : EduTheme.muted)
                             + (l.late > 0 ? Text(" · \(l.late) retard\(l.late > 1 ? "s" : "")").foregroundColor(H.amber) : Text("")))
                                .font(.caption.weight(.semibold))
                        }
                    }
                    Spacer(minLength: 0)
                }
                HStack {
                    Spacer()
                    statusPill(l)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func statusPill(_ l: DayLesson) -> some View {
        if l.done {
            Label("Appel fait", systemImage: "checkmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(H.emerald)
                .padding(.horizontal, 10).frame(minHeight: 32)
                .background(H.emerald50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        } else if l.upcoming {
            Label("Plus tard", systemImage: "clock")
                .font(.caption.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
                .padding(.horizontal, 10).frame(minHeight: 32)
                .background(H.slate100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        } else {
            Label(l.partial ? "Terminer l’appel" : "Faire l’appel", systemImage: "chevron.right")
                .labelStyle(TrailingIconLabelStyle())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 12).frame(minHeight: 32)
                .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
    }

    private var nextLessonDay: String? {
        guard let base = EduDates.parseDay(date) else { return nil }
        for i in 1...7 {
            guard let d = Calendar.current.date(byAdding: .day, value: i, to: base) else { continue }
            let dow = EduDates.weekday(d)
            if dow != 7, snapshot.slots.contains(where: { $0.dayOfWeek == dow }) { return EduDates.day(d) }
        }
        return nil
    }

    // MARK: - Other class

    private var otherClassCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Autre classe").font(.subheadline.weight(.bold)).foregroundStyle(EduTheme.ink)
                Text("Remplacement, cours déplacé ou rattrapé").font(.caption).foregroundStyle(EduTheme.muted)
            }
            .padding(16)
            Divider()
            if classes.isEmpty {
                Text("Aucune classe assignée.").font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            } else {
                ForEach(Array(classes.enumerated()), id: \.element.id) { i, c in
                    if i > 0 { Divider().padding(.leading, 16) }
                    NavigationLink {
                        TeacherAttendanceView(initialClassId: c.id, initialDate: date)
                    } label: {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(c.name).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                                if let g = c.gradeLevel, !g.isEmpty, g != c.name {
                                    Text(g).font(.caption).foregroundStyle(EduTheme.muted)
                                }
                            }
                            Spacer()
                            Text("Appel").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .modifier(HomeCardStyle())
    }

    // MARK: - Helpers

    /// « Mardi 17 novembre »
    static func dayLabel(_ iso: String) -> String {
        guard let d = EduDates.parseDay(iso) else { return iso }
        let s = TeacherExercisesView.format(d, "EEEE d MMMM")
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    // MARK: - Loading

    private func load() async {
        guard let tid = auth.userId else { ready = true; return }
        do {
            async let snap = TeacherLessons.load(teacherId: tid)
            async let rows = EduAPI().fetchTeachingAssignments(teacherId: tid)
            let (s, r) = try await (snap, rows)
            snapshot = s
            var seen: [String: (id: String, name: String, gradeLevel: String?)] = [:]
            for a in r where seen[a.classSectionId] == nil {
                seen[a.classSectionId] = (a.classSectionId, a.classes?.name ?? "Classe", a.classes?.gradeLevel)
            }
            classes = seen.values.sorted { a, b in
                let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
                let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
                if ra != rb { return ra < rb }
                return a.name.localizedStandardCompare(b.name) == .orderedAscending
            }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        ready = true
    }

    /// Presences recorded on the chosen day for the classes and subjects of its lessons.
    private func loadDay() async {
        guard let d = EduDates.parseDay(date) else { return }
        let dow = EduDates.weekday(d)
        let slots = snapshot.slots.filter { $0.dayOfWeek == dow }
        let classIds = Array(Set(slots.compactMap(\.classSectionId)))
        let subjectIds = Array(Set(slots.compactMap(\.subjectId)))
        guard !classIds.isEmpty, !subjectIds.isEmpty else { day = []; dayLoading = false; return }
        dayLoading = true
        let wanted = date
        do {
            let rows = try await EduAPI().fetchDayPresences(classIds: classIds, subjectIds: subjectIds, date: wanted)
            if wanted == date { day = rows }
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
        dayLoading = false
    }
}

extension EduAPI {
    func fetchDayPresences(classIds: [String], subjectIds: [String], date: String) async throws -> [TeacherAppelView.DayRow] {
        var out: [TeacherAppelView.DayRow] = []
        var start = 0
        while true {
            let page: [TeacherAppelView.DayRow] = try await client.from("presences")
                .select("class_section_id, subject_id, status")
                .in("class_section_id", values: classIds)
                .in("subject_id", values: subjectIds)
                .eq("date", value: date)
                .range(from: start, to: start + 999)
                .execute()
                .value
            out += page
            if page.count < 1000 { break }
            start += 1000
        }
        return out
    }
}
