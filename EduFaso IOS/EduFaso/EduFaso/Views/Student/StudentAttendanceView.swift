import SwiftUI

/// Présences page (student and parent), same as the web AttendanceBoard: period switch,
/// subject chips, summary (rate + counters that filter the list), calendar, absences and
/// lates by month, per-subject bars and « Écrire à l’école ». Has its own guided tour.
struct StudentAttendanceView: View {
    @EnvironmentObject private var auth: AuthViewModel
    /// The student's own screen: the tour speaks to them as "tu".
    private var isStudent: Bool { auth.primaryRole == .student && childName == nil }

    var studentIdOverride: String? = nil
    /// Parent view: the child's first name, shown in the titles.
    var childName: String? = nil
    /// When set (teacher viewing a student), only these subjects are available.
    var allowedSubjectIds: [String]? = nil

    private struct Period: Hashable {
        let key: String
        let label: String
        let from: String?
        let to: String?
    }

    @State private var periods: [Period] = []
    @State private var periodKey = "trimester"
    @State private var subjectId = ""
    @State private var status = ""   // "", absent, late, excused
    @State private var subjects: [(id: String, name: String)] = []
    @State private var bySubject: [SubjectAttendanceCount] = []
    @State private var totals: AttendanceTotals?
    @State private var rows: [AttendanceRow] = []
    @State private var dayStatus: [String: String] = [:]
    @State private var hasMore = false
    @State private var loadingMore = false
    @State private var ready = false
    @State private var listLoading = false
    @State private var error: String?

    // guided tour (shares targets with ChildGate's child switcher when there is one)
    @State private var tour = TabTour(key: "presences")
    @State private var ownCoach = CoachMarkRegistry()
    @Environment(CoachMarkRegistry.self) private var outerCoach: CoachMarkRegistry?
    private var coach: CoachMarkRegistry { outerCoach ?? ownCoach }

    private let pageSize = 30
    private static let brand800 = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255)
    private static let brand600 = Color(red: 13 / 255, green: 148 / 255, blue: 136 / 255)
    private static let emerald = Color(red: 16 / 255, green: 185 / 255, blue: 129 / 255)
    private static let rose = Color(red: 244 / 255, green: 63 / 255, blue: 94 / 255)
    private static let amber = Color(red: 251 / 255, green: 191 / 255, blue: 36 / 255)
    private static let sky = Color(red: 14 / 255, green: 165 / 255, blue: 233 / 255)
    private static let track = Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255)

    private var studentId: String? { studentIdOverride ?? auth.userId }
    private var isParent: Bool { auth.primaryRole == .parent }
    private var period: Period? { periods.first { $0.key == periodKey } ?? periods.first }

    private var title: String { childName.map { "Présences \(ParentHomeView.de($0))" } ?? "Mes présences" }

    private var tourSteps: [CoachMarkStep] {
        let who = childName ?? "toi"
        return [
            CoachMarkStep(
                id: "child.switcher", icon: "arrow.left.arrow.right",
                title: "Changer d’enfant",
                message: "Vous avez plusieurs enfants. Essayez maintenant : touchez le prénom d’un autre enfant dans la barre en haut.",
                requiresAction: true,
                doneMessage: "Voilà ! La page affiche maintenant les présences de cet enfant."
            ),
            CoachMarkStep(
                id: "presence.periods", icon: "calendar",
                title: "Choisir la période",
                message: "Ce mois, le Trimestre en cours, l’année ou tout l’historique. Les matières, en dessous, filtrent la page."
            ),
            CoachMarkStep(
                id: "presence.summary", icon: "checkmark.seal.fill",
                title: "Taux de présence",
                message: (isStudent ? "Un retard compte comme présent ; une absence justifiée ne compte pas contre toi." : "Un retard compte comme présent ; une absence justifiée ne compte pas contre \(who).")
            ),
            CoachMarkStep(
                id: "presence.counters", icon: "line.3.horizontal.decrease.circle",
                title: "Filtrer d’un geste",
                message: (isStudent ? "Touche un compteur (absences, retards, justifiées) pour n’afficher que ces cours dans la liste." : "Touchez un compteur (absences, retards, justifiées) pour n’afficher que ces cours dans la liste.")
            ),
            CoachMarkStep(
                id: "presence.calendar", icon: "square.grid.3x3.fill",
                title: "Calendrier",
                message: "Une case par jour de classe : vert présent, rouge absent, jaune retard, bleu justifié."
            ),
            CoachMarkStep(
                id: "presence.list", icon: "list.bullet",
                title: "Absences et retards",
                message: (isStudent ? "Chacune de tes absences ou chacun de tes retards, mois par mois, avec la matière et la note de l’école." : "Chaque absence ou retard, mois par mois, avec la matière et la note de l’école.")
            ),
            CoachMarkStep(
                id: "presence.subjects", icon: "chart.bar.fill",
                title: "Par matière",
                message: (isStudent ? "Depuis le début de l’année : ton taux de présence dans chaque matière." : "Depuis le début de l’année : le taux de présence de chaque matière.")
            ),
            CoachMarkStep(
                id: "presence.help", icon: "questionmark.circle.fill",
                title: "Revoir ce guide",
                message: (isStudent ? "Touche ce bouton à tout moment pour relancer la visite." : "Touchez ce bouton à tout moment pour relancer la visite.")
            ),
        ]
    }

    var body: some View {
        PremiumScreenChrome {
            Group {
                if !ready {
                    LoadingBlock()
                } else if let error {
                    Text(error).foregroundStyle(EduTheme.fasoRed).padding()
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 20) {
                                header
                                periodSwitch.coachMarkTarget("presence.periods")
                                if subjects.count > 1 { subjectChips }
                                if let totals, totals.total > 0 {
                                    summaryCard(totals).coachMarkTarget("presence.summary")
                                    counters(totals).coachMarkTarget("presence.counters")
                                    calendarCard.coachMarkTarget("presence.calendar")
                                    exceptionsCard.coachMarkTarget("presence.list")
                                    if !bySubject.isEmpty { subjectsCard.coachMarkTarget("presence.subjects") }
                                    if isParent || auth.primaryRole == .student { justifyCard }
                                } else {
                                    emptyCard("Aucun appel enregistré pour cette période.")
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                            .padding(.bottom, 32)
                        }
                        .refreshable { await bootstrap() }
                        .tabTour(tour, registry: coach, scroller: proxy)
                    }
                    .onAppear { tour.autoStartOnce({ tourSteps }, registry: coach) }
                }
            }
        }
        .environment(coach)
        .premiumTitle(title)
        .task(id: studentIdOverride) { await bootstrap() }
        .onChange(of: studentIdOverride) { _, _ in
            guard tour.showing, tour.steps.indices.contains(tour.index),
                  tour.steps[tour.index].requiresAction else { return }
            tour.steps[tour.index].doneMessage = "Voilà ! La page affiche maintenant les présences \(childName.map { ParentHomeView.de($0) } ?? "de cet enfant"). Le bouton plein, en haut, montre toujours l’enfant affiché."
            tour.actionDone = true
        }
        .onChange(of: periodKey) { _, _ in Task { await reloadScoped() } }
        .onChange(of: subjectId) { _, _ in Task { await reloadScoped() } }
        .onChange(of: status) { _, _ in Task { await reloadList(reset: true) } }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 26, weight: .bold))
                    .tracking(-0.3)
                    .foregroundStyle(EduTheme.ink)
                Text("Un retard compte comme présent ; une absence justifiée ne compte pas contre \(isParent ? (childName ?? "votre enfant") : "toi").")
                    .font(.subheadline)
                    .foregroundStyle(EduTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            TourHelpButton(onDark: false) { tour.start(tourSteps, registry: coach) }
                .coachMarkTarget("presence.help")
        }
    }

    private var periodSwitch: some View {
        HStack(spacing: 4) {
            ForEach(periods, id: \.key) { p in
                let on = p.key == period?.key
                Button {
                    withAnimation(.snappy(duration: 0.2)) { periodKey = p.key }
                } label: {
                    Text(p.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(on ? EduTheme.ink : EduTheme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background {
                            if on {
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .fill(.white)
                                    .shadow(color: .black.opacity(0.08), radius: 1, y: 1)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Self.track, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
        .sensoryFeedback(.selection, trigger: periodKey)
    }

    private var subjectChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("Toutes les matières", on: subjectId.isEmpty, dot: nil) { subjectId = "" }
                ForEach(subjects, id: \.id) { s in
                    chip(s.name, on: subjectId == s.id, dot: SubjectPalette.swatch(for: s.name).border) {
                        subjectId = subjectId == s.id ? "" : s.id
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func chip(_ text: String, on: Bool, dot: Color?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let dot { Circle().fill(dot).frame(width: 8, height: 8) }
                Text(text).font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(on ? .white : EduTheme.ink.opacity(0.8))
            .padding(.horizontal, 12)
            .frame(minHeight: 34)
            .background(on ? EduTheme.teal : .white, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(on ? EduTheme.teal : EduTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: Summary

    private func summaryCard(_ t: AttendanceTotals) -> some View {
        let rate = t.ratePercent
        return VStack(alignment: .leading, spacing: 8) {
            Text("PRÉSENCE · \((period?.label ?? "").uppercased())")
                .font(.caption.weight(.semibold))
                .tracking(1)
                .foregroundStyle(.white.opacity(0.7))
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(rate.map(String.init) ?? "—")
                    .font(.system(size: 48, weight: .bold).monospacedDigit())
                    .foregroundStyle(.white)
                Text("%").font(.title2.weight(.semibold)).foregroundStyle(.white.opacity(0.7))
            }
            Text("\(t.total - t.absent) cours sur \(t.total)")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.8))
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2).fill(.white.opacity(0.15))
                    RoundedRectangle(cornerRadius: 2).fill(Self.emerald)
                        .frame(width: geo.size.width * CGFloat(Double(rate ?? 0) / 100))
                }
            }
            .frame(height: 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            LinearGradient(colors: [Self.brand800, EduTheme.teal, Self.brand600], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
        .shadow(color: Self.brand800.opacity(0.25), radius: 12, y: 6)
    }

    private func counters(_ t: AttendanceTotals) -> some View {
        HStack(spacing: 10) {
            counter("person.fill.xmark", "Absences non justifiées", t.absent, key: "absent")
            counter("clock", "Retards", t.late, key: "late")
            counter("doc.badge.checkmark", "Absences justifiées", t.excused, key: "excused")
        }
    }

    private func counter(_ icon: String, _ label: String, _ value: Int, key: String) -> some View {
        let on = status == key
        return Button {
            withAnimation(.snappy(duration: 0.2)) { status = on ? "" : key }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon).foregroundStyle(EduTheme.subtle)
                Spacer(minLength: 0)
                Text("\(value)")
                    .font(.title.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.ink)
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(EduTheme.muted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, minHeight: 118, alignment: .leading)
            .padding(12)
            .background(.white, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(on ? EduTheme.teal : EduTheme.borderStrong.opacity(0.7), lineWidth: on ? 2 : 1)
            )
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: Calendar

    private var weeks: [[String]] {
        guard let range = calendarRange else { return [] }
        var out: [[String]] = []
        var monday = Self.startOfWeek(range.from)
        while monday <= range.to {
            out.append((0..<6).map { Self.addDays(monday, $0) })
            monday = Self.addDays(monday, 7)
        }
        return out
    }

    private var calendarRange: (from: String, to: String)? {
        let today = EduDates.day()
        let end = (period?.to).map { min($0, today) } ?? today
        let earliest = Self.startOfWeek(Self.addDays(end, -7 * 13))
        let start = (period?.from).map { max(Self.startOfWeek($0), earliest) } ?? earliest
        return (start, end)
    }

    private var calendarCard: some View {
        let today = EduDates.day()
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Calendrier").font(.headline.weight(.bold)).foregroundStyle(EduTheme.ink)
                Spacer()
                Text("\(weeks.count) semaine\(weeks.count > 1 ? "s" : "") · une case par jour de classe")
                    .font(.caption2)
                    .foregroundStyle(EduTheme.muted)
            }
            Grid(horizontalSpacing: 5, verticalSpacing: 5) {
                GridRow {
                    Text("")
                    ForEach(["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"], id: \.self) { d in
                        Text(d.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(EduTheme.muted)
                            .frame(maxWidth: .infinity)
                    }
                }
                ForEach(weeks, id: \.first) { week in
                    GridRow {
                        Text(Self.shortDate(week[0]))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(EduTheme.subtle)
                            .frame(width: 44, alignment: .trailing)
                        ForEach(week, id: \.self) { day in
                            let s = dayStatus[day]
                            let future = day > today
                            Text(Self.dayNumber(day))
                                .font(.system(size: 11, weight: .bold).monospacedDigit())
                                .foregroundStyle(s != nil ? .white : EduTheme.subtle)
                                .frame(maxWidth: .infinity, minHeight: 30)
                                .background(
                                    s.map { Self.statusColor($0) } ?? (future ? Color.clear : Self.track),
                                    in: RoundedRectangle(cornerRadius: 4, style: .continuous)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                                        .stroke(day == today ? EduTheme.teal : (future && s == nil ? EduTheme.border : .clear), lineWidth: day == today ? 2 : 1)
                                )
                                .accessibilityLabel("\(Self.longDate(day)) : \(s.map(Self.statusLabel) ?? (future ? "à venir" : "pas de cours"))")
                        }
                    }
                }
            }
            FlowLegend()
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    // MARK: Absences et retards

    private var exceptionsTitle: String {
        switch status {
        case "absent": return "Absences non justifiées"
        case "late": return "Retards"
        case "excused": return "Absences justifiées"
        default: return "Absences et retards"
        }
    }

    private var byMonth: [(month: String, rows: [AttendanceRow])] {
        var order: [String] = []
        var groups: [String: [AttendanceRow]] = [:]
        for r in rows {
            let key = String(r.date.prefix(7))
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append(r)
        }
        return order.map { ($0, groups[$0] ?? []) }
    }

    private var exceptionsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(exceptionsTitle).font(.headline.weight(.bold)).foregroundStyle(EduTheme.ink)
                Spacer()
                if !status.isEmpty {
                    Button("Tout afficher") { status = "" }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.teal)
                }
            }
            if listLoading {
                RoundedRectangle(cornerRadius: EduTheme.radius).fill(Self.track).frame(height: 80)
            } else if rows.isEmpty {
                Label("Aucune absence ni retard sur cette période. Bravo !", systemImage: "calendar.badge.checkmark")
                    .font(.subheadline)
                    .foregroundStyle(Color(red: 6 / 255, green: 95 / 255, blue: 70 / 255))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Self.emerald.opacity(0.1), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
            } else {
                ForEach(byMonth, id: \.month) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(Self.monthTitle(group.month).uppercased())
                            .font(.system(size: 11, weight: .bold))
                            .tracking(0.8)
                            .foregroundStyle(EduTheme.muted)
                        VStack(spacing: 0) {
                            ForEach(Array(group.rows.enumerated()), id: \.element.id) { index, r in
                                exceptionRow(r)
                                    .overlay(alignment: .top) {
                                        if index > 0 { Rectangle().fill(EduTheme.border).frame(height: 1) }
                                    }
                            }
                        }
                        .overlay(RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous).stroke(EduTheme.border, lineWidth: 1))
                    }
                }
                if hasMore {
                    Button {
                        Task { await loadMore() }
                    } label: {
                        Text(loadingMore ? "Chargement…" : "Afficher plus")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(EduTheme.teal, in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(loadingMore)
                }
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private func exceptionRow(_ r: AttendanceRow) -> some View {
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(Self.dayNumber(r.date))
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(EduTheme.ink)
                Text(Self.weekdayShort(r.date).uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(EduTheme.muted)
            }
            .frame(width: 40)
            RoundedRectangle(cornerRadius: 2)
                .fill(SubjectPalette.swatch(for: r.matieres?.name).border)
                .frame(width: 4, height: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.matieres?.name ?? "Cours")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EduTheme.ink)
                    .lineLimit(1)
                if let note = r.note, !note.isEmpty {
                    Text(note).font(.caption).foregroundStyle(EduTheme.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(Self.statusLabel(r.status))
                .font(.caption.weight(.bold))
                .foregroundStyle(Self.statusText(r.status))
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Self.statusColor(r.status).opacity(0.12), in: RoundedRectangle(cornerRadius: EduTheme.radius))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: Par matière

    private var subjectsCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Par matière").font(.headline.weight(.bold)).foregroundStyle(EduTheme.ink)
            Text("Depuis le début de l’année · rouge = absent, jaune = retard")
                .font(.caption)
                .foregroundStyle(EduTheme.muted)
                .padding(.bottom, 8)
            ForEach(bySubject) { s in
                let absent = s.absent ?? 0, late = s.late ?? 0, excused = s.excused ?? 0
                let total = absent + late + excused + (s.present ?? 0)
                let rate = total > 0 ? Int((Double(total - absent) / Double(total) * 100).rounded()) : 0
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Circle().fill(SubjectPalette.swatch(for: s.name).border).frame(width: 9, height: 9)
                        Text(s.name).font(.subheadline.weight(.medium)).foregroundStyle(EduTheme.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        Text([absent > 0 ? "\(absent) absence\(absent > 1 ? "s" : "")" : nil, late > 0 ? "\(late) retard\(late > 1 ? "s" : "")" : nil].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(EduTheme.muted)
                        Text("\(rate) %").font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(EduTheme.ink)
                    }
                    GeometryReader { geo in
                        HStack(spacing: 0) {
                            Self.rose.frame(width: total > 0 ? geo.size.width * CGFloat(absent) / CGFloat(total) : 0)
                            Self.amber.frame(width: total > 0 ? geo.size.width * CGFloat(late) / CGFloat(total) : 0)
                            Self.sky.frame(width: total > 0 ? geo.size.width * CGFloat(excused) / CGFloat(total) : 0)
                            Self.emerald
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 2))
                    }
                    .frame(height: 6)
                }
                .padding(.vertical, 5)
            }
        }
        .padding(16)
        .modifier(HomeCardStyle())
    }

    private var justifyCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(isParent ? "Une absence à justifier ?" : "Une absence à expliquer ?")
                .font(.headline.weight(.semibold))
                .foregroundStyle(EduTheme.ink)
            Text("\(isParent ? "Écrivez" : "Écris") à l’école : seule l’administration peut justifier une absence.")
                .font(.subheadline)
                .foregroundStyle(EduTheme.muted)
            WriteToSchoolButton(
                subject: childName.map { "Absence \(ParentHomeView.de($0))" } ?? "Mon absence",
                message: childName.map { "Bonjour,\n\nJe vous écris au sujet d’une absence \(ParentHomeView.de($0)) le … (matière : …).\n\nMotif : \n\nMerci et bonne journée." }
                    ?? "Bonjour,\n\nJe vous écris au sujet de mon absence le … (matière : …).\n\nMotif : \n\nMerci."
            )
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Self.track, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(EduTheme.borderStrong.opacity(0.7), lineWidth: 1))
    }

    private func emptyCard(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(EduTheme.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
            .modifier(HomeCardStyle())
    }

    // MARK: Loading

    private func bootstrap() async {
        error = nil
        let api = EduAPI()
        var base: [AttendancePeriod]
        if let ctx = try? await api.fetchAttendancePeriodContext() {
            base = AttendancePeriodBuilder.build(yearStart: ctx.start, yearEnd: ctx.end, custom: ctx.custom)
        } else {
            base = AttendancePeriodBuilder.build()
        }
        base = base.filter { $0.key != .all }
        // same choices as the web: Ce mois, the current Trimestre, Année, Tout
        let today = Date()
        let cal = Calendar.current
        let monthStart = cal.date(from: cal.dateComponents([.year, .month], from: today)) ?? today
        let monthEnd = cal.date(byAdding: DateComponents(month: 1, day: -1), to: monthStart) ?? today
        var list = [Period(key: "month", label: "Ce mois", from: EduDates.day(monthStart), to: EduDates.day(monthEnd))]
        if let current = ParentHomeLoader.currentTrimester(from: base) {
            list.append(Period(key: "trimester", label: current.label, from: current.from, to: current.to))
        }
        if let first = base.first?.from, let last = base.last?.to {
            list.append(Period(key: "year", label: "Année", from: first, to: last))
        }
        list.append(Period(key: "all", label: "Tout", from: nil, to: nil))
        periods = list
        if !list.contains(where: { $0.key == periodKey }) { periodKey = list.first?.key ?? "all" }

        if let sid = studentId, let counts = try? await api.fetchAttendanceCounts(studentId: sid) {
            var subjectList = (counts.bySubject ?? [])
                .compactMap { row -> (id: String, name: String)? in
                    guard let id = row.subjectId, !id.isEmpty else { return nil }
                    return (id, row.name)
                }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            var perSubject = (counts.bySubject ?? []).filter { ($0.present ?? 0) + ($0.absent ?? 0) + ($0.late ?? 0) + ($0.excused ?? 0) > 0 }
            if let allowed = allowedSubjectIds, !allowed.isEmpty {
                let set = Set(allowed)
                subjectList = subjectList.filter { set.contains($0.id) }
                perSubject = perSubject.filter { set.contains($0.subjectId ?? "") }
                if subjectId.isEmpty || !set.contains(subjectId) { subjectId = subjectList.first?.id ?? "" }
            }
            subjects = subjectList
            bySubject = perSubject.sorted {
                (($0.absent ?? 0), ($0.late ?? 0)) > (($1.absent ?? 0), ($1.late ?? 0))
                    || ((($0.absent ?? 0), ($0.late ?? 0)) == (($1.absent ?? 0), ($1.late ?? 0)) && $0.name < $1.name)
            }
        }
        await reloadScoped()
        ready = true
    }

    private func reloadScoped() async {
        guard let sid = studentId else {
            error = "Compte introuvable."
            return
        }
        let api = EduAPI()
        let p = period
        do {
            let fetchedTotals = try await api.fetchAttendanceTotals(
                studentId: sid, from: p?.from, to: p?.to,
                subjectId: subjectId.isEmpty ? nil : subjectId
            )
            if Task.isCancelled { return }
            totals = fetchedTotals
            if let range = calendarRange,
               let rowsInRange = try? await api.fetchAttendanceRange(studentId: sid, from: range.from, to: range.to, subjectId: subjectId.isEmpty ? nil : subjectId) {
                let rank = ["absent": 3, "late": 2, "excused": 1, "present": 0]
                var out: [String: String] = [:]
                for r in rowsInRange {
                    if let cur = out[r.date], (rank[cur] ?? 0) >= (rank[r.status] ?? 0) { continue }
                    out[r.date] = r.status
                }
                dayStatus = out
            }
            error = nil
            await reloadList(reset: true)
        } catch {
            if Task.isCancelled || error.isCancellation { return }
            self.error = error.localizedDescription
        }
    }

    private func reloadList(reset: Bool) async {
        guard let sid = studentId else { return }
        if reset { listLoading = true }
        let p = period
        do {
            let page = try await EduAPI().fetchAttendanceExceptions(
                studentId: sid, from: p?.from, to: p?.to,
                subjectId: subjectId.isEmpty ? nil : subjectId,
                status: status.isEmpty ? nil : status,
                offset: reset ? 0 : rows.count,
                limit: pageSize
            )
            if Task.isCancelled { return }
            rows = reset ? page : rows + page
            hasMore = page.count == pageSize
        } catch {
            if Task.isCancelled || error.isCancellation { return }
            self.error = error.localizedDescription
        }
        listLoading = false
    }

    private func loadMore() async {
        guard !loadingMore, hasMore else { return }
        loadingMore = true
        await reloadList(reset: false)
        loadingMore = false
    }

    // MARK: Helpers

    fileprivate static func statusColor(_ s: String) -> Color {
        switch s {
        case "absent": return rose
        case "late": return amber
        case "excused": return sky
        default: return emerald
        }
    }

    private static func statusText(_ s: String) -> Color {
        switch s {
        case "absent": return Color(red: 159 / 255, green: 18 / 255, blue: 57 / 255)
        case "late": return Color(red: 146 / 255, green: 64 / 255, blue: 14 / 255)
        case "excused": return Color(red: 7 / 255, green: 89 / 255, blue: 133 / 255)
        default: return Color(red: 6 / 255, green: 95 / 255, blue: 70 / 255)
        }
    }

    fileprivate static func statusLabel(_ s: String) -> String {
        switch s {
        case "absent": return "Absent"
        case "late": return "En retard"
        case "excused": return "Absence justifiée"
        default: return "Présent"
        }
    }

    private static func date(_ iso: String) -> Date? {
        let df = DateFormatter()
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(iso.prefix(10)))
    }

    private static func format(_ iso: String, _ pattern: String) -> String {
        guard let d = date(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = pattern
        return f.string(from: d)
    }

    private static func addDays(_ iso: String, _ n: Int) -> String {
        guard let d = date(iso), let r = Calendar(identifier: .gregorian).date(byAdding: .day, value: n, to: d) else { return iso }
        return EduDates.day(r)
    }

    /// Monday of the week containing `iso`.
    private static func startOfWeek(_ iso: String) -> String {
        guard let d = date(iso) else { return iso }
        let weekday = Calendar(identifier: .gregorian).component(.weekday, from: d) // 1 = Sunday
        let back = (weekday + 5) % 7
        return addDays(iso, -back)
    }

    private static func dayNumber(_ iso: String) -> String { format(iso, "d") }
    private static func shortDate(_ iso: String) -> String { format(iso, "d MMM").replacingOccurrences(of: ".", with: "") }
    private static func weekdayShort(_ iso: String) -> String { format(iso, "EEE").replacingOccurrences(of: ".", with: "") }
    private static func longDate(_ iso: String) -> String { format(iso, "EEEE d MMMM") }
    private static func monthTitle(_ month: String) -> String { format("\(month)-01", "MMMM yyyy") }
}

/// Colour key under the calendar.
private struct FlowLegend: View {
    var body: some View {
        let items: [(String, Color?)] = [
            ("Présent", StudentAttendanceView.statusColor("present")),
            ("Absent", StudentAttendanceView.statusColor("absent")),
            ("En retard", StudentAttendanceView.statusColor("late")),
            ("Justifiée", StudentAttendanceView.statusColor("excused")),
            ("Pas de cours", nil),
        ]
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8, alignment: .leading)], alignment: .leading, spacing: 6) {
            ForEach(items, id: \.0) { item in
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(item.1 ?? Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(item.1 == nil ? EduTheme.border : .clear, lineWidth: 1))
                        .frame(width: 12, height: 12)
                    Text(item.0).font(.caption).foregroundStyle(EduTheme.muted)
                }
            }
        }
    }
}
