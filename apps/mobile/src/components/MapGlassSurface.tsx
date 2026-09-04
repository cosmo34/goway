import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { radius } from '../theme';

export function MapGlassBackground() {
  return (
    <>
      {Platform.OS === 'ios' ? (
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={28} tint="dark" />
        </View>
      ) : null}
      <View style={mapGlassSurfaceStyles.tint} />
    </>
  );
}

export const mapGlassSurfaceStyles = StyleSheet.create({
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(14, 14, 16, 0.42)',
  },
  panel: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
});
