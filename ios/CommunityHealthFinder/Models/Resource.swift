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

    var label: String {
        switch self {
        case .mentalHealth: return "Mental Health"
        case .emergencyCare: return "Emergency Care"
        case .womensHealth: return "Women’s Health"
        case .pharmacy: return "Pharmacy"
        case .dental: return "Dental"
        case .food: return "Food"
        case .shelter: return "Shelter"
        }
    }
}
