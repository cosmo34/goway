# Fiche App Store Connect — GOWAY

Apple ID : **6806571587** · Bundle : `fr.goway.app` · Version store : **1.1** (READY_FOR_DISTRIBUTION) → **1.2** (nouvelle soumission) · Build app : **1.2.0 (3)**

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

## Notes de version 1.2 (What's New)

### FR
```
• Recherche en langage naturel et assistant conversationnel sur la carte
• Trajets planifiés enregistrés avec rappel 30 min avant le départ
• Live Activity pour les trajets planifiés
• Guidage plus clair : étape en cours uniquement, carte centrée sur votre position
• Interface carte affinée (bulles, modes, horaires)
```

### EN
```
• Natural-language search and conversational assistant on the map
• Save planned trips with a reminder 30 minutes before departure
• Live Activity for planned trips
• Clearer guidance: current step only, map centered on your location
• Refined map UI (bubbles, modes, departure time)
```

## Build & soumission 1.2

```bash
cd apps/mobile
asc publish appstore --app 6806571587 \
  --workspace ios/GOWAY.xcworkspace --scheme GOWAY \
  --version 1.2 --team-id 8RYST2PZHX \
  --metadata-dir ../../docs/asc/metadata/version/1.2 \
  --signing-style automatic --wait --submit --confirm
```
