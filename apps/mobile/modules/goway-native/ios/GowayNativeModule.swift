import ExpoModulesCore
import ActivityKit
import MapKit
import GowayShared

@available(iOS 16.2, *)
var currentActivity: Activity<GowayDepartureAttributes>?

private func contentState(from data: [String: Any]) -> GowayDepartureAttributes.ContentState {
    GowayDepartureAttributes.ContentState(
        lineName: data["lineName"] as? String ?? "",
        lineColor: data["lineColor"] as? String ?? "#5B8DEF",
        direction: data["direction"] as? String ?? "",
        minutesUntil: data["minutesUntil"] as? Int ?? 0,
        stopName: data["stopName"] as? String ?? "",
        isRealtime: data["isRealtime"] as? Bool ?? false,
        isNavigation: data["isNavigation"] as? Bool ?? false,
        stepIndex: data["stepIndex"] as? Int ?? 0,
        totalSteps: data["totalSteps"] as? Int ?? 0,
        distanceMeters: data["distanceMeters"] as? Int ?? 0
    )
}

private func coordinates(from polyline: MKPolyline) -> [[String: Double]] {
    var coords = Array(
        repeating: CLLocationCoordinate2D(latitude: 0, longitude: 0),
        count: polyline.pointCount
    )
    polyline.getCoordinates(&coords, range: NSRange(location: 0, length: polyline.pointCount))
    return coords.map { ["latitude": $0.latitude, "longitude": $0.longitude] }
}

/** Distance point → segment en mètres (approx.). */
private func pointToSegmentMeters(
    _ point: CLLocationCoordinate2D,
    _ a: CLLocationCoordinate2D,
    _ b: CLLocationCoordinate2D
) -> Double {
    let lat0 = ((a.latitude + b.latitude) / 2.0) * .pi / 180.0
    let x0 = a.longitude * cos(lat0)
    let y0 = a.latitude
    let x1 = b.longitude * cos(lat0)
    let y1 = b.latitude
    let xp = point.longitude * cos(lat0)
    let yp = point.latitude
    let dx = x1 - x0
    let dy = y1 - y0
    let len2 = dx * dx + dy * dy
    var t = 0.0
    if len2 > 1e-12 {
        t = max(0.0, min(1.0, ((xp - x0) * dx + (yp - y0) * dy) / len2))
    }
    let mx = x0 + t * dx
    let my = y0 + t * dy
    return hypot((xp - mx) * 111_320.0, (yp - my) * 111_320.0)
}

/**
 * Sur une place / esplanade, MapKit suit parfois le pourtour :
 * on remplace par une corde si le détour est quasi nul.
 * Les rues (coins, L, S) restent intactes.
 */
private func reshapeWalkingCoordinates(_ coords: [[String: Double]]) -> [[String: Double]] {
    guard coords.count > 2 else { return coords }

    func latLon(_ c: [String: Double]) -> (Double, Double)? {
        guard let lat = c["latitude"], let lon = c["longitude"] else { return nil }
        return (lat, lon)
    }

    guard let first = latLon(coords[0]), let last = latLon(coords[coords.count - 1]) else {
        return coords
    }

    let crow = CLLocation(
        latitude: first.0,
        longitude: first.1
    ).distance(from: CLLocation(latitude: last.0, longitude: last.1))

    var maxDev = 0.0
    let start = CLLocationCoordinate2D(latitude: first.0, longitude: first.1)
    let end = CLLocationCoordinate2D(latitude: last.0, longitude: last.1)
    for i in 1..<(coords.count - 1) {
        guard let p = latLon(coords[i]) else { continue }
        maxDev = max(
            maxDev,
            pointToSegmentMeters(CLLocationCoordinate2D(latitude: p.0, longitude: p.1), start, end)
        )
    }

    var routed = 0.0
    for i in 1..<coords.count {
        guard let a = latLon(coords[i - 1]), let b = latLon(coords[i]) else { continue }
        routed += CLLocation(latitude: a.0, longitude: a.1)
            .distance(from: CLLocation(latitude: b.0, longitude: b.1))
    }

    // Place courte : presque alignée → ligne droite (évite le tour du pourtour).
    if crow >= 25, crow <= 280, maxDev <= 12, routed <= crow * 1.3 {
        return [coords[0], coords[coords.count - 1]]
    }

    // Détour net sur une courte distance avec faible écart à la corde → raccourci place.
    if crow >= 40, crow <= 320, routed >= crow * 1.45, maxDev <= max(14.0, crow * 0.22) {
        return [coords[0], coords[coords.count - 1]]
    }

    return coords
}

public class GowayNativeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("GowayNative")

        AsyncFunction("startLiveActivity") { (data: [String: Any]) in
            guard #available(iOS 16.2, *) else { return }
            let state = contentState(from: data)
            let attributes = GowayDepartureAttributes(tripId: UUID().uuidString)
            if ActivityAuthorizationInfo().areActivitiesEnabled {
                Task {
                    await currentActivity?.end(nil, dismissalPolicy: .immediate)
                    currentActivity = try? Activity.request(
                        attributes: attributes,
                        content: .init(state: state, staleDate: nil),
                        pushType: nil
                    )
                }
            }
        }

        AsyncFunction("updateLiveActivity") { (data: [String: Any]) in
            guard #available(iOS 16.2, *) else { return }
            let state = contentState(from: data)
            Task {
                await currentActivity?.update(ActivityContent(state: state, staleDate: nil))
            }
        }

        AsyncFunction("endLiveActivity") {
            guard #available(iOS 16.2, *) else { return }
            Task {
                await currentActivity?.end(nil, dismissalPolicy: .immediate)
                currentActivity = nil
            }
        }

        AsyncFunction("setAppGroupValue") { (key: String, value: String) in
            let defaults = UserDefaults(suiteName: "group.fr.goway.app")
            defaults?.set(value, forKey: key)
        }

        /// Tracé piéton aligné Apple Maps : plus court parmi les alternatives, places → corde.
        AsyncFunction("getWalkingRoute") { (
            fromLat: Double,
            fromLon: Double,
            toLat: Double,
            toLon: Double
        ) -> [[String: Double]] in
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[[String: Double]], Error>) in
                let request = MKDirections.Request()
                request.source = MKMapItem(
                    placemark: MKPlacemark(
                        coordinate: CLLocationCoordinate2D(latitude: fromLat, longitude: fromLon)
                    )
                )
                request.destination = MKMapItem(
                    placemark: MKPlacemark(
                        coordinate: CLLocationCoordinate2D(latitude: toLat, longitude: toLon)
                    )
                )
                request.transportType = .walking
                request.requestsAlternateRoutes = true

                MKDirections(request: request).calculate { response, error in
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    guard let routes = response?.routes, !routes.isEmpty else {
                        continuation.resume(returning: [])
                        return
                    }

                    // MapKit renvoie parfois un itinéraire « confort » plus long : prendre le plus court.
                    let shortest = routes.min(by: { $0.distance < $1.distance }) ?? routes[0]
                    let raw = coordinates(from: shortest.polyline)
                    continuation.resume(returning: reshapeWalkingCoordinates(raw))
                }
            }
        }
    }
}
