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

    static var loginBackground: LinearGradient {
        LinearGradient(
            colors: [brand50, sand, Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
