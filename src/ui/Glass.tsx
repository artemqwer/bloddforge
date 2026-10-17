import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';

import { useSettings } from '../tg/settings';
import { theme } from './theme';

const liquid = isLiquidGlassAvailable();

type GlassProps = {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** 'regular' is the frosted panel; 'clear' is a lighter, more transparent glass. */
  variant?: 'regular' | 'clear';
  tint?: string;
};

/**
 * Liquid Glass surface. Uses the native iOS 26 glass effect where available,
 * falls back to an expo-blur frosted panel elsewhere (incl. Android / old iOS),
 * and to a solid elevated colour on web.
 */
export function Glass({ style, children, variant = 'regular', tint }: GlassProps) {
  const { reduceEffects } = useSettings();
  // Economy mode (or web): a cheap solid surface instead of a live blur/glass layer.
  if (reduceEffects || Platform.OS === 'web') {
    return <View style={[{ backgroundColor: theme.glassFallback }, style]}>{children}</View>;
  }
  if (liquid) {
    return (
      <GlassView style={style} glassEffectStyle={variant} tintColor={tint}>
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView
      intensity={variant === 'clear' ? 40 : 70}
      tint="dark"
      style={[{ backgroundColor: theme.glassTint }, style]}
    >
      {children}
    </BlurView>
  );
}

export const liquidGlassAvailable = liquid;
