import Foundation
import Combine

@MainActor
final class ResourceService: ObservableObject {
    @Published var resources: [Resource] = []
    @Published var locationLabel: String = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    func fetch(zip: String, categories: [ResourceCategory]) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let categoryParam = categories.map { $0.rawValue }.joined(separator: ",")
        guard let url = URL(string: "http://localhost:3000/api/resources?zip=\(zip)&categories=\(categoryParam)") else {
            errorMessage = "Bad request"
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let decoded = try JSONDecoder().decode(ResourceResponse.self, from: data)
            resources = decoded.results
            locationLabel = decoded.locationLabel
        } catch {
            errorMessage = "Network unavailable; showing mock data."
            resources = PreviewData.sampleResources
            locationLabel = "Mock data"
        }
    }

    func loadMock() {
        resources = PreviewData.sampleResources
        locationLabel = "Sample data"
    }
}
