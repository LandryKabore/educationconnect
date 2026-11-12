import SwiftUI

struct MessagesView: View {
    var announcementsOnly = false
    @EnvironmentObject private var auth: AuthViewModel
    @State private var rows: [MessageRow] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else if rows.isEmpty {
                    ContentUnavailableView(
                        announcementsOnly ? "Aucune annonce" : "Boîte de réception vide",
                        systemImage: announcementsOnly ? "megaphone" : "envelope.open",
                        description: Text(announcementsOnly
                            ? "Les annonces de votre école apparaîtront ici."
                            : "Vos messages reçus apparaîtront ici.")
                    )
                } else {
                    List(rows) { msg in
                        NavigationLink {
                            MessageDetailView(message: msg) {
                                Task { await markRead(msg) }
                            }
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: announcementsOnly || msg.isAnnouncement == true ? "megaphone.fill" : "envelope.fill")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(msg.readAt == nil ? .white : EduTheme.navy)
                                    .frame(width: 40, height: 40)
                                    .background(
                                        (msg.readAt == nil ? EduTheme.navy : EduTheme.brand50),
                                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    )

                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(msg.subject?.isEmpty == false ? msg.subject! : "(Sans objet)")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(EduTheme.ink)
                                            .lineLimit(1)
                                        Spacer(minLength: 4)
                                        if msg.readAt == nil {
                                            Circle().fill(EduTheme.teal).frame(width: 8, height: 8)
                                        }
                                    }
                                    Text(msg.sender?.fullName.isEmpty == false ? msg.sender!.fullName : "Annonce")
                                        .font(.caption)
                                        .foregroundStyle(EduTheme.muted)
                                    Text(msg.body ?? "")
                                        .font(.footnote)
                                        .lineLimit(2)
                                        .foregroundStyle(EduTheme.ink.opacity(0.75))
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .listRowBackground(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(.white)
                                .padding(.vertical, 3)
                        )
                    }
                    .listStyle(.plain)
                    .listRowSeparator(.hidden)
                }
            }
        }
        .premiumTitle(announcementsOnly ? "Annonces" : "Messages")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let uid = auth.userId else { return }
        loading = rows.isEmpty
        error = nil
        do {
            rows = try await EduAPI().fetchInbox(userId: uid, announcementsOnly: announcementsOnly)
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func markRead(_ msg: MessageRow) async {
        guard msg.readAt == nil else { return }
        do {
            try await EduAPI().markMessageRead(id: msg.id)
            await load()
        } catch {}
    }
}

struct MessageDetailView: View {
    let message: MessageRow
    var onAppearAction: () -> Void

    var body: some View {
        PremiumScreenChrome {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(message.subject ?? "(Sans objet)")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(EduTheme.ink)
                    Text(message.sender?.fullName ?? "Expéditeur")
                        .font(.subheadline)
                        .foregroundStyle(EduTheme.muted)
                    if let created = message.createdAt {
                        Text(created)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                    Divider()
                    Text(message.body ?? "")
                        .font(.body)
                        .foregroundStyle(EduTheme.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.white)
                        .shadow(color: .black.opacity(0.05), radius: 10, y: 3)
                )
                .padding(16)
            }
        }
        .premiumTitle("Message")
        .onAppear(perform: onAppearAction)
    }
}
