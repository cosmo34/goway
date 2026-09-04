# Widgets GOWAY

Les widgets et Live Activities nécessitent un **development build** Expo (pas Expo Go).

## Live Activity — navigation & départs

### Comportement
- **Navigation** : au lancement d’un itinéraire, une Live Activity affiche l’étape courante (marche, transit, arrivée), la distance restante et le compteur d’étapes. Les mises à jour suivent la position GPS comme dans l’app.
- **Suivi d’arrêt** : tap sur le nom de l’arrêt dans la fiche station.

### Fichiers
```
apps/mobile/ios-widgets/GowayLiveActivity/   # Extension Live Activity (copiée au prebuild)
apps/mobile/modules/goway-shared/ios/        # Types ActivityKit partagés
apps/mobile/modules/goway-native/ios/        # Bridge Expo → ActivityKit
```

### Build iOS production
```bash
cd apps/mobile
APP_VARIANT=production npx expo prebuild --platform ios
npx expo run:ios --configuration Release
```

> Le variant `personal` (GOWAY Dev) désactive les Live Activities dans `app.config.js`.

## iOS — WidgetKit (écran d’accueil)

```
widgets/ios/GowayWidget/
├── GowayWidget.swift          # Widget principal
├── GowayWidgetBundle.swift    # Bundle
├── DepartureTimeline.swift    # Timeline prochains départs
└── Info.plist
```

### Configuration requise
1. `npx expo prebuild` pour générer le projet Xcode natif
2. Ajouter une Widget Extension dans Xcode
3. App Group : `group.fr.goway.app` pour partager les données
4. L'app écrit les départs favoris dans UserDefaults partagé
5. Le widget lit via `GET /api/widget/departures?stopId=XXX`

### Fichier Swift de référence

Voir `widgets/ios/GowayWidget/GowayWidget.swift`

## Android — Jetpack Glance

```
widgets/android/
├── GowayWidget.kt             # AppWidget Glance
├── DepartureWidgetReceiver.kt
└── res/xml/goway_widget_info.xml
```

### Configuration requise
1. `npx expo prebuild` pour générer le projet Android natif
2. Ajouter le module widget dans `android/app/src/main/`
3. Configurer `WorkManager` pour rafraîchir toutes les 15 min
4. Appeler l'API backend en arrière-plan

## Données partagées

L'app mobile stocke dans AsyncStorage / App Group :
- `favoriteStopId` : arrêt favori pour le widget
- `favoriteStopName` : nom affiché
- `lastDepartures` : cache JSON des 3 prochains départs

## Build

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```
