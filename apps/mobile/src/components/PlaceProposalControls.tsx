import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MapControlButton } from './MapControlButton';
import { spacing } from '../theme';

interface PlaceProposalControlsProps {
  total: number;
  /** Distance depuis le haut pour centrer les flèches dans la zone carte visible. */
  arrowTop: number;
  onPrev: () => void;
  onNext: () => void;
}

/** Flèches latérales pour parcourir les propositions (détails sur le marqueur carte). */
export function PlaceProposalControls({
  total,
  arrowTop,
  onPrev,
  onNext,
}: PlaceProposalControlsProps) {
  const { t } = useTranslation();
  if (total < 2) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={[styles.side, styles.left, { top: arrowTop }]}>
        <MapControlButton
          icon="chevron-back"
          onPress={onPrev}
          accessibilityLabel={t('map.previousPlace')}
        />
      </View>
      <View style={[styles.side, styles.right, { top: arrowTop }]}>
        <MapControlButton
          icon="chevron-forward"
          onPress={onNext}
          accessibilityLabel={t('map.nextPlace')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 28,
    elevation: 28,
  },
  side: {
    position: 'absolute',
    marginTop: -22,
  },
  left: {
    left: spacing.md,
  },
  right: {
    right: spacing.md,
  },
});
