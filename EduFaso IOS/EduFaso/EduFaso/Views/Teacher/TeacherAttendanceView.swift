import SwiftUI

struct TeacherAttendanceView: View {
    var initialClassId: String? = nil
    var initialSubjectId: String? = nil
    @EnvironmentObject private var auth: AuthViewModel
    @State private var assignments: [TeachingAssignment] = []
    @State private var selected: TeachingAssignment?
    @State private var drafts: [PresenceDraft] = []
    @State private var date = Date()
    @State private var loading = false
    @State private var saving = false
    @State private var message: String?
    @State private var error: String?

    private let statuses: [(id: String, label: String)] = [
        ("present", "Présent"),
        ("absent", "Absent"),
        ("late", "Retard"),
        ("excused", "Excusé"),
    ]

    private var absentCount: Int { drafts.filter { $0.status == "absent" }.count }
    private var lateCount: Int { drafts.filter { $0.status == "late" }.count }
    private var excusedCount: Int { drafts.filter { $0.status == "excused" }.count }

    private var canSave: Bool {
        selected?.subjectId != nil && !drafts.isEmpty && !saving
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    classCard

                    if loading {
                        ProgressView()
                            .tint(EduTheme.navy)
                            .frame(maxWidth: .infinity, minHeight: 120)
                    } else if drafts.isEmpty {
                        Text(selected == nil
                             ? "Choisissez une classe et une matière."
                             : "Aucun élève inscrit dans cette classe.")
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 24)
                    } else {
                        summaryStrip
                        rosterCard
                    }

                    if let error {
                        Text(error)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(EduTheme.fasoRed)
                    } else if let message {
                        Text(message)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(EduTheme.teal)
                    }
                }
                .padding(16)
                .padding(.bottom, 100)
            }

            if !drafts.isEmpty {
                stickySaveBar
            }
        }
        .background(EduTheme.loginBackground.ignoresSafeArea())
        .navigationTitle("Appel")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await loadAssignments() }
        .onChange(of: selected) { _, _ in
            Task { await loadStudents() }
        }
        .onChange(of: date) { _, _ in
            // Keep roster; statuses stay editable for the new day.
            message = nil
            error = nil
        }
    }

    private var classCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Classe et matière")
                .font(.caption.weight(.bold))
                .foregroundStyle(EduTheme.muted)
                .textCase(.uppercase)

            Picker("Affectation", selection: $selected) {
                Text("Choisir").tag(Optional<TeachingAssignment>.none)
                ForEach(assignments) { a in
                    Text("\(a.classes?.name ?? "?") — \(a.matieres?.name ?? "")")
                        .tag(Optional(a))
                }
            }
            .pickerStyle(.menu)
            .tint(EduTheme.navy)

            DatePicker("Date", selection: $date, displayedComponents: .date)
                .tint(EduTheme.navy)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
    }

    private var summaryStrip: some View {
        HStack(spacing: 8) {
            summaryChip("\(drafts.count)", "Élèves", EduTheme.navy)
            summaryChip("\(absentCount)", "Absents", EduTheme.fasoRed)
            summaryChip("\(lateCount)", "Retards", Color.orange)
            summaryChip("\(excusedCount)", "Excusés", Color(red: 37 / 255, green: 99 / 255, blue: 235 / 255))
        }
    }

    private func summaryChip(_ value: String, _ label: String, _ tint: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline.weight(.bold).monospacedDigit())
                .foregroundStyle(tint)
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(EduTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var rosterCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Appel (\(drafts.count))")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(EduTheme.ink)
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 8)

            ForEach($drafts) { $draft in
                HStack(spacing: 12) {
                    Text(draft.fullName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Menu {
                        ForEach(statuses, id: \.id) { item in
                            Button {
                                draft.status = item.id
                            } label: {
                                Label(item.label, systemImage: statusIcon(item.id))
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(statusLabel(draft.status))
                                .font(.caption.weight(.bold))
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.caption2.weight(.bold))
                        }
                        .foregroundStyle(statusColor(draft.status))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(statusColor(draft.status).opacity(0.12), in: Capsule())
                    }
                    .accessibilityLabel("Statut : \(statusLabel(draft.status))")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)

                if draft.id != drafts.last?.id {
                    Rectangle()
                        .fill(Color.black.opacity(0.06))
                        .frame(height: 1)
                        .padding(.leading, 14)
                }
            }
        }
        .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
    }

    private var stickySaveBar: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Color.black.opacity(0.06))
                .frame(height: 1)
            Button {
                Task { await save() }
            } label: {
                HStack {
                    if saving { ProgressView().tint(.white) }
                    Text(saving ? "Enregistrement…" : "Enregistrer l’appel")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(.white)
                .background(canSave ? EduTheme.teal : EduTheme.muted.opacity(0.35), in: Capsule())
            }
            .disabled(!canSave)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 16)
        }
        .background(.ultraThinMaterial)
    }

    private func statusLabel(_ status: String) -> String {
        statuses.first { $0.id == status }?.label ?? status
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "absent": return EduTheme.fasoRed
        case "late": return Color.orange
        case "excused": return Color(red: 37 / 255, green: 99 / 255, blue: 235 / 255)
        default: return EduTheme.teal
        }
    }

    private func statusIcon(_ status: String) -> String {
        switch status {
        case "absent": return "xmark.circle.fill"
        case "late": return "clock.fill"
        case "excused": return "checkmark.shield.fill"
        default: return "checkmark.circle.fill"
        }
    }

    private func loadAssignments() async {
        guard let tid = auth.userId else { return }
        do {
            assignments = try await EduAPI().fetchTeachingAssignments(teacherId: tid)
            guard selected == nil else { return }
            if let initialClassId, let initialSubjectId,
               let match = assignments.first(where: {
                   $0.classSectionId == initialClassId && $0.subjectId == initialSubjectId
               }) {
                selected = match
            } else if let initialClassId,
                      let match = assignments.first(where: { $0.classSectionId == initialClassId }) {
                selected = match
            } else if let initialSubjectId,
                      let match = assignments.first(where: { $0.subjectId == initialSubjectId }) {
                selected = match
            }
            if selected != nil {
                await loadStudents()
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
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        guard let selected, let subjectId = selected.subjectId, let uid = auth.userId else {
            error = "Classe, matière ou session manquante."
            return
        }
        saving = true
        defer { saving = false }
        message = nil
        error = nil
        do {
            try await EduAPI().saveAttendance(
                classSectionId: selected.classSectionId,
                subjectId: subjectId,
                date: EduDates.day(date),
                drafts: drafts,
                recordedBy: uid
            )
            message = "Appel enregistré."
        } catch {
            self.error = error.localizedDescription
        }
    }
}
