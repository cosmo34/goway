# GOWAY

Application de transport en commun pour la **Métropole de Montpellier**.

Horaires en temps réel TaM, itinéraires multimodaux, recherche en langage naturel.

## Liens légaux (App Store)

| | URL |
|---|-----|
| Politique de confidentialité | https://picaza.fr/privacy/goway/ |
| Support | https://picaza.fr/support/goway/ |
| Site Picaza | https://picaza.fr/ |
| Checklist publication | [docs/APP_STORE.md](docs/APP_STORE.md) |

## Démarrage rapide

```bash
npm install
cp .env.example .env

# Lancer backend + mobile
npm run dev
```

Ou séparément :

```bash
npm run api      # Backend → http://localhost:3001
npm run mobile   # Expo → scanner QR code
```

## Publication iOS (EAS)

```bash
cd apps/mobile
eas login
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Configurer `EXPO_PUBLIC_API_URL`, `appleTeamId` et `ascAppId` dans `apps/mobile/eas.json` avant la soumission. Voir [docs/APP_STORE.md](docs/APP_STORE.md).

## Fonctionnalités

- **Carte interactive** sombre
- **Horaires temps réel** TaM via GTFS + GTFS-RT
- **Recherche intuitive**
- **Itinéraire multimodal** (marche + tram/bus)
- **Navigation guidée** + Live Activities iOS
- **Points d'intérêt** à l'arrivée
- **Alertes trafic**
- **Notifications** de départ
- **7 langues** : FR, EN, ES, ZH, AR, DE, IT
- **Accessibilité** : VoiceOver, gros texte, contraste, RTL arabe
- **Widgets** iOS/Android (development build)

## Structure

```
GOWAY/
├── apps/api/          # Backend Node.js (GTFS, routing, NLP)
├── apps/mobile/       # App Expo React Native
├── packages/shared/   # Types partagés
├── widgets/           # WidgetKit + Glance
└── docs/              # Architecture + pages légales (GitHub Pages)
```

## Données

Open Data TaM — Licence ODbL  
https://data.montpellier3m.fr/dataset/offre-de-transport-tam-en-temps-reel

## Plateformes

- iOS 16+ (development build pour widgets / Live Activities)
- Android 10+

## Licence

MIT — voir [LICENSE](LICENSE)
