import SwiftUI

struct ChatView: View {
    @EnvironmentObject private var chat: ChatService
    @Environment(\.dismiss) private var dismiss
    /// The ZIP results are shown for; replies can change it.
    let zip: String
    let onReply: (ChatReply) -> Void
    @State private var input = ""

    private let suggestions = [
        "I need affordable dental care",
        "Where can I get food today?",
        "I need a safe place to sleep"
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            ForEach(chat.messages) { message in
                                MessageBubble(message: message)
                                    .id(message.id)
                            }
                            if chat.isSending {
                                MessageBubble(message: ChatMessage(role: .assistant, text: "Finding the best filters…"))
                            }
                        }
                        .padding()
                    }
                    .onChange(of: chat.messages.count) {
                        // Show the top of the newest message; long replies like the crisis
                        // message would otherwise start out of view.
                        guard let last = chat.messages.last else { return }
                        withAnimation { proxy.scrollTo(last.id, anchor: .top) }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Messages may be processed by an AI service. Please don’t share your name or personal health details.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(suggestions, id: \.self) { suggestion in
                                Button(suggestion) { send(suggestion) }
                                    .font(.caption)
                                    .buttonStyle(.bordered)
                            }
                        }
                    }
                    HStack {
                        TextField("Ask about community resources", text: $input)
                            .textFieldStyle(.roundedBorder)
                            .submitLabel(.send)
                            .onSubmit { send(input) }
                        Button("Send") { send(input) }
                            .buttonStyle(.borderedProminent)
                            .disabled(chat.isSending || input.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                .padding()
                .background(.bar)
            }
            .navigationTitle("Resource helper")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("Not medical advice")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func send(_ text: String) {
        guard !chat.isSending else { return }
        input = ""
        Task {
            if let reply = await chat.send(text, zip: zip) {
                onReply(reply)
            }
        }
    }
}

private struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        let isUser = message.role == .user
        VStack(alignment: .leading, spacing: 8) {
            Text(message.text)
            if message.emergency {
                CrisisLinks()
            }
        }
        .padding(10)
        .background(
            message.emergency ? Color.red.opacity(0.12) : isUser ? Color.accentColor.opacity(0.18) : Color(.secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 12)
        )
        .overlay {
            if message.emergency {
                RoundedRectangle(cornerRadius: 12).stroke(Color.red.opacity(0.6))
            }
        }
        .frame(maxWidth: 300, alignment: isUser ? .trailing : .leading)
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}
