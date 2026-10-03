import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

// react-native-screens does not currently list GPUI as a native platform.
// Keep JS navigators available while Step 5 builds the GPUI native-stack port.
if (!['ios', 'android', 'windows'].includes(Platform.OS)) {
  enableScreens(false);
}

const scenario =
  (globalThis as { __RN_GPUI_NAV_SCENARIO__?: string })
    .__RN_GPUI_NAV_SCENARIO__ ?? 'tabs';
const Tabs = createBottomTabNavigator();
const Stack = createStackNavigator();
const NativeStack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function SafeAreaTrace({ children }: React.PropsWithChildren) {
  const frame = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    console.log(
      `[safe-area] frame=${frame.x},${frame.y} ${frame.width}x${frame.height} insets=${insets.top},${insets.right},${insets.bottom},${insets.left}`,
    );
  }, [frame, insets]);
  return children;
}

function useRouteTrace(name: string) {
  useFocusEffect(
    useCallback(() => {
      console.log(`[nav] focus ${name}`);
      return () => console.log(`[nav] blur ${name}`);
    }, [name]),
  );
}

function Page({
  name,
  navigation,
  children,
}: React.PropsWithChildren<{
  name: string;
  navigation: {
    navigate: (route: string) => void;
    push?: (route: string, params?: object) => void;
  };
}>) {
  useRouteTrace(name);
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.title}>{name}</Text>
      {children}
      <Button
        title="Open details"
        onPress={() => {
          console.log(`[nav] press Open details from ${name}`);
          navigation.push
            ? navigation.push('Details', { id: 1 })
            : navigation.navigate('Details');
        }}
      />
    </SafeAreaView>
  );
}

function HomeScreen({ navigation }: { navigation: any }) {
  return <Page name="Home" navigation={navigation} />;
}

function DetailsScreen({ route, navigation }: { route: any; navigation: any }) {
  const id = route.params?.id ?? 1;
  return (
    <Page name={`Details ${id}`} navigation={navigation}>
      <Button
        title="Open next detail"
        onPress={() => {
          console.log(`[nav] press next detail ${id + 1}`);
          navigation.push('Details', { id: id + 1 });
        }}
      />
    </Page>
  );
}

function ListScreen({ navigation }: { navigation: any }) {
  useRouteTrace('List');
  const [value, setValue] = useState('Navigation input state');
  useFocusEffect(
    useCallback(() => {
      console.log(`[nav] list state input=${value}`);
    }, [value]),
  );
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.title}>Long list + input</Text>
      <TextInput
        value={value}
        onFocus={() => console.log('[nav] input focus')}
        onBlur={() => console.log('[nav] input blur')}
        onChangeText={next => {
          console.log(`[nav] input ${next}`);
          setValue(next);
        }}
        style={styles.input}
      />
      <FlatList
        data={Array.from({ length: 100 }, (_, index) => `Row ${index + 1}`)}
        keyExtractor={item => item}
        onScroll={event =>
          console.log(
            `[nav] scroll offset=${event.nativeEvent.contentOffset.y}`,
          )
        }
        scrollEventThrottle={16}
        renderItem={({ item }) => <Text style={styles.row}>{item}</Text>}
      />
      <Button
        title="Open details"
        onPress={() => navigation.navigate('Details')}
      />
    </SafeAreaView>
  );
}

function ModalScreen({ navigation }: { navigation: any }) {
  return <Page name="Modal" navigation={navigation} />;
}

function JsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerMode: Platform.OS === 'gpui' ? 'float' : undefined,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Details" component={DetailsScreen} />
    </Stack.Navigator>
  );
}

function NativeStackFlow() {
  return (
    <NativeStack.Navigator>
      <NativeStack.Screen name="Home" component={HomeScreen} />
      <NativeStack.Screen name="Details" component={DetailsScreen} />
    </NativeStack.Navigator>
  );
}

function TabFlow() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="List" component={ListScreen} />
      <Tabs.Screen name="Stack" component={JsStack} />
    </Tabs.Navigator>
  );
}

function DrawerFlow() {
  return (
    <Drawer.Navigator>
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="List" component={ListScreen} />
      <Drawer.Screen name="Details" component={DetailsScreen} />
    </Drawer.Navigator>
  );
}

function NestedFlow() {
  return (
    <Drawer.Navigator>
      <Drawer.Screen name="Tabs">
        {() => (
          <Stack.Navigator>
            <Stack.Screen
              name="TabsHome"
              component={TabFlow}
              options={{ title: 'Nested tabs' }}
            />
            <Stack.Screen name="Details" component={DetailsScreen} />
            <Stack.Screen
              name="Modal"
              component={ModalScreen}
              options={{ presentation: 'modal' }}
            />
          </Stack.Navigator>
        )}
      </Drawer.Screen>
      <Drawer.Screen name="List" component={ListScreen} />
    </Drawer.Navigator>
  );
}

function Scenario() {
  switch (scenario) {
    case 'stack':
      return <JsStack />;
    case 'drawer':
      return <DrawerFlow />;
    case 'native-stack':
      return <NativeStackFlow />;
    case 'nested':
      return <NestedFlow />;
    case 'tabs':
    default:
      return <TabFlow />;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <SafeAreaTrace>
          <Scenario />
        </SafeAreaTrace>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, gap: 16, backgroundColor: '#171923' },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  row: {
    color: '#ddd',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#303442',
  },
  input: { color: '#fff', borderWidth: 1, borderColor: '#6772e5', padding: 12 },
});
