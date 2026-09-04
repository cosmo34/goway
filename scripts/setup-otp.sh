#!/bin/bash
# Prépare OpenTripPlanner avec le GTFS TaM Montpellier
set -e

OTP_DIR="data/otp"
GTFS_URL="https://data.montpellier3m.fr/sites/default/files/ressources/TAM_MMM_GTFS.zip"

mkdir -p "$OTP_DIR"

if [ ! -f "$OTP_DIR/gtfs.zip" ]; then
  echo "Téléchargement GTFS TaM…"
  curl -L -o "$OTP_DIR/gtfs.zip" "$GTFS_URL"
fi

if [ ! -f "$OTP_DIR/build-config.json" ]; then
  cat > "$OTP_DIR/build-config.json" << 'EOF'
{
  "transitFeeds": [
    {
      "type": "gtfs",
      "source": "gtfs.zip",
      "feedId": "TAM"
    }
  ],
  "osm": [
    {
      "source": "https://download.geofabrik.de/europe/france/languedoc-roussillon-latest.osm.pbf",
      "osmProvider": "osm"
    }
  ]
}
EOF
fi

echo "Lancement OTP (build initial ~10-20 min)…"
docker compose up otp -d
echo "OTP disponible sur http://localhost:8080"
