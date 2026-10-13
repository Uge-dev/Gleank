import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type DividerProps = {
  orientation?: 'horizontal' | 'vertical';
  label?: string;
  thickness?: number;
  color?: string;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
};

export function Divider({
  orientation = 'horizontal',
  label,
  thickness = StyleSheet.hairlineWidth,
  color,
  spacing = Spacing.lg,
  style,
}: DividerProps) {
  const theme = useAppTheme();

  const dividerColor = color ?? theme.colors.divider;

  if (orientation === 'vertical') {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[
          styles.vertical,
          {
            width: thickness,
            backgroundColor: dividerColor,
            marginHorizontal: spacing,
          },
          style,
        ]}
      />
    );
  }

  if (label) {
    return (
      <View
        accessible={false}
accessibilityElementsHidden
importantForAccessibility="no"
        style={[
          styles.labelContainer,
          {
            marginVertical: spacing,
          },
          style,
        ]}
      >
        <View
          style={[
            styles.line,
            {
              height: thickness,
              backgroundColor: dividerColor,
            },
          ]}
        />

        <AppText
          variant="caption"
          tone="muted"
          style={styles.label}
        >
          {label}
        </AppText>

        <View
          style={[
            styles.line,
            {
              height: thickness,
              backgroundColor: dividerColor,
            },
          ]}
        />
      </View>
    );
  }

  return (
    <View
     accessible={false}
accessibilityElementsHidden
importantForAccessibility="no"
      style={[
        styles.horizontal,
        {
          height: thickness,
          backgroundColor: dividerColor,
          marginVertical: spacing,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: {
    width: '100%',
  },

  vertical: {
    alignSelf: 'stretch',
  },

  labelContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },

  line: {
    flex: 1,
  },

  label: {
    paddingHorizontal: Spacing.md,
  },
});