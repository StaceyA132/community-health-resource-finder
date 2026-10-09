import Foundation

struct ResourceResponse: Decodable {
    let zip: String
    let locationLabel: String
    let results: [Resource]
    let metadata: Metadata
}

struct Metadata: Decodable {
    let radiusMiles: Double
    let matchedCount: Int
    let centered: Bool
    /// "mock" when the server is using its built-in sample listings.
    let source: String?
    /// "ok", "unavailable" (the OpenStreetMap lookup failed) or "not-requested".
    let liveData: String?
}

struct Resource: Decodable, Identifiable {
    let id: String
    let name: String
    let categories: [String]
    let description: String
    let address: String
    let city: String
    let state: String
    let zip: String
    let phone: String?
    let website: String?
    let hours: String
    let cost: String
    let eligibility: String
    let distance: Double?
    /// "openstreetmap" for community-edited listings, "curated" otherwise.
    let source: String?

    var isFromOpenStreetMap: Bool { source == "openstreetmap" }

    /// Address parts joined, skipping blanks (OpenStreetMap listings often lack some).
    var fullAddress: String {
        let stateZip = [state, zip].filter { !$0.isEmpty }.joined(separator: " ")
        return [address, city, stateZip].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    var categoryLabels: [String] {
        categories.compactMap { ResourceCategory(rawValue: $0)?.label }
    }
}

enum ResourceCategory: String, CaseIterable, Identifiable {
    case mentalHealth = "mental-health"
    case emergencyCare = "emergency-care"
    case womensHealth = "womens-health"
    case pharmacy = "pharmacy"
    case dental = "dental"
    case food = "food"
    case shelter = "shelter"

    var id: String { rawValue }

    // Matches the web app's labels in data/resources.ts.
    var label: String {
        switch self {
        case .mentalHealth: return "Mental Health"
        case .emergencyCare: return "Emergency Care"
        case .womensHealth: return "Women’s Health"
        case .pharmacy: return "Pharmacy"
        case .dental: return "Dental"
        case .food: return "Food Banks"
        case .shelter: return "Shelter"
        }
    }
}

struct Coordinate: Equatable {
    let lat: Double
    let lng: Double
}

/// Everything a search depends on, so it can be repeated by "Try again".
struct SearchQuery: Equatable {
    var zip: String
    var categories: Set<ResourceCategory>
    var coordinate: Coordinate?

    static func isValidZip(_ zip: String) -> Bool {
        zip.range(of: #"^\d{5}$"#, options: .regularExpression) != nil
    }
}
