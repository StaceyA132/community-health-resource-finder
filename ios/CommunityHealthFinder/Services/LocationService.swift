import Combine
import CoreLocation

/// Follows the user's location while tracking is on, like the website's live location.
@MainActor
final class LocationService: NSObject, ObservableObject {
    @Published private(set) var coordinate: Coordinate?
    @Published private(set) var isTracking = false
    @Published private(set) var status: String?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        // Only report moves of about a tenth of a mile, so GPS jitter doesn't refetch results.
        manager.distanceFilter = 160
    }

    func start() {
        switch manager.authorizationStatus {
        case .denied, .restricted:
            status = "Location access is off. Turn it on in Settings, or search by ZIP."
            return
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        default:
            break
        }
        isTracking = true
        status = "Locating…"
        manager.startUpdatingLocation()
    }

    /// Stops following the user. A typed ZIP clears the location so searches use the ZIP;
    /// turning tracking off keeps showing results near the last location.
    func stop(clearLocation: Bool) {
        manager.stopUpdatingLocation()
        isTracking = false
        if clearLocation {
            coordinate = nil
            status = nil
        } else if coordinate != nil {
            status = "Live location off. Showing results near your last location."
        }
    }

    private func handleDenied() {
        stop(clearLocation: true)
        status = "Location permission denied. Search by ZIP instead."
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let coordinate = Coordinate(lat: location.coordinate.latitude, lng: location.coordinate.longitude)
        Task { @MainActor in
            guard self.isTracking else { return }
            self.coordinate = coordinate
            let time = Date.now.formatted(date: .omitted, time: .shortened)
            self.status = "Live location on · updated \(time)"
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let denied = (error as? CLError)?.code == .denied
        Task { @MainActor in
            if denied {
                self.handleDenied()
            } else if self.isTracking {
                self.status = "Can’t get your location right now. Still trying…"
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            if (status == .denied || status == .restricted) && self.isTracking {
                self.handleDenied()
            }
        }
    }
}
