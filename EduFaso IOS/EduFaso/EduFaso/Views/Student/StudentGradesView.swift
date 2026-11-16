import SwiftUI

/// Notes page (student and parent), same as the web: teal banner with the period
/// average, the annual average and the latest grade; period tabs; one card per
/// subject with its coefficient and grades. Averages use the class coefficients,
/// like the bulletin.
struct StudentGradesView: View {
    @EnvironmentObject private var auth: AuthViewModel
    var studentIdOverride: String? = nil
    /// Parent view: the child's first name, shown in the titles.
    var childName: String? = nil
    /// When set (teacher viewing a student), only these subjects are shown.
    var subjectIds: [String]? = nil

    @State private var rows: [GradeRow] = []
    @State private var coefficients: [String: Double] = [:]
    @State private var loading = true
    @State private var error: String?
    @State private var period: String = NotesMath.trimesters[0]
    @State private var didPickPeriod = false

    // guided tour (shares targets with ChildGate's child switcher when there is one)
    @State private var tour = TabTour(key: "notes.v3")
    @State private var ownCoach = CoachMarkRegistry()
    @Environment(CoachMarkRegistry.self) private var outerCoach: CoachMarkRegistry?
    private var coach: CoachMarkRegistry { outerCoach ?? ownCoach }

    private var tourSteps: [CoachMarkStep] {
        let who = childName ?? "vous"
        let whose = childName.map { Self.de($0) } ?? "de vos notes"
        return [
            CoachMarkStep(
                id: "child.switcher", icon: "arrow.left.arrow.right",
                title: "Changer d’enfant",
                message: "Vous avez plusieurs enfants. Essayez maintenant : touchez le prénom d’un autre enfant dans la barre en haut.",
                requiresAction: true,
                doneMessage: "Voilà ! La page affiche maintenant les notes \(childName.map { Self.de($0) } ?? "de cet enfant"). Le bouton plein, en haut, montre toujours l’enfant affiché : revenez à un autre enfant de la même façon."
            ),
            CoachMarkStep(
                id: "notes.stats", icon: "chart.bar.fill",
                title: "Les moyennes",
                message: "Moyenne du Trimestre choisi avec sa mention, moyenne de l’année (touchez-la pour le bulletin) et nombre de notes. Elles utilisent les coefficients de la classe, comme le bulletin."
            ),
            CoachMarkStep(
                id: "notes.latest", icon: "pencil.line",
                title: "Dernière note",
                message: "La note la plus récente publiée pour \(who), avec sa matière et sa date."
            ),
            CoachMarkStep(
                id: "notes.tabs", icon: "calendar",
                title: "Choisir la période",
                message: "Trimestre 1, 2, 3 ou l’année entière. Le chiffre indique combien de notes chaque période contient."
            ),
            CoachMarkStep(
                id: "notes.subject", icon: "book.fill",
                title: "Une carte par matière",
                message: "Coefficient, moyenne de la matière (\(whose)) et chaque note avec sa date, son type et le commentaire de l’enseignant."
            ),
            CoachMarkStep(
                id: "notes.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: "Touchez ce bouton à tout moment pour relancer la visite."
            ),
        ]
    }

    private static let annual = "Année"
    private var periods: [String] { NotesMath.trimesters + [Self.annual] }
    private var isAnnual: Bool { period == Self.annual }

    private static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    private static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)
    private static let brand50 = Color(red: 240 / 255, green: 253 / 255, blue: 250 / 255)
    private static let rose = Color(red: 225 / 255, green: 29 / 255, blue: 72 / 255)
    private static let emerald = Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)
    private static let softFill = Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)

    private var annualResult: NotesMath.Annual { NotesMath.annual(rows, coefficients: coefficients) }

    private var periodRows: [GradeRow] {
        isAnnual ? rows : rows.filter { $0.periodLabel == period }
    }

    private var periodAverage: Double? {
        isAnnual ? annualResult.average : NotesMath.weighted(periodRows, coefficients: coefficients).general
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if loading {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 20, pinnedViews: [.sectionHeaders]) {
                                banner
                                Section {
                                    content
                                } header: {
                                    periodTabs.coachMarkTarget("notes.tabs")
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                            .padding(.bottom, 32)
                        }
                        .refreshable { await load() }
                        .tabTour(tour, registry: coach, scroller: proxy)
                    }
                    .onAppear { tour.autoStartOnce({ tourSteps }, registry: coach) }
                }
            }
        }
        .environment(coach)
        .premiumTitle(childName.map { "Notes \(Self.de($0))" } ?? "Mes notes")
        .task(id: studentIdOverride) { await load() }
        .onChange(of: studentIdOverride) { _, _ in
            // interactive step: the parent really used the bar at the top
            guard tour.showing, tour.steps.indices.contains(tour.index),
                  tour.steps[tour.index].requiresAction else { return }
            let name = childName ?? "cet enfant"
            tour.steps[tour.index].doneMessage = "Voilà ! La page affiche maintenant les notes \(Self.de(name)). Le bouton plein, en haut, montre toujours l’enfant affiché : revenez à un autre enfant de la même façon."
            tour.actionDone = true
        }
    }

    // MARK: Banner

    private var banner: some View {
        let annual = annualResult
        let index = NotesMath.trimesters.firstIndex(of: period)
        let previous = (index ?? 0) > 0 ? annual.trimesters[index! - 1].average : nil
        let delta: Double? = (!isAnnual && periodAverage != nil && previous != nil) ? periodAverage! - previous! : nil
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(childName.map { "Résultats scolaires · \($0)" } ?? "Résultats scolaires")
                        .font(.caption.weight(.semibold))
                        .tracking(1.4)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.7))
                    Text(childName.map { "Notes \(Self.de($0))" } ?? "Mes notes")
                        .font(.system(size: 28, weight: .bold))
                        .tracking(-0.4)
                        .foregroundStyle(.white)
                    Text("Moyennes calculées avec les coefficients de la classe, comme sur le bulletin.")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                }
                    Spacer(minLength: 0)
                    TourHelpButton { tour.start(tourSteps, registry: coach) }
                        .coachMarkTarget("notes.help")
                }

                HStack(alignment: .top, spacing: 10) {
                    bannerStat(
                        label: isAnnual ? "Moyenne annuelle" : period,
                        value: periodAverage.map { NotesMath.format($0, 2) } ?? "—"
                    ) {
                        if periodAverage == nil {
                            Text("Pas encore de note")
                        } else if isAnnual {
                            Text(annual.decision + (annual.complete ? "" : " · provisoire"))
                        } else {
                            HStack(spacing: 4) {
                                Text(NotesMath.mention(periodAverage))
                                if let delta, abs(delta) > 0.05 {
                                    Label(NotesMath.format(abs(delta), 1), systemImage: delta > 0 ? "arrow.up.right" : "arrow.down.right")
                                        .labelStyle(.titleAndIcon)
                                        .font(.caption2.weight(.bold))
                                        .padding(.horizontal, 4)
                                        .background((delta > 0 ? Color.green : Color.red).opacity(0.3), in: RoundedRectangle(cornerRadius: 3))
                                }
                            }
                        }
                    }
                    NavigationLink {
                        if let sid = studentIdOverride ?? auth.userId {
                            BulletinBoard(studentId: sid, title: childName == nil ? "Mon bulletin" : "Bulletin")
                        }
                    } label: {
                        bannerStat(label: "Moyenne annuelle", value: annual.average.map { NotesMath.format($0, 2) } ?? "—") {
                            Text(annual.average == nil ? "Pas encore de note" : annual.decision + (annual.complete ? "" : " · provisoire"))
                        }
                    }
                    .buttonStyle(.plain)
                    bannerStat(label: isAnnual ? "Notes publiées" : "Notes \(period)", value: "\(periodRows.count)") {
                        Text(isAnnual ? "depuis le début de l’année" : "sur ce Trimestre")
                    }
                }
                .coachMarkTarget("notes.stats")

                latestGradeCard.coachMarkTarget("notes.latest")
            }
            .padding(20)

            HStack(spacing: 0) {
                EduTheme.fasoRed
                EduTheme.fasoYellow
                EduTheme.fasoGreen
            }
            .frame(height: 4)
            .accessibilityHidden(true)
        }
        .background {
            ZStack {
                LinearGradient(colors: [Self.brand800, EduTheme.teal, Self.brand600], startPoint: .topLeading, endPoint: .bottomTrailing)
                Circle().fill(.white.opacity(0.06)).frame(width: 260, height: 260).offset(x: 150, y: -120)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Self.brand800.opacity(0.25), radius: 14, y: 8)
    }

    private func bannerStat<Hint: View>(label: String, value: String, @ViewBuilder hint: () -> Hint) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Text(value)
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            hint()
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .padding(10)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    @ViewBuilder private var latestGradeCard: some View {
        let latest = periodRows.max { ($0.createdAt ?? "") < ($1.createdAt ?? "") }
        if let g = latest {
            let on20 = NotesMath.on20(g)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("DERNIÈRE NOTE", systemImage: "pencil.line")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color(red: 224 / 255, green: 242 / 255, blue: 254 / 255), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    Spacer()
                    if let date = g.evaluations?.evalDate ?? g.createdAt {
                        Text(NotesMath.longDay(date))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(EduTheme.muted)
                    }
                }
                HStack(alignment: .bottom, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(g.matieres?.name ?? "Matière")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(EduTheme.ink)
                            .lineLimit(1)
                        Text([g.evaluations?.type.map(NotesMath.typeLabel), g.evaluations?.title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.subheadline)
                            .foregroundStyle(EduTheme.muted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if g.isAbsent == true {
                        Text("Absent").font(.title2.weight(.bold)).foregroundStyle(EduTheme.subtle)
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 1) {
                            Text(NotesMath.plain(g.score))
                                .font(.system(size: 30, weight: .bold).monospacedDigit())
                                .foregroundStyle((on20 ?? 20) < 10 ? Self.rose : EduTheme.ink)
                            Text("/\(NotesMath.plain(g.maxScore))")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(EduTheme.subtle)
                        }
                    }
                }
            }
            .padding(16)
            .background(.white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("DERNIÈRE NOTE")
                    .font(.caption2.weight(.semibold)).tracking(1)
                    .foregroundStyle(.white.opacity(0.7))
                Text("Aucune note pour le moment")
                    .font(.headline)
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        }
    }

    // MARK: Period tabs (sticky)

    private var periodTabs: some View {
        HStack(spacing: 4) {
            ForEach(periods, id: \.self) { p in
                let active = p == period
                let count = p == Self.annual ? rows.count : rows.filter { $0.periodLabel == p }.count
                Button {
                    withAnimation(.snappy(duration: 0.2)) { period = p; didPickPeriod = true }
                } label: {
                    VStack(spacing: 1) {
                        Text(p)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        Text("\(count) note\(count > 1 ? "s" : "")")
                            .font(.caption2)
                            .foregroundStyle(active ? .white.opacity(0.8) : EduTheme.muted)
                    }
                    .foregroundStyle(active ? .white : Self.brand800)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background {
                        if active {
                            RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).fill(EduTheme.teal)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(4)
        .background(Self.brand50, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color(red: 153 / 255, green: 246 / 255, blue: 228 / 255), lineWidth: 1))
        .padding(.vertical, 6)
        .background(EduTheme.page)
        .sensoryFeedback(.selection, trigger: period)
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        if rows.isEmpty {
            emptyCard("Aucune note disponible.")
        } else if isAnnual {
            VStack(alignment: .leading, spacing: 24) {
                if annualResult.average != nil { annualCard }
                let shown = NotesMath.trimesters.filter { p in rows.contains { $0.periodLabel == p } }
                ForEach(shown, id: \.self) { p in
                    periodSection(p, rows.filter { $0.periodLabel == p }, markFirst: p == shown.first)
                }
            }
        } else if periodRows.isEmpty {
            emptyCard("Aucune note pour \(period) pour le moment.")
        } else {
            periodSection(period, periodRows)
        }
    }

    private var annualCard: some View {
        let a = annualResult
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Moyenne annuelle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Text("Moyenne des trimestres notés (\(a.count) sur 3)\(a.complete ? "" : " · provisoire") · admis à partir de 10 / 20")
                    .font(.caption)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(a.average.map { NotesMath.format($0, 2) } ?? "—")
                        .font(.title2.weight(.bold).monospacedDigit())
                        .foregroundStyle(Self.scoreColor(a.average))
                    Text("/ 20").font(.subheadline.weight(.semibold)).foregroundStyle(EduTheme.muted)
                }
                Text(a.decision)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(a.passed == true ? Self.emerald : Color(red: 180 / 255, green: 83 / 255, blue: 9 / 255))
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background((a.passed == true ? Self.emerald : Color.orange).opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
            }
        }
        .padding(16)
        .background(Self.brand50, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color(red: 153 / 255, green: 246 / 255, blue: 228 / 255), lineWidth: 1))
    }

    /// `markFirst`: its first subject card is the tour's « Une carte par matière » stop.
    private func periodSection(_ label: String, _ list: [GradeRow], markFirst: Bool = true) -> some View {
        let result = NotesMath.weighted(list, coefficients: coefficients)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .lastTextBaseline) {
                Text(label)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                Spacer()
                Text("Moyenne générale")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                Text(result.general.map { NotesMath.format($0, 2) } ?? "—")
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(Self.scoreColor(result.general))
                Text("/ 20").font(.subheadline).foregroundStyle(EduTheme.muted)
            }
            .padding(.bottom, 6)
            .overlay(alignment: .bottom) { Rectangle().fill(EduTheme.borderStrong.opacity(0.7)).frame(height: 1) }

            ForEach(Array(result.subjects.enumerated()), id: \.element.id) { index, subject in
                let card = subjectCard(subject, list.filter { ($0.subjectId ?? $0.matieres?.id ?? $0.matieres?.name) == subject.id })
                if index == 0 && markFirst {
                    card.coachMarkTarget("notes.subject")
                } else {
                    card
                }
            }
        }
    }

    private func subjectCard(_ subject: NotesMath.Subject, _ grades: [GradeRow]) -> some View {
        let sorted = grades.sorted { ($0.evaluations?.evalDate ?? $0.createdAt ?? "") > ($1.evaluations?.evalDate ?? $1.createdAt ?? "") }
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(subject.name)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(EduTheme.ink)
                        Text("Coef. \(NotesMath.plain(subject.coefficient)) · \(grades.count) note\(grades.count > 1 ? "s" : "")")
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                    }
                    Spacer(minLength: 8)
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text(subject.average.map { NotesMath.format($0, 2) } ?? "—")
                            .font(.title2.weight(.bold).monospacedDigit())
                            .foregroundStyle(Self.scoreColor(subject.average))
                        Text("/20").font(.caption.weight(.semibold)).foregroundStyle(EduTheme.subtle)
                    }
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
                        Capsule()
                            .fill(Self.barColor(subject.average))
                            .frame(width: geo.size.width * CGFloat(min(max((subject.average ?? 0) / 20, 0), 1)))
                        Rectangle().fill(EduTheme.subtle.opacity(0.6)).frame(width: 1).offset(x: geo.size.width / 2)
                    }
                }
                .frame(height: 6)
            }
            .padding(14)

            ForEach(sorted) { g in
                gradeRow(g, subjectName: subject.name)
                    .overlay(alignment: .top) { Rectangle().fill(EduTheme.border).frame(height: 1) }
            }
        }
        .modifier(HomeCardStyle())
    }

    private func gradeRow(_ g: GradeRow, subjectName: String) -> some View {
        let absent = g.isAbsent == true
        let on20 = NotesMath.on20(g)
        let date = g.evaluations?.evalDate
        let title = NotesMath.cleanTitle(g.evaluations?.title, subject: subjectName)
        return HStack(spacing: 12) {
            VStack(spacing: 0) {
                if let date, let parts = NotesMath.dayMonth(date) {
                    Text(parts.day).font(.subheadline.weight(.bold)).foregroundStyle(EduTheme.ink.opacity(0.8))
                    Text(parts.month).font(.caption2).foregroundStyle(EduTheme.muted)
                } else {
                    Text("—").font(.caption).foregroundStyle(EduTheme.muted)
                }
            }
            .frame(width: 40)

            VStack(alignment: .leading, spacing: 2) {
                if let type = g.evaluations?.type, !type.isEmpty {
                    HStack(spacing: 6) {
                        Text(NotesMath.typeShort(type).uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(Self.typeColor(type))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Self.typeColor(type).opacity(0.1), in: RoundedRectangle(cornerRadius: 3))
                        Text(title.isEmpty ? NotesMath.typeLabel(type) : title)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(EduTheme.ink)
                            .lineLimit(1)
                    }
                } else {
                    Text("Note").font(.subheadline).foregroundStyle(EduTheme.muted)
                }
                if let comment = g.comment?.trimmingCharacters(in: .whitespacesAndNewlines), !comment.isEmpty {
                    Text("« \(comment) »")
                        .font(.caption.italic())
                        .foregroundStyle(EduTheme.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if absent {
                Text("Absent")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color(red: 255 / 255, green: 251 / 255, blue: 235 / 255), in: RoundedRectangle(cornerRadius: EduTheme.radius))
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(NotesMath.plain(g.score))
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundStyle(Self.scoreColor(on20))
                    Text("/\(NotesMath.plain(g.maxScore))")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(EduTheme.subtle)
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Self.scoreFill(on20), in: RoundedRectangle(cornerRadius: EduTheme.radius))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func emptyCard(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
            .background(Self.softFill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(EduTheme.borderStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
    }

    // MARK: Colours

    private static func scoreColor(_ v: Double?) -> Color {
        guard let v else { return EduTheme.muted }
        if v >= 14 { return emerald }
        if v >= 10 { return EduTheme.ink }
        return rose
    }

    private static func scoreFill(_ v: Double?) -> Color {
        guard let v else { return softFill }
        if v >= 14 { return emerald.opacity(0.1) }
        if v >= 10 { return softFill }
        return rose.opacity(0.08)
    }

    private static func barColor(_ v: Double?) -> Color {
        guard let v else { return .clear }
        if v >= 14 { return emerald }
        if v >= 10 { return EduTheme.teal }
        return rose
    }

    private static func typeColor(_ type: String) -> Color {
        switch type {
        case "examen": return rose
        case "composition": return emerald
        case "interrogation": return Color(red: 2 / 255, green: 132 / 255, blue: 199 / 255)
        default: return Color(red: 100 / 255, green: 116 / 255, blue: 139 / 255)
        }
    }

    static func de(_ name: String) -> String { ParentHomeView.de(name) }

    // MARK: Loading

    private func load() async {
        let sid = studentIdOverride ?? auth.userId
        guard let sid else {
            loading = false
            error = "Compte introuvable."
            return
        }
        loading = rows.isEmpty
        let api = EduAPI()
        do {
            async let gradesTask = api.fetchGrades(studentId: sid, subjectIds: subjectIds)
            async let enrollmentTask = api.activeEnrollment(studentId: sid)
            async let periodTask = api.fetchAttendancePeriodContext()
            rows = try await gradesTask
            if let classId = (try? await enrollmentTask)??.classId {
                coefficients = await api.fetchClassCoefficients(classId: classId)
            }
            // open on the current Trimestre, like the web
            if !didPickPeriod {
                let periodsList: [AttendancePeriod]
                if let ctx = try? await periodTask {
                    periodsList = AttendancePeriodBuilder.build(yearStart: ctx.start, yearEnd: ctx.end, custom: ctx.custom)
                } else {
                    periodsList = AttendancePeriodBuilder.build()
                }
                if let current = ParentHomeLoader.currentTrimester(from: periodsList)?.label, periods.contains(current) {
                    period = current
                }
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

// MARK: - Averages (same rules as the web, src/lib/averages.ts)

enum NotesMath {
    static let trimesters = ["Trimestre 1", "Trimestre 2", "Trimestre 3"]

    struct Subject {
        let id: String
        let name: String
        let coefficient: Double
        let average: Double?
    }

    struct Weighted {
        let general: Double?
        let subjects: [Subject]
    }

    struct Trimester {
        let label: String
        let average: Double?
    }

    struct Annual {
        let trimesters: [Trimester]
        let average: Double?
        let count: Int
        let complete: Bool
        let passed: Bool?

        var decision: String {
            guard let passed, average != nil else { return "—" }
            if !complete { return passed ? "En cours (≥ 10)" : "En cours (< 10)" }
            return passed ? "Admis" : "Ajourné"
        }
    }

    static func on20(_ g: GradeRow) -> Double? {
        if g.isAbsent == true { return nil }
        guard let s = g.score, let m = g.maxScore, m > 0 else { return nil }
        return s / m * 20
    }

    /// Subject average = mean of its grades on 20; general = coefficient-weighted mean of subjects.
    static func weighted(_ grades: [GradeRow], coefficients: [String: Double]) -> Weighted {
        var order: [String] = []
        var bucket: [String: (name: String, coef: Double, scores: [Double], count: Int)] = [:]
        for g in grades {
            let key = g.subjectId ?? g.matieres?.id ?? g.matieres?.name ?? "?"
            if bucket[key] == nil {
                order.append(key)
                bucket[key] = (g.matieres?.name ?? "Matière", coefficients[key] ?? 1, [], 0)
            }
            bucket[key]!.count += 1
            if let v = on20(g) { bucket[key]!.scores.append(v) }
        }
        var subjects: [Subject] = []
        var sum = 0.0, coefs = 0.0
        for key in order {
            guard let b = bucket[key] else { continue }
            let avg = b.scores.isEmpty ? nil : b.scores.reduce(0, +) / Double(b.scores.count)
            subjects.append(Subject(id: key, name: b.name, coefficient: b.coef, average: avg))
            if let avg { sum += avg * b.coef; coefs += b.coef }
        }
        subjects.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return Weighted(general: coefs > 0 ? sum / coefs : nil, subjects: subjects)
    }

    static func annual(_ grades: [GradeRow], coefficients: [String: Double]) -> Annual {
        let ts = trimesters.map { label in
            Trimester(label: label, average: weighted(grades.filter { $0.periodLabel == label }, coefficients: coefficients).general)
        }
        let available = ts.compactMap(\.average)
        let avg = available.isEmpty ? nil : available.reduce(0, +) / Double(available.count)
        return Annual(trimesters: ts, average: avg, count: available.count, complete: available.count == trimesters.count, passed: avg.map { $0 >= 10 })
    }

    static func mention(_ v: Double?) -> String {
        guard let v else { return "—" }
        if v >= 16 { return "Félicitations" }
        if v >= 14 { return "Encouragements" }
        if v >= 12 { return "Compliments" }
        if v >= 10 { return "Passable" }
        return "Insuffisant"
    }

    static func typeLabel(_ type: String) -> String {
        switch type {
        case "interrogation": return "Interrogation"
        case "devoir": return "Exercice de maison"
        case "examen": return "Devoir"
        case "composition": return "Composition"
        default: return type.capitalized
        }
    }

    static func typeShort(_ type: String) -> String {
        switch type {
        case "interrogation": return "Interro"
        case "devoir": return "Exercice"
        case "examen": return "Devoir"
        case "composition": return "Compo"
        default: return type
        }
    }

    /// Drop a title that only repeats the subject name.
    static func cleanTitle(_ title: String?, subject: String) -> String {
        let t = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return t.caseInsensitiveCompare(subject) == .orderedSame ? "" : t
    }

    static func format(_ v: Double, _ digits: Int) -> String {
        let nf = NumberFormatter()
        nf.locale = Locale(identifier: "fr_FR")
        nf.minimumFractionDigits = digits
        nf.maximumFractionDigits = digits
        return nf.string(from: NSNumber(value: v)) ?? String(format: "%.\(digits)f", v)
    }

    /// 15 → "15", 12.5 → "12,5"
    static func plain(_ v: Double?) -> String {
        guard let v else { return "—" }
        if v == v.rounded() { return String(Int(v)) }
        return format(v, 1)
    }

    private static func parse(_ iso: String) -> Date? {
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(iso.prefix(10)))
    }

    static func dayMonth(_ iso: String) -> (day: String, month: String)? {
        guard let d = parse(iso) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d"
        let day = f.string(from: d)
        f.dateFormat = "MMM"
        return (day, f.string(from: d))
    }

    static func longDay(_ iso: String) -> String {
        guard let d = parse(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "d MMMM"
        return f.string(from: d)
    }
}
