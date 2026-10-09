import Foundation
import Combine

@MainActor
final class ResourceService: ObservableObject {
    @Published private(set) var resources: [Resource] = []
    @Published private(set) var locationLabel = ""
    @Published private(set) var isLoading = false
    @Published private(set) var hasLoaded = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var isSampleData = false
    @Published private(set) var isCentered = true
    /// True when the OpenStreetMap lookup failed, so nearby places may be missing.
    @Published private(set) var liveDataUnavailable = false

    private var searchTask: Task<Void, Never>?
    private var lastQuery: SearchQuery?

    /// Starts a search, cancelling any search still in flight so older results can't overwrite newer ones.
    func search(_ query: SearchQuery) {
        lastQuery = query
        searchTask?.cancel()
        searchTask = Task { await fetch(query) }
    }

    func retry() {
        if let lastQuery { search(lastQuery) }
    }

    /// Shows the bundled sample listings, for previews and offline demos.
    func loadMock() {
        searchTask?.cancel()
        isLoading = false
        hasLoaded = true
        errorMessage = nil
        resources = PreviewData.sampleResources
        locationLabel = "Sample data"
        isSampleData = true
        isCentered = true
        liveDataUnavailable = false
    }

    private func fetch(_ query: SearchQuery) async {
        var items = [URLQueryItem(name: "zip", value: query.zip)]
        if !query.categories.isEmpty {
            let value = query.categories.map(\.rawValue).sorted().joined(separator: ",")
            items.append(URLQueryItem(name: "categories", value: value))
        }
        if let coordinate = query.coordinate {
            items.append(URLQueryItem(name: "lat", value: String(coordinate.lat)))
            items.append(URLQueryItem(name: "lng", value: String(coordinate.lng)))
        }
        guard let url = API.url("api/resources", query: items) else {
            errorMessage = "Could not build the request."
            return
        }

        isLoading = true
        errorMessage = nil
        defer {
            if !Task.isCancelled { isLoading = false }
        }

        do {
            let decoded = try await API.decode(ResourceResponse.self, from: URLRequest(url: url))
            try Task.checkCancellation()
            resources = decoded.results
            locationLabel = decoded.locationLabel
            isSampleData = decoded.metadata.source == "mock"
            isCentered = decoded.metadata.centered
            liveDataUnavailable = decoded.metadata.liveData == "unavailable"
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            // Don't silently swap in sample data; it could be mistaken for real listings.
            resources = []
            locationLabel = ""
            isSampleData = false
            liveDataUnavailable = false
            hasLoaded = true
            errorMessage = "Couldn't load resources. Check your connection and try again."
        }
    }
}
