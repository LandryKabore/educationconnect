import SwiftUI

/// Mes profs (student), same as the web: one row per teacher of the class, listed by subject
/// ("my maths teacher"), with the next lesson together, the hours per week and a button to write.
struct MyTeachersView: View {
    var studentId: String? = nil
    @EnvironmentObject private var auth: AuthViewModel

    struct Teacher: Identifiable, Hashable {
        let id: String
        let name: String
        var subjects: [String]
        let minutesPerWeek: Int
        let next: NextLesson?
    }

    struct NextLesson: Hashable {
        let day: Int
        let start: String
        let room: String?
    }

    @State private var teachers: [Teacher] = []
    @State private var className: String?
    @State private var notEnrolled = false
    @State private var loading = true
    @State private var error: String?

    @State private var tour = TabTour(key: "mes-profs")
    @State private var coach = CoachMarkRegistry()

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(
                id: "profs.summary", icon: "person.2.fill",
                title: "Tes enseignants",
                message: "Combien de professeurs tu as cette année et combien d’heures de cours par semaine."
            ),
            CoachMarkStep(
                id: "profs.row", icon: "book.fill",
                title: "Rangés par matière",
                message: "Pour chaque matière : ton professeur, ton prochain cours avec lui (en vert si c’est aujourd’hui) et ses heures par semaine."
            ),
            CoachMarkStep(
                id: "profs.write", icon: "envelope.fill",
                title: "Écrire à un professeur",
                message: "Touche « Écrire » pour lui envoyer un message. La discussion s’ouvre dans Messages."
            ),
            CoachMarkStep(
                id: "profs.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: "Touche ce bouton à tout moment pour relancer la visite."
            ),
        ]
    }

    private var totalMinutes: Int { teachers.reduce(0) { $0 + $1.minutesPerWeek } }

    private var rows: [Teacher] {
        teachers.sorted { ($0.subjects.first ?? "~").localizedCompare($1.subjects.first ?? "~") == .orderedAscending }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading && teachers.isEmpty {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 16) {
                                header.coachMarkTarget("profs.summary")
                                if notEnrolled {
                                    emptyCard("Tu n’es inscrit dans aucune classe pour le moment.")
                                } else if teachers.isEmpty {
                                    emptyCard("Aucun enseignant n’est encore affecté à ta classe.")
                                } else {
                                    list
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        }
                        .refreshable { await load() }
                        .tabTour(tour, registry: coach, scroller: proxy)
                    }
                    .onAppear { tour.autoStartOnce({ tourSteps }, registry: coach) }
                }
            }
        }
        .environment(coach)
        .premiumTitle("Mes profs")
        .task { await load() }
    }

    // MARK: - Pieces

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Mes profs")
                    .font(.system(size: 24, weight: .bold))
                    .tracking(-0.3)
                    .foregroundStyle(EduTheme.ink)
                let parts = [
                    className,
                    teachers.isEmpty ? nil : "\(teachers.count) enseignant\(teachers.count > 1 ? "s" : "")",
                    totalMinutes > 0 ? "\(Self.hours(totalMinutes)) de cours par semaine" : nil,
                ].compactMap { $0 }
                Text(parts.isEmpty ? "Les enseignants de ta classe" : parts.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            TourHelpButton(onDark: false) { tour.start(tourSteps, registry: coach) }
                .coachMarkTarget("profs.help")
        }
    }

    private var list: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, t in
                if index > 0 { Divider() }
                if index == 0 {
                    row(t, first: true).coachMarkTarget("profs.row")
                } else {
                    row(t, first: false)
                }
            }
        }
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private func row(_ t: Teacher, first: Bool) -> some View {
        let subject = t.subjects.first ?? "Matière non précisée"
        let swatch = SubjectPalette.swatch(for: subject)
        let isToday = t.next?.day == EduDates.weekday()
        return HStack(alignment: .top, spacing: 12) {
            Rectangle()
                .fill(swatch.border)
                .frame(width: 4)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(subject)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    if t.subjects.count > 1 {
                        Text("+ " + t.subjects.dropFirst().joined(separator: ", "))
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                            .lineLimit(1)
                    }
                }
                Label(t.name, systemImage: "person.fill")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.ink.opacity(0.85))
                    .labelStyle(.titleAndIcon)
                Group {
                    if let next = t.next {
                        (Text("\(isToday ? "Aujourd’hui" : Self.dayName(next.day)) à \(Self.clockFr(next.start))")
                            .foregroundStyle(isToday ? Self.emerald : EduTheme.muted)
                            .fontWeight(isToday ? .semibold : .regular)
                         + Text(Self.room(next.room).map { " · \($0)" } ?? "").foregroundStyle(EduTheme.subtle))
                    } else {
                        Text("Pas encore à l’emploi du temps").foregroundStyle(EduTheme.subtle)
                    }
                }
                .font(.caption)
                if t.minutesPerWeek > 0 {
                    Text("\(Self.hours(t.minutesPerWeek)) par semaine")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                }
            }
            .padding(.vertical, 12)
            Spacer(minLength: 8)
            writeButton(t)
                .padding(.top, 12)
                .modifier(OptionalCoachTarget(id: first ? "profs.write" : nil))
        }
        .padding(.trailing, 12)
        .fixedSize(horizontal: false, vertical: true)
    }

    private func writeButton(_ t: Teacher) -> some View {
        NavigationLink {
            ConversationChatView(
                otherId: t.id,
                otherName: t.name,
                subtitle: "Professeur" + (t.subjects.isEmpty ? "" : " · " + t.subjects.joined(separator: ", ")),
                onChanged: {}
            )
        } label: {
            Label("Écrire", systemImage: "envelope.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .frame(minHeight: 34)
                .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Écrire à \(t.name)")
    }

    private func emptyCard(_ text: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "person.2")
                .font(.title2)
                .foregroundStyle(EduTheme.teal)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 16)
        .background(cardBackground)
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
            .fill(.white)
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1)
            )
    }

    // MARK: - Data

    private func load() async {
        guard let sid = studentId ?? auth.userId else { return }
        do {
            let api = EduAPI()
            guard let enrollment = try await api.activeEnrollment(studentId: sid) else {
                notEnrolled = true
                teachers = []
                loading = false
                return
            }
            let data = try await api.fetchClassTeachers(classId: enrollment.classId)
            if Task.isCancelled { return }
            className = enrollment.className
            notEnrolled = false
            var byTeacher: [String: Teacher] = [:]
            var order: [String] = []
            for a in data.assignments {
                guard let tid = a.teacherId else { continue }
                let subject = a.matieres?.name.trimmingCharacters(in: .whitespaces) ?? ""
                if var existing = byTeacher[tid] {
                    if !subject.isEmpty && !existing.subjects.contains(subject) { existing.subjects.append(subject) }
                    byTeacher[tid] = existing
                    continue
                }
                let mine = data.slots.filter { $0.teacherId == tid }
                let name = a.profils?.fullName ?? ""
                byTeacher[tid] = Teacher(
                    id: tid,
                    name: name.isEmpty ? "Enseignant" : name,
                    subjects: subject.isEmpty ? [] : [subject],
                    minutesPerWeek: mine.reduce(0) { $0 + max(0, Self.minutes($1.endTime) - Self.minutes($1.startTime)) },
                    next: Self.nextLesson(mine)
                )
                order.append(tid)
            }
            teachers = order.compactMap { byTeacher[$0] }.map { t in
                var t = t
                t.subjects.sort { $0.localizedCompare($1) == .orderedAscending }
                return t
            }
            error = nil
        } catch {
            if Task.isCancelled || error.isCancellation { return }
            self.error = error.localizedDescription
        }
        loading = false
    }

    /// Next lesson of this teacher with the class, from now (wraps to next week).
    private static func nextLesson(_ slots: [EduAPI.ClassTeacherSlot]) -> NextLesson? {
        let today = EduDates.weekday()
        let cal = Calendar.current
        let now = Date()
        let nowMin = cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now)
        var best: (score: Int, slot: EduAPI.ClassTeacherSlot)?
        for s in slots {
            var offset = (s.dayOfWeek - today + 7) % 7
            if offset == 0 && minutes(s.startTime) <= nowMin { offset = 7 }
            let score = offset * 1440 + minutes(s.startTime)
            if best == nil || score < best!.score { best = (score, s) }
        }
        guard let s = best?.slot else { return nil }
        return NextLesson(day: s.dayOfWeek, start: String(s.startTime.prefix(5)), room: s.room)
    }

    // MARK: - Formatting

    private static let emerald = Color(red: 4 / 255, green: 120 / 255, blue: 87 / 255)

    private static func minutes(_ t: String) -> Int {
        let p = t.prefix(5).split(separator: ":").compactMap { Int($0) }
        return (p.first ?? 0) * 60 + (p.count > 1 ? p[1] : 0)
    }

    /// "07:00" → "7 h", "09:30" → "9 h 30"
    private static func clockFr(_ hhmm: String) -> String {
        let m = minutes(hhmm)
        return m % 60 == 0 ? "\(m / 60) h" : "\(m / 60) h \(String(format: "%02d", m % 60))"
    }

    private static func hours(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "\(h) h" : "\(h) h \(String(format: "%02d", m))"
    }

    private static func room(_ room: String?) -> String? {
        guard let r = room?.trimmingCharacters(in: .whitespaces), !r.isEmpty else { return nil }
        return r.lowercased().hasPrefix("salle") ? r : "Salle \(r)"
    }

    private static func dayName(_ d: Int) -> String {
        ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"][max(0, min(7, d))]
    }
}

/// Adds a coach-mark target only when an id is given (first row of a list).
private struct OptionalCoachTarget: ViewModifier {
    let id: String?
    func body(content: Content) -> some View {
        if let id { content.coachMarkTarget(id) } else { content }
    }
}

extension EduAPI {
    struct ClassTeacherAssignment: Decodable {
        let teacherId: String?
        let matieres: NamedEntity?
        let profils: PersonName?
        enum CodingKeys: String, CodingKey {
            case matieres, profils
            case teacherId = "teacher_id"
        }
    }

    struct ClassTeacherSlot: Decodable {
        let teacherId: String?
        let dayOfWeek: Int
        let startTime: String
        let endTime: String
        let room: String?
        enum CodingKeys: String, CodingKey {
            case room
            case teacherId = "teacher_id"
            case dayOfWeek = "day_of_week"
            case startTime = "start_time"
            case endTime = "end_time"
        }
    }

    /// Teachers of a class (with their subjects) and the class timetable slots, with teacher ids.
    func fetchClassTeachers(classId: String) async throws -> (assignments: [ClassTeacherAssignment], slots: [ClassTeacherSlot]) {
        async let assignments: [ClassTeacherAssignment] = client
            .from("affectations_enseignement")
            .select("teacher_id, matieres(name), profils:teacher_id(first_name, last_name)")
            .eq("class_section_id", value: classId)
            .execute()
            .value
        async let slots: [ClassTeacherSlot] = client
            .from("creneaux_edt")
            .select("teacher_id, day_of_week, start_time, end_time, room")
            .eq("class_section_id", value: classId)
            .execute()
            .value
        let a = try await assignments
        let s = (try? await slots) ?? []
        return (a, s)
    }
}
