import type { ReactNode } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    View,
    type ScrollViewProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import {
    SafeAreaView,
    type Edge,
} from 'react-native-safe-area-context';

import { useAppTheme } from '@/hooks/use-app-theme';

type ScreenProps = {
  children: ReactNode;
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  edges?: Edge[];
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
};

export function Screen({
  children,
  scrollable = false,
  keyboardAvoiding = true,
  edges = ['top', 'left', 'right'],
  backgroundColor,
  style,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  refreshControl,
}: ScreenProps) {
  const theme = useAppTheme();

  const selectedBackgroundColor =
    backgroundColor ?? theme.colors.background;

  const content = scrollable ? (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.scrollContent,
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={
        Platform.OS === 'ios' ? 'interactive' : 'on-drag'
      }
      refreshControl={refreshControl}
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[
        styles.safeArea,
        { backgroundColor: selectedBackgroundColor },
        style,
      ]}
    >
      <StatusBar
        animated
        translucent={false}
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={selectedBackgroundColor}
      />

      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  keyboardView: {
    flex: 1,
  },

  content: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
  },
});