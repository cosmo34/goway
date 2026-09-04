# GOWAY — Guide multi-villes

Ce document décrit comment le réseau, le routage, les tracés carte et l’app mobile sont structurés aujourd’hui (Montpellier / TaM), et comment ajouter une nouvelle ville en conservant le même niveau de qualité.

## Principe directeur

| Couche | Rôle | Spécifique ville ? |
|--------|------|-------------------|
| **Mobile** (`apps/mobile`) | UI, carte, navigation, appels API | Non — réutilisable tel quel |
| **API REST** (`apps/api/src/routes`) | Contrat HTTP stable | Non |
| **Moteur métier** (`apps/api/src/services/*`) | GTFS, routage, géométrie, horaires | Non — paramétré par les données |
| **Configuration ville** (`config`, `data/`) | URLs GTFS, bornes carte, lieux connus, couleurs | **Oui** |
| **Données open data** | GTFS, GTFS-RT, tracés réseau, POI | **Oui** |

L’objectif pour une nouvelle ville : **ne changer que la config et les jeux de données**, pas la logique de routage ni l’app mobile.

---

## Flux bout-en-bout (itinéraire)

```
Mobile                          API                           Données
──────                          ───                           ──────
SearchBar / carte
    │
    ▼
transitApi.planRoutes() ──────► POST /api/routes/plan
                                    │
                                    ▼
                              routingService.planGtfsRoutes()
                              ├─ hubs (stations GTFS)
                              ├─ findDirectRoutes()
                              ├─ findOneTransferRoutes()
                              ├─ filterDominatedRoutes()
                              └─ dedupeRoutes()
                                    │
                                    ▼ (fallback si vide)
                              tryOtpRoutes() ──► OpenTripPlanner (optionnel)

Mobile prefetch géométrie
    │
    ▼
transitApi.buildRouteGeometry() ► POST /api/routes/geometry
                                    │
                                    ▼
                              shapeService.attachRouteGeometriesAsync()
                              ├─ getNetworkShapeSegment()  (tracés officiels MMM / réseau)
                              ├─ getTripShapeSegment()     (GTFS shapes si présents)
                              └─ osrmService               (bus / fallback marche)

Mobile carte
    │
    ▼
buildRouteMapSegments(route)  — un segment par leg (walk = pointillés, transit = plein)
TransitMap routeSegments
```

---

## Backend — fichiers clés

### Chargement GTFS (`gtfsLoader.ts`)

- Télécharge et parse le ZIP GTFS au démarrage.
- Expose : `stops`, `routes`, `trips`, `stopTimesByTrip`, `stopTimesByStop`, `shapes`.
- **Stations** : `getStationId()` / `getStationStopIds()` regroupent les quais d’un même pôle (ex. Comédie = plusieurs `stop_id`).
- **Service day** : `getServiceDate()` (minuit fuseau Paris) pour interpréter les horaires GTFS.

**Nouvelle ville** : pointer `TAM.gtfs.*` (ou équivalent) dans `config.ts` vers le GTFS de l’agence.

### Routage (`routingService.ts`)

Moteur principal (sans OTP). Points importants :

| Fonction | Rôle |
|----------|------|
| `getNearestStationHubs()` | Pôles d’accès origine / destination (rayon 1,5 km) |
| `buildReachableStopIds()` | Arrêts atteignables à pied depuis un point (rayon 600 m origine, 800 m destination) |
| `collectDepartures()` | Départs possibles aux arrêts d’origine (cache par ensemble d’arrêts) |
| `filterBoardableDepartures()` | **Critique** : temps de marche **par arrêt de montée**, pas un minimum global |
| `findDestOnTrip()` | Arrêt de descente = le plus proche géographiquement de la destination parmi les arrêts du trip **après** la montée |
| `isLongWayAroundTrip()` | Rejette les trajets qui parcourent > 52 % du trip (évite le « tour complet » de la ligne) |
| `findDirectRoutes()` | Trajets directs 0 correspondance |
| `findOneTransferRoutes()` | 1 correspondance |
| `filterDominatedRoutes()` | Supprime les options plus lentes ET plus de marche |
| `getItineraryStopIds()` | Liste des arrêts réellement parcourus (filtrage carte mobile) |

Constantes à ajuster si besoin : `MAX_SCAN_DEPARTURES` (120), fenêtre scan 45 min, `MAX_TRANSIT_LEG_MINUTES` (90).

### Géométrie réseau (`networkShapeService.ts`)

- Charge les tracés officiels (JSON lignes tram/bus Montpellier MMM).
- `buildTripLineShape()` : tracé dense d’un trip (snap arrêts sur polyligne).
- `getNetworkShapeSegment()` : segment entre deux arrêts d’un trip :
  1. Tracé officiel découpé
  2. Découpe sur `buildTripLineShape` (gaps GPS tolérés sur tracés denses)
  3. Fallback `buildShapeAlongStopIds` / OSRM bus

**Nouvelle ville** : fournir l’équivalent des JSON MMM ou s’appuyer sur `shapes.txt` GTFS + OSRM pour les bus.

### Assemblage géométrie itinéraire (`shapeService.ts`)

- `getTripShapeSegmentAsync()` : segment d’un leg ; valide le tracé via `shapeNeedsRoadRouting()`.
- Bus / `tram_bus` : routage OSRM si tracé trop pauvre.
- Tram : conserve les tracés denses même avec petits gaps GPS.

### Autres services

| Fichier | Rôle |
|---------|------|
| `stopService.ts` | Recherche, proximité, bbox arrêts |
| `lineService.ts` | Métadonnées lignes, détail ligne + shape |
| `gtfsRtService.ts` | Retards temps réel (TripUpdate) |
| `osrmService.ts` | Marche et bus (OSRM foot) |
| `placesService.ts` / `geocodingService.ts` | Lieux, géocodage (partiellement Montpellier-centré) |

---

## Mobile — fichiers clés

| Fichier | Rôle |
|---------|------|
| `app/(tabs)/index.tsx` | Carte, planification, prefetch géométrie, navigation |
| `services/api/transitApi.ts` | Client HTTP (`/api/routes/plan`, `/geometry`) |
| `services/routing/routingService.ts` | `collectRouteStops`, `buildRouteMapSegments`, merge arrêts carte |
| `stores/transitStore.ts` | État itinéraires, `itineraryStopIds`, arrêts visibles |
| `components/TransitMap.tsx` | Polylignes (transit plein, marche pointillé fin) |
| `config/tam.ts` | Bornes carte Montpellier |
| `utils/mapRegion.ts` | Région par défaut, zone de service |

### Affichage itinéraire sur carte

- `buildRouteMapSegments()` produit un tableau `{ coordinates, dashed, color }` par leg.
- `leg.mode === 'walk'` → `dashed: true` (pointillés fins dans `TransitMap`).
- `leg.mode !== 'walk'` → couleur `lineColor`, trait plein.

### Éviter les régressions carte

- Toujours passer `itineraryStopIds` depuis l’API jusqu’au store.
- `collectRouteStops()` ne doit retourner **que** les arrêts de l’itinéraire, pas tout le viewport.
- Prefetch géométrie : itinéraire prévisualisé en priorité (`geometryInFlightRef` par route).

---

## Configuration Montpellier (référence)

```
apps/api/src/config.ts
  TAM.gtfs / TAM.gtfsRt     → URLs open data
  KNOWN_PLACES              → NLP local
  LINE_COLORS               → Tram 1–5

apps/api/src/services/networkShapeService.ts
  TRAM_LINES_URL / BUS_LINES_URL  → JSON MMM

apps/mobile/src/config/tam.ts
  MONTPELLIER_BOUNDS        → centre carte, bbox service

apps/api/data/montpellierPlaces.ts
  Lieux curatés recherche
```

---

## Checklist — ajouter une ville

### 1. Données

- [ ] GTFS statique (agency, stops, routes, trips, stop_times, calendar)
- [ ] GTFS-RT si temps réel souhaité (TripUpdate, VehiclePosition, Alert)
- [ ] Tracés lignes officiels (JSON/API agence) ou `shapes.txt` GTFS complets
- [ ] Vérifier `location_type` stations et regroupement quais (`parent_station`)

### 2. Config API

- [ ] Créer un bloc config ville (URLs GTFS, GTFS-RT, shapes)
- [ ] Bornes géographiques + centre carte
- [ ] `LINE_COLORS` / couleurs depuis `routes.txt`
- [ ] `KNOWN_PLACES` + fichier lieux curatés pour la recherche
- [ ] Alias lignes substitution si applicable (`ROUTE_LINE_ALIASES` dans `networkShapeService.ts`)

### 3. Validation routage

Exécuter un audit local (adapter les coordonnées) :

```bash
cd apps/api
node --import tsx -e "
import { loadGtfs } from './src/services/gtfsLoader.ts';
import { planRoutes } from './src/services/routingService.ts';
await loadGtfs();
const r = await planRoutes(ORIG_LAT, ORIG_LON, DEST_LAT, DEST_LON, new Date(), 5);
console.log(r.map(x => x.legs.filter(l=>l.mode!=='walk').map(l=>'L'+l.lineShortName)));
"
```

Contrôles manuels :

- Pas de « tour complet » de ligne (vérifier `isLongWayAroundTrip`)
- Pas de marche seule quand un tram/bus direct existe
- Descente au bon arrêt (pas un arrêt intermédiaire plus proche à vol d’oiseau mais avant la vraie destination)

### 4. Validation géométrie

- Segments tram denses (> 10 points), pas de simple ligne droite sur longues distances
- Bus périurbains : fallback OSRM si tracé MMM absent
- `shapeNeedsRoadRouting()` ne doit pas rejeter à tort les tracés denses

### 5. Mobile

- [ ] `defaultMapRegion()` / zone de service
- [ ] `EXPO_PUBLIC_API_URL` pointant vers l’API de la ville
- [ ] Test UI : 3 propositions, tracés tram corrects, marche en pointillés, arrêts filtrés

### 6. Optionnel

- [ ] OTP : `docker-compose.yml` + `scripts/setup-otp.sh` avec le GTFS de la ville
- [ ] Widgets / alertes : mêmes endpoints, données GTFS-RT de l’agence

---

## Évolutions architecture recommandées (multi-villes)

Aujourd’hui Montpellier est **implicitement** la ville unique. Pour plusieurs villes en production :

1. **`CityProfile`** dans `config` : `{ id, gtfs, gtfsRt, shapes, bounds, places, lineColors }`
2. **Header ou query `cityId`** sur l’API (`/api/routes/plan?city=montpellier`)
3. **Cache GTFS par ville** : `data/gtfs/{cityId}/`
4. **Mobile** : sélection ville (ou détection bbox) → envoie `cityId` à chaque appel
5. **Tests d’audit** par ville dans `apps/api/scripts/audit-routing.ts`

La logique dans `routingService.ts` et `networkShapeService.ts` reste inchangée ; seul le contexte ville injecté au démarrage change.

---

## Références

- Architecture générale : [ARCHITECTURE.md](./ARCHITECTURE.md)
- Open data TaM : https://data.montpellier3m.fr
