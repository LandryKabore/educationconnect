import SwiftUI
import UIKit

/// School admin « Parents », like the web Parents: parent accounts with their children and login,
/// creating a parent linked to a student, new temporary password and reset link.
struct SchoolParentsView: View {
    @EnvironmentObject private var auth: AuthViewModel

    @State private var rows: [PersonRow] = []
    @State private var total = 0
    @State private var search = ""
    @State private var credentials: [String: EduAPI.TempCredential] = [:]
    @State private var loading = true
    @State private var ready = false
    @State private var error: String?
    @State private var searchTask: Task<Void, Never>?
    @State private var creating = false
    @State private var busyId: String?
    @State private var notice: (title: String, message: String, copy: String?)?

    @State private var tour = TabTour(key: "parents-ecole")
    @State private var coach = CoachMarkRegistry()

    private typealias H = TeacherHomeView

    private var tourSteps: [CoachMarkStep] {
        [
            CoachMarkStep(id: "pa.new", icon: "person.badge.plus", title: "Nouveau parent",
                          message: "Créez le compte d’un parent et liez-le à son enfant : l’identifiant et le mot de passe temporaire s’affichent."),
            CoachMarkStep(id: "pa.list", icon: "figure.and.child.holdinghands", title: "Les parents",
                          message: "Pour chaque parent : ses enfants, son identifiant et son mot de passe temporaire tant qu’il ne l’a pas changé. « ⋯ » pour un nouveau mot de passe ou un lien."),
            CoachMarkStep(id: "pa.help", icon: "questionmark.circle.fill", title: "Revoir ce guide",
                          message: "Touchez ce bouton à tout moment pour relancer la visite."),
        ]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if ready {
                    VStack(alignment: .leading, spacing: 14) {
                        banner
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass").foregroundStyle(EduTheme.subtle)
                            TextField("Rechercher un parent ou un enfant…", text: $search).textInputAutocapitalization(.never).autocorrectionDisabled()
                            if !search.isEmpty { Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(EduTheme.subtle) } }
                        }
                        .font(.subheadline).padding(.horizontal, 12).frame(minHeight: 42).modifier(HomeCardStyle())
                        if let error { Text(error).font(.subheadline).foregroundStyle(EduTheme.fasoRed) }
                        list.coachMarkTarget("pa.list")
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
                } else {
                    ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load(reset: true) }
            .tabTour(tour, registry: coach, scroller: proxy)
        }
        .environment(coach)
        .background(EduTheme.page.ignoresSafeArea())
        .navigationTitle("Parents")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.light)
        .task { await load(reset: true) }
        .onChange(of: search) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                if !Task.isCancelled { await load(reset: true) }
            }
        }
        .onChange(of: ready) { _, isReady in
            if isReady { tour.autoStartOnce({ tourSteps }, registry: coach) }
        }
        .sheet(isPresented: $creating) {
            NewParentSheet { res in
                Task {
                    await load(reset: true)
                    if let res { notice = ("Compte créé", "Identifiant : \(res.0)\nMot de passe temporaire : \(res.1)", "\(res.0)\n\(res.1)") }
                }
            }
            .environmentObject(auth)
        }
        .alert(notice?.title ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            if let copy = notice?.copy { Button("Copier") { UIPasteboard.general.string = copy } }
            Button("OK", role: .cancel) {}
        } message: { Text(notice?.message ?? "") }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Parents").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                        Text("Comptes, identifiants et liaison avec les élèves.").font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.85))
                    }
                    Spacer()
                    TourHelpButton(onDark: true) { tour.start(tourSteps, registry: coach) }.coachMarkTarget("pa.help")
                }
                Button { creating = true } label: {
                    Label("Nouveau parent", systemImage: "person.badge.plus")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                }
                .buttonStyle(.plain).coachMarkTarget("pa.new")
            }
            .padding(20)
            HStack(spacing: 0) { EduTheme.fasoRed; EduTheme.fasoYellow; EduTheme.fasoGreen }.frame(height: 4).accessibilityHidden(true)
        }
        .background(LinearGradient(colors: [H.brand800, EduTheme.teal, H.brand600], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(total) parent\(total > 1 ? "s" : "")").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink).padding(16)
            Divider()
            if loading && rows.isEmpty {
                ProgressView().tint(EduTheme.teal).frame(maxWidth: .infinity).padding(24)
            } else if rows.isEmpty {
                Text(search.isEmpty ? "Aucun parent pour le moment." : "Aucun parent ne correspond à la recherche.").font(.subheadline).foregroundStyle(EduTheme.muted).padding(16)
            }
            ForEach(rows) { p in
                let cred = credentials[p.id]
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(p.fullName.isEmpty ? "Parent" : p.fullName).font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.ink)
                        Text((p.children ?? []).isEmpty ? "Aucun enfant lié" : "Parent de " + (p.children ?? []).joined(separator: ", "))
                            .font(.caption).foregroundStyle((p.children ?? []).isEmpty ? H.amber : EduTheme.muted)
                        if let ph = p.phone, !ph.isEmpty { Text(ph).font(.caption).foregroundStyle(EduTheme.muted) }
                        HStack(spacing: 6) {
                            tag(cred?.username ?? p.email.map { $0.replacingOccurrences(of: "@edufaso.local", with: "") } ?? "—", EduTheme.muted, H.slate100)
                            if let pw = cred?.temp_password_hint, cred?.used != true { tag(pw, H.amber, H.amber50) }
                        }
                    }
                    Spacer(minLength: 4)
                    Menu {
                        Button { Task { await credentialAction(p, reset: true) } } label: { Label("Nouveau mot de passe", systemImage: "key") }
                        Button { Task { await credentialAction(p, reset: false) } } label: { Label("Lien oublié", systemImage: "link") }
                    } label: {
                        Image(systemName: busyId == p.id ? "hourglass" : "ellipsis").font(.subheadline.weight(.semibold))
                            .foregroundStyle(EduTheme.muted).frame(width: 32, height: 32)
                    }
                    .accessibilityLabel("Actions pour \(p.fullName)")
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                Divider().padding(.leading, 16)
            }
            if rows.count < total {
                Button { Task { await load(reset: false) } } label: {
                    Text(loading ? "Chargement…" : "Afficher plus (\(total - rows.count) restants)")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.teal).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain).disabled(loading)
            }
        }
        .modifier(HomeCardStyle())
    }

    private func tag(_ text: String, _ fg: Color, _ bg: Color) -> some View {
        Text(text).font(.caption.weight(.semibold).monospaced()).foregroundStyle(fg)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(bg, in: RoundedRectangle(cornerRadius: 3, style: .continuous))
            .textSelection(.enabled)
    }

    private func load(reset: Bool) async {
        guard let sid = auth.schoolId else { ready = true; return }
        loading = true
        defer { loading = false; ready = true }
        do {
            let page = try await EduAPI().fetchParentsPage(schoolId: sid, search: search.trimmingCharacters(in: .whitespaces), offset: reset ? 0 : rows.count)
            rows = reset ? page.rows : rows + page.rows
            total = page.total
            if !rows.isEmpty, let list = try? await EduAPI().fetchTempCredentials(userIds: rows.map(\.id)) {
                credentials = Dictionary(list.map { ($0.user_id, $0) }, uniquingKeysWith: { a, _ in a })
            }
            error = nil
        } catch {
            if !error.isCancellation { self.error = error.localizedDescription }
        }
    }

    private func credentialAction(_ p: PersonRow, reset: Bool) async {
        guard let sid = auth.schoolId else { return }
        busyId = p.id
        defer { busyId = nil }
        do {
            let res = try await EduAPI().manageCredential(action: reset ? "reset_password" : "recovery_link", userId: p.id, schoolId: sid)
            if let e = res.error { error = e; return }
            if reset, let pw = res.tempPassword {
                notice = ("Nouveau mot de passe temporaire", "\(res.username ?? "")\n\(pw)", "\(res.username ?? "")\n\(pw)")
                await load(reset: true)
            } else if let link = res.recoveryLink {
                UIPasteboard.general.string = link
                notice = ("Lien de réinitialisation copié", "Envoyez-le au parent.", link)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - New parent

private struct NewParentSheet: View {
    var onDone: ((String, String)?) -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var first = ""
    @State private var last = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var address = ""
    @State private var relationship = "pere"
    @State private var studentQuery = ""
    @State private var studentResults: [PersonRow] = []
    @State private var student: PersonRow?
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        EduFormSheet(title: "Nouveau parent", primary: saving ? "Création…" : "Créer", primaryDisabled: saving || first.trimmingCharacters(in: .whitespaces).isEmpty || last.trimmingCharacters(in: .whitespaces).isEmpty, busy: saving, onPrimary: { Task { await save() } }) {
                Section {
                    TextField("Prénom", text: $first).textContentType(.givenName)
                    TextField("Nom", text: $last).textContentType(.familyName)
                    TextField("Téléphone", text: $phone).keyboardType(.phonePad)
                    TextField("E-mail de contact (optionnel)", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    TextField("Adresse (optionnel)", text: $address)
                }
                Section("Élève à lier") {
                    Picker("Lien avec l’élève", selection: $relationship) {
                        Text("Père").tag("pere"); Text("Mère").tag("mere"); Text("Tuteur / Tutrice").tag("tuteur"); Text("Autre").tag("autre")
                    }
                    if let s = student {
                        HStack {
                            Text("\(s.fullName)\(s.className.map { " · \($0)" } ?? "")").foregroundStyle(EduTheme.ink)
                            Spacer()
                            Button("Changer") { student = nil }.font(.caption.weight(.semibold))
                        }
                    } else {
                        TextField("Rechercher un élève…", text: $studentQuery).textInputAutocapitalization(.never).autocorrectionDisabled()
                        ForEach(studentResults.prefix(6)) { r in
                            Button { student = r; studentQuery = "" } label: {
                                Text("\(r.fullName)\(r.className.map { " · \($0)" } ?? "")").foregroundStyle(EduTheme.ink)
                            }
                        }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(EduTheme.fasoRed) } }
            }
            
            
            
            .onChange(of: studentQuery) { _, q in
                Task {
                    let t = q.trimmingCharacters(in: .whitespaces)
                    guard t.count >= 2, let sid = auth.schoolId else { studentResults = []; return }
                    studentResults = (try? await EduAPI().fetchStudentsPage(schoolId: sid, classId: "", search: t, offset: 0).rows) ?? []
                }
            }

        .tint(EduTheme.teal)
        .preferredColorScheme(.light)
    }

    private func save() async {
        guard let sid = auth.schoolId else { return }
        saving = true
        defer { saving = false }
        var extra: [String: String] = ["relationship": relationship]
        if let s = student { extra["studentId"] = s.id }
        for (k, v) in [("phone", phone), ("contactEmail", email), ("address", address)] {
            let t = v.trimmingCharacters(in: .whitespaces)
            if !t.isEmpty { extra[k] = t }
        }
        do {
            let res = try await EduAPI().createUserAccount(role: "parent", schoolId: sid, firstName: first.trimmingCharacters(in: .whitespaces),
                                                          lastName: last.trimmingCharacters(in: .whitespaces), extra: extra)
            if let e = res.error { error = e; return }
            onDone(res.username.map { ($0, res.tempPassword ?? "—") })
            dismiss()
        } catch {
            self.error = "La création a échoué"
        }
    }
}
