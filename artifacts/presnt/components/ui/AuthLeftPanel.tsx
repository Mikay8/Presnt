import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';

const DARK_BG = '#272018';

const BULLETS = [
  'QR + geofence check-in',
  'Excuses, dues, status in one place',
  'Attendance management for all organizations',
];

const MEMBER_COLORS = ['#CA8A04', '#22C55E', '#A855F7', '#E26B4A'];

/** Dark marketing panel shown on the left on wide/desktop auth screens. */
export function AuthLeftPanel() {
  return (
    <View style={styles.panel}>
      {/* Logo */}
      <View style={styles.logoRow}>
        <Image
          source={require('@/assets/images/wordmark-dark.png')}
          style={styles.logoIcon}
          resizeMode="contain"
        />
      </View>

      {/* Headline + bullets */}
      <View style={styles.body}>
        <Text weight="bold" color="#FBF6EE" style={styles.headline}>
          Attendance that{'\n'}actually shows up.
        </Text>

        <View style={styles.bullets}>
          {BULLETS.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={10} color="#FBF6EE" />
              </View>
              <Text size="sm" color="#C9BFB1">{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Decorative concentric rings — absolute, bottom-right */}
      <View style={styles.ringOuter} pointerEvents="none">
        <View style={styles.ringMid} />
        <View style={styles.ringInner} />
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <View style={styles.memberDots}>
          {MEMBER_COLORS.map((color, i) => (
            <View
              key={color}
              style={[styles.memberDot, { backgroundColor: color, marginLeft: i === 0 ? 0 : -8 }]}
            />
          ))}
        </View>
        <Text size="sm" color="#6E5E54" style={styles.trustedText}>
          Trusted by 1+ chapters
        </Text>
      </View>
    </View>
  );
}

const RING_SIZE = 480;

const styles = StyleSheet.create({
  panel: {
    width: '45%',
    backgroundColor: DARK_BG,
    padding: 36,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 190,
    height: 190,
  },
  body: {
    gap: 24,
  },
  headline: {
    fontSize: 36,
    lineHeight: 44,
  },
  bullets: {
    gap: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E26B4A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Concentric rings
  ringOuter: {
    position: 'absolute',
    bottom: -RING_SIZE * 0.45,
    right: -RING_SIZE * 0.35,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringMid: {
    width: RING_SIZE * 0.67,
    height: RING_SIZE * 0.67,
    borderRadius: (RING_SIZE * 0.67) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    position: 'absolute',
    width: RING_SIZE * 0.35,
    height: RING_SIZE * 0.35,
    borderRadius: (RING_SIZE * 0.35) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  // Bottom
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: DARK_BG,
  },
  trustedText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
});
