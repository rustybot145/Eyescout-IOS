import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { GradientButton } from './GradientButton';

// Root-level safety net: an uncaught render error anywhere in the tree used to
// white-screen the whole app with no way back (App Review flags this as a
// crash). This catches it and offers a reload instead of a dead screen.
type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          Sorry about that — please try again. If it keeps happening, reach out at{' '}
          <Text style={styles.email}>info@eyescoutsports.com</Text>.
        </Text>
        <View style={styles.btn}>
          <GradientButton label="Try Again" onPress={this.reset} />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: {
    fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.5, textTransform: 'uppercase',
    color: colors.white, textAlign: 'center', marginBottom: 14,
  },
  body: { color: colors.muted, fontSize: 14.5, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  email: { color: colors.white, fontWeight: '700' },
  btn: { width: '100%', maxWidth: 300 },
});
