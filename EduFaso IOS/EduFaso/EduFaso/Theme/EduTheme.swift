import SwiftUI

enum EduTheme {
    // Web tokens from src/index.css
    static let teal = Color(red: 15 / 255, green: 118 / 255, blue: 110 / 255) // brand-700 #0f766e
    static let tealDark = Color(red: 17 / 255, green: 94 / 255, blue: 89 / 255) // brand-800
    static let brand50 = Color(red: 240 / 255, green: 253 / 255, blue: 250 / 255) // #f0fdfa
    static let navy = Color(red: 21 / 255, green: 48 / 255, blue: 100 / 255) // navy-700 #153064
    static let navyDark = Color(red: 15 / 255, green: 36 / 255, blue: 80 / 255) // navy-800
    static let fasoRed = Color(red: 212 / 255, green: 55 / 255, blue: 46 / 255) // #d4372e
    static let fasoYellow = Color(red: 239 / 255, green: 172 / 255, blue: 66 / 255) // #efac42
    static let fasoGreen = Color(red: 75 / 255, green: 143 / 255, blue: 74 / 255) // #4b8f4a
    static let sand = Color(red: 245 / 255, green: 247 / 255, blue: 250 / 255)
    static let ink = Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)
    static let muted = Color(red: 100 / 255, green: 116 / 255, blue: 139 / 255)
    static let fieldBorder = Color(red: 148 / 255, green: 163 / 255, blue: 184 / 255)

    // Redesign tokens (same as the web redesign): flat page, white surfaces,
    // thin slate borders, small square-ish radius, colour only for status.
    static let page = Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255) // slate-50
    static let border = Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255) // slate-200
    static let borderStrong = Color(red: 203 / 255, green: 213 / 255, blue: 225 / 255) // slate-300
    static let subtle = Color(red: 148 / 255, green: 163 / 255, blue: 184 / 255) // slate-400
    static let accent = teal
    static let radius: CGFloat = 6

    /// Kept for the screens that still use it: now a flat page colour, no gradient.
    static var loginBackground: LinearGradient {
        LinearGradient(colors: [page, page], startPoint: .top, endPoint: .bottom)
    }
}

/// White surface with a thin border and the small radius.
struct EduSurface: ViewModifier {
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .fill(.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: EduTheme.radius, style: .continuous)
                    .stroke(EduTheme.border, lineWidth: 1)
            )
    }
}

extension View {
    func eduSurface(padding: CGFloat = 16) -> some View {
        modifier(EduSurface(padding: padding))
    }
}

/// The three-colour flag line used as a quiet brand mark.
struct EduFlagStripe: View {
    var width: CGFloat = 22
    var body: some View {
        HStack(spacing: 3) {
            Rectangle().fill(EduTheme.fasoRed).frame(width: width, height: 3)
            Rectangle().fill(EduTheme.fasoYellow).frame(width: width, height: 3)
            Rectangle().fill(EduTheme.fasoGreen).frame(width: width, height: 3)
        }
        .accessibilityHidden(true)
    }
}

/// Stable subject colors shared by EDT, notes, exercices, etc.
enum SubjectPalette {
    struct Swatch {
        let fill: Color
        let border: Color
    }

    private static let palette: [Swatch] = [
        Swatch(fill: rgb(186, 230, 253), border: rgb(2, 132, 199)),
        Swatch(fill: rgb(167, 243, 208), border: rgb(5, 150, 105)),
        Swatch(fill: rgb(253, 230, 138), border: rgb(217, 119, 6)),
        Swatch(fill: rgb(221, 214, 254), border: rgb(124, 58, 237)),
        Swatch(fill: rgb(165, 243, 252), border: rgb(8, 145, 178)),
        Swatch(fill: rgb(153, 246, 228), border: rgb(13, 148, 136)),
        Swatch(fill: rgb(190, 242, 100), border: rgb(101, 163, 13)),
        Swatch(fill: rgb(254, 205, 211), border: rgb(225, 29, 72)),
        Swatch(fill: rgb(254, 215, 170), border: rgb(234, 88, 12)),
        Swatch(fill: rgb(233, 213, 255), border: rgb(147, 51, 234)),
        Swatch(fill: rgb(251, 207, 232), border: rgb(219, 39, 119)),
        Swatch(fill: rgb(254, 240, 138), border: rgb(202, 138, 4)),
    ]

    private static let aliases: [String: Int] = [
        "mathematiques": 0, "maths": 0, "math": 0, "calcul": 0,
        "francais": 1,
        "anglais": 2, "education civique et morale": 2, "education civique": 2,
        "histoire geographie": 3, "histoire geo": 3, "hist geo": 3, "histoire": 3, "geographie": 3,
        "physique chimie": 4, "pc": 4, "sciences physiques": 4,
        "sciences de la vie et de la terre": 5, "svt": 5,
        "education physique et sportive": 6, "eps": 6,
        "philosophie": 7, "philo": 7,
        "informatique": 8, "technologie": 8,
        "economie": 9, "sciences economiques et sociales": 9, "ses": 9,
        "arts plastiques": 10, "musique": 10, "dessin": 10,
        "allemand": 11, "espagnol": 11,
    ]

    static func swatch(for name: String?) -> Swatch {
        let key = normalize(name ?? "Cours")
        if let pinned = aliases[key] { return palette[pinned] }
        var h = 0
        for (i, ch) in key.utf8.enumerated() { h = (h + Int(ch) * (i + 1)) % 997 }
        return palette[h % palette.count]
    }

    private static func normalize(_ name: String) -> String {
        name
            .folding(options: .diacriticInsensitive, locale: .current)
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    private static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color {
        Color(red: r / 255, green: g / 255, blue: b / 255)
    }
}
