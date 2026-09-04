# GOWAY — Architecture technique

Application de transport en commun pour la Métropole de Montpellier.
Style **Cartographie Fluide** (tons noirs), iOS + Android.

> **Multi-villes** : voir [MULTI_CITY.md](./MULTI_CITY.md) pour la structure détaillée du routage, de la géométrie carte et la checklist d’ajout d’une nouvelle agence.

## Stack

| Couche | Technologie |
|--------|-------------|
| Mobile | Expo SDK 57 + React Native + TypeScript |
| Backend | Fastify + Node.js 20+ |
| Données | GTFS statique + GTFS-RT TaM (Open Data ODbL) |
| Routing | GTFS direct + OpenTripPlanner (optionnel) |
| NLP | Parsing local + OpenAI (optionnel) |
| POI | Overpass API (OpenStreetMap) |
| Widgets | WidgetKit iOS + Jetpack Glance Android |

## Démarrage

```bash
# Installation
npm install
cp .env.example .env

# Backend (terminal 1)
npm run api

# Mobile (terminal 2)
npm run mobile

# Tout en un
npm run dev
```

## Structure

```
GOWAY/
├── apps/
│   ├── api/                 # Backend Fastify
│   │   ├── src/
│   │   │   ├── config.ts    # URLs GTFS, lieux connus, couleurs (ville)
│   │   │   ├── services/    # GTFS, routage, géométrie, shapes réseau
│   │   │   └── routes/      # Endpoints REST (ville-agnostiques)
│   │   └── data/gtfs/       # Cache GTFS local
│   └── mobile/              # App Expo (ville-agnostique)
│       ├── app/(tabs)/      # Carte, Horaires, Alertes, Réglages
│       └── src/
│           ├── services/    # API client, routage UI, navigation
│           ├── components/  # TransitMap, feuilles itinéraire
│           └── config/      # Bornes carte (Montpellier aujourd’hui)
├── docs/
│   ├── ARCHITECTURE.md      # Ce fichier
│   └── MULTI_CITY.md        # Routage, géométrie, checklist nouvelle ville
├── packages/shared/         # Types partagés
├── widgets/                 # iOS WidgetKit + Android Glance
├── docker-compose.yml       # OpenTripPlanner
└── scripts/setup-otp.sh
```

## Pipeline itinéraire (résumé)

1. **Plan** — `routingService` : hubs → départs filtrés par marche réelle → trips directs / 1 correspondance → déduplication.
2. **Géométrie** — `networkShapeService` + `shapeService` : tracés officiels, découpe par segment, OSRM si bus.
3. **Mobile** — `buildRouteMapSegments` : marche (pointillés) + transit (plein) ; arrêts filtrés via `itineraryStopIds`.

Détail complet : [MULTI_CITY.md](./MULTI_CITY.md).

## API Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/health` | Santé + dernier fetch GTFS-RT |
| GET | `/api/stops/search?q=` | Recherche arrêts |
| GET | `/api/stops/:id/departures` | Prochains départs temps réel |
| GET | `/api/stops/nearby?lat=&lon=` | Arrêts proches |
| POST | `/api/routes/plan` | Itinéraire multimodal |
| POST | `/api/nlp/parse` | Parsing langage naturel |
| GET | `/api/poi/nearby?lat=&lon=` | POI destination |
| GET | `/api/alerts` | Alertes trafic GTFS-RT |
| GET | `/api/vehicles` | Positions véhicules |
| GET | `/api/widget/departures?stopId=` | Données widget |

## Sources open data TaM

| Donnée | URL |
|--------|-----|
| GTFS combiné | `TAM_MMM_GTFS.zip` |
| GTFS-RT TripUpdate | `/GTFS/Urbain/TripUpdate.pb` |
| GTFS-RT VehiclePosition | `/GTFS/Urbain/VehiclePosition.pb` |
| GTFS-RT Alert | `/GTFS/Urbain/Alert.pb` |

Portail : https://data.montpellier3m.fr/dataset/offre-de-transport-tam-en-temps-reel

## OpenTripPlanner (optionnel)

```bash
./scripts/setup-otp.sh
# OTP sur http://localhost:8080
```

L'API utilise le **moteur GTFS direct** en priorité ; OTP en fallback optionnel si le moteur local ne trouve rien.

## Widgets

Nécessitent `npx expo prebuild` + development build.
Voir `widgets/README.md`.

## Variables d'environnement

Voir `.env.example` :
- `OPENAI_API_KEY` — NLP avancé (optionnel)
- `EXPO_PUBLIC_API_URL` — URL backend pour mobile
- `OTP_URL` — OpenTripPlanner (optionnel)

## Roadmap

### V1 ✅
- Backend GTFS + GTFS-RT réel (2133 arrêts, 45 lignes)
- App mobile connectée à l'API
- Recherche NL, itinéraires, horaires temps réel
- 7 langues + accessibilité
- Écran alertes trafic
- Widgets (code natif prêt)

### V2
- Live Activities iOS
- Mode hors-ligne (cache GTFS mobile)
- Favoris + rappels de départ intelligents
- Carte avec positions véhicules temps réel

### V3
- Abonnements / tickets (si API TaM disponible)
- Apple Watch / Wear OS
