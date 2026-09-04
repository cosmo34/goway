import WidgetKit
import SwiftUI

// MARK: - Modèle de données partagé avec l'app principale
struct DepartureEntry: Codable, TimelineEntry {
    let date: Date
    let lineName: String
    let lineColor: String
    let direction: String
    let minutesUntil: Int
    let isRealtime: Bool
    let stopName: String
}

struct Provider: TimelineProvider {
    private let appGroup = "group.fr.goway.app"
    private let apiBase = "http://localhost:3001"

    func placeholder(in context: Context) -> DepartureEntry {
        DepartureEntry(
            date: Date(),
            lineName: "Ligne 1",
            lineColor: "#E85D4C",
            direction: "Mosson",
            minutesUntil: 3,
            isRealtime: true,
            stopName: "Comédie"
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (DepartureEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DepartureEntry>) -> Void) {
        let defaults = UserDefaults(suiteName: appGroup)
        let stopId = defaults?.string(forKey: "favoriteStopId") ?? ""
        let stopName = defaults?.string(forKey: "favoriteStopName") ?? "Comédie"

        fetchDepartures(stopId: stopId, stopName: stopName) { entries in
            let timeline = Timeline(entries: entries, policy: .after(Date().addingTimeInterval(60)))
            completion(timeline)
        }
    }

    private func fetchDepartures(stopId: String, stopName: String, completion: @escaping ([DepartureEntry]) -> Void) {
        guard let url = URL(string: "\(apiBase)/api/widget/departures?stopId=\(stopId)&count=3") else {
            completion([placeholder(in: Context())])
            return
        }

        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data = data,
                  let deps = try? JSONDecoder().decode([WidgetDeparture].self, from: data) else {
                completion([DepartureEntry(
                    date: Date(), lineName: "—", lineColor: "#5B8DEF",
                    direction: "Pas de données", minutesUntil: 0,
                    isRealtime: false, stopName: stopName
                )])
                return
            }

            let entries = deps.map { d in
                DepartureEntry(
                    date: Date(),
                    lineName: d.lineName,
                    lineColor: d.lineColor,
                    direction: d.direction,
                    minutesUntil: d.minutesUntil,
                    isRealtime: d.isRealtime,
                    stopName: stopName
                )
            }
            completion(entries.isEmpty ? [placeholder(in: Context())] : entries)
        }.resume()
    }
}

struct WidgetDeparture: Codable {
    let lineName: String
    let lineColor: String
    let direction: String
    let minutesUntil: Int
    let isRealtime: Bool
}

// MARK: - Vue Widget
struct GowayWidgetEntryView: View {
    var entry: DepartureEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("GOWAY")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(Color(hex: "#5B8DEF"))
                Spacer()
                if entry.isRealtime {
                    Circle()
                        .fill(Color(hex: "#5B8DEF"))
                        .frame(width: 6, height: 6)
                }
            }

            Text(entry.stopName)
                .font(.caption)
                .foregroundColor(.secondary)

            HStack(alignment: .firstTextBaseline) {
                Text(entry.lineName)
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(Color(hex: entry.lineColor))

                Spacer()

                Text("\(entry.minutesUntil)")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)

                Text("min")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            Text(entry.direction)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .padding()
        .containerBackground(Color(hex: "#0A0A0B"), for: .widget)
    }
}

@main
struct GowayWidget: Widget {
    let kind = "GowayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            GowayWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Prochain départ")
        .description("Affiche le prochain tram ou bus à votre arrêt favori.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
