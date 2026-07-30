import React from 'react';
import { Text, TextProps, StyleProp, TextStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { gradient } from '../theme/colors';

// Renders text filled with the brand gradient (web's .g-text). The text is used
// as a mask over a LinearGradient.
export function GradientText({ style, children, ...rest }: TextProps & { style?: StyleProp<TextStyle> }) {
  return (
    <MaskedView
      maskElement={
        <Text {...rest} style={[style, { backgroundColor: 'transparent' }]}>
          {children}
        </Text>
      }
    >
      <LinearGradient
        colors={gradient.colors}
        locations={gradient.locations}
        start={gradient.start}
        end={gradient.end}
      >
        {/* Invisible copy sets the gradient's size to the text bounds */}
        <Text {...rest} style={[style, { opacity: 0 }]}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}
