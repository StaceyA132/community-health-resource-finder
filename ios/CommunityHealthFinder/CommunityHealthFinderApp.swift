import SwiftUI

@main
struct CommunityHealthFinderApp: App {
    @StateObject private var service = ResourceService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(service)
        }
    }
}
