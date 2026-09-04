# Checklist App Store — GOWAY

## URLs légales (GitHub Pages)

Après activation de GitHub Pages (source : dossier `/docs`, branche `main`) :

| Usage App Store Connect | URL |
|-------------------------|-----|
| **Privacy Policy** | https://cosmo34.github.io/goway/privacy/ |
| **Support URL** | https://cosmo34.github.io/goway/support/ |
| Marketing (optionnel) | https://cosmo34.github.io/goway/ |

Versions par langue : `/privacy/fr.html`, `/privacy/en.html`, `/support/ar.html`, etc.  
Langues : **fr, en, es, de, it, zh, ar**.

## Prérequis

- [ ] Compte [Apple Developer](https://developer.apple.com) (99 €/an)
- [ ] App créée sur [App Store Connect](https://appstoreconnect.apple.com) — Bundle ID `fr.goway.app`
- [ ] Capabilities : App Groups (`group.fr.goway.app`), Push Notifications, Live Activities
- [ ] Extension Bundle ID : `fr.goway.app.GowayLiveActivity`
- [ ] API de production en **HTTPS** (remplacer `EXPO_PUBLIC_API_URL` si besoin dans `eas.json`)
- [ ] E-mail support réel (actuellement `support@goway.app` dans les pages légales)

## Métadonnées App Store Connect (suggestion)

- **Nom** : GOWAY  
- **Sous-titre** : Transports Montpellier TaM  
- **Catégorie principale** : Navigation  
- **Catégorie secondaire** : Voyages  
- **Tranche d’âge** : 4+  
- **Prix** : Gratuit  

### Description courte (FR)

Horaires temps réel, itinéraires et navigation pour le réseau TaM à Montpellier.

### Description (FR)

GOWAY vous aide à vous déplacer sur le réseau TaM (Métropole de Montpellier) :

• Horaires tram et bus en temps réel  
• Itinéraires multimodaux (marche + transport)  
• Navigation guidée étape par étape  
• Live Activities iOS pendant le trajet  
• Widgets et suivi d’arrêt  
• Accessible (VoiceOver, contraste, 7 langues)

Données open data TaM (licence ODbL).

## Confidentialité App Store (questionnaire)

Déclarer notamment :

- **Location** — Precise Location — App Function (itinéraires / navigation) — liée à l’utilisateur, non utilisée pour le tracking publicitaire  
- **Identifiers** — Device ID (si notifications / Live Activities) — App Function  
- **Product Interaction** / diagnostics éventuels selon ce que vous collectez réellement côté API  

Ne pas cocher « Used for Tracking » si vous ne faites pas de tracking publicitaire (ATT).

## Build & soumission

```bash
cd apps/mobile
npm install -g eas-cli
eas login
eas build:configure   # si besoin
# Remplir appleTeamId + ascAppId dans eas.json

# Build production iOS
eas build --platform ios --profile production

# Soumission
eas submit --platform ios --profile production
```

Ou en local :

```bash
cd apps/mobile
APP_VARIANT=production EXPO_PUBLIC_API_URL=https://api.goway.app npx expo prebuild --platform ios --clean
# Puis Archive dans Xcode → Distribute App Store Connect
```

## Encryption export compliance

`ITSAppUsesNonExemptEncryption = false` est déjà défini dans `app.json` (HTTPS standard uniquement).

## Assets requis

- Icône 1024×1024 (sans transparence) — générer depuis `apps/mobile/assets/icon.png` si besoin  
- Captures iPhone 6.7" / 6.5" (et iPad si `supportsTablet`)  
- Politique de confidentialité URL (ci-dessus)  

## Après review

Incrémenter `expo.version` dans `app.json` pour chaque release store ; EAS `autoIncrement` gère le build number iOS.
