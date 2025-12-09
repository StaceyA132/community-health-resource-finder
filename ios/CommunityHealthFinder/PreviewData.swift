import Foundation

enum PreviewData {
    static let sampleResources: [Resource] = [
        Resource(
            id: "sf-mental-health",
            name: "Community Mental Health Hub",
            categories: ["mental-health"],
            description: "Walk-in counseling, crisis support, and weekly group sessions.",
            address: "1250 Market St",
            city: "San Francisco",
            state: "CA",
            zip: "94103",
            phone: "(415) 555-8830",
            website: "https://www.cmhhub.org",
            hours: "Mon–Sat 10a–8p",
            cost: "Free for SF residents",
            eligibility: "Open to all; priority for SF residents",
            distance: 1.2
        ),
        Resource(
            id: "sf-free-clinic",
            name: "San Francisco Free Clinic",
            categories: ["womens-health", "dental"],
            description: "Free and low-cost primary care, women’s health screenings, and dental referrals.",
            address: "4900 California St",
            city: "San Francisco",
            state: "CA",
            zip: "94118",
            phone: "(415) 750-9894",
            website: "https://www.sffreeclinic.org",
            hours: "Mon–Fri 8a–5p",
            cost: "Free or sliding scale",
            eligibility: "Uninsured or underinsured",
            distance: 3.1
        ),
        Resource(
            id: "nyc-urgent-care",
            name: "CityCare Urgent",
            categories: ["emergency-care", "pharmacy"],
            description: "24/7 urgent care with on-site low-cost pharmacy.",
            address: "455 8th Ave",
            city: "New York",
            state: "NY",
            zip: "10001",
            phone: "(212) 555-2200",
            website: "https://www.citycareurgent.org",
            hours: "24/7",
            cost: "Sliding scale",
            eligibility: "Open to all",
            distance: 0.6
        )
    ]
}
