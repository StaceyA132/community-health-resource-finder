import Foundation
import Combine

@MainActor
final class ResourceService: ObservableObject {
    @Published var resources: [Resource] = []
    @Published var locationLabel: String = ""
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isSampleData = false

    /// Set `APIBaseURL` in Info.plist once the backend is deployed.
    private let baseURL: URL = {
        if let value = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           let url = URL(string: value) {
            return url
        }
        return URL(string: "http://localhost:3000")!
    }()

    private var searchTask: Task<Void, Never>?

    /// Starts a search, cancelling any search still in flight so older results can't overwrite newer ones.
    func search(zip: String, categories: Set<ResourceCategory>) {
        searchTask?.cancel()
        searchTask = Task { await fetch(zip: zip, categories: categories) }
    }

    func loadMock() {
        searchTask?.cancel()
        isLoading = false
        errorMessage = nil
        resources = PreviewData.sampleResources
        locationLabel = "Sample data"
        isSampleData = true
    }

    private func fetch(zip: String, categories: Set<ResourceCategory>) async {
        let trimmedZip = zip.trimmingCharacters(in: .whitespaces)
        guard trimmedZip.range(of: #"^\d{5}$"#, options: .regularExpression) != nil else {
            errorMessage = "Enter a 5-digit ZIP code."
            return
        }

        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/resources"),
            resolvingAgainstBaseURL: false
        )
        var queryItems = [URLQueryItem(name: "zip", value: trimmedZip)]
        if !categories.isEmpty {
            let value = categories.map(\.rawValue).sorted().joined(separator: ",")
            queryItems.append(URLQueryItem(name: "categories", value: value))
        }
        components?.queryItems = queryItems
        guard let url = components?.url else {
            errorMessage = "Could not build the request."
            return
        }

        isLoading = true
        errorMessage = nil
        defer {
            if !Task.isCancelled { isLoading = false }
        }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw URLError(.badServerResponse)
            }
            let decoded = try JSONDecoder().decode(ResourceResponse.self, from: data)
            try Task.checkCancellation()
            resources = decoded.results
            locationLabel = decoded.locationLabel
            isSampleData = decoded.metadata.source == "mock"
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            // Don't silently swap in sample data; it could be mistaken for real listings.
            resources = []
            locationLabel = ""
            isSampleData = false
            errorMessage = "Couldn't load resources. Check your connection and try again, or tap Sample data."
        }
    }
}
