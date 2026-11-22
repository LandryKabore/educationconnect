import SwiftUI

/// One lesson opened from the teacher timetable (the web opens its lesson screen): the class,
/// subject, day and time, and what can be done for it — roll call, cahier de textes, homework,
/// a quiz — plus the class page.
struct TeacherLessonView: View {
    let slot: TimetableSlot
    /// yyyy-MM-dd of the lesson
    let date: String

    @EnvironmentObject private var auth: AuthViewModel
    private typealias H = TeacherHomeView

    private var className: String { slot.classes?.name ?? "Classe" }
    private var subjectName: String { slot.matieres?.name ?? "Cours" }
    private var classId: String { slot.classSectionId ?? "" }
    private var subjectId: String { slot.subjectId ?? "" }
    private var today: String { EduDates.day() }
    private var nowMin: Int { TeacherLessons.minutes(of: Date()) }
    private var startMin: Int { TeacherLessons.minutes(slot.startTime) }
    private var endMin: Int { TeacherLessons.minutes(slot.endTime) }
    private var started: Bool { date < today || (date == today && nowMin >= startMin) }
    private var live: Bool { date == today && nowMin >= startMin && nowMin < endMin }
    private var over: Bool { date < today || (date == today && nowMin >= endMin) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                VStack(spacing: 0) {
                    action(icon: "checklist", title: "Faire l’appel",
                           hint: started ? "Présents, absents et retards de ce cours." : "Possible dès le début du cours.",
                           primary: started && !over || (over && date == today), enabled: started) {
                        TeacherAttendanceView(initialClassId: classId, initialSubjectId: subjectId, initialDate: date)
                    }
                    Divider().padding(.leading, 64)
                    action(icon: "book", title: over ? "Remplir le cahier de textes" : "Préparer le cahier de textes",
                           hint: "Ce qui a été vu en cours et le travail à faire.", primary: over, enabled: true) {
                        TeacherCahierView(initialClassId: classId, initialSubjectId: subjectId, initialDate: date)
                    }
                    Divider().padding(.leading, 64)
                    action(icon: "book.closed", title: "Exercices de maison",
                           hint: "Le travail à faire à la maison et sa date.", primary: false, enabled: true) {
                        TeacherExercisesView()
                    }
                    Divider().padding(.leading, 64)
                    action(icon: "list.clipboard", title: "Évaluations & notes",
                           hint: "Interrogations de la classe et notes à saisir.", primary: false, enabled: true) {
                        TeacherEvaluationsView(initialClassId: classId)
                    }
                }
                .modifier(HomeCardStyle())

                NavigationLink {
                    ClassHubView(classId: classId, className: className)
                } label: {
                    Label("Ouvrir la classe \(className)", systemImage: "person.3")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(EduTheme.ink)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("\(className) · \(subjectName)")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
    }

    private var header: some View {
        let swatch = SubjectPalette.swatch(for: className)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(live ? "EN COURS" : (over ? "TERMINÉ" : "À VENIR"))
                    .font(.system(size: 11, weight: .bold)).tracking(0.5)
                    .foregroundStyle(live ? .white : (over ? EduTheme.muted : EduTheme.teal))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(live ? EduTheme.fasoGreen : (over ? H.slate100 : EduTheme.brand50),
                                in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                Text(TeacherExercisesView.dayLabel(date).capitalized(with: Locale(identifier: "fr_FR")))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
            }
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 2).fill(swatch.border).frame(width: 4, height: 48)
                VStack(alignment: .leading, spacing: 3) {
                    Text(className).font(.title2.weight(.bold)).foregroundStyle(EduTheme.ink)
                    Text("\(subjectName) · \(FrTime.of(slot.startTime)) – \(FrTime.of(slot.endTime))")
                        .font(.subheadline).foregroundStyle(EduTheme.muted)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(HomeCardStyle())
    }

    private func action<D: View>(icon: String, title: String, hint: String, primary: Bool, enabled: Bool,
                                 @ViewBuilder destination: @escaping () -> D) -> some View {
        NavigationLink { destination() } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(primary ? .white : EduTheme.teal)
                    .frame(width: 36, height: 36)
                    .background(primary ? EduTheme.teal : EduTheme.brand50,
                                in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                    Text(hint).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(2)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
            .opacity(enabled ? 1 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}
