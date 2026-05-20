import React from 'react';
import { Image, View, ViewStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface Props {
  uri?: string | null;
  name?: string;
  size?: Size;
  style?: ViewStyle;
}

const dimensions: Record<Size, number> = { sm: 32, md: 40, lg: 56, xl: 72 };
const textSize: Record<Size, 'xs' | 'sm' | 'md' | 'lg'> = { sm: 'xs', md: 'sm', lg: 'md', xl: 'lg' };

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

export function Avatar({ uri, name, size = 'md', style }: Props) {
  const { theme } = useThemeStore();
  const dim = dimensions[size];

  const containerStyle: ViewStyle = {
    width: dim,
    height: dim,
    borderRadius: dim / 2,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  };

  return (
    <View style={[containerStyle, style]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: dim, height: dim }} />
      ) : (
        <Text size={textSize[size]} weight="medium" color={theme.colors.textMuted}>
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}
