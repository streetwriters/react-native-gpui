import React from 'react';
import { AppRegistry, Image, Text, View } from 'react-native';

const dataImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAA4klEQVR4nO3QQaoBABiFUSuxkrew10uSJEmSJEmSJEmSJEmSJEmSJMlevLMGU//gDO/gfonk7+ud/CNFmgxZcuQpUKREmQpVatRp0KRFmw5devQZMGTEmAlTZsxZsGTFmg1bduw5cOTEmQtXbtx58OTDH4kIEAEiQASIABEgAkSACBABIkAEiAAR4CsD/BiSIk2GLDnyFChSokyFKjXqNGjSok2HLj36DBgyYsyEKTPmLFiyYs2GLTv2HDhy4syFKzfuPHjy4Y8IEAEiQASIABEgAkSACBABIkAEiAAR4AsD/ANuYFIPtwYnlAAAAABJRU5ErkJggg==';

function ImageProbe() {
  return (
    <View style={{ flex: 1, padding: 20, gap: 10, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 18, color: '#111' }}>
        Image source and resizeMode
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {['cover', 'contain', 'stretch', 'center'].map(mode => (
          <View key={mode} style={{ alignItems: 'center', gap: 4 }}>
            <Image
              source={require('../assets/image-probe.png')}
              resizeMode={mode}
              style={{ width: 120, height: 72, backgroundColor: '#ddd' }}
            />
            <Text style={{ fontSize: 12, color: '#111' }}>{mode}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 14, color: '#111' }}>data URI</Text>
      <Image
        source={{ uri: dataImage }}
        resizeMode="contain"
        style={{ width: 160, height: 80, backgroundColor: '#ddd' }}
      />
    </View>
  );
}

Image.getSize(
  dataImage,
  (width, height) => console.log(`[ImageProbe] data size ${width}x${height}`),
  error => console.error('[ImageProbe] data size failed', error),
);
const metroImage = Image.resolveAssetSource(
  require('../assets/image-probe.png'),
);
Image.getSize(
  metroImage.uri,
  (width, height) => console.log(`[ImageProbe] http size ${width}x${height}`),
  error => console.error('[ImageProbe] http size failed', error),
);
Image.prefetch(metroImage.uri)
  .then(ok => {
    console.log(`[ImageProbe] prefetch ${ok}`);
    return Image.queryCache([metroImage.uri]);
  })
  .then(cache =>
    console.log(`[ImageProbe] cache ${cache[metroImage.uri] || 'miss'}`),
  );
AppRegistry.registerComponent('ImageProbe', () => ImageProbe);
