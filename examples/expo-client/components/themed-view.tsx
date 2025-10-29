import { StyleSheet, View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  variant?:
    | 'default'
    | 'section'
    | 'card'
    | 'statBox'
    | 'infoSection'
    | 'successBox'
    | 'errorBox'
    | 'warningBox';
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  variant = 'default',
  ...otherProps
}: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return (
    <View
      style={[
        { backgroundColor },
        variant === 'section' ? styles.section : undefined,
        variant === 'card' ? styles.card : undefined,
        variant === 'statBox' ? styles.statBox : undefined,
        variant === 'infoSection' ? styles.infoSection : undefined,
        variant === 'successBox' ? styles.successBox : undefined,
        variant === 'errorBox' ? styles.errorBox : undefined,
        variant === 'warningBox' ? styles.warningBox : undefined,
        style
      ]}
      {...otherProps}
    />
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  card: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  infoSection: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  successBox: {
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
    borderRadius: 4,
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: '#d32f2f',
    borderRadius: 4,
  },
  warningBox: {
    padding: 12,
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    borderRadius: 4,
  },
});
