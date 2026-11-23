import SwiftUI
import PhotosUI

/// « Espace classe » (secondaire): questions per subject, revision sheets, study groups and a
/// Révisions countdown, shared with the class. `moderatorClassId` opens a class for the school
/// administration: reading and hiding / restoring instead of writing.
struct ClassSpaceView: View {
    var moderatorClassId: String? = nil
    var moderatorClassName: String? = nil

    @EnvironmentObject private var auth: AuthViewModel
    @State private var context: ClassSpace.Context?
    @State private var loading = true
    @State private var tab = 0
    @State private var openPost: String?
    @State private var openGroup: String?
    @State private var composer: ComposerSeed?
    @State private var newGroup: NewGroupSeed?

    struct ComposerSeed: Identifiable { let id = UUID(); let kind: String; let subjectId: String? }
    struct NewGroupSeed: Identifiable { let id = UUID(); let name: String; let subjectId: String? }

    private var moderator: Bool { moderatorClassId != nil }
    private var classId: String? { moderatorClassId ?? context?.classId }
    private var subjects: [ClassSpace.Subject] { context?.subjects ?? [] }

    var body: some View {
        Group {
            if loading {
                LoadingBlock()
            } else if let classId {
                content(classId)
            } else {
                unavailable
            }
        }
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle(moderator ? (moderatorClassName ?? "Espace classe") : "Espace classe")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .navigationDestination(item: $openPost) { id in
            if let classId { ClassSpacePostView(postId: id, classId: classId, moderator: moderator) }
        }
        .navigationDestination(item: $openGroup) { id in
            if let classId { ClassSpaceGroupView(groupId: id, classId: classId, moderator: moderator) }
        }
        .sheet(item: $composer) { seed in
            if let classId {
                ClassSpaceComposer(classId: classId, subjects: subjects, kind: seed.kind, subjectId: seed.subjectId) { id in
                    composer = nil
                    openPost = id
                }
                .environmentObject(auth)
            }
        }
        // tapped notification: the discussion or the group it is about
        .onReceive(PushManager.shared.$focus) { f in
            guard let f, f.isFresh, f.kind == "classe" else { return }
            DispatchQueue.main.async {
                PushManager.shared.focus = nil
                if let post = f.ids("space-post").first { openPost = post }
                else if let group = f.ids("space-group").first { tab = 2; openGroup = group }
            }
        }
    }

    private func load() async {
        if moderator { loading = false; return }
        context = try? await ClassSpace.context()
        loading = false
    }

    private var unavailable: some View {
        let reason = context?.reason ?? "module"
        let text = reason == "primaire" ? "L’espace classe est disponible à partir de la 6ème."
            : reason == "inscription" ? "Tu n’es inscrit(e) dans aucune classe pour le moment."
            : "Ton école n’a pas activé l’espace classe."
        return VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right.fill").font(.largeTitle).foregroundStyle(EduTheme.teal)
            Text(text).font(.subheadline.weight(.semibold)).multilineTextAlignment(.center).foregroundStyle(EduTheme.ink)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .modifier(HomeCardStyle())
        .padding(16)
    }

    private func content(_ classId: String) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !moderator { banner }
                tabs
                switch tab {
                case 0: ClassSpaceFeed(classId: classId, kind: "discussions", subjects: subjects, moderator: moderator,
                                       onOpen: { openPost = $0 }, onCompose: { composer = ComposerSeed(kind: "question", subjectId: $0) })
                case 1: ClassSpaceFeed(classId: classId, kind: "fiche", subjects: subjects, moderator: moderator,
                                       onOpen: { openPost = $0 }, onCompose: { composer = ComposerSeed(kind: "fiche", subjectId: $0) })
                case 2: ClassSpaceGroups(classId: classId, subjects: subjects, moderator: moderator, seed: $newGroup, onOpen: { openGroup = $0 })
                default: revisions
                }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
        }
        .refreshable { await load() }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("ESPACE CLASSE").font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(.white.opacity(0.75))
                Text(context?.className ?? "Ma classe").font(.title2.weight(.bold)).foregroundStyle(.white)
                Text("Pose tes questions, partage tes fiches et révise en groupe.").font(.subheadline).foregroundStyle(.white.opacity(0.9))
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [EduTheme.tealDark, EduTheme.teal], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "checkmark.shield.fill").foregroundStyle(EduTheme.teal)
                Text("Visible par ta classe et l’administration de l’école. Sois bienveillant(e) ; un message déplacé peut être signalé.")
                    .font(.caption).foregroundStyle(EduTheme.tealDark)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
    }

    private var soon: Bool {
        (context?.compositions ?? []).contains { (Self.days(until: $0.startsOn) ?? 99) <= 21 }
    }

    private var tabs: some View {
        let items: [(String, String)] = [("Questions", "bubble.left.and.bubble.right"), ("Fiches", "note.text"), ("Groupes", "person.3"), ("Révisions", "sparkles")]
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                    if moderator && i == 3 { EmptyView() } else {
                        Button { withAnimation(.snappy(duration: 0.2)) { tab = i } } label: {
                            HStack(spacing: 6) {
                                Image(systemName: item.1).font(.caption.weight(.semibold))
                                Text(item.0).font(.subheadline.weight(.semibold))
                                if i == 3 && soon { Circle().fill(EduTheme.fasoRed).frame(width: 7, height: 7) }
                            }
                            .padding(.horizontal, 12).frame(minHeight: 36)
                            .foregroundStyle(tab == i ? .white : EduTheme.ink)
                            .background(tab == i ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(tab == i ? .clear : EduTheme.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .sensoryFeedback(.selection, trigger: tab)
    }

    static func days(until iso: String) -> Int? {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: String(iso.prefix(10))) else { return nil }
        return Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: d).day
    }

    static func frDay(_ iso: String?, _ format: String = "EEEE d MMMM") -> String {
        guard let iso else { return "" }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: String(iso.prefix(10))) else { return iso }
        let o = DateFormatter(); o.locale = Locale(identifier: "fr_FR"); o.dateFormat = format
        return o.string(from: d)
    }

    @ViewBuilder
    private var revisions: some View {
        let comps = context?.compositions ?? []
        if comps.isEmpty {
            ClassSpaceEmpty(icon: "sparkles", title: "Pas de composition dans les 45 prochains jours",
                            text: "Quand l’école programme les compositions, tu retrouves ici le compte à rebours et les révisions par matière.")
        } else {
            ForEach(comps) { c in
                let days = Self.days(until: c.startsOn) ?? 0
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 14) {
                        Text(days <= 0 ? "En cours" : "J-\(days)")
                            .font(.title3.weight(.bold)).foregroundStyle(.white)
                            .frame(width: 76, height: 60)
                            .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: EduTheme.radius))
                        VStack(alignment: .leading, spacing: 2) {
                            Text((c.periodLabel ?? "Compositions").uppercased()).font(.caption2.weight(.bold)).foregroundStyle(.white.opacity(0.75))
                            Text(c.title ?? "Compositions").font(.headline).foregroundStyle(.white)
                            Text(c.endsOn != nil && c.endsOn != c.startsOn ? "Du \(Self.frDay(c.startsOn)) au \(Self.frDay(c.endsOn))" : "Le \(Self.frDay(c.startsOn))")
                                .font(.caption).foregroundStyle(.white.opacity(0.9))
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(LinearGradient(colors: [EduTheme.tealDark, EduTheme.teal], startPoint: .topLeading, endPoint: .bottomTrailing),
                                in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    let papers = Dictionary(grouping: c.papers.filter { $0.subjectId != nil }, by: { $0.subjectId! }).compactMap { $0.value.first }
                        .sorted { ($0.date ?? "") < ($1.date ?? "") }
                    let rows: [(id: String, name: String, date: String?, start: String?)] = papers.isEmpty
                        ? subjects.map { ($0.id, $0.name, nil, nil) }
                        : papers.map { ($0.subjectId!, $0.subjectName ?? "Matière", $0.date, $0.start) }
                    ForEach(rows, id: \.id) { s in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(s.name).font(.headline).foregroundStyle(EduTheme.ink)
                                Spacer()
                                if let d = s.date {
                                    Text(Self.frDay(d, "EEE d MMM") + (s.start.map { " · \(FrTime.of($0))" } ?? ""))
                                        .font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                                }
                            }
                            HStack(spacing: 8) {
                                smallButton("Fiches", "note.text") { tab = 1 }
                                smallButton("Question", "questionmark.bubble") { composer = ComposerSeed(kind: "question", subjectId: s.id) }
                                smallButton("En groupe", "person.3") { tab = 2; newGroup = NewGroupSeed(name: "Révisions \(s.name)", subjectId: s.id) }
                            }
                        }
                        .padding(14)
                        .modifier(HomeCardStyle())
                    }
                }
            }
        }
    }

    private func smallButton(_ title: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                .padding(.horizontal, 10).frame(minHeight: 32)
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(EduTheme.teal.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shared bits

struct ClassSpaceEmpty: View {
    let icon: String
    let title: String
    var text: String? = nil
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.title).foregroundStyle(EduTheme.teal)
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).multilineTextAlignment(.center)
            if let text { Text(text).font(.caption).foregroundStyle(EduTheme.muted).multilineTextAlignment(.center) }
        }
        .padding(24).frame(maxWidth: .infinity).modifier(HomeCardStyle())
    }
}

struct ClassSpacePhotos: View {
    let paths: [String]
    var height: CGFloat = 180
    @State private var urls: [String: URL] = [:]
    @State private var full: URL?
    var body: some View {
        if !paths.isEmpty {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: paths.count == 1 ? 1 : 2), spacing: 6) {
                ForEach(paths, id: \.self) { p in
                    Button { full = urls[p] } label: {
                        AsyncImage(url: urls[p]) { img in img.resizable().scaledToFill() } placeholder: { Color(white: 0.93).overlay(ProgressView()) }
                            .frame(height: height).frame(maxWidth: .infinity).clipped()
                            .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius))
                    }
                    .buttonStyle(.plain)
                }
            }
            .task(id: paths) { urls = await ClassSpace.signed(paths) }
            .fullScreenCover(item: $full) { url in
                ZStack(alignment: .topTrailing) {
                    Color.black.ignoresSafeArea()
                    AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView().tint(.white) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    Button { full = nil } label: { Image(systemName: "xmark").font(.headline).foregroundStyle(.white).padding(12) }
                        .accessibilityLabel("Fermer")
                }
            }
        }
    }
}

extension URL: @retroactive Identifiable { public var id: String { absoluteString } }

/// Up to `max` photos, uploaded to the class's private folder as soon as they are picked.
struct ClassSpacePhotoPicker: View {
    let classId: String
    let max: Int
    @Binding var paths: [String]
    @EnvironmentObject private var auth: AuthViewModel
    @State private var items: [PhotosPickerItem] = []
    @State private var uploading = false
    var body: some View {
        HStack(spacing: 8) {
            ClassSpaceThumbs(paths: $paths)
            if paths.count < max {
                PhotosPicker(selection: $items, maxSelectionCount: max - paths.count, matching: .images) {
                    Label(uploading ? "Envoi…" : "Photo", systemImage: "camera.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .padding(.horizontal, 10).frame(minHeight: 34)
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(EduTheme.teal.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4])))
                }
                .disabled(uploading)
            }
        }
        .onChange(of: items) { _, picked in
            guard !picked.isEmpty, let uid = auth.userId else { return }
            uploading = true
            Task {
                for item in picked {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data),
                       let path = try? await ClassSpace.upload(classId: classId, userId: uid, image: image) {
                        paths.append(path)
                    }
                }
                items = []
                uploading = false
            }
        }
    }
}

private struct ClassSpaceThumbs: View {
    @Binding var paths: [String]
    @State private var urls: [String: URL] = [:]
    var body: some View {
        ForEach(paths, id: \.self) { p in
            AsyncImage(url: urls[p]) { $0.resizable().scaledToFill() } placeholder: { Color(white: 0.93) }
                .frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(alignment: .topTrailing) {
                    Button { paths.removeAll { $0 == p } } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.white, .black.opacity(0.6))
                    }
                    .offset(x: 5, y: -5)
                    .accessibilityLabel("Retirer la photo")
                }
        }
        .task(id: paths) { urls = await ClassSpace.signed(paths) }
    }
}

struct ClassSpaceHiddenNote: View {
    let reason: String?
    let moderator: Bool
    var body: some View {
        Label(moderator ? "Masqué · \(reason ?? "par l’administration")" : "Masqué par l’administration — visible par toi seul(e)", systemImage: "eye.slash.fill")
            .font(.caption.weight(.semibold)).foregroundStyle(Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255))
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color(red: 255 / 255, green: 251 / 255, blue: 235 / 255), in: RoundedRectangle(cornerRadius: 4))
    }
}

/// « Signaler »: the administration of the school is told; the author does not know who.
struct ClassSpaceReportSheet: View {
    let classId: String
    let targetType: String
    let targetId: String
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ClassSpace.reportReasons[0]
    @State private var detail = ""
    @State private var sending = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section { Text("L’administration de l’école recevra ton signalement. La personne ne saura pas que c’est toi.").font(.subheadline) }
                Section("Motif") {
                    Picker("Motif", selection: $reason) { ForEach(ClassSpace.reportReasons, id: \.self) { Text($0).tag($0) } }
                        .pickerStyle(.inline).labelsHidden()
                    TextField("Précision (facultatif)", text: $detail, axis: .vertical)
                }
                if let error { Text(error).foregroundStyle(EduTheme.fasoRed).font(.caption) }
            }
            .navigationTitle("Signaler").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Signaler") {
                        guard let uid = auth.userId else { return }
                        sending = true
                        Task {
                            do {
                                let text = detail.trimmingCharacters(in: .whitespaces)
                                try await ClassSpace.report(classId: classId, targetType: targetType, targetId: targetId, reporterId: uid,
                                                            reason: text.isEmpty ? reason : "\(reason) : \(text)")
                                dismiss()
                            } catch {
                                self.error = "\(error)".contains("duplicate") ? "Tu as déjà signalé ce message." : error.localizedDescription
                            }
                            sending = false
                        }
                    }
                    .disabled(sending)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Feed

struct ClassSpaceFeed: View {
    let classId: String
    let kind: String
    let subjects: [ClassSpace.Subject]
    let moderator: Bool
    let onOpen: (String) -> Void
    let onCompose: (String?) -> Void
    @EnvironmentObject private var auth: AuthViewModel
    @State private var posts: [ClassSpace.PostSummary] = []
    @State private var loading = true
    @State private var filter = "tout"
    @State private var subject: String?

    private var shown: [ClassSpace.PostSummary] { filter == "sans" ? posts.filter { !$0.answered } : posts }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if kind == "discussions" {
                        ForEach([("tout", "Tout"), ("question", "Questions"), ("sans", "Sans réponse"), ("discussion", "Discussions")], id: \.0) { k, l in
                            chip(l, filter == k) { filter = k }
                        }
                    }
                    Menu {
                        Button("Toutes les matières") { subject = nil }
                        ForEach(subjects) { s in Button(s.name) { subject = s.id } }
                    } label: {
                        HStack(spacing: 4) {
                            Text(subjects.first { $0.id == subject }?.name ?? "Matière").font(.subheadline.weight(.semibold))
                            Image(systemName: "chevron.down").font(.caption2.weight(.bold))
                        }
                        .foregroundStyle(subject == nil ? EduTheme.ink : .white)
                        .padding(.horizontal, 12).frame(minHeight: 36)
                        .background(subject == nil ? .white : EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(subject == nil ? EduTheme.border : .clear, lineWidth: 1))
                    }
                    .disabled(subjects.isEmpty)
                }
            }
            if !moderator {
                Button { onCompose(subject) } label: {
                    Label(kind == "fiche" ? "Partager une fiche" : "Poser une question", systemImage: "plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                }
                .buttonStyle(.plain)
            }
            if loading {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 120)
            } else if shown.isEmpty {
                ClassSpaceEmpty(icon: kind == "fiche" ? "note.text" : "questionmark.bubble",
                                title: kind == "fiche" ? "Aucune fiche pour le moment" : (filter == "sans" ? "Toutes les questions ont une réponse" : "Rien pour le moment"),
                                text: moderator ? nil : (kind == "fiche" ? "Partage tes notes : elles aideront toute la classe avant les compositions." : "Une question sur un exercice ? Pose-la à ta classe."))
            } else {
                ForEach(shown) { p in
                    Button { onOpen(p.id) } label: { card(p) }.buttonStyle(.plain)
                }
            }
        }
        .task(id: "\(filter)|\(subject ?? "")") { await load() }
    }

    private func load() async {
        let k = kind == "fiche" ? "fiche" : (filter == "question" || filter == "sans" ? "question" : (filter == "discussion" ? "discussion" : "discussions"))
        posts = (try? await ClassSpace.feed(classId: classId, kind: k, subjectId: subject)) ?? []
        loading = false
    }

    private func chip(_ label: String, _ on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.subheadline.weight(.semibold))
                .foregroundStyle(on ? .white : EduTheme.ink)
                .padding(.horizontal, 12).frame(minHeight: 36)
                .background(on ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(on ? .clear : EduTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func card(_ p: ClassSpace.PostSummary) -> some View {
        let isQ = p.kind == "question"
        let reaction = isQ ? "moi_aussi" : "utile"
        let reacted = p.myReactions.contains(reaction)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(ClassSpace.kindLabel(p.kind).uppercased()).font(.system(size: 10, weight: .bold))
                    .foregroundStyle(isQ ? Color(red: 3 / 255, green: 105 / 255, blue: 161 / 255) : (p.kind == "fiche" ? Color(red: 109 / 255, green: 40 / 255, blue: 217 / 255) : EduTheme.muted))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background((isQ ? Color.blue : (p.kind == "fiche" ? Color.purple : Color.gray)).opacity(0.1), in: RoundedRectangle(cornerRadius: 3))
                if let s = p.subjectName { Text(s).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal) }
                if isQ && p.answered { Label("Résolue", systemImage: "checkmark.circle.fill").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.fasoGreen) }
                if moderator, let r = p.reports, r > 0 { Label("\(r)", systemImage: "flag.fill").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.fasoRed) }
                Spacer(minLength: 4)
                Text(ClassSpace.relative(p.lastActivityAt)).font(.caption2).foregroundStyle(EduTheme.subtle)
            }
            Text(p.title).font(.headline).foregroundStyle(EduTheme.ink).multilineTextAlignment(.leading)
            if !p.body.isEmpty { Text(p.body).font(.subheadline).foregroundStyle(EduTheme.muted).lineLimit(2).multilineTextAlignment(.leading) }
            ClassSpacePhotos(paths: Array(p.photos.prefix(2)), height: 110)
            if p.hidden { ClassSpaceHiddenNote(reason: p.hiddenReason, moderator: moderator) }
            HStack(spacing: 14) {
                Text(p.mine ? "Toi" : p.authorName).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink.opacity(0.8))
                Label("\(p.replies)", systemImage: "bubble.left").font(.caption).foregroundStyle(EduTheme.muted)
                Spacer()
                if moderator {
                    Label("\(isQ ? p.moiAussi : p.utile)", systemImage: isQ ? "hand.raised" : "hand.thumbsup").font(.caption).foregroundStyle(EduTheme.muted)
                } else {
                    Button {
                        guard let uid = auth.userId else { return }
                        Task {
                            try? await ClassSpace.react(targetType: "post", targetId: p.id, userId: uid, kind: reaction, on: !reacted)
                            await load()
                        }
                    } label: {
                        Label("\(isQ ? "Moi aussi" : "Utile") · \(isQ ? p.moiAussi : p.utile)", systemImage: isQ ? "hand.raised.fill" : "hand.thumbsup.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(reacted ? EduTheme.teal : EduTheme.muted)
                            .padding(.horizontal, 8).frame(minHeight: 28)
                            .background(reacted ? EduTheme.brand50 : .clear, in: RoundedRectangle(cornerRadius: 4))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(HomeCardStyle())
        .opacity(p.hidden ? 0.75 : 1)
    }
}

// MARK: - Composer

struct ClassSpaceComposer: View {
    let classId: String
    let subjects: [ClassSpace.Subject]
    @State var kind: String
    @State var subjectId: String?
    let onCreated: (String) -> Void
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var text = ""
    @State private var photos: [String] = []
    @State private var sending = false
    @State private var error: String?

    init(classId: String, subjects: [ClassSpace.Subject], kind: String, subjectId: String?, onCreated: @escaping (String) -> Void) {
        self.classId = classId
        self.subjects = subjects
        _kind = State(initialValue: kind)
        _subjectId = State(initialValue: subjectId)
        self.onCreated = onCreated
    }

    var body: some View {
        NavigationStack {
            Form {
                if kind != "fiche" {
                    Picker("Type", selection: $kind) {
                        Text("Question").tag("question")
                        Text("Discussion").tag("discussion")
                    }
                    .pickerStyle(.segmented)
                }
                Picker(kind == "fiche" ? "Matière *" : "Matière", selection: $subjectId) {
                    Text(kind == "fiche" ? "Choisir…" : "Toutes matières").tag(String?.none)
                    ForEach(subjects) { Text($0.name).tag(String?.some($0.id)) }
                }
                Section(kind == "question" ? "Ta question" : "Titre") {
                    TextField(kind == "question" ? "Ex. : Comment on factorise x² − 9 ?" : (kind == "fiche" ? "Ex. : Les fractions en 5 points" : "Ex. : Qui révise samedi ?"),
                              text: $title, axis: .vertical)
                }
                Section(kind == "fiche" ? "Contenu de la fiche" : "Détails (facultatif)") {
                    TextField("", text: $text, axis: .vertical).lineLimit(kind == "fiche" ? 6...16 : 3...8)
                }
                Section {
                    ClassSpacePhotoPicker(classId: classId, max: 4, paths: $photos)
                } footer: {
                    Text("Visible par ta classe et l’administration de l’école. Reste respectueux et ne publie pas de réponses à copier.")
                }
                if let error { Text(error).foregroundStyle(EduTheme.fasoRed).font(.caption) }
            }
            .navigationTitle(kind == "fiche" ? "Partager une fiche" : "Nouveau message").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Publier") { Task { await submit() } }.disabled(sending || title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func submit() async {
        guard let uid = auth.userId else { return }
        if kind == "fiche" && subjectId == nil { error = "Choisis la matière de la fiche."; return }
        sending = true
        do {
            let id = try await ClassSpace.createPost(classId: classId, authorId: uid, kind: kind, subjectId: subjectId, evaluationId: nil,
                                                     title: title, body: text, photos: photos)
            onCreated(id)
        } catch {
            self.error = error.localizedDescription
        }
        sending = false
    }
}

// MARK: - One post

struct ClassSpacePostView: View {
    let postId: String
    let classId: String
    let moderator: Bool
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var post: ClassSpace.Post?
    @State private var failed = false
    @State private var reply = ""
    @State private var photos: [String] = []
    @State private var sending = false
    @State private var reporting: ReportTarget?

    struct ReportTarget: Identifiable { let id: String; let type: String }

    var body: some View {
        ScrollView {
            if let p = post {
                VStack(alignment: .leading, spacing: 14) {
                    postCard(p)
                    Text("\(p.replies.count) RÉPONSE\(p.replies.count > 1 ? "S" : "")").font(.caption.weight(.bold)).tracking(0.6).foregroundStyle(EduTheme.teal)
                    ForEach(p.replies) { r in replyCard(r, in: p) }
                    if !moderator && !p.hidden { composer(p) }
                }
                .padding(16)
            } else if failed {
                ClassSpaceEmpty(icon: "questionmark.bubble", title: "Ce message n’existe plus.").padding(16)
            } else {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 200)
            }
        }
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle(post.map { ClassSpace.kindLabel($0.kind) } ?? "Message")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $reporting) { t in
            ClassSpaceReportSheet(classId: classId, targetType: t.type, targetId: t.id).environmentObject(auth)
        }
    }

    private func load() async {
        do { post = try await ClassSpace.post(postId) } catch { failed = true }
    }

    private func postCard(_ p: ClassSpace.Post) -> some View {
        let isQ = p.kind == "question"
        let reaction = isQ ? "moi_aussi" : "utile"
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if let s = p.subjectName { Text(s).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal) }
                Spacer()
                Text("\(p.mine ? "Toi" : p.authorName) · \(ClassSpace.relative(p.createdAt))\(p.editedAt != nil ? " · modifié" : "")")
                    .font(.caption2).foregroundStyle(EduTheme.subtle)
            }
            Text(p.title).font(.title3.weight(.bold)).foregroundStyle(EduTheme.ink)
            if let e = p.evaluationTitle { Text("Exercice : \(e)").font(.caption).foregroundStyle(EduTheme.muted) }
            if !p.body.isEmpty { Text(p.body).font(.subheadline).foregroundStyle(EduTheme.ink.opacity(0.85)) }
            ClassSpacePhotos(paths: p.photos)
            if p.hidden { ClassSpaceHiddenNote(reason: p.hiddenReason, moderator: moderator) }
            Divider()
            HStack {
                if moderator {
                    Text("\(isQ ? p.moiAussi : p.utile) « \(isQ ? "Moi aussi" : "Utile") »").font(.caption).foregroundStyle(EduTheme.muted)
                } else {
                    Button {
                        guard let uid = auth.userId else { return }
                        Task {
                            try? await ClassSpace.react(targetType: "post", targetId: p.id, userId: uid, kind: reaction, on: !p.myReactions.contains(reaction))
                            await load()
                        }
                    } label: {
                        Label("\(isQ ? "Moi aussi" : "Utile") · \(isQ ? p.moiAussi : p.utile)", systemImage: isQ ? "hand.raised.fill" : "hand.thumbsup.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(p.myReactions.contains(reaction) ? EduTheme.teal : EduTheme.muted)
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                if moderator {
                    moderateButton(type: "post", id: p.id, hidden: p.hidden)
                } else if p.mine {
                    Button(role: .destructive) {
                        Task { try? await ClassSpace.deletePost(p.id); dismiss() }
                    } label: { Label("Supprimer", systemImage: "trash").font(.caption.weight(.semibold)) }
                } else {
                    Button { reporting = ReportTarget(id: p.id, type: "post") } label: {
                        Label("Signaler", systemImage: "flag").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                    }
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func replyCard(_ r: ClassSpace.Reply, in p: ClassSpace.Post) -> some View {
        let isAnswer = r.id == p.answerReplyId
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(r.mine ? "Toi" : r.authorName).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.ink)
                Text(ClassSpace.relative(r.createdAt)).font(.caption2).foregroundStyle(EduTheme.subtle)
                if isAnswer { Label("Réponse choisie", systemImage: "checkmark.circle.fill").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.fasoGreen) }
                if moderator, let n = r.reports, n > 0 { Label("\(n)", systemImage: "flag.fill").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.fasoRed) }
            }
            Text(r.body).font(.subheadline).foregroundStyle(EduTheme.ink.opacity(0.85))
            ClassSpacePhotos(paths: r.photos, height: 120)
            if r.hidden { ClassSpaceHiddenNote(reason: r.hiddenReason, moderator: moderator) }
            HStack(spacing: 14) {
                if moderator {
                    Text("\(r.merci) merci").font(.caption).foregroundStyle(EduTheme.muted)
                } else {
                    Button {
                        guard let uid = auth.userId, !r.mine else { return }
                        Task { try? await ClassSpace.react(targetType: "reply", targetId: r.id, userId: uid, kind: "merci", on: !r.myMerci); await load() }
                    } label: {
                        Label("Merci\(r.merci > 0 ? " · \(r.merci)" : "")", systemImage: r.myMerci ? "heart.fill" : "heart")
                            .font(.caption.weight(.semibold)).foregroundStyle(r.myMerci ? EduTheme.fasoRed : EduTheme.muted)
                    }
                    .buttonStyle(.plain)
                    if p.mine && p.kind == "question" && !r.mine {
                        Button {
                            Task { try? await ClassSpace.setAnswer(postId: p.id, replyId: isAnswer ? nil : r.id); await load() }
                        } label: {
                            Label(isAnswer ? "Retirer" : "M’a aidé", systemImage: "checkmark.circle").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.fasoGreen)
                        }
                        .buttonStyle(.plain)
                    }
                }
                Spacer()
                if moderator {
                    moderateButton(type: "reply", id: r.id, hidden: r.hidden)
                } else if r.mine {
                    Button(role: .destructive) { Task { try? await ClassSpace.deleteReply(r.id); await load() } } label: {
                        Image(systemName: "trash").font(.caption)
                    }
                    .accessibilityLabel("Supprimer ma réponse")
                } else {
                    Button { reporting = ReportTarget(id: r.id, type: "reply") } label: {
                        Label("Signaler", systemImage: "flag").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isAnswer ? EduTheme.fasoGreen.opacity(0.06) : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(isAnswer ? EduTheme.fasoGreen.opacity(0.6) : EduTheme.borderStrong.opacity(0.7), lineWidth: 1))
    }

    private func composer(_ p: ClassSpace.Post) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(p.kind == "question" ? "Ta réponse" : "Répondre").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
            TextField(p.kind == "question" ? "Explique la méthode plutôt que de donner la réponse." : "Écris ta réponse…", text: $reply, axis: .vertical)
                .lineLimit(3...8)
                .padding(10)
                .background(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255), in: RoundedRectangle(cornerRadius: EduTheme.radius))
                .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(EduTheme.borderStrong, lineWidth: 1))
            HStack {
                ClassSpacePhotoPicker(classId: classId, max: 2, paths: $photos)
                Spacer()
                Button {
                    guard let uid = auth.userId else { return }
                    sending = true
                    Task {
                        do {
                            try await ClassSpace.reply(postId: p.id, authorId: uid, body: reply, photos: photos)
                            reply = ""; photos = []
                            await load()
                        } catch {}
                        sending = false
                    }
                } label: {
                    Label("Envoyer", systemImage: "paperplane.fill").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 14).frame(minHeight: 40)
                        .background(reply.trimmingCharacters(in: .whitespaces).isEmpty || sending ? EduTheme.subtle : EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                }
                .buttonStyle(.plain)
                .disabled(reply.trimmingCharacters(in: .whitespaces).isEmpty || sending)
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private func moderateButton(type: String, id: String, hidden: Bool) -> some View {
        Button {
            Task { try? await ClassSpace.moderate(targetType: type, targetId: id, hide: !hidden); await load() }
        } label: {
            Label(hidden ? "Rétablir" : "Masquer", systemImage: hidden ? "checkmark.shield" : "eye.slash")
                .font(.caption.weight(.semibold)).foregroundStyle(hidden ? EduTheme.teal : EduTheme.fasoRed)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Groups

struct ClassSpaceGroups: View {
    let classId: String
    let subjects: [ClassSpace.Subject]
    let moderator: Bool
    @Binding var seed: ClassSpaceView.NewGroupSeed?
    let onOpen: (String) -> Void
    @EnvironmentObject private var auth: AuthViewModel
    @State private var groups: [ClassSpace.GroupSummary] = []
    @State private var loading = true
    @State private var creating = false
    @State private var name = ""
    @State private var subjectId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Des groupes de 2 à 6 pour réviser ou préparer un devoir ensemble : une discussion et une liste de tâches partagée.")
                .font(.caption).foregroundStyle(EduTheme.muted)
            if !moderator {
                Button { name = ""; subjectId = nil; creating = true } label: {
                    Label("Créer un groupe", systemImage: "plus").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                }
                .buttonStyle(.plain)
            }
            if loading {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 120)
            } else if groups.isEmpty {
                ClassSpaceEmpty(icon: "person.3", title: "Aucun groupe pour le moment", text: moderator ? nil : "Crée le premier et invite tes camarades à le rejoindre.")
            } else {
                ForEach(groups) { g in groupCard(g) }
            }
        }
        .task { await load() }
        .onChange(of: seed?.id) { _, _ in
            guard let s = seed else { return }
            name = s.name; subjectId = s.subjectId; creating = true; seed = nil
        }
        .sheet(isPresented: $creating) {
            NavigationStack {
                Form {
                    TextField("Nom du groupe", text: $name)
                    Picker("Matière", selection: $subjectId) {
                        Text("Toutes matières").tag(String?.none)
                        ForEach(subjects) { Text($0.name).tag(String?.some($0.id)) }
                    }
                    Text("Le groupe est ouvert : tes camarades le voient et peuvent le rejoindre (6 au maximum). L’administration de l’école peut le lire.")
                        .font(.caption).foregroundStyle(EduTheme.muted)
                }
                .navigationTitle("Nouveau groupe").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Annuler") { creating = false } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Créer") {
                            guard let uid = auth.userId else { return }
                            Task {
                                if let id = try? await ClassSpace.createGroup(classId: classId, userId: uid, name: name, subjectId: subjectId) {
                                    creating = false
                                    await load()
                                    onOpen(id)
                                }
                            }
                        }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }

    private func load() async {
        groups = (try? await ClassSpace.groups(classId: classId)) ?? []
        loading = false
    }

    private func groupCard(_ g: ClassSpace.GroupSummary) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                if let s = g.subjectName { Text(s).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal) }
                if g.member { Text("Mon groupe").font(.caption2.weight(.bold)).foregroundStyle(EduTheme.teal).padding(.horizontal, 6).padding(.vertical, 2).background(EduTheme.brand50, in: RoundedRectangle(cornerRadius: 3)) }
                if g.archived { Text("Terminé").font(.caption2.weight(.bold)).foregroundStyle(EduTheme.muted) }
                Spacer()
                Text(ClassSpace.relative(g.lastActivityAt)).font(.caption2).foregroundStyle(EduTheme.subtle)
            }
            Text(g.name).font(.headline).foregroundStyle(EduTheme.ink)
            Text(g.members.map { $0.id == auth.userId ? "Toi" : $0.name }.joined(separator: ", ")).font(.caption).foregroundStyle(EduTheme.muted)
            HStack(spacing: 14) {
                Label("\(g.members.count)/6", systemImage: "person.2").font(.caption).foregroundStyle(EduTheme.muted)
                if g.tasks > 0 { Label("\(g.tasksDone)/\(g.tasks)", systemImage: "checklist").font(.caption).foregroundStyle(EduTheme.muted) }
                Spacer()
                if g.member || moderator {
                    Button("Ouvrir") { onOpen(g.id) }.font(.subheadline.weight(.semibold)).tint(EduTheme.teal)
                } else if !g.archived && g.members.count < 6 {
                    Button {
                        guard let uid = auth.userId else { return }
                        Task { try? await ClassSpace.join(groupId: g.id, userId: uid); await load(); onOpen(g.id) }
                    } label: {
                        Text("Rejoindre").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            .padding(.horizontal, 12).frame(minHeight: 32)
                            .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("Complet").font(.caption).foregroundStyle(EduTheme.muted)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(HomeCardStyle())
        .opacity(g.archived ? 0.7 : 1)
    }
}

struct ClassSpaceGroupView: View {
    let groupId: String
    let classId: String
    let moderator: Bool
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var group: ClassSpace.Group?
    @State private var text = ""
    @State private var photos: [String] = []
    @State private var task = ""
    @State private var showTasks = false
    @State private var reporting: ClassSpacePostView.ReportTarget?

    private var canWrite: Bool { !moderator && (group?.member ?? false) && !(group?.archived ?? true) }

    var body: some View {
        VStack(spacing: 0) {
            if let g = group {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            header(g)
                            if g.messages.isEmpty { Text("Aucun message. Lance la discussion !").font(.subheadline).foregroundStyle(EduTheme.muted).padding(.vertical, 30) }
                            ForEach(g.messages) { m in bubble(m).id(m.id) }
                        }
                        .padding(16)
                    }
                    .onChange(of: g.messages.count) { _, _ in if let last = g.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
                    .onAppear { if let last = g.messages.last { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
                if canWrite { inputBar(g) }
            } else {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle(group?.name ?? "Groupe")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showTasks = true } label: { Image(systemName: "checklist") }.accessibilityLabel("À faire ensemble")
            }
        }
        .task { await load() }
        .task {
            // the chat refreshes while open
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                await load()
            }
        }
        .sheet(isPresented: $showTasks) { tasksSheet }
        .sheet(item: $reporting) { t in ClassSpaceReportSheet(classId: classId, targetType: t.type, targetId: t.id).environmentObject(auth) }
    }

    private func load() async {
        if let g = try? await ClassSpace.group(groupId) { group = g }
    }

    private func header(_ g: ClassSpace.Group) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(g.subjectName ?? "Groupe de travail").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal)
            Text(g.members.map { $0.id == auth.userId ? "Toi" : $0.name }.joined(separator: ", ")).font(.caption).foregroundStyle(EduTheme.muted)
            if !moderator {
                HStack(spacing: 12) {
                    if g.mine {
                        Button(g.archived ? "Rouvrir" : "Terminer le groupe") {
                            Task { try? await ClassSpace.archive(groupId: g.id, !g.archived); await load() }
                        }
                        .font(.caption.weight(.semibold)).tint(EduTheme.teal)
                    }
                    if g.member {
                        Button("Quitter", role: .destructive) {
                            guard let uid = auth.userId else { return }
                            Task { try? await ClassSpace.leave(groupId: g.id, userId: uid); dismiss() }
                        }
                        .font(.caption.weight(.semibold))
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(HomeCardStyle())
    }

    private func bubble(_ m: ClassSpace.GroupMessage) -> some View {
        HStack {
            if m.mine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 4) {
                if !m.mine { Text(m.authorName).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.teal) }
                Text(m.body).font(.subheadline).foregroundStyle(m.mine ? .white : EduTheme.ink)
                ClassSpacePhotos(paths: m.photos, height: 120)
                if m.hidden { ClassSpaceHiddenNote(reason: m.hiddenReason, moderator: moderator) }
                HStack(spacing: 10) {
                    Text(ClassSpace.relative(m.createdAt)).font(.caption2).foregroundStyle(m.mine ? .white.opacity(0.75) : EduTheme.subtle)
                    if moderator {
                        Button(m.hidden ? "Rétablir" : "Masquer") {
                            Task { try? await ClassSpace.moderate(targetType: "group_message", targetId: m.id, hide: !m.hidden); await load() }
                        }
                        .font(.caption2.weight(.semibold)).tint(m.hidden ? EduTheme.teal : EduTheme.fasoRed)
                    } else if !m.mine {
                        Button("Signaler") { reporting = .init(id: m.id, type: "group_message") }.font(.caption2.weight(.semibold)).tint(EduTheme.subtle)
                    }
                }
            }
            .padding(10)
            .background(m.mine ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(m.mine ? .clear : EduTheme.border, lineWidth: 1))
            if !m.mine { Spacer(minLength: 40) }
        }
    }

    private func inputBar(_ g: ClassSpace.Group) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                TextField("Écrire au groupe…", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(10)
                    .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                    .overlay(RoundedRectangle(cornerRadius: EduTheme.radius).stroke(EduTheme.borderStrong, lineWidth: 1))
                Button {
                    guard let uid = auth.userId, !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                    let body = text, pics = photos
                    text = ""; photos = []
                    Task { try? await ClassSpace.send(groupId: g.id, authorId: uid, body: body, photos: pics); await load() }
                } label: {
                    Image(systemName: "paperplane.fill").foregroundStyle(.white).frame(width: 42, height: 42)
                        .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius))
                }
                .accessibilityLabel("Envoyer")
            }
            HStack { ClassSpacePhotoPicker(classId: classId, max: 2, paths: $photos); Spacer() }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(.bar)
    }

    private var tasksSheet: some View {
        NavigationStack {
            List {
                ForEach(group?.tasks ?? []) { t in
                    HStack {
                        Button {
                            guard canWrite else { return }
                            Task { try? await ClassSpace.setTaskDone(t.id, !t.done); await load() }
                        } label: {
                            Image(systemName: t.done ? "checkmark.square.fill" : "square").foregroundStyle(EduTheme.teal)
                        }
                        .buttonStyle(.plain)
                        VStack(alignment: .leading) {
                            Text(t.label).strikethrough(t.done).foregroundStyle(t.done ? EduTheme.muted : EduTheme.ink)
                            if let a = t.assigneeName { Text(t.assigneeId == auth.userId ? "Toi" : a).font(.caption).foregroundStyle(EduTheme.muted) }
                        }
                        Spacer()
                        if canWrite && t.assigneeId == nil {
                            Button("Je m’en charge") {
                                guard let uid = auth.userId else { return }
                                Task { try? await ClassSpace.takeTask(t.id, userId: uid); await load() }
                            }
                            .font(.caption.weight(.semibold)).tint(EduTheme.teal)
                        }
                    }
                    .swipeActions {
                        if canWrite {
                            Button("Retirer", role: .destructive) { Task { try? await ClassSpace.deleteTask(t.id); await load() } }
                        }
                    }
                }
                if canWrite {
                    HStack {
                        TextField("Ajouter une tâche", text: $task)
                        Button {
                            guard let uid = auth.userId, let g = group, !task.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                            let label = task; task = ""
                            Task { try? await ClassSpace.addTask(groupId: g.id, userId: uid, label: label); await load() }
                        } label: { Image(systemName: "plus.circle.fill").foregroundStyle(EduTheme.teal) }
                    }
                }
                if (group?.tasks ?? []).isEmpty && !canWrite {
                    Text("Aucune tâche.").foregroundStyle(EduTheme.muted)
                }
            }
            .navigationTitle("À faire ensemble").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { showTasks = false } } }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Administration

/// The school administration: reports to handle, and the secondaire classes to read and moderate.
struct SchoolClassSpaceView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var classes: [ClassSpace.SchoolClass] = []
    @State private var reports: [ClassSpace.Report] = []
    @State private var openOnly = true
    @State private var loading = true
    @State private var openClass: ClassSpace.SchoolClass?
    @State private var openPost: PostTarget?

    struct PostTarget: Identifiable, Hashable { let id: String; let classId: String }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Les élèves du secondaire s’entraident par classe. Vous seuls lisez tout et modérez.")
                    .font(.subheadline).foregroundStyle(EduTheme.muted)
                HStack {
                    Label("SIGNALEMENTS", systemImage: "flag.fill").font(.caption.weight(.bold)).tracking(0.6).foregroundStyle(EduTheme.teal)
                    Spacer()
                    Picker("", selection: $openOnly) { Text("À traiter").tag(true); Text("Tous").tag(false) }
                        .pickerStyle(.segmented).frame(width: 180)
                }
                if loading {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 80)
                } else if reports.isEmpty {
                    Label("Aucun signalement\(openOnly ? " à traiter" : "").", systemImage: "checkmark.circle.fill")
                        .font(.subheadline).foregroundStyle(EduTheme.muted).padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading).modifier(HomeCardStyle())
                } else {
                    ForEach(reports) { r in reportCard(r) }
                }
                Label("CLASSES DU SECONDAIRE", systemImage: "person.3.fill").font(.caption.weight(.bold)).tracking(0.6).foregroundStyle(EduTheme.teal)
                    .padding(.top, 6)
                ForEach(classes) { c in
                    Button { openClass = c } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(c.name).font(.headline).foregroundStyle(EduTheme.ink)
                                Text("\(c.posts) messages · \(c.groups) groupe\(c.groups > 1 ? "s" : "") · \(c.postsWeek) cette semaine")
                                    .font(.caption).foregroundStyle(EduTheme.muted)
                            }
                            Spacer()
                            if c.openReports > 0 { Label("\(c.openReports)", systemImage: "flag.fill").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.fasoRed) }
                            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(EduTheme.subtle)
                        }
                        .padding(14).modifier(HomeCardStyle())
                    }
                    .buttonStyle(.plain)
                }
                if !loading && classes.isEmpty {
                    Text("Aucune classe du secondaire cette année.").font(.subheadline).foregroundStyle(EduTheme.muted)
                }
            }
            .padding(16)
        }
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Espace classe")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: openOnly) { await load() }
        .refreshable { await load() }
        .navigationDestination(item: $openClass) { c in
            ClassSpaceView(moderatorClassId: c.classId, moderatorClassName: c.name)
        }
        .navigationDestination(item: $openPost) { t in
            ClassSpacePostView(postId: t.id, classId: t.classId, moderator: true)
        }
    }

    private func load() async {
        guard let school = auth.schoolId else { loading = false; return }
        async let c = ClassSpace.schoolClasses(schoolId: school)
        async let r = ClassSpace.reports(schoolId: school, open: openOnly)
        classes = (try? await c) ?? []
        reports = (try? await r) ?? []
        loading = false
    }

    private func reportCard(_ r: ClassSpace.Report) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text("\(r.count) signalement\(r.count > 1 ? "s" : "")").font(.caption.weight(.bold)).foregroundStyle(EduTheme.fasoRed)
                Text(r.className).font(.caption.weight(.semibold)).foregroundStyle(EduTheme.muted)
                if r.hidden == true { Label("Masqué", systemImage: "eye.slash").font(.caption).foregroundStyle(.orange) }
                if r.handled { Text("Traité").font(.caption).foregroundStyle(EduTheme.fasoGreen) }
                Spacer()
                Text(ClassSpace.relative(r.firstAt)).font(.caption2).foregroundStyle(EduTheme.subtle)
            }
            Text(r.text ?? "(supprimé)").font(.subheadline).foregroundStyle(EduTheme.ink)
            Text("Écrit par \(r.authorName ?? "—")\(r.reasons.isEmpty ? "" : " · Motifs : \(r.reasons.joined(separator: " ; "))")")
                .font(.caption).foregroundStyle(EduTheme.muted)
            HStack(spacing: 8) {
                if !r.handled || r.hidden != true {
                    actionButton("Masquer", "eye.slash", EduTheme.fasoRed) { Task { try? await ClassSpace.moderate(targetType: r.targetType, targetId: r.targetId, hide: true); await load() } }
                }
                if !r.handled || r.hidden == true {
                    actionButton(r.hidden == true ? "Rétablir" : "Garder", "checkmark.shield", EduTheme.teal) {
                        Task { try? await ClassSpace.moderate(targetType: r.targetType, targetId: r.targetId, hide: false); await load() }
                    }
                }
                if let post = r.postId {
                    Button("Voir") { openPost = PostTarget(id: post, classId: r.classId) }.font(.caption.weight(.semibold)).tint(EduTheme.teal)
                }
            }
        }
        .padding(14)
        .modifier(HomeCardStyle())
    }

    private func actionButton(_ title: String, _ icon: String, _ color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.caption.weight(.semibold)).foregroundStyle(.white)
                .padding(.horizontal, 10).frame(minHeight: 32)
                .background(color, in: RoundedRectangle(cornerRadius: EduTheme.radius))
        }
        .buttonStyle(.plain)
    }
}
