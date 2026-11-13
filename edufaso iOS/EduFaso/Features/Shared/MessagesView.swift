import SwiftUI

struct MessagesView: View {
  @Environment(AuthStore.self) private var auth
  @State private var messages: [MessageRow] = []
  @State private var loading = true
  @State private var error: String?

  var body: some View {
    Group {
      if loading {
        ProgressView("Chargement…")
      } else if let error {
        ContentUnavailableView("Messages", systemImage: "exclamationmark.bubble", description: Text(error))
      } else if messages.isEmpty {
        ContentUnavailableView("Aucun message", systemImage: "tray", description: Text("Votre boîte de réception est vide."))
      } else {
        List(messages) { message in
          VStack(alignment: .leading, spacing: 6) {
            HStack {
              Text(message.subject?.isEmpty == false ? message.subject! : "Sans objet")
                .font(.headline)
              Spacer()
              if message.readAt == nil {
                Circle()
                  .fill(Brand.teal)
                  .frame(width: 8, height: 8)
              }
            }
            if let body = message.body, !body.isEmpty {
              Text(body)
                .font(.subheadline)
                .foregroundStyle(Brand.muted)
                .lineLimit(3)
            }
            if let created = message.createdAt {
              Text(created.prefix(16))
                .font(.caption)
                .foregroundStyle(Brand.muted)
            }
          }
          .padding(.vertical, 4)
        }
      }
    }
    .navigationTitle("Messages")
    .task { await load() }
    .refreshable { await load() }
  }

  private func load() async {
    guard let userId = auth.userId else { return }
    loading = messages.isEmpty
    error = nil
    do {
      messages = try await SchoolDataService.inbox(for: userId)
    } catch {
      self.error = error.localizedDescription
    }
    loading = false
  }
}
