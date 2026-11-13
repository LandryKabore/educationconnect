import SwiftUI

struct ParentTabView: View {
  @Environment(AuthStore.self) private var auth
  @State private var children: [Profile] = []
  @State private var selectedChildId: String?
  @State private var loading = true
  @State private var error: String?

  var selectedChild: Profile? {
    children.first(where: { $0.id == selectedChildId }) ?? children.first
  }

  var body: some View {
    TabView {
      NavigationStack {
        ParentHomeView(
          children: children,
          selectedChildId: $selectedChildId,
          loading: loading,
          error: error,
          reload: { await loadChildren() }
        )
      }
      .tabItem { Label("Accueil", systemImage: "house.fill") }

      NavigationStack {
        if let child = selectedChild {
          StudentNotesView(studentId: child.id)
            .navigationTitle("Notes · \(child.firstName)")
        } else {
          ContentUnavailableView("Choisissez un enfant", systemImage: "person.2")
        }
      }
      .tabItem { Label("Notes", systemImage: "list.number") }

      NavigationStack {
        if let child = selectedChild {
          StudentAttendanceView(studentId: child.id)
            .navigationTitle("Présences · \(child.firstName)")
        } else {
          ContentUnavailableView("Choisissez un enfant", systemImage: "person.2")
        }
      }
      .tabItem { Label("Présences", systemImage: "checkmark.circle") }

      NavigationStack {
        if let child = selectedChild {
          ParentTimetableHost(studentId: child.id, title: "EDT · \(child.firstName)")
        } else {
          ContentUnavailableView("Choisissez un enfant", systemImage: "person.2")
        }
      }
      .tabItem { Label("Emploi du temps", systemImage: "calendar") }

      NavigationStack {
        ProfileView()
      }
      .tabItem { Label("Profil", systemImage: "person.crop.circle") }
    }
    .task { await loadChildren() }
  }

  private func loadChildren() async {
    guard let parentId = auth.userId else { return }
    loading = children.isEmpty
    error = nil
    do {
      children = try await SchoolDataService.children(for: parentId)
      if selectedChildId == nil {
        selectedChildId = children.first?.id
      }
    } catch {
      self.error = error.localizedDescription
    }
    loading = false
  }
}

struct ParentHomeView: View {
  let children: [Profile]
  @Binding var selectedChildId: String?
  let loading: Bool
  let error: String?
  let reload: () async -> Void

  @Environment(AuthStore.self) private var auth
  @State private var className: String?
  @State private var todaySlots: [SlotDisplay] = []

  var selectedChild: Profile? {
    children.first(where: { $0.id == selectedChildId }) ?? children.first
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        VStack(alignment: .leading, spacing: 8) {
          Text("Bonjour \(auth.profile?.firstName ?? "")")
            .font(.title2.bold())
          Text(auth.currentSchool?.name ?? Brand.tagline)
            .foregroundStyle(Brand.muted)
        }
        .edufasoCard()

        if loading {
          ProgressView("Chargement des enfants…")
            .edufasoCard()
        } else if let error {
          Text(error).foregroundStyle(Brand.fasoRed).edufasoCard()
        } else if children.isEmpty {
          Text("Aucun enfant lié à ce compte.")
            .foregroundStyle(Brand.muted)
            .edufasoCard()
        } else {
          VStack(alignment: .leading, spacing: 10) {
            Text("Enfants").font(.headline)
            ForEach(children) { child in
              Button {
                selectedChildId = child.id
              } label: {
                HStack {
                  VStack(alignment: .leading) {
                    Text(child.fullName).font(.headline)
                    if child.id == selectedChild?.id, let className {
                      Text(className).font(.caption).foregroundStyle(Brand.muted)
                    }
                  }
                  Spacer()
                  if child.id == selectedChildId {
                    Image(systemName: "checkmark.circle.fill")
                      .foregroundStyle(Brand.teal)
                  }
                }
                .padding(12)
                .background(child.id == selectedChildId ? Brand.teal.opacity(0.08) : Brand.background)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
              }
              .buttonStyle(.plain)
            }
          }
          .edufasoCard()

          VStack(alignment: .leading, spacing: 10) {
            Text("Aujourd’hui · \(selectedChild?.firstName ?? "")").font(.headline)
            if todaySlots.isEmpty {
              Text("Pas de cours prévu aujourd’hui.")
                .foregroundStyle(Brand.muted)
            } else {
              ForEach(todaySlots) { slot in
                HStack {
                  Text(slot.startTime)
                    .font(.subheadline.monospacedDigit().weight(.semibold))
                    .foregroundStyle(Brand.teal)
                    .frame(width: 48, alignment: .leading)
                  Text(slot.subjectName)
                }
              }
            }
          }
          .edufasoCard()
        }

        NavigationLink {
          MessagesView()
        } label: {
          Label("Messages", systemImage: "envelope")
            .frame(maxWidth: .infinity, alignment: .leading)
            .edufasoCard()
        }
        .buttonStyle(.plain)
      }
      .padding()
    }
    .background(Brand.background.ignoresSafeArea())
    .navigationTitle(Brand.name)
    .task(id: selectedChildId) { await loadChildContext() }
    .refreshable {
      await reload()
      await loadChildContext()
    }
  }

  private func loadChildContext() async {
    guard let child = selectedChild else { return }
    do {
      if let enrollment = try await SchoolDataService.enrollment(for: child.id) {
        className = try await SchoolDataService.classSection(id: enrollment.classSectionId)?.name
        let slots = try await SchoolDataService.timetable(classSectionId: enrollment.classSectionId)
        todaySlots = slots.filter { $0.dayOfWeek == WeekdayLabel.todayISO }
      } else {
        className = nil
        todaySlots = []
      }
    } catch {
      // Partial home is fine.
    }
  }
}

private struct ParentTimetableHost: View {
  let studentId: String
  let title: String
  @State private var classSectionId: String?

  var body: some View {
    Group {
      if let classSectionId {
        TimetableView(title: title) {
          try await SchoolDataService.timetable(classSectionId: classSectionId)
        }
      } else {
        ProgressView("Chargement…")
      }
    }
    .task {
      classSectionId = try? await SchoolDataService.enrollment(for: studentId)?.classSectionId
    }
  }
}
