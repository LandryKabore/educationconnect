import SwiftUI

/// School admin « Saisie pour un enseignant », like the web SaisieEnseignant: when a teacher has no
/// connection, the school picks the teacher, then a class, and enters the roll call or the grades
/// on their behalf.
struct SchoolTeacherEntryView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var teachers: [SchoolTimetableView.Person] = []
    @State private var teacherId = ""
    @State private var classes: [ClassCard] = []
    @State private var loadingClasses = false
    @State private var ready = false

    @State private var tour = TabTour(key: "saisie-enseignant")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView
    private let sky = Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)
    private let sky100 = Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255)

    struct ClassCard: Identifiable {
        let id: String
        let name: String
        let gradeLevel: String?
        var subjects: [String]
    }

    private var teacherName: String? { teachers.first { $0.id == teacherId }?.name }

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "se.teacher", icon: "person", title: "L’enseignant",
                          message: "Choisissez le professeur qui n’a pas de connexion : les saisies sont enregistrées à son nom."),
            CoachMarkStep(id: "se.classes", icon: "rectangle.3.group", title: "Par classe",
                          message: "Pour chacune de ses classes : faites l’appel ou saisissez ses évaluations et ses notes."),
            CoachMarkStep(id: "se.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        teacherCard.coachMarkTarget("se.teacher")
                        if !teacherId.isEmpty {
                            if loadingClasses {
                                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity).padding(24)
                            } else if classes.isEmpty {
                                Text("Aucune classe affectée à cet enseignant.").font(.subheadline).foregroundStyle(EduTheme.muted)
                                    .frame(maxWidth: .infinity).padding(24).modifier(HomeCardStyle())
                            } else {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("PAR CLASSE").font(.system(size: 11, weight: .semibold)).tracking(0.6).foregroundStyle(EduTheme.muted)
                                    ForEach(classes) { c in classCard(c) }
                                }
                                .coachMarkTarget("se.classes")
                            }
                        }
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Saisie enseignant")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await loadTeachers() }
        .onChange(of: teacherId) { _, _ in Task { await loadClasses() } }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Saisie pour un enseignant").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                    Text("Quand un professeur n’a pas de connexion, l’administration peut saisir à sa place.")
                        .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("se.help")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var teacherCard: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "pencil.line")
                .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                .frame(width: 40, height: 40)
                .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text("Enseignant").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.muted)
                Menu {
                    ForEach(teachers) { t in Button(t.name) { teacherId = t.id } }
                } label: {
                    HStack {
                        Text(teacherName ?? "Choisir un enseignant…").font(.subheadline.weight(.semibold))
                            .foregroundStyle(teacherName == nil ? EduTheme.muted : EduTheme.ink)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(EduTheme.muted)
                    }
                    .padding(.horizontal, 12).frame(minHeight: 40)
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
                }
                if let teacherName {
                    (Text("Les saisies seront enregistrées au nom de ").foregroundColor(EduTheme.muted)
                     + Text(teacherName).fontWeight(.semibold).foregroundColor(EduTheme.ink) + Text(".").foregroundColor(EduTheme.muted))
                        .font(.caption)
                } else {
                    Text("Sélectionnez le professeur concerné, puis choisissez une action.").font(.caption).foregroundStyle(EduTheme.muted)
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func classCard(_ c: ClassCard) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    (Text(c.name).font(.headline).foregroundColor(EduTheme.ink)
                     + Text(c.gradeLevel.map { $0 != c.name ? "  \($0)" : "" } ?? "").font(.subheadline).foregroundColor(EduTheme.muted))
                    Text(c.subjects.isEmpty ? "Aucune matière" : c.subjects.joined(separator: " · ")).font(.caption).foregroundStyle(EduTheme.muted)
                }
                Spacer()
                Text("\(c.subjects.count) matière\(c.subjects.count > 1 ? "s" : "")").font(.caption.weight(.bold)).foregroundStyle(sky)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(sky100, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            }
            HStack(spacing: 8) {
                NavigationLink {
                    TeacherAttendanceView(initialClassId: c.id, teacherIdOverride: teacherId)
                } label: {
                    Label("Présences", systemImage: "checkmark.circle")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain)
                NavigationLink {
                    EvaluationsBrowser(classId: c.id, teacherId: teacherId, allowEntry: true, recordedBy: teacherId,
                                       title: "Évaluations & notes · \(c.name)")
                } label: {
                    Label("Évaluations & notes", systemImage: "list.clipboard")
                        .font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.borderStrong, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private func loadTeachers() async {
        guard let sid = auth.schoolId else { ready = true; return }
        teachers = (try? await EduAPI().fetchActiveTeachers(schoolId: sid)) ?? []
        ready = true
    }

    private func loadClasses() async {
        guard !teacherId.isEmpty else { classes = []; return }
        loadingClasses = true
        defer { loadingClasses = false }
        let rows = (try? await EduAPI().fetchTeachingAssignments(teacherId: teacherId)) ?? []
        var map: [String: ClassCard] = [:]
        for r in rows {
            var c = map[r.classSectionId] ?? ClassCard(id: r.classSectionId, name: r.classes?.name ?? "Classe", gradeLevel: r.classes?.gradeLevel, subjects: [])
            if let s = r.matieres?.name, !c.subjects.contains(s) { c.subjects.append(s) }
            map[r.classSectionId] = c
        }
        classes = map.values.map { var c = $0; c.subjects.sort { $0.localizedCompare($1) == .orderedAscending }; return c }
            .sorted { a, b in
                let ra = TeacherClassesView.gradeRank(name: a.name, gradeLevel: a.gradeLevel)
                let rb = TeacherClassesView.gradeRank(name: b.name, gradeLevel: b.gradeLevel)
                return ra != rb ? ra < rb : a.name.localizedStandardCompare(b.name) == .orderedAscending
            }
    }
}
