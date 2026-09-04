import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import type { Coordinates } from '../stores/transitStore';

interface MapAppOption {
  id: string;
  nameKey: keyof DirectionsPickerLabels;
  url: string;
}

export interface DirectionsPickerLabels {
  pickerTitle: string;
  cancel: string;
  unavailable: string;
  mapsApple: string;
  mapsGoogle: string;
  mapsWaze: string;
  mapsCitymapper: string;
  mapsMoovit: string;
}

function buildIosMapApps(
  destination: Coordinates,
  label: string,
  mode: 'driving' | 'walking'
): MapAppOption[] {
  const { latitude, longitude } = destination;
  const encodedLabel = encodeURIComponent(label);
  const coords = `${latitude},${longitude}`;
  const appleDirFlag = mode === 'walking' ? '&dirflg=w' : '';
  const googleMode = mode === 'walking' ? 'walking' : 'driving';

  return [
    {
      id: 'apple-maps',
      nameKey: 'mapsApple',
      url: `http://maps.apple.com/?daddr=${coords}&q=${encodedLabel}${appleDirFlag}`,
    },
    {
      id: 'google-maps',
      nameKey: 'mapsGoogle',
      url: `comgooglemaps://?daddr=${coords}&directionsmode=${googleMode}`,
    },
    {
      id: 'waze',
      nameKey: 'mapsWaze',
      url: `waze://?ll=${coords}&navigate=yes`,
    },
    {
      id: 'citymapper',
      nameKey: 'mapsCitymapper',
      url: `citymapper://directions?endcoord=${coords}&endname=${encodedLabel}`,
    },
    {
      id: 'moovit',
      nameKey: 'mapsMoovit',
      url: `moovit://directions?dest_lat=${latitude}&dest_lon=${longitude}`,
    },
  ];
}

async function getAvailableIosMapApps(
  destination: Coordinates,
  label: string,
  mode: 'driving' | 'walking' = 'driving'
): Promise<MapAppOption[]> {
  const available: MapAppOption[] = [];

  for (const app of buildIosMapApps(destination, label, mode)) {
    if (app.id === 'apple-maps') {
      available.push(app);
      continue;
    }
    try {
      if (await Linking.canOpenURL(app.url)) available.push(app);
    } catch {
      // Scheme not declared in Info.plist — skip.
    }
  }

  return available;
}

async function openMapUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function openAndroidMapChooser(
  destination: Coordinates,
  label: string
): Promise<boolean> {
  const { latitude, longitude } = destination;
  const encodedLabel = encodeURIComponent(label);
  const geoUrl = `geo:0,0?q=${latitude},${longitude}(${encodedLabel})`;

  if (await openMapUrl(geoUrl)) return true;

  return openMapUrl(`google.navigation:q=${latitude},${longitude}`);
}

export function promptDirectionsChoice(
  destination: Coordinates,
  label: string,
  labels: DirectionsPickerLabels
): void {
  void showDirectionsPicker(destination, label, labels, 'driving');
}

export function promptWalkingDirections(
  destination: Coordinates,
  label: string,
  labels: DirectionsPickerLabels
): void {
  void showDirectionsPicker(destination, label, labels, 'walking');
}

function showDirectionsPicker(
  destination: Coordinates,
  label: string,
  labels: DirectionsPickerLabels,
  mode: 'driving' | 'walking'
): void {
  void (async () => {
    if (Platform.OS === 'android') {
      const ok = await openAndroidMapChooser(destination, label);
      if (!ok) Alert.alert(label, labels.unavailable);
      return;
    }

    const apps = await getAvailableIosMapApps(destination, label, mode);
    if (apps.length === 0) {
      Alert.alert(label, labels.unavailable);
      return;
    }

    if (apps.length === 1) {
      const ok = await openMapUrl(apps[0].url);
      if (!ok) Alert.alert(label, labels.unavailable);
      return;
    }

    const optionLabels = [...apps.map((app) => labels[app.nameKey]), labels.cancel];
    const cancelButtonIndex = optionLabels.length - 1;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: label,
        message: labels.pickerTitle,
        options: optionLabels,
        cancelButtonIndex,
      },
      (index) => {
        if (index === undefined || index === cancelButtonIndex) return;
        void (async () => {
          const ok = await openMapUrl(apps[index].url);
          if (!ok) Alert.alert(label, labels.unavailable);
        })();
      }
    );
  })();
}
