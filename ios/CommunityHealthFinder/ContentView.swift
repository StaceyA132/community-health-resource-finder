import SwiftUI

private let defaultZip = "94103"

struct ContentView: View {
    @EnvironmentObject private var service: ResourceService
    @EnvironmentObject private var location: LocationService
    /// What's typed in the box; `zip` is the ZIP results are shown for, so a half-typed
    /// ZIP never reaches category changes or live location updates.
    @State private var zipInput = defaultZip
    @State private var zip = defaultZip
    @State private var zipError: String?
    @State private var selectedCategories: Set<ResourceCategory> = []
    @State private var showingChat = false
    @FocusState private var zipFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    searchControls
                    notices
                    results
                    CrisisFooter()
                        .padding(.top, 8)
                }
                .padding()
            }
            .refreshable { search() }
            .navigationTitle("Health Finder")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingChat = true
                    } label: {
                        Label("Resource helper", systemImage: "bubble.left.and.bubble.right")
                    }
                }
            }
            .sheet(isPresented: $showingChat) {
                ChatView(zip: zip, onReply: applyChatReply)
            }
            .task {
                // Show the default ZIP right away, then follow the user's location if they allow it.
                search()
                location.start()
            }
            .onChange(of: location.coordinate) { _, coordinate in
                if coordinate != nil { search() }
            }
        }
    }

    private var searchControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Find free and low-cost health resources near you.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack {
                TextField("ZIP code", text: $zipInput)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .focused($zipFocused)
                Button(action: submitZip) {
                    if service.isLoading {
                        ProgressView()
                    } else {
                        Text("Search")
                    }
                }
                .buttonStyle(.borderedProminent)
            }
            if let zipError {
                Text(zipError)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            if service.isLoading {
                Text("Searching nearby listings. This can take up to 30 seconds.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
                Button {
                    if location.isTracking {
                        location.stop(clearLocation: false)
                    } else {
                        location.start()
                    }
                } label: {
                    Label(
                        location.isTracking ? "Stop live location" : "Use my live location",
                        systemImage: location.isTracking ? "location.fill" : "location"
                    )
                }
                .buttonStyle(.bordered)
                .font(.caption)
                Text(location.status ?? "We’ll search near your ZIP or location.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ResourceCategory.allCases) { category in
                        let isSelected = selectedCategories.contains(category)
                        Button {
                            toggle(category)
                        } label: {
                            Text(category.label)
                                .font(.subheadline)
                                .padding(.vertical, 8)
                                .padding(.horizontal, 12)
                                .background(isSelected ? Color.accentColor.opacity(0.2) : Color(.systemGray6), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var notices: some View {
        if service.isSampleData {
            Notice(text: "Listings not marked “From OpenStreetMap” are sample data for demonstration. Some names and phone numbers are made up, so don’t rely on them for care.")
        }
        if service.liveDataUnavailable {
            Notice(text: "Nearby listings from OpenStreetMap are temporarily unavailable, so some places may be missing.") {
                Button("Try again") { service.retry() }
                    .buttonStyle(.bordered)
                    .font(.caption)
                    .disabled(service.isLoading)
            }
        }
        if service.hasLoaded && !service.isCentered && service.errorMessage == nil {
            Notice(text: "We couldn’t find a location for ZIP \(zip), so results aren’t limited to your area or sorted by distance.")
        }
        if let message = service.errorMessage {
            Notice(text: message, tint: .red) {
                Button("Try again") { service.retry() }
                    .buttonStyle(.bordered)
                    .font(.caption)
            }
        }
    }

    @ViewBuilder
    private var results: some View {
        if service.hasLoaded && service.errorMessage == nil {
            HStack {
                Text("\(service.resources.count) resources")
                    .font(.headline)
                Spacer()
                Text(locationSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if service.resources.isEmpty {
                Notice(text: selectedCategories.isEmpty
                       ? "No resources found near here yet."
                       : "No resources matched. Try removing a category filter.")
            }
            LazyVStack(spacing: 12) {
                ForEach(service.resources) { resource in
                    ResourceCard(resource: resource)
                }
            }
        }
    }

    private var locationSummary: String {
        if location.coordinate != nil { return "Near your location" }
        return service.locationLabel.isEmpty ? "ZIP \(zip)" : "\(service.locationLabel) • ZIP \(zip)"
    }

    private func search() {
        service.search(SearchQuery(zip: zip, categories: selectedCategories, coordinate: location.coordinate))
    }

    private func submitZip() {
        zipFocused = false
        let nextZip = zipInput.trimmingCharacters(in: .whitespaces)
        guard SearchQuery.isValidZip(nextZip) else {
            zipError = "Enter a 5-digit ZIP code."
            return
        }
        zipError = nil
        zip = nextZip
        // A typed ZIP is an explicit choice, so stop following the user's location.
        location.stop(clearLocation: true)
        search()
    }

    private func toggle(_ category: ResourceCategory) {
        if selectedCategories.contains(category) {
            selectedCategories.remove(category)
        } else {
            selectedCategories.insert(category)
        }
        search()
    }

    private func applyChatReply(_ reply: ChatReply) {
        let categories = Set(reply.categories.compactMap(ResourceCategory.init(rawValue:)))
        let newZip = reply.zip.flatMap { $0 != zip ? $0 : nil }
        guard newZip != nil || !categories.isEmpty else { return }

        if !categories.isEmpty { selectedCategories = categories }
        if let newZip {
            // Asking about a different ZIP means searching there, not around the detected location.
            zip = newZip
            zipInput = newZip
            zipError = nil
            location.stop(clearLocation: true)
        }
        search()
    }
}

#Preview {
    let service = ResourceService()
    service.loadMock()
    return ContentView()
        .environmentObject(service)
        .environmentObject(LocationService())
        .environmentObject(ChatService())
}
