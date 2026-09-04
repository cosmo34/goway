import Foundation
import ActivityKit

@available(iOS 16.2, *)
public struct GowayDepartureAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var lineName: String
        public var lineColor: String
        public var direction: String
        public var minutesUntil: Int
        public var stopName: String
        public var isRealtime: Bool
        public var isNavigation: Bool
        public var stepIndex: Int
        public var totalSteps: Int
        public var distanceMeters: Int

        public init(
            lineName: String,
            lineColor: String,
            direction: String,
            minutesUntil: Int,
            stopName: String,
            isRealtime: Bool,
            isNavigation: Bool = false,
            stepIndex: Int = 0,
            totalSteps: Int = 0,
            distanceMeters: Int = 0
        ) {
            self.lineName = lineName
            self.lineColor = lineColor
            self.direction = direction
            self.minutesUntil = minutesUntil
            self.stopName = stopName
            self.isRealtime = isRealtime
            self.isNavigation = isNavigation
            self.stepIndex = stepIndex
            self.totalSteps = totalSteps
            self.distanceMeters = distanceMeters
        }
    }

    public var tripId: String

    public init(tripId: String) {
        self.tripId = tripId
    }
}
