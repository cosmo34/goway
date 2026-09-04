# Fiche App Store Connect — GOWAY (prête à coller)

> Tentative d’écriture via API ASC le 4 sept. 2026 : **refusée (403)**.  
> La clé `QLS629377F` n’a pas les droits d’écriture.  
> Régénérer une clé avec rôle **Admin** ou **App Manager**, ou coller manuellement ci-dessous.

Apple ID : **6806571587** · Bundle : `fr.goway.app` · Version : **1.0** · État : Prepare for Submission

---

## Informations sur l’app (fr-FR)

| Champ | Valeur |
|--------|--------|
| **Nom** | GOWAY |
| **Sous-titre** (≤30) | Transports Montpellier TaM |
| **URL confidentialité** | https://picaza.fr/privacy/goway/ |
| **Catégorie principale** | Navigation |
| **Catégorie secondaire** | Voyages |
| **Copyright** | 2026 Picaza |

## Version 1.0 — Localisation française

**URL support :** https://picaza.fr/support/goway/  
**URL marketing :** https://picaza.fr/

**Texte promotionnel :**
```
Horaires temps réel TaM, itinéraires et navigation guidée pour Montpellier.
```

**Mots-clés** (≤100) :
```
tram,bus,montpellier,tam,horaire,itinéraire,transport,navigation,temps réel
```

**Description :**
```
GOWAY vous aide à vous déplacer sur le réseau TaM (Métropole de Montpellier) :

• Horaires tram et bus en temps réel
• Itinéraires multimodaux (marche + transport)
• Navigation guidée étape par étape
• Live Activities iOS pendant le trajet
• Widgets et suivi d’arrêt
• Recherche de destinations et lieux
• Alertes trafic
• 7 langues et options d’accessibilité (VoiceOver, contraste, RTL)

Données open data TaM (licence ODbL). Connexion Internet requise. Fonctionne principalement à Montpellier et alentours.
```

**Nouveautés :**
```
Première version de GOWAY : horaires temps réel, itinéraires multimodaux, navigation guidée et Live Activities.
```

---

## Localisation anglaise (en-US) — à ajouter

| Champ | Valeur |
|--------|--------|
| **Name** | GOWAY |
| **Subtitle** | Montpellier TaM Transit |
| **Privacy URL** | https://picaza.fr/privacy/goway/ |
| **Support URL** | https://picaza.fr/support/goway/ |
| **Marketing URL** | https://picaza.fr/ |

**Keywords :**
```
tram,bus,montpellier,tam,schedule,route,transit,navigation,realtime
```

**Description :**
```
GOWAY helps you get around Montpellier’s TaM transit network:

• Real-time tram and bus schedules
• Multimodal routes (walk + transit)
• Step-by-step guided navigation
• iOS Live Activities during your trip
• Widgets and stop tracking
• Destination search
• Traffic alerts
• 7 languages and accessibility options

Powered by TaM open data (ODbL). Internet connection required. Mainly designed for Montpellier and surrounding areas.
```

**What’s New :**
```
First release of GOWAY: real-time schedules, multimodal routing, guided navigation and Live Activities.
```

---

## Notes pour la review Apple

```
L’app nécessite une connexion Internet et fonctionne principalement à Montpellier (réseau TaM).
Autoriser la localisation pour les itinéraires et la navigation.
Compte de démo : non requis.
Contact : contact@picaza.fr
```

## Encore à faire manuellement

1. **Captures d’écran** iPhone (6.7" / 6.5" minimum) — et iPad si `supportsTablet`
2. **Classification par âge** / questionnaire confidentialité App Store
3. **Build** uploadée (EAS / Xcode Archive)
4. Droits API : clé avec rôle **Admin** ou **App Manager** pour écrire via API

### Activer l’écriture API

App Store Connect → Utilisateurs et accès → Intégrations → App Store Connect API  
→ créer une clé avec accès **Admin** / **App Manager** → remplacer le `.p8` et le Key ID dans `~/.config/picaza/asc/`  
Puis redemander : « remplis la fiche GOWAY via l’API ».
