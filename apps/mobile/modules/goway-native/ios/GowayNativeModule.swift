import ExpoModulesCore
import ActivityKit
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
    }
}
