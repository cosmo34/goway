# Fiche App Store Connect — GOWAY

Apple ID : **6806571587** · Bundle : `fr.goway.app` · Version store : **1.0** (publiée) → **1.1** (nouvelle soumission) · Build app : **1.1.0 (2)**

## Rempli via API

| Champ | Valeur |
|--------|--------|
| Nom FR | GOWAY |
| Sous-titre FR | Transports Montpellier TaM |
| Nom EN | GOWAY Montpellier |
| Sous-titre EN | Montpellier TaM Transit |
| Catégories | Navigation + Voyages |
| Copyright | 2026 Picaza |
| Confidentialité | https://picaza.fr/privacy/goway/ |
| Support | https://picaza.fr/support/goway/ |
| Marketing | https://picaza.fr/ |
| Description / keywords FR+EN | OK |
| Texte promo FR+EN | OK |
| Classification âge | **4+** |
| IDFA | Non |
| Content rights | Does not use third-party content |
| Infos review | contact@picaza.fr + notes review |
| Prix | Gratuit |

## Notes de version 1.1 (What's New)

### FR
```
• Itinéraires plus fiables (bons sens, moins de détours)
• Marche qui suit les rues ; ligne droite sur les places
• Guidage navigation amélioré (GPS, étapes)
• Mode chat et suggestions de lieux
• Corrections d’arrêts affichés sur l’itinéraire
```

### EN
```
• More reliable routes (correct direction, fewer detours)
• Walking paths follow streets; straight lines across plazas
• Improved in-app navigation guidance
• Chat mode and place suggestions
• Fixes for stops shown along your itinerary
```

## Build & soumission 1.1

```bash
cd apps/mobile
# Archive / upload locaux via asc (team 8RYST2PZHX)
asc publish appstore --app 6806571587 \
  --workspace ios/GOWAY.xcworkspace --scheme GOWAY \
  --version 1.1 --team-id 8RYST2PZHX \
  --signing-style automatic --wait --submit --confirm
```
