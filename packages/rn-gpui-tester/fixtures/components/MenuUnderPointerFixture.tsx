import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

export default function MenuUnderPointerFixture() {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const host = useRef<React.ComponentRef<typeof View>>(null);
  const [hovered, setHovered] = useState('');
  const [height, setHeight] = useState(0);
  return (
    <View style={{ flex: 1 }}>
      <Text
        testID="menu-hovered"
        style={{ position: 'absolute', left: 620, top: 0 }}
      >
        {hovered}
      </Text>
      <View
        testID="menu-close"
        focusable
        onKeyDown={() => {
          setMenu(null);
          setHeight(0);
          setHovered('');
        }}
        style={{
          position: 'absolute',
          left: 620,
          top: 30,
          width: 10,
          height: 10,
        }}
      />
      <View
        ref={host}
        testID="menu-host"
        focusable
        onContextMenu={event => {
          const { pageX, pageY } = event.nativeEvent as unknown as {
            pageX: number;
            pageY: number;
          };
          host.current?.measure((_x, _y, _w, _h, originX, originY) =>
            setMenu({ x: pageX - originX, y: pageY - originY }),
          );
        }}
        onKeyDown={() => setMenu({ x: 300, y: 300 })}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 600,
          height: 600,
        }}
      />
      {menu && (
        <Pressable
          testID="menu-backdrop"
          onPress={() => setMenu(null)}
          onContextMenu={event => {
            event.preventDefault();
            setMenu(null);
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
          }}
        >
          <View
            testID="menu-popup"
            onLayout={event => setHeight(event.nativeEvent.layout.height)}
            style={{
              position: 'absolute',
              left: menu.x - 10,
              top: height === 0 ? menu.y + 10 : menu.y - 70,
              width: 120,
            }}
          >
            {['first', 'second', 'last'].map(item => (
              <View
                key={item}
                testID={`menu-item-${item}`}
                hoverStyle={{ backgroundColor: '#eeeeee' }}
                style={{ height: 30, backgroundColor: '#ffffff' }}
              >
                {item === 'last' ? (
                  <Pressable
                    testID="menu-pressable"
                    onHoverIn={() => setHovered('in')}
                    onHoverOut={() => setHovered('out')}
                    style={{ height: 30 }}
                  >
                    <Text>{item}</Text>
                  </Pressable>
                ) : (
                  <Text>{item}</Text>
                )}
              </View>
            ))}
          </View>
        </Pressable>
      )}
    </View>
  );
}
