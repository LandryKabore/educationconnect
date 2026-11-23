import Foundation
import UIKit
import Supabase

/// « Espace classe » (secondaire): the students of a class help each other.
/// Reads go through one RPC per screen (names, counts, visibility decided by the database);
/// writes go straight to the tables, row-level security decides who may write.
enum ClassSpace {
    struct Subject: Codable, Hashable, Identifiable { let id: String; let name: String }
    struct Paper: Codable, Hashable { let subjectId: String?; let subjectName: String?; let date: String?; let start: String?; let end: String? }
    struct Composition: Codable, Hashable, Identifiable {
        let id: String; let title: String?; let periodLabel: String?; let startsOn: String; let endsOn: String?; let papers: [Paper]
    }

    struct Context: Codable {
        let enabled: Bool
        let reason: String?
        let classId: String?
        let className: String?
        let classmates: Int?
        let subjects: [Subject]?
        let compositions: [Composition]?
    }

    struct PostSummary: Codable, Hashable, Identifiable {
        let id: String
        let kind: String
        let title: String
        let body: String
        let photos: [String]
        let subjectId: String?
        let subjectName: String?
        let evaluationTitle: String?
        let authorName: String
        let mine: Bool
        let lastActivityAt: String
        let answered: Bool
        let replies: Int
        let moiAussi: Int
        let utile: Int
        let myReactions: [String]
        let hidden: Bool
        let hiddenReason: String?
        let reports: Int?
    }

    struct Reply: Codable, Hashable, Identifiable {
        let id: String
        let body: String
        let photos: [String]
        let authorName: String
        let mine: Bool
        let createdAt: String
        let hidden: Bool
        let hiddenReason: String?
        let merci: Int
        let myMerci: Bool
        let reports: Int?
    }

    struct Post: Codable, Identifiable {
        let id: String
        let classId: String
        let kind: String
        let title: String
        let body: String
        let photos: [String]
        let subjectName: String?
        let evaluationTitle: String?
        let authorName: String
        let mine: Bool
        let createdAt: String
        let editedAt: String?
        let answerReplyId: String?
        let hidden: Bool
        let hiddenReason: String?
        let moiAussi: Int
        let utile: Int
        let myReactions: [String]
        let replies: [Reply]
    }

    struct Member: Codable, Hashable, Identifiable { let id: String; let name: String }

    struct GroupSummary: Codable, Hashable, Identifiable {
        let id: String
        let name: String
        let subjectName: String?
        let mine: Bool
        let archived: Bool
        let lastActivityAt: String
        let member: Bool
        let members: [Member]
        let tasks: Int
        let tasksDone: Int
    }

    struct TaskItem: Codable, Hashable, Identifiable { let id: String; let label: String; let assigneeId: String?; let assigneeName: String?; let done: Bool }
    struct GroupMessage: Codable, Hashable, Identifiable {
        let id: String; let body: String; let photos: [String]; let authorName: String; let mine: Bool; let createdAt: String
        let hidden: Bool; let hiddenReason: String?
    }

    struct Group: Codable, Identifiable {
        let id: String
        let classId: String
        let name: String
        let subjectName: String?
        let mine: Bool
        let member: Bool
        let archived: Bool
        let members: [Member]
        let tasks: [TaskItem]
        let messages: [GroupMessage]
    }

    struct Report: Codable, Hashable, Identifiable {
        var id: String { "\(targetType)-\(targetId)" }
        let targetType: String
        let targetId: String
        let classId: String
        let className: String
        let count: Int
        let reasons: [String]
        let firstAt: String
        let handled: Bool
        let text: String?
        let authorName: String?
        let postId: String?
        let groupId: String?
        let hidden: Bool?
    }

    struct SchoolClass: Codable, Hashable, Identifiable {
        var id: String { classId }
        let classId: String
        let name: String
        let posts: Int
        let postsWeek: Int
        let groups: Int
        let openReports: Int
    }

    static let reportReasons = ["Insulte ou moquerie", "Contenu inapproprié", "Réponses d’un devoir à copier", "Hors sujet ou publicité", "Autre"]

    static func kindLabel(_ kind: String) -> String {
        switch kind {
        case "question": return "Question"
        case "fiche": return "Fiche"
        default: return "Discussion"
        }
    }

    private static var client: SupabaseClient { SupabaseManager.client }

    // MARK: reading

    static func context() async throws -> Context {
        try await client.rpc("ef_space_context").execute().value
    }

    private struct FeedParams: Encodable { let p_class: String; let p_kind: String?; let p_subject: String?; let p_limit: Int }
    static func feed(classId: String, kind: String?, subjectId: String?) async throws -> [PostSummary] {
        try await client.rpc("ef_space_feed", params: FeedParams(p_class: classId, p_kind: kind, p_subject: subjectId, p_limit: 60)).execute().value
    }

    static func post(_ id: String) async throws -> Post {
        try await client.rpc("ef_space_post", params: ["p_post": id]).execute().value
    }

    static func groups(classId: String) async throws -> [GroupSummary] {
        try await client.rpc("ef_space_groups_list", params: ["p_class": classId]).execute().value
    }

    static func group(_ id: String) async throws -> Group {
        try await client.rpc("ef_space_group", params: ["p_group": id]).execute().value
    }

    private struct ReportsParams: Encodable { let p_school: String; let p_open: Bool }
    static func reports(schoolId: String, open: Bool) async throws -> [Report] {
        try await client.rpc("ef_space_reports_list", params: ReportsParams(p_school: schoolId, p_open: open)).execute().value
    }

    static func schoolClasses(schoolId: String) async throws -> [SchoolClass] {
        try await client.rpc("ef_space_school_classes", params: ["p_school": schoolId]).execute().value
    }

    // MARK: writing

    private struct NewPost: Encodable {
        let class_id: String; let author_id: String; let kind: String; let subject_id: String?; let evaluation_id: String?
        let title: String; let body: String; let photos: [String]
    }
    private struct IdRow: Decodable { let id: String }

    static func createPost(classId: String, authorId: String, kind: String, subjectId: String?, evaluationId: String?,
                           title: String, body: String, photos: [String]) async throws -> String {
        let row: IdRow = try await client.from("ef_space_posts")
            .insert(NewPost(class_id: classId, author_id: authorId, kind: kind, subject_id: subjectId, evaluation_id: evaluationId,
                            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                            body: body.trimmingCharacters(in: .whitespacesAndNewlines), photos: photos))
            .select("id").single().execute().value
        return row.id
    }

    private struct AnswerPatch: Encodable { let answer_reply_id: String? }
    static func setAnswer(postId: String, replyId: String?) async throws {
        try await client.from("ef_space_posts").update(AnswerPatch(answer_reply_id: replyId)).eq("id", value: postId).execute()
    }

    static func deletePost(_ id: String) async throws {
        try await client.from("ef_space_posts").delete().eq("id", value: id).execute()
    }

    private struct NewReply: Encodable { let post_id: String; let author_id: String; let body: String; let photos: [String] }
    static func reply(postId: String, authorId: String, body: String, photos: [String]) async throws {
        try await client.from("ef_space_replies")
            .insert(NewReply(post_id: postId, author_id: authorId, body: body.trimmingCharacters(in: .whitespacesAndNewlines), photos: photos))
            .execute()
    }

    static func deleteReply(_ id: String) async throws {
        try await client.from("ef_space_replies").delete().eq("id", value: id).execute()
    }

    private struct Reaction: Encodable { let target_type: String; let target_id: String; let user_id: String; let kind: String }
    static func react(targetType: String, targetId: String, userId: String, kind: String, on: Bool) async throws {
        if on {
            try await client.from("ef_space_reactions").insert(Reaction(target_type: targetType, target_id: targetId, user_id: userId, kind: kind)).execute()
        } else {
            try await client.from("ef_space_reactions").delete()
                .eq("target_type", value: targetType).eq("target_id", value: targetId)
                .eq("user_id", value: userId).eq("kind", value: kind).execute()
        }
    }

    private struct NewGroup: Encodable { let class_id: String; let created_by: String; let name: String; let subject_id: String? }
    static func createGroup(classId: String, userId: String, name: String, subjectId: String?) async throws -> String {
        let row: IdRow = try await client.from("ef_space_groups")
            .insert(NewGroup(class_id: classId, created_by: userId, name: name.trimmingCharacters(in: .whitespacesAndNewlines), subject_id: subjectId))
            .select("id").single().execute().value
        return row.id
    }

    static func join(groupId: String, userId: String) async throws {
        try await client.from("ef_space_group_members").insert(["group_id": groupId, "user_id": userId]).execute()
    }

    static func leave(groupId: String, userId: String) async throws {
        try await client.from("ef_space_group_members").delete().eq("group_id", value: groupId).eq("user_id", value: userId).execute()
    }

    private struct ArchivePatch: Encodable { let archived_at: String? }
    static func archive(groupId: String, _ archived: Bool) async throws {
        try await client.from("ef_space_groups")
            .update(ArchivePatch(archived_at: archived ? ISO8601DateFormatter().string(from: Date()) : nil))
            .eq("id", value: groupId).execute()
    }

    private struct NewMessage: Encodable { let group_id: String; let author_id: String; let body: String; let photos: [String] }
    static func send(groupId: String, authorId: String, body: String, photos: [String]) async throws {
        try await client.from("ef_space_group_messages")
            .insert(NewMessage(group_id: groupId, author_id: authorId, body: body.trimmingCharacters(in: .whitespacesAndNewlines), photos: photos))
            .execute()
    }

    static func addTask(groupId: String, userId: String, label: String) async throws {
        try await client.from("ef_space_tasks")
            .insert(["group_id": groupId, "created_by": userId, "label": label.trimmingCharacters(in: .whitespacesAndNewlines)]).execute()
    }

    private struct TaskDone: Encodable { let done_at: String? }
    static func setTaskDone(_ id: String, _ done: Bool) async throws {
        try await client.from("ef_space_tasks").update(TaskDone(done_at: done ? ISO8601DateFormatter().string(from: Date()) : nil)).eq("id", value: id).execute()
    }

    static func takeTask(_ id: String, userId: String) async throws {
        try await client.from("ef_space_tasks").update(["assignee_id": userId]).eq("id", value: id).execute()
    }

    static func deleteTask(_ id: String) async throws {
        try await client.from("ef_space_tasks").delete().eq("id", value: id).execute()
    }

    private struct NewReport: Encodable { let class_id: String; let target_type: String; let target_id: String; let reporter_id: String; let reason: String }
    static func report(classId: String, targetType: String, targetId: String, reporterId: String, reason: String) async throws {
        try await client.from("ef_space_reports")
            .insert(NewReport(class_id: classId, target_type: targetType, target_id: targetId, reporter_id: reporterId, reason: reason)).execute()
    }

    private struct ModerateParams: Encodable { let p_target_type: String; let p_target_id: String; let p_hide: Bool; let p_reason: String? }
    static func moderate(targetType: String, targetId: String, hide: Bool) async throws {
        try await client.rpc("ef_space_moderate", params: ModerateParams(p_target_type: targetType, p_target_id: targetId, p_hide: hide, p_reason: nil)).execute()
    }

    // MARK: photos (private bucket, <class>/<author>/<file>)

    private static let bucket = "espace-classe"

    static func upload(classId: String, userId: String, image: UIImage) async throws -> String {
        let maxEdge: CGFloat = 1600
        let scale = min(1, maxEdge / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let resized = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let data = resized.jpegData(compressionQuality: 0.8) else { throw URLError(.cannotDecodeContentData) }
        let path = "\(classId)/\(userId)/\(UUID().uuidString.lowercased()).jpg"
        try await client.storage.from(bucket).upload(path, data: data, options: FileOptions(contentType: "image/jpeg"))
        return path
    }

    static func signed(_ paths: [String]) async -> [String: URL] {
        guard !paths.isEmpty else { return [:] }
        guard let results = try? await client.storage.from(bucket).createSignedURLs(paths: paths, expiresIn: 3600) else { return [:] }
        var out: [String: URL] = [:]
        for r in results { if case let .success(path, url) = r { out[path] = url } }
        return out
    }

    static func relative(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) ?? {
            let p = DateFormatter(); p.locale = Locale(identifier: "en_US_POSIX"); p.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX"
            return p.date(from: iso)
        }()
        guard let date else { return "" }
        let r = RelativeDateTimeFormatter()
        r.locale = Locale(identifier: "fr_FR")
        r.unitsStyle = .short
        return r.localizedString(for: date, relativeTo: Date())
    }
}
