import SwiftUI

// MARK: - Guided tour ("coach marks")
//
// How to add a tour to a screen:
// 1. Own a `CoachMarkRegistry` (@State) and pass it down with `.environment(registry)`.
// 2. Mark each element to explain with `.coachMarkTarget("some.id")`.
// 3. Describe the steps with `CoachMarkStep(id: "some.id", ...)` in the order to show them.
// 4. Present `CoachMarkOverlay` (see `ParentHomeView` for the full wiring: auto-start
//    once, scroll each target into view, replay button).

struct CoachMarkStep: Identifiable, Equatable {
    /// Same id as the `.coachMarkTarget(_:)` of the element to highlight.
    let id: String
    let icon: String
    let title: String
    let message: String
    /// Interactive step: the user must do something (shown by the screen's `actionView`)
    /// before « Suivant » is enabled.
    var requiresAction: Bool = false
    /// Message shown once the action is done.
    var doneMessage: String? = nil
}

/// Where each marked element currently is on screen (global coordinates).
@Observable
final class CoachMarkRegistry {
    var frames: [String: CGRect] = [:]

    func steps(_ all: [CoachMarkStep]) -> [CoachMarkStep] {
        all.filter { (frames[$0.id]?.isEmpty == false) }
    }
}

private struct CoachMarkTargetModifier: ViewModifier {
    let id: String
    @Environment(CoachMarkRegistry.self) private var registry: CoachMarkRegistry?

    func body(content: Content) -> some View {
        content
            .id(id)
            .onGeometryChange(for: CGRect.self) { proxy in
                proxy.frame(in: .global)
            } action: { frame in
                registry?.frames[id] = frame
            }
    }
}

extension View {
    /// Marks this view as a stop of a guided tour (and as a `ScrollViewReader` target).
    func coachMarkTarget(_ id: String) -> some View {
        modifier(CoachMarkTargetModifier(id: id))
    }
}

// MARK: - Spotlight

/// A full-screen dim with a rounded hole; the hole animates between targets.
private struct SpotlightShape: Shape {
    var rect: CGRect
    var cornerRadius: CGFloat

    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>> {
        get { AnimatablePair(AnimatablePair(rect.minX, rect.minY), AnimatablePair(rect.width, rect.height)) }
        set {
            rect = CGRect(
                x: newValue.first.first,
                y: newValue.first.second,
                width: newValue.second.first,
                height: newValue.second.second
            )
        }
    }

    func path(in bounds: CGRect) -> Path {
        var path = Path(bounds.insetBy(dx: -200, dy: -200))
        if rect.width > 0, rect.height > 0 {
            path.addRoundedRect(in: rect, cornerSize: CGSize(width: cornerRadius, height: cornerRadius), style: .continuous)
        }
        return path
    }
}

/// Small triangle used as the bubble's pointer.
private struct BubbleArrow: Shape {
    var pointsUp: Bool
    func path(in r: CGRect) -> Path {
        var p = Path()
        if pointsUp {
            p.move(to: CGPoint(x: r.midX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        } else {
            p.move(to: CGPoint(x: r.minX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.midX, y: r.maxY))
        }
        p.closeSubpath()
        return p
    }
}

// MARK: - Overlay

struct CoachMarkOverlay: View {
    let steps: [CoachMarkStep]
    @Binding var index: Int
    let registry: CoachMarkRegistry
    var accent: Color = EduTheme.teal
    /// Interactive steps: whether the action is done, and the controls to do it.
    var actionDone: Bool = false
    var actionView: ((CoachMarkStep) -> AnyView?)? = nil
    let onFinish: () -> Void

    @State private var bubbleHeight: CGFloat = 200
    @State private var appeared = false
    @State private var closing = false
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let gap: CGFloat = 12
    private let arrowSize = CGSize(width: 22, height: 12)
    private let screenMargin: CGFloat = 16

    private var step: CoachMarkStep? { steps.indices.contains(index) ? steps[index] : nil }
    private var isLast: Bool { index >= steps.count - 1 }
    private var waitingForAction: Bool { step?.requiresAction == true && !actionDone }

    var body: some View {
        GeometryReader { geo in
            let origin = geo.frame(in: .global).origin
            let target = currentTarget(origin: origin)
            let layout = bubbleLayout(target: target, in: geo.size, safeTop: geo.safeAreaInsets.top, safeBottom: geo.safeAreaInsets.bottom)

            ZStack(alignment: .topLeading) {
                SpotlightShape(rect: target, cornerRadius: 22)
                    .fill(Color.black.opacity(0.66), style: FillStyle(eoFill: true))
                    .contentShape(Rectangle())
                    .onTapGesture { next() }
                    .accessibilityHidden(true)

                // pulsing outline around the highlighted element
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(.white, lineWidth: 3)
                    .frame(width: max(target.width, 0), height: max(target.height, 0))
                    .scaleEffect(pulse ? 1.035 : 1)
                    .opacity(pulse ? 0.25 : 0.95)
                    .position(x: target.midX, y: target.midY)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                if let step {
                    bubble(step, arrowX: layout.arrowX, pointsUp: layout.below)
                        .frame(width: layout.width)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { bubbleHeight = $0 }
                        .position(x: layout.center.x, y: layout.center.y)
                        .id(step.id)
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                }
            }
            .animation(reduceMotion ? nil : .spring(duration: 0.45, bounce: 0.12), value: index)
        }
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.easeOut(duration: 0.25)) { appeared = true }
            if !reduceMotion {
                withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { pulse = true }
            }
        }
        .accessibilityAddTraits(.isModal)
    }

    // MARK: Geometry

    private func currentTarget(origin: CGPoint) -> CGRect {
        guard let step, let frame = registry.frames[step.id] else { return .zero }
        return frame.offsetBy(dx: -origin.x, dy: -origin.y).insetBy(dx: -6, dy: -6)
    }

    private struct Layout {
        let center: CGPoint
        let width: CGFloat
        let below: Bool
        let arrowX: CGFloat
    }

    private func bubbleLayout(target: CGRect, in size: CGSize, safeTop: CGFloat, safeBottom: CGFloat) -> Layout {
        let width = min(size.width - screenMargin * 2, 360)
        let total = bubbleHeight + arrowSize.height + gap
        let top = safeTop + 8
        let bottom = size.height - safeBottom - 8
        let spaceBelow = bottom - target.maxY
        let spaceAbove = target.minY - top
        let below = spaceBelow >= total || spaceBelow >= spaceAbove

        var centerY = below
            ? target.maxY + gap + arrowSize.height + bubbleHeight / 2
            : target.minY - gap - arrowSize.height - bubbleHeight / 2
        centerY = min(max(centerY, top + bubbleHeight / 2), bottom - bubbleHeight / 2)

        let centerX = min(max(target.midX, screenMargin + width / 2), size.width - screenMargin - width / 2)
        let leftEdge = centerX - width / 2
        let arrowX = min(max(target.midX - leftEdge, 30), width - 30)
        return Layout(center: CGPoint(x: centerX, y: centerY), width: width, below: below, arrowX: arrowX)
    }

    // MARK: Bubble

    private func bubble(_ step: CoachMarkStep, arrowX: CGFloat, pointsUp: Bool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: step.icon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(accent, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Étape \(index + 1) sur \(steps.count)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(EduTheme.muted)
                    Text(step.title)
                        .font(.headline)
                        .foregroundStyle(EduTheme.ink)
                }
                Spacer(minLength: 0)
            }

            Text(step.requiresAction && actionDone ? (step.doneMessage ?? step.message) : step.message)
                .font(.subheadline)
                .foregroundStyle(EduTheme.ink.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)

            if step.requiresAction {
                if actionDone {
                    Label("Bien joué !", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(accent)
                } else if let custom = actionView?(step) {
                    custom
                }
            }

            HStack(spacing: 10) {
                if !isLast {
                    Button("Passer") { close() }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EduTheme.muted)
                        .frame(minHeight: 44)
                }
                Spacer(minLength: 0)
                HStack(spacing: 5) {
                    ForEach(steps.indices, id: \.self) { i in
                        Capsule()
                            .fill(i == index ? accent : EduTheme.fieldBorder.opacity(0.5))
                            .frame(width: i == index ? 16 : 6, height: 6)
                    }
                }
                .accessibilityHidden(true)
                Spacer(minLength: 0)
                if index > 0 {
                    Button {
                        index -= 1
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(accent)
                            .frame(width: 44, height: 44)
                            .background(accent.opacity(0.1), in: Circle())
                    }
                    .accessibilityLabel("Étape précédente")
                }
                Button {
                    next()
                } label: {
                    Text(isLast ? "C’est parti !" : "Suivant")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .frame(minHeight: 44)
                        .background(accent.opacity(waitingForAction ? 0.35 : 1), in: Capsule())
                }
                .disabled(waitingForAction)
            }
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(alignment: pointsUp ? .topLeading : .bottomLeading) {
            BubbleArrow(pointsUp: pointsUp)
                .fill(.white)
                .frame(width: arrowSize.width, height: arrowSize.height)
                .offset(x: arrowX - arrowSize.width / 2, y: pointsUp ? -arrowSize.height + 1 : arrowSize.height - 1)
                .accessibilityHidden(true)
        }
        .shadow(color: .black.opacity(0.25), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
    }

    private func next() {
        guard !closing, !waitingForAction else { return }
        if isLast { close() } else { index += 1 }
    }

    /// Fade the whole overlay out on the current step, then hand back to the screen.
    private func close() {
        guard !closing else { return }
        closing = true
        withAnimation(.easeIn(duration: 0.2)) { appeared = false }
        Task {
            try? await Task.sleep(for: .milliseconds(220))
            onFinish()
        }
    }
}

// MARK: - Per-tab tour helper
//
// Every tab gets its own short tour. Usage in a screen:
//   @State private var tour = TabTour(key: "notes")
//   @State private var ownCoach = CoachMarkRegistry()
//   @Environment(CoachMarkRegistry.self) private var outerCoach: CoachMarkRegistry?
//   let coach = outerCoach ?? ownCoach        // shares targets with ChildGate's switcher
//   ScrollViewReader { proxy in ... .tabTour(tour, registry: coach, scroller: proxy) }
//   .environment(coach)
//   TourHelpButton { tour.start(steps, registry: coach) }   // replay
//   tour.autoStartOnce(steps, registry: coach)              // first visit, once data is shown

@Observable
final class TabTour {
    let key: String
    var steps: [CoachMarkStep] = []
    var index = 0
    var showing = false
    /// Interactive step done (e.g. the user switched child during the tour).
    var actionDone = false
    private var scheduled = false

    init(key: String) { self.key = "edufaso.tour.\(key).v1" }

    var done: Bool { UserDefaults.standard.bool(forKey: key) }

    func start(_ catalog: [CoachMarkStep], registry: CoachMarkRegistry) {
        let visible = registry.steps(catalog)
        guard !visible.isEmpty else { return }
        steps = visible
        index = 0
        actionDone = false
        var t = Transaction()
        t.disablesAnimations = true
        withTransaction(t) { showing = true }
    }

    /// First visit only: waits for the screen to settle, then runs the tour.
    func autoStartOnce(_ catalog: @escaping () -> [CoachMarkStep], registry: CoachMarkRegistry) {
        guard !done, !scheduled, !showing else { return }
        scheduled = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(900))
            self.start(catalog(), registry: registry)
        }
    }

    func finish() {
        UserDefaults.standard.set(true, forKey: key)
        var t = Transaction()
        t.disablesAnimations = true
        withTransaction(t) { showing = false }
    }
}

private struct TabTourModifier: ViewModifier {
    @Bindable var tour: TabTour
    let registry: CoachMarkRegistry
    let scroller: ScrollViewProxy?
    var actionView: ((CoachMarkStep) -> AnyView?)?

    func body(content: Content) -> some View {
        content
            .scrollDisabled(tour.showing)
            .onChange(of: tour.index) { _, i in
                guard tour.showing, tour.steps.indices.contains(i) else { return }
                withAnimation(.easeInOut(duration: 0.4)) { scroller?.scrollTo(tour.steps[i].id, anchor: .center) }
            }
            .onChange(of: tour.showing) { _, on in
                guard on, let first = tour.steps.first else { return }
                withAnimation(.easeInOut(duration: 0.4)) { scroller?.scrollTo(first.id, anchor: .center) }
            }
            // Drawn as an overlay of the scrolling content, not a full-screen cover: bars
            // pinned above the content (the child switcher) stay on top and tappable, so an
            // interactive step can ask the user to really use them.
            .overlay {
                if tour.showing {
                    CoachMarkOverlay(
                        steps: tour.steps,
                        index: $tour.index,
                        registry: registry,
                        actionDone: tour.actionDone,
                        actionView: actionView
                    ) { tour.finish() }
                        .ignoresSafeArea()
                }
            }
    }
}

extension View {
    func tabTour(
        _ tour: TabTour,
        registry: CoachMarkRegistry,
        scroller: ScrollViewProxy?,
        actionView: ((CoachMarkStep) -> AnyView?)? = nil
    ) -> some View {
        modifier(TabTourModifier(tour: tour, registry: registry, scroller: scroller, actionView: actionView))
    }
}

/// "?" button that replays a tab's tour. `onDark` for teal banners.
struct TourHelpButton: View {
    var onDark: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "questionmark")
                .font(.body.weight(.semibold))
                .foregroundStyle(onDark ? .white : EduTheme.ink)
                .frame(width: 40, height: 40)
                .background((onDark ? Color.white.opacity(0.12) : Color.white), in: RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                        .stroke(onDark ? Color.white.opacity(0.18) : EduTheme.border, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Revoir le guide de cette page")
    }
}
