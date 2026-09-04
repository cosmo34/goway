package fr.goway.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.*
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.URL

class GowayWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val departures = fetchDepartures(context)
        provideContent {
            GowayWidgetContent(departures)
        }
    }

    private suspend fun fetchDepartures(context: Context): List<WidgetDeparture> =
        withContext(Dispatchers.IO) {
            try {
                val prefs = context.getSharedPreferences("goway_widget", Context.MODE_PRIVATE)
                val stopId = prefs.getString("favoriteStopId", "") ?: return@withContext emptyList()
                val apiBase = prefs.getString("apiBase", "http://10.0.2.2:3001") ?: return@withContext emptyList()

                val url = URL("$apiBase/api/widget/departures?stopId=$stopId&count=3")
                val json = url.readText()
                val array = JSONArray(json)
                (0 until array.length()).map { i ->
                    val obj = array.getJSONObject(i)
                    WidgetDeparture(
                        lineName = obj.getString("lineName"),
                        lineColor = obj.getString("lineColor"),
                        direction = obj.getString("direction"),
                        minutesUntil = obj.getInt("minutesUntil"),
                        isRealtime = obj.getBoolean("isRealtime")
                    )
                }
            } catch (e: Exception) {
                emptyList()
            }
        }
}

data class WidgetDeparture(
    val lineName: String,
    val lineColor: String,
    val direction: String,
    val minutesUntil: Int,
    val isRealtime: Boolean
)

@Composable
fun GowayWidgetContent(departures: List<WidgetDeparture>) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ColorProvider(Color(0xFF0A0A0B)))
            .padding(12.dp)
            .clickable { /* ouvre l'app */ }
    ) {
        Text(
            text = "GOWAY",
            style = TextStyle(
                color = ColorProvider(Color(0xFF5B8DEF)),
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium
            )
        )

        Spacer(GlanceModifier.height(4.dp))

        if (departures.isEmpty()) {
            Text(
                text = "Aucun départ",
                style = TextStyle(color = ColorProvider(Color(0xFFA1A1A6)), fontSize = 12.sp)
            )
        } else {
            departures.take(3).forEach { dep ->
                Row(
                    modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = dep.lineName,
                        style = TextStyle(
                            color = ColorProvider(Color(0xFFF5F5F7)),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        modifier = GlanceModifier.defaultWeight()
                    )
                    Text(
                        text = "${dep.minutesUntil} min",
                        style = TextStyle(
                            color = ColorProvider(Color(0xFF5B8DEF)),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    )
                }
            }
        }
    }
}

class GowayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GowayWidget()
}
