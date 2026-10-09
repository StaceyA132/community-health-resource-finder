import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var service: ResourceService
    @State private var zip: String = "94103"
    @State private var selectedCategories: Set<ResourceCategory> = []

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                searchBar
                categoryPills
                resourceList
            }
            .padding()
            .navigationTitle("Health Finder")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Sample data") {
                        service.loadMock()
                    }
                }
            }
            .task {
                service.search(zip: zip, categories: selectedCategories)
            }
        }
    }

    private var searchBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Enter a zip code to find clinics, counseling, food banks, and more.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack {
                TextField("Zip code", text: $zip)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                Button {
                    service.search(zip: zip, categories: selectedCategories)
                } label: {
                    if service.isLoading {
                        ProgressView()
                    } else {
                        Text("Search")
                    }
                }
                .buttonStyle(.borderedProminent)
            }
            if !service.locationLabel.isEmpty {
                Text("Results near \(service.locationLabel)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if service.isSampleData {
                Text("Sample listings for demonstration. Some details are made up.")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            if let message = service.errorMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private var categoryPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ResourceCategory.allCases) { category in
                    let isSelected = selectedCategories.contains(category)
                    Button {
                        toggle(category)
                    } label: {
                        Text(category.label)
                            .padding(.vertical, 8)
                            .padding(.horizontal, 12)
                            .background(isSelected ? Color.accentColor.opacity(0.2) : Color(.systemGray6))
                            .clipShape(Capsule())
                    }
                }
            }
        }
    }

    private var resourceList: some View {
        List(service.resources) { resource in
            VStack(alignment: .leading, spacing: 6) {
                Text(resource.name)
                    .font(.headline)
                Text(resource.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack {
                    Text("\(resource.city), \(resource.state)")
                    if let distance = resource.distance {
                        Text(String(format: "%.1f mi", distance))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                HStack {
                    Text(resource.hours)
                    Text(resource.cost)
                }
                .font(.caption2)
                HStack(spacing: 16) {
                    if let phone = resource.phone, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                        Link(phone, destination: url)
                    }
                    if let website = resource.website, let url = URL(string: website),
                       ["http", "https"].contains(url.scheme?.lowercased()) {
                        Link("Website", destination: url)
                    }
                }
                .font(.caption)
                // Lets each link be tapped on its own inside the list row.
                .buttonStyle(.borderless)
            }
        }
        .listStyle(.plain)
    }

    private func toggle(_ category: ResourceCategory) {
        if selectedCategories.contains(category) {
            selectedCategories.remove(category)
        } else {
            selectedCategories.insert(category)
        }
        service.search(zip: zip, categories: selectedCategories)
    }
}

#Preview {
    ContentView()
        .environmentObject(ResourceService())
}
