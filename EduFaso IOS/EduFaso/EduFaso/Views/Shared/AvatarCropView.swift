import SwiftUI
import UIKit

/// Pan + pinch inside a circle, then export a square crop for the avatar.
struct AvatarCropView: View {
    let image: UIImage
    var onCancel: () -> Void
    var onCrop: (UIImage) -> Void

    @State private var scale: CGFloat = 1
    @State private var baseScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var baseOffset: CGSize = .zero
    @State private var displaySize: CGSize = .zero
    @State private var holeSide: CGFloat = 280

    private let outputSize: CGFloat = 512

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                let side = min(geo.size.width, geo.size.height) * 0.78

                ZStack {
                    Color.black.ignoresSafeArea()

                    Image(uiImage: image)
                        .resizable()
                        .frame(width: displaySize.width * scale, height: displaySize.height * scale)
                        .offset(offset)
                        .position(x: geo.size.width / 2, y: geo.size.height / 2)

                    CircleMask(holeSide: side)
                        .allowsHitTesting(false)

                    Circle()
                        .strokeBorder(.white.opacity(0.95), lineWidth: 2.5)
                        .frame(width: side, height: side)
                        .shadow(color: .black.opacity(0.35), radius: 6)
                        .allowsHitTesting(false)

                    VStack {
                        Spacer()
                        Text("Déplacez et pincez pour cadrer")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(.bottom, 28)
                    }
                }
                .contentShape(Rectangle())
                .gesture(dragGesture(hole: side))
                .simultaneousGesture(magnifyGesture(hole: side))
                .onAppear {
                    holeSide = side
                    resetLayout(hole: side)
                }
                .onChange(of: geo.size) { _, _ in
                    holeSide = side
                    resetLayout(hole: side)
                }
            }
            .navigationTitle("Cadrer la photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Utiliser") {
                        if let cropped = renderCrop() {
                            onCrop(cropped)
                        }
                    }
                    .fontWeight(.semibold)
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .preferredColorScheme(.dark)
        }
    }

    private func resetLayout(hole: CGFloat) {
        displaySize = coverSize(image.size, hole: hole)
        scale = 1
        baseScale = 1
        offset = .zero
        baseOffset = .zero
    }

    private func coverSize(_ imageSize: CGSize, hole: CGFloat) -> CGSize {
        guard imageSize.width > 0, imageSize.height > 0 else {
            return CGSize(width: hole, height: hole)
        }
        let s = max(hole / imageSize.width, hole / imageSize.height)
        return CGSize(width: imageSize.width * s, height: imageSize.height * s)
    }

    private func dragGesture(hole: CGFloat) -> some Gesture {
        DragGesture()
            .onChanged { value in
                offset = CGSize(
                    width: baseOffset.width + value.translation.width,
                    height: baseOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                clamp(hole: hole)
                baseOffset = offset
            }
    }

    private func magnifyGesture(hole: CGFloat) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = max(1, baseScale * value.magnification)
            }
            .onEnded { _ in
                scale = max(1, scale)
                baseScale = scale
                clamp(hole: hole)
                baseOffset = offset
            }
    }

    private func clamp(hole: CGFloat) {
        let w = displaySize.width * scale
        let h = displaySize.height * scale
        let maxX = max(0, (w - hole) / 2)
        let maxY = max(0, (h - hole) / 2)
        offset = CGSize(
            width: min(maxX, max(-maxX, offset.width)),
            height: min(maxY, max(-maxY, offset.height))
        )
    }

    /// Crop the circle region to a 512×512 square JPEG-ready image.
    private func renderCrop() -> UIImage? {
        let source = image.normalizedOrientation()
        let imgSize = source.size
        guard imgSize.width > 0, displaySize.width > 0, holeSide > 0 else { return nil }

        let dispW = displaySize.width * scale
        let pxPerPoint = imgSize.width / dispW
        let cropSide = holeSide * pxPerPoint

        // Positive offset moves the image right → crop window moves left in image space.
        let centerX = imgSize.width / 2 - offset.width * pxPerPoint
        let centerY = imgSize.height / 2 - offset.height * pxPerPoint

        var rect = CGRect(
            x: centerX - cropSide / 2,
            y: centerY - cropSide / 2,
            width: cropSide,
            height: cropSide
        )
        rect.origin.x = min(max(0, rect.origin.x), max(0, imgSize.width - rect.width))
        rect.origin.y = min(max(0, rect.origin.y), max(0, imgSize.height - rect.height))
        rect.size.width = min(rect.width, imgSize.width - rect.origin.x)
        rect.size.height = min(rect.height, imgSize.height - rect.origin.y)

        guard let cg = source.cgImage else { return nil }
        let s = source.scale
        let pixelRect = CGRect(
            x: rect.origin.x * s,
            y: rect.origin.y * s,
            width: rect.width * s,
            height: rect.height * s
        ).integral
        guard pixelRect.width > 1, pixelRect.height > 1,
              let croppedCG = cg.cropping(to: pixelRect) else { return nil }

        let cropped = UIImage(cgImage: croppedCG, scale: 1, orientation: .up)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: outputSize, height: outputSize),
            format: format
        )
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: outputSize, height: outputSize))
            cropped.draw(in: CGRect(x: 0, y: 0, width: outputSize, height: outputSize))
        }
    }
}

private struct CircleMask: View {
    var holeSide: CGFloat

    var body: some View {
        Canvas { context, size in
            let hole = CGRect(
                x: (size.width - holeSide) / 2,
                y: (size.height - holeSide) / 2,
                width: holeSide,
                height: holeSide
            )
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.black.opacity(0.58)))
            context.blendMode = .destinationOut
            context.fill(Path(ellipseIn: hole), with: .color(.black))
        }
        .compositingGroup()
        .allowsHitTesting(false)
    }
}

private extension UIImage {
    func normalizedOrientation() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
