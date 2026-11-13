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

            Text(step.message)
                .font(.subheadline)
                .foregroundStyle(EduTheme.ink.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)

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
                        .background(accent, in: Capsule())
                }
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
        guard !closing else { return }
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
