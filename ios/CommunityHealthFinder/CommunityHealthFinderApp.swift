import SwiftUI

@main
struct CommunityHealthFinderApp: App {
    @StateObject private var service = ResourceService()
    @StateObject private var location = LocationService()
    @StateObject private var chat = ChatService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(service)
                .environmentObject(location)
                .environmentObject(chat)
        }
    }
}
