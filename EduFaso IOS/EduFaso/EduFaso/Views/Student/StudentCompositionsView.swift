import SwiftUI

struct StudentCompositionsView: View {
    @EnvironmentObject private var auth: AuthViewModel
    var studentIdOverride: String? = nil
    @State private var sessions: [StudentCompositionSession] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading { LoadingBlock() }
                else if let error { Text(error).foregroundStyle(EduTheme.fasoRed).padding() }
                else if sessions.isEmpty {
                    PremiumEmpty(
                        title: "Aucune composition",
                        systemImage: "doc.on.doc",
                        message: "Aucune composition programmée pour le moment."
                    )
                } else {
                    List {
                        Section {
                            Text("Chaque composition regroupe les épreuves de ta classe. Les notes apparaissent dans « Mes notes » une fois saisies.")
                                .font(.footnote)
                                .foregroundStyle(EduTheme.muted)
                                .listRowBackground(EduTheme.brand50)
                        }
                        ForEach(sessions) { session in
                            Section {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(alignment: .firstTextBaseline) {
                                        Text(session.title?.isEmpty == false ? session.title! : "Composition")
                                            .font(.headline)
                                            .foregroundStyle(EduTheme.ink)
                                        Spacer()
                                        Text(session.statusLabel)
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(statusColor(session.statusLabel))
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(statusColor(session.statusLabel).opacity(0.12), in: Capsule())
                                    }
                                    Text([
                                        session.periodLabel,
                                        [session.startsOn, session.endsOn].compactMap { $0 }.joined(separator: " → "),
                                    ].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(EduTheme.muted)

                                    if session.papers.isEmpty {
                                        Text("Épreuves non encore publiées.")
                                            .font(.caption)
                                            .foregroundStyle(EduTheme.muted)
                                    } else {
                                        ForEach(session.papers) { paper in
                                            HStack {
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(paper.matieres?.name ?? "Matière")
                                                        .font(.subheadline.weight(.semibold))
                                                        .foregroundStyle(EduTheme.ink)
                                                    if let date = paper.evalDate {
                                                        Text(date).font(.caption).foregroundStyle(EduTheme.muted)
                                                    }
                                                }
                                                Spacer()
                                                if let start = paper.startTime, let end = paper.endTime {
                                                    Text("\(start.prefix(5))–\(end.prefix(5))")
                                                        .font(.caption.weight(.semibold).monospacedDigit())
                                                        .foregroundStyle(EduTheme.navy)
                                                }
                                            }
                                            .padding(10)
                                            .background(
                                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                                    .fill(Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255))
                                            )
                                        }
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                            .listRowBackground(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(.white)
                                    .padding(.vertical, 4)
                            )
                        }
                    }
                    .premiumListStyle()
                }
            }
        }
        .premiumTitle("Mes compositions")
        .task { await load() }
        .refreshable { await load() }
    }

    private func statusColor(_ label: String) -> Color {
        switch label {
        case "En cours": return .orange
        case "Terminée": return EduTheme.muted
        default: return EduTheme.teal
        }
    }

    private func load() async {
        let sid = studentIdOverride ?? auth.userId
        guard let sid else {
            loading = false
            error = "Compte introuvable."
            return
        }
        loading = sessions.isEmpty
        do {
            let api = EduAPI()
            guard let classId = try await api.activeEnrollment(studentId: sid)?.classId else {
                sessions = []
                error = nil
                loading = false
                return
            }
            sessions = try await api.fetchCompositionSessions(classSectionId: classId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
