import Foundation
import Combine

/// Opens bulletin verification from QR / Universal Links / `edufaso://` URLs.
@MainActor
final class DeepLinkCenter: ObservableObject {
    struct VerifyRequest: Identifiable, Equatable {
        let id = UUID()
        let code: String
    }

    @Published var verifyRequest: VerifyRequest?

    func handle(_ url: URL) {
        guard let code = Self.bulletinCode(from: url) else { return }
        verifyRequest = VerifyRequest(code: code)
    }

    /// `edufaso://verifier?c=EF-…` or `https://edufaso.lovable.app/verifier?c=EF-…`
    static func bulletinCode(from url: URL) -> String? {
        let scheme = (url.scheme ?? "").lowercased()
        let host = (url.host ?? "").lowercased()
        let path = url.path.lowercased()

        let isAppScheme = scheme == "edufaso"
        let isWebVerifier =
            (scheme == "https" || scheme == "http")
            && host.contains("edufaso")
            && (path == "/verifier" || path.hasPrefix("/verifier/"))
        let isSchemeVerifier =
            isAppScheme
            && (host == "verifier" || path == "/verifier" || path.hasPrefix("/verifier") || host.isEmpty)

        guard isWebVerifier || isSchemeVerifier else { return nil }

        let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "c" })?
            .value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let raw, !raw.isEmpty else { return nil }
        return raw.uppercased()
    }
}
