import React, {useState} from 'react';
import {AppRegistry, FlatList, Text, View} from 'react-native';

const ROWS = Array.from({length: 1000}, (_, id) => ({id}));

function ScrollProbe() {
  const [offset, setOffset] = useState(0);
  return (
    <View style={{flex: 1, padding: 20, backgroundColor: '#fff'}}>
      <Text style={{fontSize: 18, color: '#111'}}>FlatList: 1,000 rows</Text>
      <Text style={{fontSize: 12, color: '#111'}}>scrollY={Math.round(offset)}</Text>
      <FlatList
        style={{height: 450, marginTop: 12, backgroundColor: '#eee'}}
        data={ROWS}
        keyExtractor={item => String(item.id)}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={3}
        getItemLayout={(_, index) => ({length: 40, offset: 40 * index, index})}
        onScroll={event => {
          const y = event.nativeEvent.contentOffset.y;
          setOffset(y);
          console.log(`[ScrollProbe] onScroll y=${Math.round(y)}`);
        }}
        scrollEventThrottle={16}
        renderItem={({item}) => (
          <View style={{height: 40, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#bbb'}}>
            <Text style={{fontSize: 12, color: '#111'}}>Row {item.id}</Text>
          </View>
        )}
      />
    </View>
  );
}

AppRegistry.registerComponent('ScrollProbe', () => ScrollProbe);
