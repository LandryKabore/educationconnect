import SwiftUI

struct StudentTabView: View {
  @Environment(AuthStore.self) private var auth

  var body: some View {
    TabView {
      NavigationStack {
        StudentHomeView()
      }
      .tabItem { Label("Accueil", systemImage: "house.fill") }

      NavigationStack {
        if let id = auth.userId {
          StudentNotesView(studentId: id)
        }
      }
      .tabItem { Label("Notes", systemImage: "list.number") }

      NavigationStack {
        if let id = auth.userId {
          StudentAttendanceView(studentId: id)
        }
      }
      .tabItem { Label("Présences", systemImage: "checkmark.circle") }

      NavigationStack {
        StudentTimetableHost()
      }
      .tabItem { Label("Emploi du temps", systemImage: "calendar") }

      NavigationStack {
        ProfileView()
      }
      .tabItem { Label("Profil", systemImage: "person.crop.circle") }
    }
  }
}

struct StudentHomeView: View {
  @Environment(AuthStore.self) private var auth
  @State private var className: String?
  @State private var todaySlots: [SlotDisplay] = []
  @State private var recentGrades: [GradeDisplay] = []
  @State private var unread = 0

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        VStack(alignment: .leading, spacing: 6) {
          Text("Bonjour \(auth.profile?.firstName.isEmpty == false ? auth.profile!.firstName : "")")
            .font(.title2.bold())
          if let className {
            Text(className)
              .foregroundStyle(Brand.muted)
          }
          if let school = auth.currentSchool {
            Text(school.name)
              .font(.caption)
              .foregroundStyle(Brand.muted)
          }
        }
        .edufasoCard()

        VStack(alignment: .leading, spacing: 10) {
          Text("Aujourd’hui").font(.headline)
          if todaySlots.isEmpty {
            Text("Pas de cours prévu aujourd’hui.")
              .foregroundStyle(Brand.muted)
          } else {
            ForEach(todaySlots) { slot in
              HStack {
                Text("\(slot.startTime)")
                  .font(.subheadline.monospacedDigit().weight(.semibold))
                  .foregroundStyle(Brand.teal)
                  .frame(width: 48, alignment: .leading)
                VStack(alignment: .leading) {
                  Text(slot.subjectName)
                  if let room = slot.room, !room.isEmpty {
                    Text(room).font(.caption).foregroundStyle(Brand.muted)
                  }
                }
              }
            }
          }
        }
        .edufasoCard()

        VStack(alignment: .leading, spacing: 10) {
          Text("Dernières notes").font(.headline)
          if recentGrades.isEmpty {
            Text("Aucune note récente.")
              .foregroundStyle(Brand.muted)
          } else {
            ForEach(recentGrades.prefix(5)) { grade in
              HStack {
                Text(grade.subjectName)
                Spacer()
                if grade.isAbsent {
                  Text("Abs").foregroundStyle(Brand.fasoRed)
                } else if let score = grade.score {
                  Text(String(format: "%.1f", score))
                    .foregroundStyle(Brand.teal)
                    .fontWeight(.semibold)
                }
              }
            }
          }
        }
        .edufasoCard()

        NavigationLink {
          MessagesView()
        } label: {
          HStack {
            Label("Messages", systemImage: "envelope")
            Spacer()
            if unread > 0 {
              Text("\(unread)")
                .font(.caption.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Brand.teal)
                .foregroundStyle(.white)
                .clipShape(Capsule())
            }
            Image(systemName: "chevron.right")
              .foregroundStyle(Brand.muted)
          }
          .edufasoCard()
        }
        .buttonStyle(.plain)
      }
      .padding()
    }
    .background(Brand.background.ignoresSafeArea())
    .navigationTitle(Brand.name)
    .task { await load() }
    .refreshable { await load() }
  }

  private func load() async {
    guard let userId = auth.userId else { return }
    do {
      if let enrollment = try await SchoolDataService.enrollment(for: userId) {
        if let section = try await SchoolDataService.classSection(id: enrollment.classSectionId) {
          className = section.name
        }
        let slots = try await SchoolDataService.timetable(classSectionId: enrollment.classSectionId)
        todaySlots = slots.filter { $0.dayOfWeek == WeekdayLabel.todayISO }
      }
      recentGrades = try await SchoolDataService.grades(for: userId)
      let inbox = try await SchoolDataService.inbox(for: userId)
      unread = inbox.filter { $0.readAt == nil }.count
    } catch {
      // Keep partial UI; errors show on dedicated tabs.
    }
  }
}

private struct StudentTimetableHost: View {
  @Environment(AuthStore.self) private var auth
  @State private var classSectionId: String?

  var body: some View {
    Group {
      if let classSectionId {
        TimetableView(title: "Emploi du temps") {
          try await SchoolDataService.timetable(classSectionId: classSectionId)
        }
      } else {
        ProgressView("Chargement…")
      }
    }
    .task {
      guard let userId = auth.userId else { return }
      classSectionId = try? await SchoolDataService.enrollment(for: userId)?.classSectionId
    }
  }
}
