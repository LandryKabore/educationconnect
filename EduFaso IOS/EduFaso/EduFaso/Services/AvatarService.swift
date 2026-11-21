import UIKit
import Supabase

/// Compress + upload profile photos to the public `avatars` bucket (same as web).
enum AvatarService {
    private static let bucket = "avatars"
    private static let maxEdge: CGFloat = 512
    private static let startQuality: CGFloat = 0.72
    private static let maxBytes = 180_000

    struct Compressed {
        let data: Data
        let contentType: String
        let ext: String
    }

    /// Resize longest side to 512px and JPEG-compress (steps quality down if still heavy).
    static func compress(_ image: UIImage) -> Compressed? {
        let sized = resize(image, maxEdge: maxEdge)
        var quality = startQuality
        guard var data = sized.jpegData(compressionQuality: quality) else { return nil }
        while data.count > maxBytes, quality > 0.45 {
            quality -= 0.08
            guard let next = sized.jpegData(compressionQuality: quality) else { break }
            data = next
        }
        return Compressed(data: data, contentType: "image/jpeg", ext: "jpg")
    }

    static func upload(userId: String, image: UIImage) async throws -> String {
        guard let compressed = compress(image) else {
            throw AvatarError.compressionFailed
        }
        let path = "\(userId)/avatar.\(compressed.ext)"
        let client = SupabaseManager.client
        try await client.storage
            .from(bucket)
            .upload(
                path,
                data: compressed.data,
                options: FileOptions(
                    cacheControl: "3600",
                    contentType: compressed.contentType,
                    upsert: true
                )
            )
        let publicURL = try client.storage.from(bucket).getPublicURL(path: path)
        return "\(publicURL.absoluteString)?v=\(Int(Date().timeIntervalSince1970 * 1000))"
    }

    static func remove(userId: String) async throws {
        let client = SupabaseManager.client
        _ = try? await client.storage
            .from(bucket)
            .remove(paths: ["\(userId)/avatar.jpg", "\(userId)/avatar.webp"])
    }

    private static func resize(_ image: UIImage, maxEdge: CGFloat) -> UIImage {
        let w = image.size.width
        let h = image.size.height
        let longest = max(w, h)
        guard longest > maxEdge, longest > 0 else { return image }
        let scale = maxEdge / longest
        let size = CGSize(width: max(1, (w * scale).rounded()), height: max(1, (h * scale).rounded()))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

enum AvatarError: LocalizedError {
    case compressionFailed
    case notSignedIn

    var errorDescription: String? {
        switch self {
        case .compressionFailed: return "Impossible de compresser l’image."
        case .notSignedIn: return "Session expirée."
        }
    }
}
