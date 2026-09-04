import ActivityKit
import SwiftUI
import WidgetKit
import GowayShared

private func colorFromHex(_ hex: String) -> Color {
    let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var value: UInt64 = 0
    Scanner(string: cleaned).scanHexInt64(&value)
    let red = Double((value >> 16) & 0xFF) / 255
    let green = Double((value >> 8) & 0xFF) / 255
    let blue = Double(value & 0xFF) / 255
    return Color(red: red, green: green, blue: blue)
}

private func formatDistance(_ meters: Int) -> String {
    if meters >= 1000 {
        let km = Double(meters) / 1000
        return String(format: "%.1f km", km)
    }
    return "\(max(meters, 0)) m"
}

@available(iOS 16.2, *)
struct GowayLiveActivityView: View {
    let state: GowayDepartureAttributes.ContentState

    var body: some View {
        if state.isNavigation {
            navigationView
        } else {
            departureView
        }
    }

    private var navigationView: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("GOWAY")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(red: 0.36, green: 0.55, blue: 0.94))
                Spacer()
                if state.totalSteps > 0 {
                    Text("Étape \(state.stepIndex)/\(state.totalSteps)")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                Text(state.lineName)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(colorFromHex(state.lineColor))
                Spacer()
                if state.distanceMeters > 0 {
                    Text(formatDistance(state.distanceMeters))
                        .font(.title3.weight(.bold))
                        .monospacedDigit()
                }
            }

            Text(state.stopName)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)

            if !state.direction.isEmpty {
                Text(state.direction)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var departureView: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("GOWAY")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(red: 0.36, green: 0.55, blue: 0.94))
                Spacer()
                if state.isRealtime {
                    Circle()
                        .fill(Color(red: 0.36, green: 0.55, blue: 0.94))
                        .frame(width: 6, height: 6)
                }
            }

            Text(state.stopName)
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(alignment: .firstTextBaseline) {
                Text(state.lineName)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(colorFromHex(state.lineColor))
                Spacer()
                Text("\(state.minutesUntil)")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Text("min")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(state.direction)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }
}

@available(iOS 16.2, *)
struct GowayLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GowayDepartureAttributes.self) { context in
            GowayLiveActivityView(state: context.state)
                .activityBackgroundTint(Color(red: 0.04, green: 0.04, blue: 0.05))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.lineName)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(colorFromHex(context.state.lineColor))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.isNavigation {
                        Text(formatDistance(context.state.distanceMeters))
                            .font(.caption.weight(.bold))
                            .monospacedDigit()
                    } else {
                        Text("\(context.state.minutesUntil) min")
                            .font(.caption.weight(.bold))
                            .monospacedDigit()
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.stopName)
                        .font(.caption2)
                        .lineLimit(2)
                }
            } compactLeading: {
                Image(systemName: context.state.isNavigation ? "location.fill" : "tram.fill")
                    .foregroundStyle(colorFromHex(context.state.lineColor))
            } compactTrailing: {
                if context.state.isNavigation {
                    Text(formatDistance(context.state.distanceMeters))
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                } else {
                    Text("\(context.state.minutesUntil)m")
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                }
            } minimal: {
                Image(systemName: "tram.fill")
                    .foregroundStyle(colorFromHex(context.state.lineColor))
            }
        }
    }
}

@main
@available(iOS 16.2, *)
struct GowayLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        GowayLiveActivityWidget()
    }
}
