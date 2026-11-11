import SwiftUI

struct StudentNotesView: View {
  let studentId: String
  @State private var grades: [GradeDisplay] = []
  @State private var loading = true
  @State private var error: String?

  var body: some View {
    Group {
      if loading {
        ProgressView("Chargement des notes…")
      } else if let error {
        ContentUnavailableView("Notes", systemImage: "exclamationmark.triangle", description: Text(error))
      } else if grades.isEmpty {
        ContentUnavailableView("Aucune note", systemImage: "list.bullet.clipboard", description: Text("Les notes apparaîtront ici."))
      } else {
        List(grades) { grade in
          HStack {
            VStack(alignment: .leading, spacing: 4) {
              Text(grade.subjectName).font(.headline)
              if let period = grade.periodLabel {
                Text(period).font(.caption).foregroundStyle(Brand.muted)
              }
              if let comment = grade.comment, !comment.isEmpty {
                Text(comment).font(.caption).foregroundStyle(Brand.muted)
              }
            }
            Spacer()
            if grade.isAbsent {
              Text("Abs")
                .font(.headline)
                .foregroundStyle(Brand.fasoRed)
            } else if let score = grade.score {
              Text(scoreText(score: score, max: grade.maxScore))
                .font(.headline.monospacedDigit())
                .foregroundStyle(Brand.teal)
            }
          }
        }
      }
    }
    .navigationTitle("Notes")
    .task { await load() }
    .refreshable { await load() }
  }

  private func scoreText(score: Double, max: Double?) -> String {
    if let max, max > 0 {
      return String(format: "%.1f / %.0f", score, max)
    }
    return String(format: "%.1f", score)
  }

  private func load() async {
    loading = grades.isEmpty
    error = nil
    do {
      grades = try await SchoolDataService.grades(for: studentId)
    } catch {
      self.error = error.localizedDescription
    }
    loading = false
  }
}

struct StudentAttendanceView: View {
  let studentId: String
  @State private var rows: [AttendanceDisplay] = []
  @State private var loading = true
  @State private var error: String?

  var body: some View {
    Group {
      if loading {
        ProgressView("Chargement…")
      } else if let error {
        ContentUnavailableView("Présences", systemImage: "exclamationmark.triangle", description: Text(error))
      } else if rows.isEmpty {
        ContentUnavailableView("Aucune présence", systemImage: "person.crop.circle.badge.checkmark", description: Text("Les appels apparaîtront ici."))
      } else {
        List(rows) { row in
          HStack {
            VStack(alignment: .leading, spacing: 4) {
              Text(row.subjectName).font(.headline)
              Text(row.date).font(.caption).foregroundStyle(Brand.muted)
              if let note = row.note, !note.isEmpty {
                Text(note).font(.caption).foregroundStyle(Brand.muted)
              }
            }
            Spacer()
            Text(row.status.title)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(color(for: row.status))
          }
        }
      }
    }
    .navigationTitle("Présences")
    .task { await load() }
    .refreshable { await load() }
  }

  private func color(for status: AttendanceStatus) -> Color {
    switch status {
    case .present: return Brand.fasoGreen
    case .absent: return Brand.fasoRed
    case .late: return Brand.fasoYellow
    case .excused: return Brand.navy
    }
  }

  private func load() async {
    loading = rows.isEmpty
    error = nil
    do {
      rows = try await SchoolDataService.attendance(for: studentId)
    } catch {
      self.error = error.localizedDescription
    }
    loading = false
  }
}

struct TimetableView: View {
  let title: String
  let loader: () async throws -> [SlotDisplay]
  @State private var slots: [SlotDisplay] = []
  @State private var loading = true
  @State private var error: String?
  @State private var filterToday = true

  var body: some View {
    Group {
      if loading {
        ProgressView("Chargement de l’emploi du temps…")
      } else if let error {
        ContentUnavailableView(title, systemImage: "exclamationmark.triangle", description: Text(error))
      } else if visibleSlots.isEmpty {
        ContentUnavailableView("Aucun cours", systemImage: "calendar", description: Text("Aucun créneau pour ce filtre."))
      } else {
        List {
          ForEach(groupedKeys, id: \.self) { day in
            Section(WeekdayLabel.name(for: day)) {
              ForEach(visibleSlots.filter { $0.dayOfWeek == day }) { slot in
                VStack(alignment: .leading, spacing: 4) {
                  Text(slot.subjectName).font(.headline)
                  Text("\(slot.startTime) – \(slot.endTime)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(Brand.teal)
                  HStack(spacing: 8) {
                    if let className = slot.className {
                      Text(className)
                    }
                    if let room = slot.room, !room.isEmpty {
                      Text("· \(room)")
                    }
                  }
                  .font(.caption)
                  .foregroundStyle(Brand.muted)
                }
                .padding(.vertical, 2)
              }
            }
          }
        }
      }
    }
    .navigationTitle(title)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Picker("Filtre", selection: $filterToday) {
          Text("Aujourd’hui").tag(true)
          Text("Semaine").tag(false)
        }
        .pickerStyle(.segmented)
        .frame(width: 180)
      }
    }
    .task { await load() }
    .refreshable { await load() }
  }

  private var visibleSlots: [SlotDisplay] {
    filterToday ? slots.filter { $0.dayOfWeek == WeekdayLabel.todayISO } : slots
  }

  private var groupedKeys: [Int] {
    Array(Set(visibleSlots.map(\.dayOfWeek))).sorted()
  }

  private func load() async {
    loading = slots.isEmpty
    error = nil
    do {
      slots = try await loader()
    } catch {
      self.error = error.localizedDescription
    }
    loading = false
  }
}
