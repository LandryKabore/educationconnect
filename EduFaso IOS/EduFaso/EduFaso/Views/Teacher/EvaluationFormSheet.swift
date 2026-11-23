import SwiftUI

/// An evaluation being edited (same fields as the web `EditableEvaluation`).
struct EditableEvaluation: Hashable {
    let id: String
    let subjectId: String
    let period: String
    let type: String
    let title: String
    let description: String?
    let maxScore: Double
    let date: String?
}

/// Like the web `EvaluationFormModal`: create or edit an interrogation or an exercice de maison.
/// A new exercice de maison that is not graded is plain homework, saved in the cahier like the
/// « travail à faire » of a lesson (no Trimestre, no grade sheet).
struct EvaluationFormSheet: View {
    let classId: String
    let className: String
    let subjects: [TeacherExercisesView.Subject]
    let defaultPeriod: String
    var defaultType = "devoir"
    var editing: EditableEvaluation?
    /// Called with the new evaluation id (nil for plain homework or an edit) and its type.
    var onSaved: (_ createdId: String?, _ type: String) -> Void

    static let periods = ["Trimestre 1", "Trimestre 2", "Trimestre 3"]

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var type = "devoir"
    @State private var subjectId = ""
    @State private var period = "Trimestre 1"
    @State private var title = ""
    @State private var details = ""
    @State private var hasDate = false
    @State private var due = Date()
    @State private var graded = false
    @State private var maxScore = "20"
    @State private var saving = false
    @State private var error: String?

    private var plainHomework: Bool { editing == nil && type == "devoir" && !graded }

    var body: some View {
        EduFormSheet(title: editing == nil ? (type == "devoir" ? "Nouvel exercice" : "Nouvelle évaluation") : "Modifier l’évaluation", primary: saving ? "Enregistrement…" : "Enregistrer", primaryDisabled: saving, busy: saving, onPrimary: { Task { await save() } }) {
                Section {
                    Text("Classe ").foregroundStyle(EduTheme.muted) + Text(className).bold()
                    if editing == nil {
                        HStack(spacing: 8) {
                            typeButton("interrogation", "Interrogation", "Contrôle rapide en classe")
                            typeButton("devoir", "Exercice de maison", "Travail à faire à la maison")
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                    }
                }
                if editing == nil && type == "devoir" {
                    Section {
                        Toggle(isOn: $graded) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Noté")
                                Text(graded ? "Une note sera saisie pour chaque élève." : "Non noté : les élèves voient seulement le travail et la date.")
                                    .font(.caption).foregroundStyle(EduTheme.muted)
                            }
                        }
                        .tint(EduTheme.teal)
                    }
                }
                Section {
                    if subjects.count > 1 {
                        Picker("Matière", selection: $subjectId) {
                            ForEach(subjects) { s in Text(s.name).tag(s.id) }
                        }
                    }
                    if !plainHomework {
                        Picker("Trimestre", selection: $period) {
                            ForEach(Self.periods, id: \.self) { Text($0).tag($0) }
                        }
                    }
                    TextField(type == "interrogation" ? "Titre (ex. Interrogation chapitre 3)" : "Titre (ex. Exercices page 42)", text: $title)
                    Toggle(type == "devoir" ? "Pour quand ?" : "Date", isOn: $hasDate).tint(EduTheme.teal)
                    if hasDate {
                        DatePicker("Date", selection: $due,
                                   in: (plainHomework ? Calendar.current.startOfDay(for: Date()) : .distantPast)...,
                                   displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "fr_FR"))
                    }
                    if !plainHomework {
                        HStack {
                            Text("Note maximale")
                            Spacer()
                            TextField("20", text: $maxScore)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 70)
                        }
                    }
                }
                Section("Description (facultatif)") {
                    TextField("Ex. Exercices 1 à 4, à présenter en classe…", text: $details, axis: .vertical)
                        .lineLimit(3...6)
                }
                if let error {
                    Section { Text(error).foregroundStyle(EduTheme.fasoRed) }
                }
            }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
        .onAppear(perform: fill)
    }

    private func typeButton(_ value: String, _ label: String, _ hint: String) -> some View {
        let on = type == value
        return Button { type = value } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.subheadline.weight(.bold)).foregroundStyle(EduTheme.ink)
                Text(hint).font(.caption).foregroundStyle(EduTheme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(on ? EduTheme.brand50 : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                .stroke(on ? EduTheme.teal : EduTheme.border, lineWidth: on ? 1.5 : 1))
        }
        .buttonStyle(.plain)
    }

    private func fill() {
        type = editing?.type ?? defaultType
        subjectId = editing?.subjectId ?? subjects.first?.id ?? ""
        period = editing?.period ?? defaultPeriod
        title = editing?.title ?? ""
        details = editing?.description ?? ""
        if let d = editing?.date.flatMap(EduDates.parseDay) { hasDate = true; due = d }
        if let m = editing?.maxScore { maxScore = m.rounded() == m ? String(Int(m)) : String(m) }
    }

    private func save() async {
        guard let tid = auth.userId else { return }
        guard !subjectId.isEmpty else { error = "Choisissez une matière"; return }
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "Donnez un titre"; return }
        let d = details.trimmingCharacters(in: .whitespacesAndNewlines)
        let date = hasDate ? EduDates.day(due) : nil
        saving = true
        defer { saving = false }
        do {
            let api = EduAPI()
            if plainHomework {
                try await api.insertCahier(CahierInsert(
                    class_section_id: classId, subject_id: subjectId, entry_date: EduDates.day(),
                    content: "", homework: [t, d].filter { !$0.isEmpty }.joined(separator: "\n"), homework_due: date))
                onSaved(nil, type)
            } else {
                guard let max = Double(maxScore.replacingOccurrences(of: ",", with: ".")), max > 0 else {
                    error = "Note maximale invalide"; return
                }
                let payload = ExercisePayload(class_section_id: classId, subject_id: subjectId, teacher_id: tid,
                                              period_label: period, type: type, title: t, description: d.isEmpty ? nil : d,
                                              max_score: max, eval_date: date, start_time: nil, end_time: nil)
                if let editing {
                    try await api.updateExercise(id: editing.id, payload)
                    onSaved(nil, type)
                } else {
                    let id = try await api.insertExercise(payload)
                    onSaved(id, type)
                }
            }
            dismiss()
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }
}
