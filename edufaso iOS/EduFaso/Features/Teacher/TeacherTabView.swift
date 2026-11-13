import SwiftUI

struct TeacherTabView: View {
  @Environment(AuthStore.self) private var auth

  var body: some View {
    TabView {
      NavigationStack {
        TeacherHomeView()
      }
      .tabItem { Label("Accueil", systemImage: "house.fill") }

      NavigationStack {
        TeacherClassesView()
      }
      .tabItem { Label("Classes", systemImage: "rectangle.stack") }

      NavigationStack {
        if let teacherId = auth.userId {
          TimetableView(title: "Mon emploi du temps") {
            try await SchoolDataService.teacherTimetable(teacherId: teacherId)
          }
        }
      }
      .tabItem { Label("Emploi du temps", systemImage: "calendar") }

      NavigationStack {
        MessagesView()
      }
      .tabItem { Label("Messages", systemImage: "envelope") }

      NavigationStack {
        ProfileView()
      }
      .tabItem { Label("Profil", systemImage: "person.crop.circle") }
    }
  }
}

struct TeacherHomeView: View {
  @Environment(AuthStore.self) private var auth
  @State private var assignments: [AssignmentDetail] = []
  @State private var todaySlots: [SlotDisplay] = []

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        VStack(alignment: .leading, spacing: 6) {
          Text("Bonjour \(auth.profile?.firstName ?? "")")
            .font(.title2.bold())
          Text(auth.currentSchool?.name ?? "Enseignant")
            .foregroundStyle(Brand.muted)
        }
        .edufasoCard()

        VStack(alignment: .leading, spacing: 10) {
          Text("Aujourd’hui").font(.headline)
          if todaySlots.isEmpty {
            Text("Aucun cours prévu aujourd’hui.")
              .foregroundStyle(Brand.muted)
          } else {
            ForEach(todaySlots) { slot in
              VStack(alignment: .leading, spacing: 4) {
                Text("\(slot.startTime) – \(slot.endTime) · \(slot.subjectName)")
                  .font(.subheadline.weight(.semibold))
                if let className = slot.className {
                  Text(className).font(.caption).foregroundStyle(Brand.muted)
                }
              }
            }
          }
        }
        .edufasoCard()

        VStack(alignment: .leading, spacing: 10) {
          Text("Mes classes").font(.headline)
          if assignments.isEmpty {
            Text("Aucune affectation.")
              .foregroundStyle(Brand.muted)
          } else {
            ForEach(assignments.prefix(6)) { item in
              NavigationLink {
                TeacherRollCallView(assignment: item)
              } label: {
                HStack {
                  VStack(alignment: .leading) {
                    Text(item.className).font(.headline)
                    Text(item.subjectName).font(.caption).foregroundStyle(Brand.muted)
                  }
                  Spacer()
                  Text("Appel")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.teal)
                }
              }
            }
          }
        }
        .edufasoCard()
      }
      .padding()
    }
    .background(Brand.background.ignoresSafeArea())
    .navigationTitle(Brand.name)
    .task { await load() }
    .refreshable { await load() }
  }

  private func load() async {
    guard let teacherId = auth.userId else { return }
    do {
      assignments = try await SchoolDataService.teacherAssignments(teacherId: teacherId)
      let slots = try await SchoolDataService.teacherTimetable(teacherId: teacherId)
      todaySlots = slots.filter { $0.dayOfWeek == WeekdayLabel.todayISO }
    } catch {
      // Dedicated tabs surface errors.
    }
  }
}

struct TeacherClassesView: View {
  @Environment(AuthStore.self) private var auth
  @State private var assignments: [AssignmentDetail] = []
  @State private var loading = true
  @State private var error: String?

  var body: some View {
    Group {
      if loading {
        ProgressView("Chargement…")
      } else if let error {
        ContentUnavailableView("Classes", systemImage: "exclamationmark.triangle", description: Text(error))
      } else if assignments.isEmpty {
        ContentUnavailableView("Aucune classe", systemImage: "rectangle.stack", description: Text("Vos affectations apparaîtront ici."))
      } else {
        List(assignments) { item in
          NavigationLink {
            TeacherRollCallView(assignment: item)
          } label: {
            VStack(alignment: .leading, spacing: 4) {
              Text(item.className).font(.headline)
              Text(item.subjectName).foregroundStyle(Brand.muted)
            }
          }
        }
      }
    }
    .navigationTitle("Mes classes")
    .task { await load() }
    .refreshable { await load() }
  }

  private func load() async {
    guard let teacherId = auth.userId else { return }
    loading = assignments.isEmpty
    error = nil
    do {
      assignments = try await SchoolDataService.teacherAssignments(teacherId: teacherId)
    } catch {
      self.error = error.localizedDescription
    }
    loading = false
  }
}

struct TeacherRollCallView: View {
  @Environment(AuthStore.self) private var auth
  let assignment: AssignmentDetail

  @State private var students: [Profile] = []
  @State private var statuses: [String: AttendanceStatus] = [:]
  @State private var loading = true
  @State private var saving = false
  @State private var message: String?
  @State private var error: String?

  private var today: String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: Date())
  }

  var body: some View {
    Group {
      if loading {
        ProgressView("Chargement des élèves…")
      } else if let error {
        ContentUnavailableView("Appel", systemImage: "exclamationmark.triangle", description: Text(error))
      } else if students.isEmpty {
        ContentUnavailableView("Aucun élève", systemImage: "person.3")
      } else {
        List {
          Section("\(assignment.className) · \(assignment.subjectName)") {
            Text(today).foregroundStyle(Brand.muted)
          }
          Section("Élèves") {
            ForEach(students) { student in
              HStack {
                Text(student.fullName)
                Spacer()
                Picker(
                  "Statut",
                  selection: Binding(
                    get: { statuses[student.id] ?? .present },
                    set: { statuses[student.id] = $0 }
                  )
                ) {
                  ForEach(AttendanceStatus.allCases) { status in
                    Text(status.title).tag(status)
                  }
                }
                .labelsHidden()
                .pickerStyle(.menu)
              }
            }
          }
          if let message {
            Section { Text(message).foregroundStyle(Brand.fasoGreen) }
          }
        }
      }
    }
    .navigationTitle("Appel")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          Task { await save() }
        } label: {
          if saving {
            ProgressView()
          } else {
            Text("Enregistrer")
          }
        }
        .disabled(saving || students.isEmpty)
      }
    }
    .task { await load() }
  }

  private func load() async {
    loading = true
    error = nil
    do {
      students = try await SchoolDataService.students(in: assignment.classSectionId)
      for student in students where statuses[student.id] == nil {
        statuses[student.id] = .present
      }
    } catch {
      self.error = error.localizedDescription
    }
    loading = false
  }

  private func save() async {
    guard let recorder = auth.userId else { return }
    saving = true
    message = nil
    defer { saving = false }
    do {
      for student in students {
        try await SchoolDataService.upsertAttendance(
          classSectionId: assignment.classSectionId,
          studentId: student.id,
          subjectId: assignment.subjectId,
          date: today,
          status: statuses[student.id] ?? .present,
          recordedBy: recorder
        )
      }
      message = "Présences enregistrées."
    } catch {
      self.error = error.localizedDescription
    }
  }
}
