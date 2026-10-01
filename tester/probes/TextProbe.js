import React from 'react';
import {AppRegistry, Text, View} from 'react-native';

const tokens = 'a I'.split(' ');
const words = Array.from({length: 200}, (_, index) => tokens[index % tokens.length]).join(' ');

function WidthCase({width}) {
  return (
    <View style={{width, marginBottom: 16}}>
      <Text style={{fontSize: 12, color: '#555'}}>200 words at width {width}</Text>
      <Text style={{fontSize: 14, lineHeight: 18, color: '#111'}}>{words}</Text>
      {width === 100 && (
        <Text numberOfLines={2} style={{fontSize: 14, lineHeight: 18, color: '#111'}}>
          {words}
        </Text>
      )}
    </View>
  );
}

function TextProbe() {
  return (
    <View style={{flex: 1, padding: 20, backgroundColor: '#fff'}}>
      <WidthCase width={100} />
      <WidthCase width={300} />
      <WidthCase width={600} />
      <Text style={{fontSize: 20, color: '#111'}}>
        ÁÉÅ accents; gjpqy descenders; café naïve
      </Text>
      <Text style={{fontSize: 16, lineHeight: 24, color: '#111'}}>
        First line: gjpqy ÁÉÅ{'\n'}Second line: café naïve
      </Text>
      <Text style={{fontSize: 16, lineHeight: 24, color: '#111'}}>
        Normal <Text style={{fontWeight: '700', color: '#2563eb'}}>bold blue</Text>
        {' '}<Text style={{fontStyle: 'italic'}}>italic gjpqy</Text>
      </Text>
    </View>
  );
}

AppRegistry.registerComponent('TextProbe', () => TextProbe);
