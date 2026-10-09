import Foundation
import Combine

@MainActor
final class ChatService: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = [
        ChatMessage(role: .assistant, text: "Hi! I can help you find community resources. What are you looking for?")
    ]
    @Published private(set) var isSending = false

    /// Sends a message and returns the reply, so the caller can update the search filters.
    func send(_ text: String, zip: String) async -> ChatReply? {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !isSending, let url = API.url("api/chat") else { return nil }

        messages.append(ChatMessage(role: .user, text: message))
        isSending = true
        defer { isSending = false }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["message": message, "zip": zip])

        do {
            let reply = try await API.decode(ChatReply.self, from: request)
            messages.append(ChatMessage(role: .assistant, text: reply.message, emergency: reply.emergency))
            return reply
        } catch {
            messages.append(ChatMessage(
                role: .assistant,
                text: "I’m having trouble connecting right now. Try using the category filters instead."
            ))
            return nil
        }
    }
}
