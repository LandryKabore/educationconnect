import SwiftUI

enum Brand {
  static let name = "EduFaso"
  static let tagline = "Système de gestion scolaire"

  static let teal = Color(red: 15 / 255, green: 118 / 255, blue: 110 / 255) // #0f766e
  static let tealBright = Color(red: 20 / 255, green: 184 / 255, blue: 166 / 255) // #14b8a6
  static let navy = Color(red: 21 / 255, green: 48 / 255, blue: 100 / 255) // #153064
  static let fasoRed = Color(red: 212 / 255, green: 55 / 255, blue: 46 / 255)
  static let fasoYellow = Color(red: 239 / 255, green: 172 / 255, blue: 66 / 255)
  static let fasoGreen = Color(red: 75 / 255, green: 143 / 255, blue: 74 / 255)

  static let background = Color(red: 248 / 255, green: 250 / 255, blue: 252 / 255)
  static let ink = Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)
  static let muted = Color(red: 100 / 255, green: 116 / 255, blue: 139 / 255)
  static let border = Color(red: 226 / 255, green: 232 / 255, blue: 240 / 255)
}

extension View {
  func edufasoCard() -> some View {
    padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color.white)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(Brand.border, lineWidth: 1)
      )
  }
}
