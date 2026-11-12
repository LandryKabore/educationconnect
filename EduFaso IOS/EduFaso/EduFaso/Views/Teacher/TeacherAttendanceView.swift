import SwiftUI

struct TeacherAttendanceView: View {
    var initialClassId: String? = nil
    @EnvironmentObject private var auth: AuthViewModel
    @State private var assignments: [TeachingAssignment] = []
    @State private var selected: TeachingAssignment?
    @State private var drafts: [PresenceDraft] = []
    @State private var date = Date()
    @State private var loading = false
    @State private var saving = false
    @State private var message: String?

    var body: some View {
        Group {
            Form {
                Section("Classe") {
                    Picker("Affectation", selection: $selected) {
                        Text("Choisir").tag(Optional<TeachingAssignment>.none)
                        ForEach(assignments) { a in
                            Text("\(a.classes?.name ?? "?") — \(a.matieres?.name ?? "")")
                                .tag(Optional(a))
                        }
                    }
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }

                if loading {
                    ProgressView()
                } else if !drafts.isEmpty {
                    Section("Appel (\(drafts.count))") {
                        ForEach($drafts) { $d in
                            Picker(d.fullName, selection: $d.status) {
                                Text("Présent").tag("present")
                                Text("Absent").tag("absent")
                                Text("Retard").tag("late")
                                Text("Excusé").tag("excused")
                            }
                        }
                    }
                    Section {
                        Button {
                            Task { await save() }
                        } label: {
                            if saving { ProgressView() } else { Text("Enregistrer l’appel") }
                        }
                        .disabled(saving)
                    }
                }

                if let message {
                    Text(message).foregroundStyle(EduTheme.teal)
                }
            }
            .navigationTitle("Appel")
            .task { await loadAssignments() }
            .onChange(of: selected) { _, _ in
                Task { await loadStudents() }
            }
        }
    }

    private func loadAssignments() async {
        guard let tid = auth.userId else { return }
        do {
            assignments = try await EduAPI().fetchTeachingAssignments(teacherId: tid)
            if selected == nil, let initialClassId {
                selected = assignments.first { $0.classSectionId == initialClassId }
            }
        } catch { }
    }

    private func loadStudents() async {
        guard let selected else { drafts = []; return }
        loading = true
        defer { loading = false }
        do {
            drafts = try await EduAPI().fetchStudentsInClass(classSectionId: selected.classSectionId)
            message = nil
        } catch {
            message = error.localizedDescription
        }
    }

    private func save() async {
        guard let selected, let schoolId = auth.schoolId, let uid = auth.userId else {
            message = "École ou session manquante."
            return
        }
        saving = true
        defer { saving = false }
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        do {
            try await EduAPI().saveAttendance(
                schoolId: schoolId,
                classSectionId: selected.classSectionId,
                subjectId: selected.subjectId,
                date: df.string(from: date),
                drafts: drafts,
                recordedBy: uid
            )
            message = "Appel enregistré."
        } catch {
            message = error.localizedDescription
        }
    }
}
