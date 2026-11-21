import SwiftUI
import UIKit

enum PdfShare {
    @MainActor
    static func present(data: Data, fileName: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            return
        }

        let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
              let root = scene.windows.first(where: \.isKeyWindow)?.rootViewController
                ?? scene.windows.first?.rootViewController
        else { return }

        var presenter = root
        while let presented = presenter.presentedViewController {
            presenter = presented
        }

        if let pop = activity.popoverPresentationController {
            pop.sourceView = presenter.view
            pop.sourceRect = CGRect(
                x: presenter.view.bounds.midX,
                y: presenter.view.bounds.midY,
                width: 1,
                height: 1
            )
            pop.permittedArrowDirections = []
        }
        presenter.present(activity, animated: true)
    }
}

enum PdfColors {
    static let ink = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
    static let muted = UIColor(red: 100 / 255, green: 116 / 255, blue: 139 / 255, alpha: 1)
    static let teal = UIColor(red: 15 / 255, green: 118 / 255, blue: 110 / 255, alpha: 1)
    static let navy = UIColor(red: 21 / 255, green: 48 / 255, blue: 100 / 255, alpha: 1)
    static let line = UIColor(red: 203 / 255, green: 213 / 255, blue: 225 / 255, alpha: 1)
    static let headerFill = UIColor(red: 241 / 255, green: 245 / 255, blue: 249 / 255, alpha: 1)

    static func uiColor(from color: Color) -> UIColor {
        UIColor(color)
    }
}
