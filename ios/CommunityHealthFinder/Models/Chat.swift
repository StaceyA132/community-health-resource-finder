import Foundation

struct ChatReply: Decodable {
    let message: String
    let categories: [String]
    let zip: String?
    let emergency: Bool
}

struct ChatMessage: Identifiable {
    enum Role { case user, assistant }

    let id = UUID()
    let role: Role
    let text: String
    var emergency = false
}
