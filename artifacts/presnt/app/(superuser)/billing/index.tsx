import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { su } from '../_layout';

export default function SuperuserBillingScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  return (
    <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: su.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Ionicons name="card-outline" size={28} color={su.textSubtle} />
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: su.warning + '22', borderWidth: 1, borderColor: su.warning + '44', marginBottom: 16 }}>
        <Text style={{ color: su.warning, fontSize: 12, fontWeight: '600', letterSpacing: 0.8 }}>PENDING</Text>
      </View>
      <Text style={{ color: su.text, fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
        Billing
      </Text>
      <Text style={{ color: su.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 340 }}>
        Stripe integration not yet built.{'\n'}
        This section will show subscription management, failed payments, and webhook logs once billing is connected.
      </Text>
    </View>
  );
}
