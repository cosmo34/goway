import { View, StyleSheet } from 'react-native';
import { spacing } from '../theme';
import { MapControlButton } from './MapControlButton';

interface MapFloatingControlsProps {
  bottom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function MapFloatingControls({ bottom, onZoomIn, onZoomOut }: MapFloatingControlsProps) {
  return (
    <View style={[styles.wrapper, { bottom }]}>
      <MapControlButton icon="add-outline" onPress={onZoomIn} accessibilityLabel="Zoomer" />
      <MapControlButton icon="remove-outline" onPress={onZoomOut} accessibilityLabel="Dézoomer" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: spacing.lg,
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 30,
    elevation: 30,
  },
});
