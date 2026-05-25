import type { ViewStyle } from 'react-native';
import { useDemoStore } from '@/stores/demoStore';

interface DemoModeResult {
  isDemo: boolean;
  disabledProps: { disabled: boolean; style: ViewStyle };
}

export function useDemoMode(): DemoModeResult {
  const isActive = useDemoStore((s) => s.isActive);
  return {
    isDemo: isActive,
    disabledProps: {
      disabled: isActive,
      style: isActive ? { opacity: 0.4 } : {},
    },
  };
}
