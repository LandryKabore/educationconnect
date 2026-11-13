import SwiftUI

struct MessagesView: View {
    var announcementsOnly = false
    @EnvironmentObject private var auth: AuthViewModel

    @State private var inbox: [MessageRow] = []
    @State private var sent: [MessageRow] = []
    @State private var search = ""
    @State private var unreadOnly = false
    @State private var loading = true
    @State private var error: String?
    @State private var showCompose = false

    private var canCompose: Bool {
        !announcementsOnly || canAnnounce
    }

    private var canAnnounce: Bool {
        switch auth.primaryRole {
        case .schoolAdmin, .teacher, .superAdmin: return true
        default: return false
        }
    }

    private var title: String {
        announcementsOnly ? "Annonces" : "Messages"
    }

    private var query: String {
        search.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var conversations: [MessageConversation] {
        MessageConversationBuilder.build(inbox: inbox, sent: sent, userId: auth.userId)
    }

    private var unreadConversations: Int {
        conversations.filter { $0.unreadCount > 0 }.count
    }

    private var totalUnreadMessages: Int {
        conversations.reduce(0) { $0 + $1.unreadCount }
    }

    private var filteredConversations: [MessageConversation] {
        conversations.filter { convo in
            if unreadOnly && convo.unreadCount == 0 { return false }
            guard !query.isEmpty else { return true }
            return convo.otherName.localizedCaseInsensitiveContains(query)
                || convo.lastMessage.body.localizedCaseInsensitiveContains(query)
                || (convo.lastMessage.subject?.localizedCaseInsensitiveContains(query) ?? false)
        }
    }

    private var announcementRows: [MessageRow] {
        inbox.filter { $0.isAnnouncement == true }
    }

    private var unreadAnnouncements: Int {
        announcementRows.filter { $0.readAt == nil }.count
    }

    private var filteredAnnouncements: [MessageRow] {
        announcementRows.filter { row in
            if unreadOnly && row.readAt != nil { return false }
            guard !query.isEmpty else { return true }
            return (row.subject?.localizedCaseInsensitiveContains(query) ?? false)
                || (row.body?.localizedCaseInsensitiveContains(query) ?? false)
                || (row.sender?.fullName.localizedCaseInsensitiveContains(query) ?? false)
        }
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading {
                    LoadingBlock()
                } else if let error {
                    errorState(error)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14, pinnedViews: [.sectionHeaders]) {
                            Section {
                                Group {
                                    if announcementsOnly {
                                        announcementsContent
                                    } else {
                                        discussionsContent
                                    }
                                }
                                .padding(.horizontal, 16)
                            } header: {
                                stickyHeader
                            }
                        }
                        .padding(.bottom, 32)
                    }
                    .refreshable { await load() }
                }
            }
        }
        .premiumTitle(title)
        .toolbar {
            if canCompose {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCompose = true
                    } label: {
                        Image(systemName: announcementsOnly ? "megaphone.fill" : "square.and.pencil")
                    }
                    .accessibilityLabel(announcementsOnly ? "Envoyer une annonce" : "Nouveau message")
                }
            }
        }
        .sheet(isPresented: $showCompose) {
            ComposeMessageSheet(
                announcementsOnly: announcementsOnly,
                onSent: {
                    showCompose = false
                    Task { await load() }
                }
            )
            .environmentObject(auth)
        }
        .task { await load() }
    }

    // MARK: - Summary

    private var stickyHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            summaryCard
            searchField
            filterChips
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background {
            EduTheme.loginBackground
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(Color.black.opacity(0.05))
                        .frame(height: 1)
                }
        }
    }

    private var summaryCard: some View {
        let unread = announcementsOnly ? unreadAnnouncements : totalUnreadMessages
        let total = announcementsOnly ? announcementRows.count : conversations.count
        let noun = announcementsOnly ? "annonce" : "discussion"

        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(unread > 0 ? "\(unread) non lu\(unread > 1 ? "s" : "")" : "Tout est lu")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                    .contentTransition(.numericText())
                Text("\(total) \(noun)\(total > 1 ? "s" : "")")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white.opacity(0.8))
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .accessibilityElement(children: .combine)

            Spacer(minLength: 0)

            if canCompose {
                Button {
                    showCompose = true
                } label: {
                    Label(
                        announcementsOnly ? "Nouvelle annonce" : "Nouveau message",
                        systemImage: announcementsOnly ? "megaphone.fill" : "square.and.pencil"
                    )
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .foregroundStyle(EduTheme.navy)
                    .background(.white, in: Capsule())
                    .fixedSize()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(announcementsOnly ? "Envoyer une annonce" : "Nouveau message")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                LinearGradient(
                    colors: announcementsOnly
                        ? [EduTheme.navyDark, EduTheme.navy]
                        : [EduTheme.navyDark, EduTheme.navy, EduTheme.teal],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Circle()
                    .fill(.white.opacity(0.07))
                    .frame(width: 160, height: 160)
                    .offset(x: 130, y: -50)
            }
        }
        .overlay(alignment: .bottom) {
            HStack(spacing: 0) {
                EduTheme.fasoRed
                EduTheme.fasoYellow
                EduTheme.fasoGreen
            }
            .frame(height: 3)
            .accessibilityHidden(true)
        }
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: EduTheme.navy.opacity(0.22), radius: 14, y: 8)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(EduTheme.muted)
                .accessibilityHidden(true)
            TextField(announcementsOnly ? "Rechercher une annonce…" : "Rechercher une discussion…", text: $search)
                .textInputAutocapitalization(.never)
                .disableAutocorrection(true)
            if !search.isEmpty {
                Button {
                    search = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(EduTheme.muted.opacity(0.7))
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel("Effacer la recherche")
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 46)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.black.opacity(0.05), lineWidth: 1)
        )
    }

    private var filterChips: some View {
        let total = announcementsOnly ? announcementRows.count : conversations.count
        let unread = announcementsOnly ? unreadAnnouncements : unreadConversations
        return HStack(spacing: 8) {
            filterChip(title: "Toutes", count: total, selected: !unreadOnly) { unreadOnly = false }
            filterChip(title: "Non lues", count: unread, selected: unreadOnly) { unreadOnly = true }
            Spacer(minLength: 0)
        }
    }

    private func filterChip(title: String, count: Int, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.snappy(duration: 0.2)) { action() }
        } label: {
            HStack(spacing: 6) {
                Text(title)
                Text("\(count)")
                    .font(.caption2.weight(.heavy).monospacedDigit())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(selected ? .white.opacity(0.22) : EduTheme.navy.opacity(0.08))
                    )
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(selected ? .white : EduTheme.ink)
            .padding(.horizontal, 14)
            .frame(minHeight: 38)
            .background(Capsule().fill(selected ? EduTheme.navy : .white))
            .overlay(Capsule().stroke(selected ? .clear : Color.black.opacity(0.07), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: - Discussions (personal)

    @ViewBuilder
    private var discussionsContent: some View {
        if conversations.isEmpty {
            emptyState(
                systemImage: "bubble.left.and.bubble.right",
                title: "Aucune discussion",
                message: "Écrivez à un enseignant, un parent ou l’administration pour démarrer une conversation.",
                actionTitle: canCompose ? "Nouveau message" : nil
            )
        } else if filteredConversations.isEmpty {
            emptyState(
                systemImage: unreadOnly ? "checkmark.circle" : "magnifyingglass",
                title: unreadOnly ? "Tout est lu" : "Aucun résultat",
                message: unreadOnly
                    ? "Vous n’avez aucun message en attente."
                    : "Aucune discussion ne correspond à la recherche.",
                actionTitle: nil
            )
        } else {
            ForEach(filteredConversations) { convo in
                NavigationLink {
                    ConversationChatView(
                        otherId: convo.otherId,
                        otherName: convo.otherName,
                        seedInbox: inbox,
                        seedSent: sent,
                        onChanged: { Task { await load() } }
                    )
                } label: {
                    discussionRow(convo)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func discussionRow(_ convo: MessageConversation) -> some View {
        let unread = convo.unreadCount > 0
        let last = convo.lastMessage
        let mine = last.direction == .out

        return HStack(alignment: .center, spacing: 12) {
            ContactAvatar(name: convo.otherName, size: 52)
                .overlay(alignment: .topTrailing) {
                    if unread {
                        Circle()
                            .fill(EduTheme.fasoRed)
                            .frame(width: 14, height: 14)
                            .overlay(Circle().stroke(.white, lineWidth: 2.5))
                            .offset(x: 2, y: -2)
                    }
                }

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(convo.otherName.isEmpty ? "Contact" : convo.otherName)
                        .font(.body.weight(unread ? .bold : .semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if let created = last.createdAt {
                        Text(MessageDateFormatting.listTime(created))
                            .font(.caption.weight(unread ? .bold : .medium))
                            .foregroundStyle(unread ? EduTheme.teal : EduTheme.muted)
                    }
                }

                HStack(alignment: .top, spacing: 6) {
                    if mine {
                        Image(systemName: last.readAt == nil ? "checkmark" : "checkmark.circle.fill")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(last.readAt == nil ? EduTheme.muted : EduTheme.teal)
                            .padding(.top, 2)
                            .accessibilityHidden(true)
                    }
                    Text(mine ? "Vous : \(last.preview)" : last.preview)
                        .font(.subheadline)
                        .foregroundStyle(unread ? EduTheme.ink.opacity(0.85) : EduTheme.muted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                    if unread {
                        Text("\(convo.unreadCount)")
                            .font(.caption2.weight(.heavy).monospacedDigit())
                            .foregroundStyle(.white)
                            .frame(minWidth: 22, minHeight: 22)
                            .padding(.horizontal, convo.unreadCount > 9 ? 4 : 0)
                            .background(EduTheme.teal, in: Capsule())
                    }
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(unread ? EduTheme.brand50 : .white)
                .shadow(color: .black.opacity(0.045), radius: 10, y: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(unread ? EduTheme.teal.opacity(0.25) : Color.black.opacity(0.04), lineWidth: 1)
        )
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(convo.otherName), \(mine ? "vous : " : "")\(last.preview)"
                + (unread ? ", \(convo.unreadCount) non lu\(convo.unreadCount > 1 ? "s" : "")" : "")
        )
    }

    // MARK: - Announcements

    @ViewBuilder
    private var announcementsContent: some View {
        if announcementRows.isEmpty {
            emptyState(
                systemImage: "megaphone",
                title: "Aucune annonce",
                message: "Les annonces de votre école apparaîtront ici.",
                actionTitle: canCompose ? "Publier une annonce" : nil
            )
        } else if filteredAnnouncements.isEmpty {
            emptyState(
                systemImage: unreadOnly ? "checkmark.circle" : "magnifyingglass",
                title: unreadOnly ? "Tout est lu" : "Aucun résultat",
                message: unreadOnly
                    ? "Vous avez lu toutes les annonces."
                    : "Rien à afficher avec cette recherche.",
                actionTitle: nil
            )
        } else {
            ForEach(filteredAnnouncements) { msg in
                NavigationLink {
                    MessageDetailView(message: msg, announcementsOnly: true) {
                        Task { await markAnnouncementRead(msg) }
                    }
                } label: {
                    announcementCard(msg)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func announcementCard(_ msg: MessageRow) -> some View {
        let unread = msg.readAt == nil
        let sender = msg.sender?.fullName.isEmpty == false ? msg.sender!.fullName : "Établissement"

        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "megaphone.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(unread ? .white : EduTheme.fasoYellow)
                    .frame(width: 38, height: 38)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(unread ? EduTheme.fasoYellow : EduTheme.fasoYellow.opacity(0.14))
                    )
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(sender)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    if let created = msg.createdAt {
                        Text(MessageDateFormatting.listTime(created))
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                }
                Spacer(minLength: 0)
                if unread {
                    Text("Nouveau")
                        .font(.caption2.weight(.heavy))
                        .textCase(.uppercase)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(EduTheme.fasoRed, in: Capsule())
                }
            }

            Text(msg.subject?.isEmpty == false ? msg.subject! : "(Sans objet)")
                .font(.headline)
                .foregroundStyle(EduTheme.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if let body = msg.body, !body.isEmpty {
                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.ink.opacity(0.7))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }

            HStack(spacing: 4) {
                Text("Lire l’annonce")
                Image(systemName: "arrow.right")
            }
            .font(.footnote.weight(.bold))
            .foregroundStyle(EduTheme.teal)
            .accessibilityHidden(true)
        }
        .padding(16)
        .padding(.leading, unread ? 4 : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .leading) {
                Color.white
                if unread {
                    EduTheme.fasoYellow.frame(width: 5)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(unread ? EduTheme.fasoYellow.opacity(0.35) : Color.black.opacity(0.04), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.045), radius: 10, y: 3)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Ouvre l’annonce")
    }

    // MARK: - Shared bits

    private func emptyState(systemImage: String, title: String, message: String, actionTitle: String?) -> some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(EduTheme.teal)
                .frame(width: 68, height: 68)
                .background(EduTheme.brand50, in: Circle())
                .accessibilityHidden(true)
            Text(title)
                .font(.headline)
                .foregroundStyle(EduTheme.ink)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let actionTitle {
                Button {
                    showCompose = true
                } label: {
                    Text(actionTitle)
                        .font(.subheadline.weight(.bold))
                        .padding(.horizontal, 18)
                        .frame(minHeight: 44)
                        .foregroundStyle(.white)
                        .background(EduTheme.teal, in: Capsule())
                }
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 20)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.04), radius: 10, y: 3)
        )
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Color.orange)
                .frame(width: 68, height: 68)
                .background(Color.orange.opacity(0.12), in: Circle())
                .accessibilityHidden(true)
            Text("Impossible de charger les \(announcementsOnly ? "annonces" : "messages")")
                .font(.headline)
                .foregroundStyle(EduTheme.ink)
                .multilineTextAlignment(.center)
            Text(message)
                .font(.footnote)
                .foregroundStyle(EduTheme.muted)
                .multilineTextAlignment(.center)
            Button {
                Task { await load() }
            } label: {
                Text("Réessayer")
                    .font(.subheadline.weight(.bold))
                    .padding(.horizontal, 18)
                    .frame(minHeight: 44)
                    .foregroundStyle(.white)
                    .background(EduTheme.teal, in: Capsule())
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func load() async {
        guard let uid = auth.userId else { return }
        loading = inbox.isEmpty && sent.isEmpty
        error = nil
        do {
            let api = EduAPI()
            if announcementsOnly {
                inbox = try await api.fetchInbox(userId: uid, announcementsOnly: true)
                sent = []
            } else {
                async let inboxTask = api.fetchInbox(userId: uid, announcementsOnly: false)
                async let sentTask = api.fetchSentPersonalMessages(userId: uid)
                inbox = try await inboxTask
                sent = try await sentTask
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func markAnnouncementRead(_ msg: MessageRow) async {
        guard msg.readAt == nil else { return }
        do {
            try await EduAPI().markMessageRead(id: msg.id)
            if let idx = inbox.firstIndex(where: { $0.id == msg.id }) {
                inbox[idx] = inbox[idx].withReadAt(ISO8601DateFormatter().string(from: Date()))
            }
        } catch {}
    }
}

/// Initials on a stable per-person gradient.
private struct ContactAvatar: View {
    let name: String
    var size: CGFloat = 44

    var body: some View {
        let swatch = SubjectPalette.swatch(for: name.isEmpty ? "Contact" : name)
        Text(MessageConversationBuilder.initials(name))
            .font(.system(size: size * 0.36, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(
                LinearGradient(
                    colors: [swatch.border.opacity(0.75), swatch.border],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Circle()
            )
            .accessibilityHidden(true)
    }
}

// MARK: - Conversation chat

struct ConversationChatView: View {
    let otherId: String
    let otherName: String
    var onChanged: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @State private var inbox: [MessageRow] = []
    @State private var sent: [MessageRow] = []
    @State private var draft = ""
    @State private var sending = false
    @State private var sendError: String?
    @State private var marking = false
    @State private var loaded: Bool
    @FocusState private var focused: Bool

    init(
        otherId: String,
        otherName: String,
        seedInbox: [MessageRow] = [],
        seedSent: [MessageRow] = [],
        onChanged: @escaping () -> Void
    ) {
        self.otherId = otherId
        self.otherName = otherName
        self.onChanged = onChanged
        _inbox = State(initialValue: seedInbox)
        _sent = State(initialValue: seedSent)
        _loaded = State(initialValue: !seedInbox.isEmpty || !seedSent.isEmpty)
    }

    private var conversation: MessageConversation? {
        MessageConversationBuilder
            .build(inbox: inbox, sent: sent, userId: auth.userId)
            .first { $0.otherId == otherId }
    }

    private var messages: [ChatBubbleMessage] {
        conversation?.messages ?? []
    }

    private var bubbleTeal: Color {
        Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255) // brand-600
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 4) {
                        if !loaded && messages.isEmpty {
                            loadingBubbles
                        } else if messages.isEmpty {
                            VStack(spacing: 10) {
                                ContactAvatar(name: otherName, size: 72)
                                Text(otherName.isEmpty ? "Conversation" : otherName)
                                    .font(.headline)
                                    .foregroundStyle(EduTheme.ink)
                                Text("Aucun message. Écrivez le premier !")
                                    .font(.subheadline)
                                    .foregroundStyle(EduTheme.muted)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.top, 60)
                        } else {
                            ForEach(Array(messages.enumerated()), id: \.element.id) { index, msg in
                                let previous = index > 0 ? messages[index - 1] : nil
                                if let day = MessageDateFormatting.dayKey(msg.createdAt),
                                   day != MessageDateFormatting.dayKey(previous?.createdAt) {
                                    daySeparator(msg.createdAt ?? day)
                                }
                                bubble(msg, groupedWithPrevious: previous?.direction == msg.direction)
                                    .id(msg.id)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 16)
                }
                .background(Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
                .onChange(of: messages.count) { _, _ in
                    scrollToEnd(proxy)
                }
                .onAppear {
                    scrollToEnd(proxy)
                }
            }

            if let sendError {
                Text(sendError)
                    .font(.caption)
                    .foregroundStyle(EduTheme.fasoRed)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.top, 6)
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField("Écrivez un message…", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                            .overlay(
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .stroke(Color.black.opacity(0.06), lineWidth: 1)
                            )
                    )
                    .focused($focused)

                Button {
                    Task { await send() }
                } label: {
                    Group {
                        if sending {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.body.weight(.semibold))
                        }
                    }
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle().fill(
                            draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending
                                ? EduTheme.muted.opacity(0.45)
                                : bubbleTeal
                        )
                    )
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Envoyer")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white)
            .overlay(alignment: .top) {
                Divider()
            }
        }
        .navigationTitle(otherName.isEmpty ? "Conversation" : otherName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 8) {
                    ContactAvatar(name: otherName, size: 30)
                    Text(otherName.isEmpty ? "Conversation" : otherName)
                        .font(.headline)
                        .lineLimit(1)
                }
            }
        }
        .task {
            await reload()
            await markUnreadRead()
        }
    }

    private var loadingBubbles: some View {
        let widths: [(mine: Bool, width: CGFloat, height: CGFloat)] = [
            (false, 210, 44), (false, 150, 44), (true, 230, 60), (false, 180, 44), (true, 140, 44), (true, 200, 44),
        ]
        return VStack(spacing: 10) {
            Capsule()
                .fill(.white.opacity(0.85))
                .frame(width: 90, height: 22)
                .padding(.vertical, 8)
            ForEach(widths.indices, id: \.self) { i in
                let item = widths[i]
                HStack {
                    if item.mine { Spacer(minLength: 48) }
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(item.mine ? bubbleTeal.opacity(0.25) : .white)
                        .frame(width: item.width, height: item.height)
                    if !item.mine { Spacer(minLength: 48) }
                }
            }
        }
        .phaseAnimator([0.45, 1.0]) { content, phase in
            content.opacity(phase)
        } animation: { _ in
            .easeInOut(duration: 0.8)
        }
        .padding(.top, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Chargement de la conversation")
    }

    private func daySeparator(_ iso: String) -> some View {
        Text(MessageDateFormatting.dayLabel(iso))
            .font(.caption.weight(.bold))
            .foregroundStyle(EduTheme.muted)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(.white.opacity(0.85), in: Capsule())
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .accessibilityAddTraits(.isHeader)
    }

    private func bubble(_ msg: ChatBubbleMessage, groupedWithPrevious: Bool) -> some View {
        let mine = msg.direction == .out
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: !mine && groupedWithPrevious ? 6 : 20,
            bottomLeadingRadius: mine ? 20 : 6,
            bottomTrailingRadius: mine ? 6 : 20,
            topTrailingRadius: mine && groupedWithPrevious ? 6 : 20,
            style: .continuous
        )
        return HStack {
            if mine { Spacer(minLength: 48) }
            VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
                if let subject = msg.subject, !subject.isEmpty {
                    Text(subject)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(EduTheme.muted)
                        .textCase(.uppercase)
                        .lineLimit(1)
                        .padding(.horizontal, 4)
                }

                VStack(alignment: mine ? .trailing : .leading, spacing: 6) {
                    Text(msg.body)
                        .font(.subheadline)
                        .foregroundStyle(mine ? .white : EduTheme.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 4) {
                        if let created = msg.createdAt {
                            Text(MessageDateFormatting.bubbleTime(created))
                                .font(.caption2)
                                .foregroundStyle(mine ? .white.opacity(0.75) : EduTheme.muted)
                        }
                        if mine {
                            Image(systemName: msg.readAt == nil ? "checkmark" : "checkmark.circle.fill")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(msg.readAt == nil ? .white.opacity(0.75) : Color(red: 125 / 255, green: 211 / 255, blue: 252 / 255))
                                .accessibilityLabel(msg.readAt == nil ? "Envoyé" : "Vu")
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background {
                    if mine {
                        shape.fill(
                            LinearGradient(
                                colors: [bubbleTeal, EduTheme.tealDark],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    } else {
                        shape
                            .fill(.white)
                            .shadow(color: .black.opacity(0.05), radius: 4, y: 1)
                    }
                }

                if msg.allowReplies == false {
                    Text("Réponses désactivées pour ce message")
                        .font(.caption2)
                        .italic()
                        .foregroundStyle(EduTheme.muted)
                        .padding(.horizontal, 4)
                }
            }
            if !mine { Spacer(minLength: 48) }
        }
        .padding(.top, groupedWithPrevious ? 0 : 8)
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy) {
        guard let last = messages.last?.id else { return }
        DispatchQueue.main.async {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(last, anchor: .bottom)
            }
        }
    }

    private func reload() async {
        guard let uid = auth.userId else { return }
        do {
            let api = EduAPI()
            async let inboxTask = api.fetchInbox(userId: uid, announcementsOnly: false)
            async let sentTask = api.fetchSentPersonalMessages(userId: uid)
            inbox = try await inboxTask
            sent = try await sentTask
        } catch {
            sendError = error.localizedDescription
        }
        loaded = true
    }

    private func markUnreadRead() async {
        guard let uid = auth.userId, !marking else { return }
        let unreadIds = messages.filter { $0.direction == .inbound && $0.readAt == nil }.map(\.id)
        guard !unreadIds.isEmpty else { return }
        marking = true
        defer { marking = false }
        do {
            try await EduAPI().markMessagesRead(ids: unreadIds, recipientId: uid)
            let stamp = ISO8601DateFormatter().string(from: Date())
            inbox = inbox.map { row in
                unreadIds.contains(row.id) ? row.withReadAt(stamp) : row
            }
            onChanged()
        } catch {}
    }

    private func send() async {
        guard
            let uid = auth.userId,
            let schoolId = auth.schoolId
        else {
            sendError = "Session invalide."
            return
        }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sending = true
        sendError = nil
        do {
            try await EduAPI().sendChatMessage(
                schoolId: schoolId,
                senderId: uid,
                recipientId: otherId,
                body: text
            )
            draft = ""
            focused = false
            await reload()
            onChanged()
        } catch {
            sendError = error.localizedDescription
        }
        sending = false
    }
}

// MARK: - Announcement detail (legacy single-message view)

struct MessageDetailView: View {
    let message: MessageRow
    var announcementsOnly = false
    var onAppearAction: () -> Void

    var body: some View {
        PremiumScreenChrome {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 10) {
                        Image(systemName: "megaphone.fill")
                            .foregroundStyle(EduTheme.fasoYellow)
                            .frame(width: 36, height: 36)
                            .background(
                                EduTheme.fasoYellow.opacity(0.12),
                                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                            )
                        VStack(alignment: .leading, spacing: 2) {
                            Text(message.sender?.fullName.isEmpty == false ? message.sender!.fullName : "Établissement")
                                .font(.subheadline.weight(.semibold))
                            if let created = message.createdAt {
                                Text(MessageDateFormatting.listTime(created))
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)
                            }
                        }
                        Spacer(minLength: 0)
                    }

                    Text(message.subject ?? "(Sans objet)")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(EduTheme.ink)

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
        .premiumTitle("Annonce")
        .onAppear(perform: onAppearAction)
    }
}

// MARK: - Compose

struct ComposeMessageSheet: View {
    var announcementsOnly = false
    var onSent: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var contacts: [MessageContact] = []
    @State private var selectedTo: [MessageContact] = []
    @State private var selectedCc: [MessageContact] = []
    @State private var showCc = false
    @State private var activeField: ActiveField = .to
    @State private var search = ""
    @State private var roleFilter: String? = "teacher"
    @State private var subject = ""
    @State private var bodyText = ""
    @State private var announceRoles: Set<String> = ["student"]
    @State private var noReplies = false
    @State private var loadingContacts = true
    @State private var sending = false
    @State private var error: String?
    @FocusState private var focused: FocusTarget?

    private enum ActiveField { case to, cc }
    private enum FocusTarget: Hashable { case to, cc, subject, body }

    private var canControlReplies: Bool {
        switch auth.primaryRole {
        case .schoolAdmin, .teacher, .superAdmin: return true
        default: return false
        }
    }

    private var isStudent: Bool { auth.primaryRole == .student }

    private var pickingRecipients: Bool {
        // Hide the list once the user moves to Objet / message (same after À or Cc pick).
        if focused == .subject || focused == .body { return false }
        return focused == .to || focused == .cc || !search.isEmpty || selectedTo.isEmpty
    }

    private var announceRoleOptions: [(id: String, label: String)] {
        let present = Set(contacts.map(\.normalizedRole))
        return [
            ("student", "Élèves"),
            ("parent", "Parents"),
            ("teacher", "Professeurs"),
        ].filter { present.contains($0.0) }
    }

    private var announceRecipientIds: [String] {
        contacts.filter { announceRoles.contains($0.normalizedRole) }.map(\.id)
    }

    private var excludedIds: Set<String> {
        Set(selectedTo.map(\.id) + selectedCc.map(\.id))
    }

    private var roleFilterOptions: [(id: String?, label: String)] {
        let present = Set(contacts.map(\.normalizedRole))
        var options: [(id: String?, label: String)] = [(nil, "Tous")]
        if present.contains("teacher") { options.append(("teacher", "Profs")) }
        if present.contains("parent") { options.append(("parent", "Parents")) }
        if present.contains("student") { options.append(("student", "Élèves")) }
        if present.contains("school_admin") { options.append(("school_admin", "Admin")) }
        return options
    }

    private var suggestions: [MessageContact] {
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines)
        var base = contacts.filter { !excludedIds.contains($0.id) }
        if let roleFilter {
            base = base.filter { $0.normalizedRole == roleFilter }
        }
        if !q.isEmpty {
            base = base.filter {
                $0.fullName.localizedCaseInsensitiveContains(q)
                    || ($0.className?.localizedCaseInsensitiveContains(q) ?? false)
                    || $0.roleLabel.localizedCaseInsensitiveContains(q)
            }
        }
        return base.sorted { lhs, rhs in
            let lr = roleRank(lhs.normalizedRole)
            let rr = roleRank(rhs.normalizedRole)
            if lr != rr { return lr < rr }
            return lhs.fullName.localizedCaseInsensitiveCompare(rhs.fullName) == .orderedAscending
        }
    }

    private func roleRank(_ role: String) -> Int {
        switch role {
        case "teacher": return 0
        case "school_admin": return 1
        case "parent": return 2
        case "student": return 3
        default: return 4
        }
    }

    private var canSend: Bool {
        !sending
            && !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (announcementsOnly ? !announceRecipientIds.isEmpty : !selectedTo.isEmpty)
    }

    private var hairline: Color { Color.black.opacity(0.07) }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 14) {
                        if announcementsOnly {
                            announceHeader
                        } else {
                            recipientsCard
                            if pickingRecipients {
                                contactPicker
                            }
                        }

                        messageCard

                        if canControlReplies {
                            repliesRow
                        }

                        if let error {
                            errorBanner(error)
                        }

                        sendFooter
                            .id("send")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }
                .background(EduTheme.loginBackground.ignoresSafeArea())
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: focused) { _, new in
                    if new == .subject || new == .body {
                        withAnimation {
                            proxy.scrollTo(new == .body ? "body" : "subject", anchor: .center)
                        }
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(EduTheme.ink)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(.white))
                    }
                    .accessibilityLabel("Fermer")
                }
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        Image(systemName: announcementsOnly ? "megaphone.fill" : "square.and.pencil")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(announcementsOnly ? EduTheme.fasoYellow : EduTheme.teal)
                            .accessibilityHidden(true)
                        Text(announcementsOnly ? "Nouvelle annonce" : "Nouveau message")
                            .font(.headline)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await send() }
                    } label: {
                        if sending {
                            ProgressView()
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(canSend ? .white : EduTheme.muted.opacity(0.45))
                                .frame(width: 34, height: 34)
                                .background(Circle().fill(canSend ? EduTheme.teal : .white))
                        }
                    }
                    .disabled(!canSend)
                    .accessibilityLabel("Envoyer")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    if !announcementsOnly, pickingRecipients, !selectedTo.isEmpty {
                        Button("Écrire le message") {
                            search = ""
                            focused = .body
                        }
                        .fontWeight(.semibold)
                    } else if !announcementsOnly, !isStudent, !showCc, !selectedTo.isEmpty {
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showCc = true
                                activeField = .cc
                                focused = .cc
                            }
                        } label: {
                            Label("Ajouter en Cc", systemImage: "person.badge.plus")
                        }
                        .fontWeight(.semibold)
                    }
                    Spacer()
                    Button("Envoyer") {
                        Task { await send() }
                    }
                    .fontWeight(.bold)
                    .disabled(!canSend)
                    .foregroundStyle(canSend ? EduTheme.teal : EduTheme.muted)
                }
            }
            .task {
                await loadContacts()
                if !announcementsOnly {
                    activeField = .to
                    focused = .to
                    let hasTeachers = contacts.contains { $0.normalizedRole == "teacher" }
                    roleFilter = hasTeachers ? "teacher" : nil
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var sendFooter: some View {
        VStack(spacing: 10) {
            if let hint = sendHint {
                Label(hint, systemImage: "info.circle")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(EduTheme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                Task { await send() }
            } label: {
                HStack(spacing: 8) {
                    if sending {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "paperplane.fill")
                    }
                    Text(sending ? "Envoi…" : (announcementsOnly ? "Publier l’annonce" : "Envoyer"))
                }
                .font(.body.weight(.bold))
                .frame(maxWidth: .infinity, minHeight: 54)
                .foregroundStyle(.white)
                .background(
                    LinearGradient(
                        colors: canSend ? [EduTheme.teal, EduTheme.tealDark] : [EduTheme.muted.opacity(0.35), EduTheme.muted.opacity(0.35)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
                .shadow(color: canSend ? EduTheme.teal.opacity(0.3) : .clear, radius: 10, y: 5)
            }
            .disabled(!canSend)
            .accessibilityLabel(announcementsOnly ? "Publier l’annonce" : "Envoyer le message")
        }
        .padding(.top, 4)
        .padding(.bottom, 28)
    }

    private var sendHint: String? {
        if !announcementsOnly, selectedTo.isEmpty {
            return "Ajoutez au moins un destinataire, puis rédigez le message."
        }
        if announcementsOnly, announceRecipientIds.isEmpty {
            return "Choisissez au moins un groupe de destinataires."
        }
        if bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Rédigez votre message, puis appuyez sur Envoyer."
        }
        return nil
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Color.orange)
                .accessibilityHidden(true)
            Text(message)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(EduTheme.ink)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.orange.opacity(0.35), lineWidth: 1)
        )
    }

    private func sectionLabel(_ title: String, systemImage: String, trailing: String? = nil) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(EduTheme.teal)
                .accessibilityHidden(true)
            Text(title)
                .font(.caption.weight(.heavy))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(EduTheme.muted)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            if let trailing {
                Text(trailing)
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.muted)
            }
        }
    }

    private func fieldTag(_ text: String) -> some View {
        Text(text)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(EduTheme.navy)
            .frame(width: 38, height: 32)
            .background(EduTheme.navy.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityHidden(true)
    }

    // MARK: Rows

    private var recipientsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            toRow
            if showCc && !isStudent {
                Rectangle()
                    .fill(hairline)
                    .frame(height: 1)
                    .padding(.leading, 64)
                ccRow
            }
        }
        .composeCard()
    }

    private var toRow: some View {
        HStack(alignment: .top, spacing: 12) {
            fieldTag("À")
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 8) {
                if !selectedTo.isEmpty {
                    chipWrap(selectedTo) { contact in
                        selectedTo.removeAll { $0.id == contact.id }
                    }
                }
                TextField(selectedTo.isEmpty ? "Rechercher un nom…" : "Ajouter…", text: $search)
                    .font(.body)
                    .frame(minHeight: 40)
                    .focused($focused, equals: .to)
                    .textInputAutocapitalization(.words)
                    .disableAutocorrection(true)
                    .accessibilityLabel("Destinataire")
                    .onChange(of: focused) { _, new in
                        if new == .to { activeField = .to }
                    }
                    .onChange(of: search) { _, _ in
                        if focused == .to { activeField = .to }
                    }
            }

            if !isStudent {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showCc.toggle()
                        if showCc {
                            activeField = .cc
                            focused = .cc
                        } else {
                            // Closing Cc must route picks back to À — otherwise they keep landing in Cc.
                            activeField = .to
                            focused = .to
                        }
                    }
                } label: {
                    Label("Cc", systemImage: showCc ? "minus" : "plus")
                        .labelStyle(.titleAndIcon)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(showCc ? .white : EduTheme.navy)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 32)
                        .background(Capsule().fill(showCc ? EduTheme.navy : EduTheme.navy.opacity(0.08)))
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(showCc ? "Masquer Cc" : "Afficher Cc")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture { focused = .to; activeField = .to }
    }

    private var ccRow: some View {
        HStack(alignment: .top, spacing: 12) {
            fieldTag("Cc")
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 8) {
                if !selectedCc.isEmpty {
                    chipWrap(selectedCc) { contact in
                        selectedCc.removeAll { $0.id == contact.id }
                    }
                }
                TextField("Ajouter en copie…", text: $search)
                    .frame(minHeight: 40)
                    .focused($focused, equals: .cc)
                    .textInputAutocapitalization(.words)
                    .disableAutocorrection(true)
                    .accessibilityLabel("Copie")
                    .onChange(of: focused) { _, new in
                        if new == .cc { activeField = .cc }
                    }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture { focused = .cc; activeField = .cc }
    }

    private var messageCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                sectionLabel("Objet", systemImage: "tag.fill")
                TextField(announcementsOnly ? "Réunion parents…" : "Ajouter un objet (facultatif)", text: $subject)
                    .font(.headline)
                    .foregroundStyle(EduTheme.ink)
                    .frame(minHeight: 36)
                    .focused($focused, equals: .subject)
                    .submitLabel(.next)
                    .onSubmit { focused = .body }
            }
            .padding(14)
            .id("subject")

            Rectangle()
                .fill(hairline)
                .frame(height: 1)
                .padding(.horizontal, 14)

            VStack(alignment: .leading, spacing: 6) {
                sectionLabel(
                    announcementsOnly ? "Annonce" : "Message",
                    systemImage: "text.alignleft",
                    trailing: bodyText.isEmpty ? nil : "\(bodyText.count)"
                )
                bodyEditor
            }
            .padding(14)
            .id("body")
        }
        .composeCard()
    }

    private var bodyEditor: some View {
        ZStack(alignment: .topLeading) {
            if bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(announcementsOnly ? "Rédigez l’annonce…" : "Rédigez votre message…")
                    .foregroundStyle(EduTheme.muted.opacity(0.85))
                    .padding(.top, 8)
                    .padding(.leading, 5)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $bodyText)
                .focused($focused, equals: .body)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 180, maxHeight: 300)
                .accessibilityLabel(announcementsOnly ? "Texte de l’annonce" : "Texte du message")
        }
        .padding(.horizontal, -4)
    }

    private var announceHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Destinataires", systemImage: "person.3.fill")

            if loadingContacts {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            } else if announceRoleOptions.isEmpty {
                Text("Aucun contact disponible.")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                    ForEach(announceRoleOptions, id: \.id) { option in
                        let on = announceRoles.contains(option.id)
                        let count = contacts.filter { $0.normalizedRole == option.id }.count
                        let tint = roleAccent(option.id)
                        Button {
                            withAnimation(.snappy(duration: 0.2)) {
                                if on { announceRoles.remove(option.id) } else { announceRoles.insert(option.id) }
                            }
                        } label: {
                            VStack(spacing: 8) {
                                Image(systemName: roleIcon(option.id))
                                    .font(.title3.weight(.semibold))
                                    .foregroundStyle(on ? .white : tint)
                                    .frame(width: 44, height: 44)
                                    .background(Circle().fill(on ? .white.opacity(0.18) : tint.opacity(0.12)))
                                Text(option.label)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(on ? .white : EduTheme.ink)
                                Text("\(count)")
                                    .font(.caption.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(on ? .white.opacity(0.8) : EduTheme.muted)
                            }
                            .frame(maxWidth: .infinity, minHeight: 116)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(on ? AnyShapeStyle(LinearGradient(colors: [tint.opacity(0.85), tint], startPoint: .topLeading, endPoint: .bottomTrailing)) : AnyShapeStyle(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)))
                            )
                            .overlay(alignment: .topTrailing) {
                                if on {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.subheadline)
                                        .foregroundStyle(.white)
                                        .padding(8)
                                }
                            }
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(on ? .clear : Color.black.opacity(0.06), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(option.label), \(count)")
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }

                HStack(spacing: 6) {
                    Image(systemName: announceRecipientIds.isEmpty ? "exclamationmark.circle" : "checkmark.seal.fill")
                    Text(
                        announceRecipientIds.isEmpty
                            ? "Aucun destinataire sélectionné"
                            : "\(announceRecipientIds.count) destinataire\(announceRecipientIds.count == 1 ? "" : "s")"
                    )
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(announceRecipientIds.isEmpty ? Color.orange : EduTheme.teal)
            }
        }
        .padding(14)
        .composeCard()
    }

    private var contactPicker: some View {
        VStack(alignment: .leading, spacing: 0) {
            Group {
                if loadingContacts {
                    HStack {
                        sectionLabel(addingToCc ? "Ajouter en copie" : "Choisir un destinataire", systemImage: "person.crop.circle.badge.plus")
                        ProgressView().controlSize(.small)
                    }
                } else {
                    sectionLabel(
                        addingToCc ? "Ajouter en copie" : "Choisir un destinataire",
                        systemImage: "person.crop.circle.badge.plus",
                        trailing: "\(suggestions.count)"
                    )
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 10)

            if roleFilterOptions.count > 2 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(roleFilterOptions, id: \.label) { option in
                            let on = roleFilter == option.id
                            Button {
                                withAnimation(.snappy(duration: 0.2)) { roleFilter = option.id }
                            } label: {
                                HStack(spacing: 5) {
                                    if let id = option.id {
                                        Image(systemName: roleIcon(id))
                                            .font(.caption2.weight(.bold))
                                    }
                                    Text(option.label)
                                }
                                .font(.caption.weight(.bold))
                                .foregroundStyle(on ? .white : EduTheme.ink)
                                .padding(.horizontal, 12)
                                .frame(minHeight: 34)
                                .background(Capsule().fill(on ? EduTheme.navy : Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)))
                                .overlay(Capsule().stroke(on ? .clear : Color.black.opacity(0.07), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                    .padding(.horizontal, 14)
                }
                .padding(.bottom, 8)
            }

            if loadingContacts {
                ProgressView("Chargement des contacts…")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            } else if suggestions.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: search.isEmpty ? "person.slash" : "magnifyingglass")
                        .font(.title2)
                        .foregroundStyle(EduTheme.muted.opacity(0.7))
                        .accessibilityHidden(true)
                    Text(
                        search.isEmpty
                            ? (roleFilter == nil ? "Aucun contact disponible." : "Aucun \(roleFilterLabel) dans vos contacts.")
                            : "Aucun résultat pour « \(search) »."
                    )
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 22)
                .padding(.horizontal, 14)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(Array(suggestions.prefix(40).enumerated()), id: \.element.id) { index, contact in
                        if index > 0 {
                            Rectangle()
                                .fill(hairline)
                                .frame(height: 1)
                                .padding(.leading, 68)
                        }
                        Button {
                            addContact(contact)
                        } label: {
                            contactRow(contact)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.bottom, 6)
            }
        }
        .composeCard()
    }

    private func contactRow(_ contact: MessageContact) -> some View {
        let tint = roleAccent(contact.normalizedRole)
        return HStack(spacing: 12) {
            ContactAvatar(name: contact.fullName, size: 42)
            VStack(alignment: .leading, spacing: 4) {
                Text(contact.fullName.isEmpty ? "Sans nom" : contact.fullName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Label(contact.roleLabel, systemImage: roleIcon(contact.normalizedRole))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(tint)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(tint.opacity(0.12)))
                    if let className = contact.className, !className.isEmpty {
                        Text(className)
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "plus")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(EduTheme.teal)
                .frame(width: 32, height: 32)
                .background(Circle().fill(EduTheme.brand50))
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint(addingToCc ? "Ajoute en copie" : "Ajoute comme destinataire")
    }

    private var addingToCc: Bool {
        showCc && !isStudent && activeField == .cc
    }

    private var roleFilterLabel: String {
        switch roleFilter {
        case "teacher": return "professeur"
        case "parent": return "parent"
        case "student": return "élève"
        case "school_admin": return "administrateur"
        default: return "contact"
        }
    }

    private func roleAccent(_ role: String) -> Color {
        switch role {
        case "teacher": return EduTheme.navy
        case "school_admin": return EduTheme.teal
        case "parent": return Color(red: 180 / 255, green: 83 / 255, blue: 9 / 255)
        case "student": return EduTheme.fasoGreen
        default: return EduTheme.muted
        }
    }

    private func roleIcon(_ role: String) -> String {
        switch role {
        case "teacher": return "graduationcap.fill"
        case "school_admin": return "building.columns.fill"
        case "parent": return "figure.and.child.holdinghands"
        case "student": return "backpack.fill"
        default: return "person.fill"
        }
    }

    private var repliesRow: some View {
        HStack(spacing: 12) {
            Image(systemName: noReplies ? "bubble.left.and.exclamationmark.bubble.right.fill" : "arrowshape.turn.up.left.2.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(noReplies ? Color.orange : EduTheme.teal)
                .frame(width: 40, height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(noReplies ? Color.orange.opacity(0.12) : EduTheme.brand50)
                )
                .accessibilityHidden(true)
            Toggle(isOn: Binding(get: { !noReplies }, set: { noReplies = !$0 })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Autoriser les réponses")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                    Text(noReplies ? "Info officielle : personne ne pourra répondre." : "Les destinataires peuvent vous répondre.")
                        .font(.caption)
                        .foregroundStyle(EduTheme.muted)
                }
            }
            .tint(EduTheme.teal)
        }
        .padding(14)
        .composeCard()
    }

    private func chipWrap(_ items: [MessageContact], onRemove: @escaping (MessageContact) -> Void) -> some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 120), spacing: 6, alignment: .leading)],
            alignment: .leading,
            spacing: 6
        ) {
            ForEach(items) { contact in
                HStack(spacing: 6) {
                    ContactAvatar(name: contact.fullName, size: 22)
                    Text(contact.fullName.isEmpty ? "Sans nom" : contact.fullName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(EduTheme.ink)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Button {
                        withAnimation(.snappy(duration: 0.2)) { onRemove(contact) }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(EduTheme.muted)
                            .frame(width: 24, height: 24)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Retirer \(contact.fullName)")
                }
                .padding(.leading, 4)
                .padding(.trailing, 2)
                .padding(.vertical, 3)
                .background(Capsule().fill(EduTheme.brand50))
                .overlay(Capsule().stroke(EduTheme.teal.opacity(0.2), lineWidth: 1))
            }
        }
    }

    private func addContact(_ contact: MessageContact) {
        let intoCc = showCc && !isStudent && activeField == .cc
        if intoCc {
            if !selectedCc.contains(where: { $0.id == contact.id }) {
                selectedCc.append(contact)
            }
            selectedTo.removeAll { $0.id == contact.id }
        } else {
            if !selectedTo.contains(where: { $0.id == contact.id }) {
                selectedTo.append(contact)
            }
            selectedCc.removeAll { $0.id == contact.id }
            activeField = .to
        }
        search = ""
        // Close the contact list after a pick (À and Cc behave the same).
        focused = .body
    }

    private func loadContacts() async {
        guard let schoolId = auth.schoolId, let uid = auth.userId, let role = auth.primaryRole else {
            loadingContacts = false
            error = "École introuvable pour ce compte."
            return
        }
        loadingContacts = true
        error = nil
        do {
            contacts = try await EduAPI().fetchMessagingContacts(schoolId: schoolId, role: role, userId: uid)
            if announcementsOnly {
                let available = Set(announceRoleOptions.map(\.id))
                if available.contains("student") {
                    announceRoles = ["student"]
                } else if let first = available.first {
                    announceRoles = [first]
                } else {
                    announceRoles = []
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
        loadingContacts = false
    }

    private func send() async {
        guard let schoolId = auth.schoolId, let uid = auth.userId else {
            error = "Session invalide."
            return
        }
        let text = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        sending = true
        error = nil
        do {
            if announcementsOnly {
                let ids = announceRecipientIds
                guard !ids.isEmpty else {
                    error = "Choisissez au moins un rôle."
                    sending = false
                    return
                }
                let subjectText = subject.trimmingCharacters(in: .whitespacesAndNewlines)
                let finalSubject = subjectText.isEmpty
                    ? "Annonce — \(DateFormatter.localizedString(from: Date(), dateStyle: .medium, timeStyle: .none))"
                    : subjectText
                try await EduAPI().sendAnnouncement(
                    schoolId: schoolId,
                    senderId: uid,
                    recipientIds: ids,
                    subject: finalSubject,
                    body: text,
                    allowReplies: canControlReplies ? !noReplies : false
                )
            } else {
                let toIds = selectedTo.map(\.id)
                guard !toIds.isEmpty else {
                    error = "Choisissez un destinataire."
                    sending = false
                    return
                }
                let subjectText = subject.trimmingCharacters(in: .whitespacesAndNewlines)
                try await EduAPI().sendPersonalMessage(
                    schoolId: schoolId,
                    senderId: uid,
                    recipientIds: toIds,
                    ccIds: selectedCc.map(\.id),
                    subject: subjectText.isEmpty ? nil : subjectText,
                    body: text,
                    allowReplies: canControlReplies ? !noReplies : true
                )
            }
            onSent()
        } catch {
            self.error = error.localizedDescription
        }
        sending = false
    }
}

// MARK: - Conversation models

private enum ChatDirection {
    case inbound, out
}

private struct ChatBubbleMessage: Identifiable, Hashable {
    let id: String
    let direction: ChatDirection
    let subject: String?
    let body: String
    let createdAt: String?
    let readAt: String?
    let allowReplies: Bool?

    var preview: String {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if let subject, !subject.isEmpty {
            return "\(subject) — \(text)"
        }
        return text
    }
}

private struct MessageConversation: Identifiable, Hashable {
    var id: String { otherId }
    let otherId: String
    let otherName: String
    let messages: [ChatBubbleMessage]
    let unreadCount: Int

    var lastMessage: ChatBubbleMessage { messages.last! }
}

private enum MessageConversationBuilder {
    static func build(inbox: [MessageRow], sent: [MessageRow], userId: String?) -> [MessageConversation] {
        guard let userId else { return [] }
        var map: [String: (name: String, messages: [ChatBubbleMessage])] = [:]

        for row in inbox where row.isAnnouncement != true {
            guard let otherId = row.senderId, otherId != userId else { continue }
            let name = row.sender?.fullName ?? ""
            var entry = map[otherId] ?? (name: name, messages: [])
            if entry.name.isEmpty, !name.isEmpty { entry.name = name }
            entry.messages.append(
                ChatBubbleMessage(
                    id: row.id,
                    direction: .inbound,
                    subject: row.subject,
                    body: row.body ?? "",
                    createdAt: row.createdAt,
                    readAt: row.readAt,
                    allowReplies: row.allowReplies
                )
            )
            map[otherId] = entry
        }

        for row in sent where row.isAnnouncement != true {
            guard let otherId = row.recipientId, otherId != userId else { continue }
            let name = row.recipient?.fullName ?? ""
            var entry = map[otherId] ?? (name: name, messages: [])
            if entry.name.isEmpty, !name.isEmpty { entry.name = name }
            entry.messages.append(
                ChatBubbleMessage(
                    id: row.id,
                    direction: .out,
                    subject: row.subject,
                    body: row.body ?? "",
                    createdAt: row.createdAt,
                    readAt: row.readAt,
                    allowReplies: row.allowReplies
                )
            )
            map[otherId] = entry
        }

        return map.compactMap { otherId, entry -> MessageConversation? in
            guard !entry.messages.isEmpty else { return nil }
            let sorted = entry.messages.sorted {
                ($0.createdAt ?? "") < ($1.createdAt ?? "")
            }
            let unread = sorted.filter { $0.direction == .inbound && $0.readAt == nil }.count
            return MessageConversation(
                otherId: otherId,
                otherName: entry.name,
                messages: sorted,
                unreadCount: unread
            )
        }
        .sorted { ($0.lastMessage.createdAt ?? "") > ($1.lastMessage.createdAt ?? "") }
    }

    static func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        let chars = parts.compactMap { $0.first.map(String.init) }
        let value = chars.joined().uppercased()
        return value.isEmpty ? "?" : value
    }
}

private enum MessageDateFormatting {
    static func listTime(_ iso: String) -> String {
        guard let date = parse(iso) else { return String(iso.prefix(10)) }
        if Calendar.current.isDateInToday(date) {
            return format(date, "HH:mm")
        }
        return format(date, "d MMM")
    }

    static func dayKey(_ iso: String?) -> String? {
        guard let iso, let date = parse(iso) else { return nil }
        return format(date, "yyyy-MM-dd")
    }

    static func dayLabel(_ iso: String) -> String {
        guard let date = parse(iso) else { return String(iso.prefix(10)) }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Aujourd’hui" }
        if calendar.isDateInYesterday(date) { return "Hier" }
        if calendar.isDate(date, equalTo: Date(), toGranularity: .year) {
            return format(date, "EEEE d MMMM").capitalized
        }
        return format(date, "d MMMM yyyy")
    }

    static func bubbleTime(_ iso: String) -> String {
        guard let date = parse(iso) else { return String(iso.prefix(16)) }
        return format(date, "HH:mm")
    }

    private static func parse(_ iso: String) -> Date? {
        let trimmed = String(iso.prefix(19))
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        for f in ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd"] {
            parser.dateFormat = f
            if let date = parser.date(from: trimmed) { return date }
        }
        return ISO8601DateFormatter().date(from: iso)
    }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "fr_FR")
        df.dateFormat = pattern
        return df.string(from: date)
    }
}

private extension MessageRow {
    func withReadAt(_ value: String) -> MessageRow {
        MessageRow(
            id: id,
            subject: subject,
            body: body,
            createdAt: createdAt,
            readAt: value,
            isAnnouncement: isAnnouncement,
            allowReplies: allowReplies,
            senderId: senderId,
            recipientId: recipientId,
            schoolId: schoolId,
            threadId: threadId,
            sender: sender,
            recipient: recipient
        )
    }
}

private extension View {
    func composeCard() -> some View {
        background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.white)
                .shadow(color: .black.opacity(0.045), radius: 10, y: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.black.opacity(0.04), lineWidth: 1)
        )
    }
}
