import Foundation

enum API {
    /// Read from `APIBaseURL` in Info.plist, which comes from the `API_BASE_URL` build
    /// setting. Change that setting in Xcode once the website is deployed.
    static let baseURL: URL = {
        if let value = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           !value.isEmpty,
           let url = URL(string: value) {
            return url
        }
        return URL(string: "http://localhost:3000")!
    }()

    static func url(_ path: String, query: [URLQueryItem] = []) -> URL? {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )
        if !query.isEmpty { components?.queryItems = query }
        return components?.url
    }

    /// Fetches and decodes JSON, treating any non-2xx status as an error.
    static func decode<T: Decodable>(_ type: T.Type, from request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
