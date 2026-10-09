import SwiftUI

struct Notice<Action: View>: View {
    let text: String
    var tint: Color = .yellow
    @ViewBuilder var action: () -> Action

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(text)
                .font(.footnote)
                .frame(maxWidth: .infinity, alignment: .leading)
            action()
        }
        .padding(12)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(tint.opacity(0.4)))
    }
}

extension Notice where Action == EmptyView {
    init(text: String, tint: Color = .yellow) {
        self.init(text: text, tint: tint) { EmptyView() }
    }
}

/// Emergency numbers, always reachable at the bottom of the results.
struct CrisisFooter: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("In an emergency, call 911. For a mental-health crisis, call or text 988 (Suicide & Crisis Lifeline).")
                .font(.footnote)
            CrisisLinks()
            Text("Listings marked “From OpenStreetMap” come from a free community map and may be out of date, so call ahead to confirm hours, cost, and eligibility.")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Link("Map data © OpenStreetMap contributors", destination: URL(string: "https://www.openstreetmap.org/copyright")!)
                .font(.caption2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CrisisLinks: View {
    var body: some View {
        HStack(spacing: 8) {
            Link(destination: URL(string: "tel:911")!) { Label("Call 911", systemImage: "phone.fill") }
            Link(destination: URL(string: "tel:988")!) { Label("Call 988", systemImage: "phone") }
            Link(destination: URL(string: "sms:988")!) { Label("Text 988", systemImage: "message") }
        }
        .font(.caption.weight(.semibold))
        .buttonStyle(.bordered)
        .tint(.red)
    }
}
