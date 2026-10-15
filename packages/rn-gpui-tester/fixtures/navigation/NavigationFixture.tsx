import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from 'react';
import {
  Button,
  FlatList,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  DarkTheme,
  DrawerActions,
  NavigationContainer,
  useFocusEffect,
  type DrawerNavigationState,
  type ParamListBase,
  type Theme,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createStackNavigator,
  type StackCardStyleInterpolator,
} from '@react-navigation/stack';
import {
  createDrawerNavigator,
  getDrawerStatusFromState,
} from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  enableScreens,
  FullWindowOverlay,
  ScreenFooter,
} from 'react-native-screens';
import Reanimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useDesktopForwardNavigation } from '@react-native-gpui/core/navigation';
const NavigationContext = createContext({
  scenario: 'tabs',
  isE2ETest: false,
});
const APP_BACKGROUND = '#171923';
const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: APP_BACKGROUND,
    card: APP_BACKGROUND,
    text: '#ffffff',
    border: '#303442',
    primary: '#6772e5',
  },
};
const stackCardStyleInterpolator: StackCardStyleInterpolator = ({
  current,
  layouts,
}) => ({
  cardStyle: {
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [layouts.screen.width, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  },
});
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
function StackBackIcon({ tintColor }: { tintColor: string }) {
  return (
    <Text
      style={[
        styles.backIcon,
        {
          color: tintColor,
        },
      ]}
    >
      ‹
    </Text>
  );
}
function E2ETextInput() {
  const [value, setValue] = useState('');
  return (
    <TextInput
      testID="e2e-text-input"
      accessibilityLabel="Desktop test input"
      value={value}
      onChangeText={setValue}
      style={styles.input}
    />
  );
}
function E2ENetworkProbe() {
  const [result, setResult] = useState('idle');
  const request = async () => {
    setResult('loading');
    try {
      const response = await fetch('http://127.0.0.1:43181/idle');
      setResult(await response.text());
    } catch (error) {
      setResult(`error: ${String(error)}`);
    }
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Button testID="e2e-network-request" title="Fetch" onPress={request} />
      <Text
        testID="e2e-network-result"
        style={{
          color: '#fff',
        }}
      >
        {result}
      </Text>
    </View>
  );
}
function E2EAnimationProbe() {
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Button
        testID="e2e-animation-start"
        title="Start loop"
        onPress={() => {
          const loop = Animated.loop(
            Animated.timing(progress, {
              toValue: 1,
              duration: 250,
              useNativeDriver: true,
            }),
          );
          animation.current = loop;
          loop.start();
        }}
      />
      <Animated.View
        testID="e2e-animation-indicator"
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: '#aab2ff',
          opacity: progress,
        }}
      />
      <Button
        testID="e2e-animation-stop"
        title="Stop loop"
        onPress={() => animation.current?.stop()}
      />
    </View>
  );
}
function E2EWorkletProbe() {
  const progress = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Button
        testID="e2e-worklet-start"
        title="Start UI loop"
        onPress={() => {
          progress.value = withRepeat(
            withTiming(1, {
              duration: 250,
            }),
            -1,
            true,
          );
        }}
      />
      <Reanimated.View
        style={[
          {
            width: 20,
            height: 20,
            backgroundColor: '#78e7c5',
          },
          style,
        ]}
      />
      <Button
        testID="e2e-worklet-stop"
        title="Stop UI loop"
        onPress={() => cancelAnimation(progress)}
      />
    </View>
  );
}
function E2EActionabilityProbe() {
  return (
    <View
      style={{
        position: 'absolute',
        right: 8,
        bottom: 8,
        width: 24,
        height: 24,
      }}
    >
      <View
        testID="e2e-hidden"
        collapsable={false}
        style={{
          opacity: 0,
          width: 24,
          height: 24,
        }}
      />
      <View
        testID="e2e-disabled"
        accessibilityState={{
          disabled: true,
        }}
        style={{
          position: 'absolute',
          left: -32,
          width: 24,
          height: 24,
        }}
      />
      <View
        testID="e2e-covered"
        collapsable={false}
        style={{
          position: 'absolute',
          width: 24,
          height: 24,
        }}
      />
      <View
        testID="e2e-cover"
        collapsable={false}
        style={{
          position: 'absolute',
          width: 24,
          height: 24,
          backgroundColor: '#171923',
        }}
      />
    </View>
  );
}
function E2ETimerProbe() {
  const [result, setResult] = useState('idle');
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Button
        testID="e2e-timer-start"
        title="Schedule timer"
        onPress={() => {
          setResult('pending');
          setTimeout(() => setResult('timer-fired'), 700);
        }}
      />
      <Text
        testID="e2e-timer-result"
        style={{
          color: '#fff',
        }}
      >
        {result}
      </Text>
    </View>
  );
}
function E2EDragProbe() {
  const [dx, setDx] = useState(0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gesture) => setDx(gesture.dx),
      onPanResponderRelease: (_event, gesture) => setDx(gesture.dx),
    }),
  ).current;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 24,
        alignItems: 'center',
      }}
    >
      <View
        testID="e2e-drag-source"
        {...responder.panHandlers}
        style={{
          width: 88,
          height: 44,
          borderRadius: 8,
          backgroundColor: '#6772e5',
        }}
      />
      <View
        testID="e2e-drag-target"
        style={{
          width: 88,
          height: 44,
          borderRadius: 8,
          backgroundColor: '#3a4056',
        }}
      />
      <Text
        testID="e2e-drag-result"
        style={{
          color: '#fff',
        }}
      >
        dx:{Math.round(dx)}
      </Text>
    </View>
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
  const { scenario, isE2ETest } = useContext(NavigationContext);
  useRouteTrace(name);
  return (
    <SafeAreaView
      style={[
        styles.page,
        (scenario === 'native-stack-modal' ||
          scenario === 'native-stack-transparent-modal') &&
        name.startsWith('Details')
          ? {
              backgroundColor: 'transparent',
            }
          : null,
      ]}
    >
      <Text testID={`${name}-title`} style={styles.title}>
        {name}
      </Text>
      <Text style={styles.description}>
        This screen keeps its background and text colors consistent while you
        navigate.
      </Text>
      {isE2ETest ? <E2ETextInput /> : null}
      {isE2ETest ? <E2ENetworkProbe /> : null}
      {isE2ETest && name.startsWith('Details') ? <E2EAnimationProbe /> : null}
      {isE2ETest && name.startsWith('Details') ? <E2ETimerProbe /> : null}
      {isE2ETest && name.startsWith('Details') ? <E2EWorkletProbe /> : null}
      {isE2ETest && name.startsWith('Details') ? (
        <E2EActionabilityProbe />
      ) : null}
      {isE2ETest ? <E2EDragProbe /> : null}
      {children}
      <Button
        title="Open details"
        color="#aab2ff"
        onPress={() => {
          console.log(`[nav] press Open details from ${name}`);
          navigation.push
            ? navigation.push('Details', {
                id: 1,
              })
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
        testID={`details-${id}-next`}
        color="#aab2ff"
        onPress={() => {
          console.log(`[nav] press next detail ${id + 1}`);
          navigation.push('Details', {
            id: id + 1,
          });
        }}
      />
    </Page>
  );
}
function ListScreen({ navigation }: { navigation: any }) {
  const { scenario, isE2ETest } = useContext(NavigationContext);
  useRouteTrace('List');
  const [value, setValue] = useState('Navigation input state');
  const listScroll = useRef(0);
  useEffect(() => {
    console.log('[nav] list mounted');
    return () => {
      console.log('[nav] list unmounted');
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      console.log(
        `[nav] list state input=${value} scroll=${listScroll.current}`,
      );
    }, [value]),
  );
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.title}>Long list + input</Text>
      <Text style={styles.description}>
        Scroll the list or switch tabs; this screen keeps its state while you
        navigate.
      </Text>
      <TextInput
        testID="navigation-list-input"
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
        testID="navigation-list"
        data={Array.from(
          {
            length: 100,
          },
          (_, index) => `Row ${index + 1}`,
        )}
        keyExtractor={item => item}
        onScroll={event => {
          listScroll.current = event.nativeEvent.contentOffset.y;
          console.log(
            `[nav] scroll offset=${event.nativeEvent.contentOffset.y}`,
          );
        }}
        scrollEventThrottle={16}
        renderItem={({ item }) => <Text style={styles.row}>{item}</Text>}
      />
      <Button
        title="Open details"
        color="#aab2ff"
        onPress={() => navigation.navigate('Details')}
      />
      {isE2ETest && scenario === 'nested' ? (
        <Button
          title="Open modal"
          onPress={() => navigation.navigate('Modal')}
        />
      ) : null}
    </SafeAreaView>
  );
}
function ModalScreen({ navigation }: { navigation: any }) {
  return <Page name="Modal" navigation={navigation} />;
}
function JsStack() {
  return (
    <Stack.Navigator
      screenListeners={({ route }) => ({
        transitionStart: event =>
          console.log(
            `[nav] stack transition start route=${route.name} closing=${event.data.closing}`,
          ),
        transitionEnd: event =>
          console.log(
            `[nav] stack transition end route=${route.name} closing=${event.data.closing}`,
          ),
      })}
      screenOptions={{
        gestureEnabled: true,
        headerMode: 'float',
        headerStyle: {
          backgroundColor: APP_BACKGROUND,
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          color: '#ffffff',
        },
        headerBackButtonDisplayMode: 'minimal',
        headerBackImage: StackBackIcon,
        detachPreviousScreen: false,
        cardOverlayEnabled: false,
        cardStyleInterpolator: stackCardStyleInterpolator,
        cardStyle: {
          backgroundColor: APP_BACKGROUND,
        },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="Details"
        component={DetailsScreen}
        options={({ route }) => {
          const params = route.params as
            | {
                id?: number;
              }
            | undefined;
          return {
            title: `Details ${params?.id ?? 1}`,
          };
        }}
      />
    </Stack.Navigator>
  );
}
function NativeStackFlow() {
  const { scenario } = useContext(NavigationContext);
  return (
    <NativeStack.Navigator
      screenListeners={({ route }) => ({
        transitionStart: event =>
          console.log(
            `[nav-native] transition start route=${route.name} closing=${event.data.closing}`,
          ),
        transitionEnd: event =>
          console.log(
            `[nav-native] transition end route=${route.name} closing=${event.data.closing}`,
          ),
      })}
      screenOptions={{
        headerTitleAlign: 'center',
        headerRight: () => (
          <Text
            style={styles.nativeHeaderAction}
            onPress={() => console.log('[nav] native header action')}
          >
            Action
          </Text>
        ),
      }}
    >
      <NativeStack.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: scenario !== 'native-stack-hidden',
          animation: 'none',
        }}
      />
      <NativeStack.Screen
        name="Details"
        component={DetailsScreen}
        options={({ route, navigation }) => {
          const params = route.params as
            | {
                id?: number;
              }
            | undefined;
          const id = params?.id ?? 1;
          return {
            title: `Details ${id}`,
            animation:
              id === 4 ? 'fade' : id >= 3 ? 'none' : 'slide_from_right',
            presentation:
              scenario === 'native-stack-modal'
                ? 'modal'
                : scenario === 'native-stack-transparent-modal'
                  ? 'transparentModal'
                  : 'card',
            headerBackVisible: false,
            headerLeft: () => (
              <Text
                style={styles.nativeHeaderBack}
                onPress={() => {
                  console.log('[nav] native custom back');
                  navigation.goBack();
                }}
              >
                ‹
              </Text>
            ),
          };
        }}
      />
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
              options={{
                title: 'Nested tabs',
              }}
            />
            <Stack.Screen name="Details" component={DetailsScreen} />
            <Stack.Screen
              name="Modal"
              component={ModalScreen}
              options={{
                presentation: 'modal',
              }}
            />
          </Stack.Navigator>
        )}
      </Drawer.Screen>
      <Drawer.Screen name="List" component={ListScreen} />
    </Drawer.Navigator>
  );
}
function FullWindowOverlayFlow() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: APP_BACKGROUND,
        padding: 24,
      }}
    >
      <Text style={styles.title}>Navigation content behind overlay</Text>
      <FullWindowOverlay>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 120,
            left: 80,
            padding: 16,
            backgroundColor: '#2c8f6b',
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 20,
            }}
          >
            Full window overlay above the app
          </Text>
        </View>
      </FullWindowOverlay>
    </View>
  );
}
function UnsupportedScreensFlow() {
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        backgroundColor: APP_BACKGROUND,
      }}
    >
      <Text style={styles.title}>Unsupported screens component probe</Text>
      <ScreenFooter>
        <Text
          style={{
            color: '#fff',
          }}
        >
          ScreenFooter is not implemented
        </Text>
      </ScreenFooter>
    </View>
  );
}
function Scenario() {
  const { scenario } = useContext(NavigationContext);
  switch (scenario) {
    case 'native-stack-overlay':
      return <FullWindowOverlayFlow />;
    case 'native-stack-unsupported':
      return <UnsupportedScreensFlow />;
    case 'stack':
      return <JsStack />;
    case 'drawer':
      return <DrawerFlow />;
    case 'native-stack':
    case 'native-stack-hidden':
    case 'native-stack-lifecycle':
    case 'native-stack-modal':
    case 'native-stack-transparent-modal':
      return <NativeStackFlow />;
    case 'nested':
      return <NestedFlow />;
    case 'tabs':
    default:
      return <TabFlow />;
  }
}
function NavigationRoot() {
  const { scenario, isE2ETest } = useContext(NavigationContext);
  const navigationRef = useNavigationContainerRef<ParamListBase>();
  useDesktopForwardNavigation(navigationRef);
  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        onReady={() => {
          if (scenario === 'nested' && !isE2ETest) {
            const later = (delay: number, action: () => void) =>
              setTimeout(action, delay);
            later(500, () =>
              navigationRef.navigate('Tabs', {
                screen: 'TabsHome',
                params: {
                  screen: 'List',
                },
              }),
            );
            later(1500, () =>
              navigationRef.navigate('Tabs', {
                screen: 'Details',
                params: {
                  id: 1,
                },
              }),
            );
            later(2500, () =>
              navigationRef.navigate('Tabs', {
                screen: 'Modal',
              }),
            );
            later(6500, () =>
              navigationRef.dispatch(DrawerActions.openDrawer()),
            );
          }
          if (
            scenario === 'stack' ||
            scenario === 'native-stack' ||
            scenario === 'native-stack-hidden' ||
            scenario === 'native-stack-lifecycle' ||
            scenario === 'native-stack-modal' ||
            scenario === 'native-stack-transparent-modal'
          ) {
            const label = scenario === 'stack' ? 'stack' : 'native-stack';
            console.log(`[nav] ${label} state route=Home title=Home`);
          }
        }}
        onStateChange={state => {
          if (scenario === 'nested') {
            let current: any = state;
            const path = [];
            while (current?.routes) {
              const route = current.routes[current.index ?? 0];
              if (!route) break;
              path.push(route.name);
              current = route.state;
            }
            console.log(`[nav] nested path=${path.join('/')}`);
          }
          if (
            (scenario === 'stack' ||
              scenario === 'native-stack' ||
              scenario === 'native-stack-hidden' ||
              scenario === 'native-stack-lifecycle' ||
              scenario === 'native-stack-modal' ||
              scenario === 'native-stack-transparent-modal') &&
            state?.type === 'stack'
          ) {
            const label = scenario === 'stack' ? 'stack' : 'native-stack';
            const route = state.routes[state.index];
            const params = route.params as
              | {
                  id?: number;
                }
              | undefined;
            const title =
              route.name === 'Details'
                ? `Details ${params?.id ?? 1}`
                : route.name;
            console.log(
              `[nav] ${label} state route=${route.name} title=${title}`,
            );
          }
          if (state?.type === 'drawer') {
            console.log(
              `[nav] drawer status=${getDrawerStatusFromState(state as DrawerNavigationState<ParamListBase>)}`,
            );
          }
        }}
      >
        <SafeAreaTrace>
          <Scenario />
        </SafeAreaTrace>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 24,
    gap: 16,
    backgroundColor: APP_BACKGROUND,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  backIcon: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 32,
  },
  nativeHeaderAction: {
    color: '#ffffff',
    fontSize: 14,
    padding: 12,
  },
  nativeHeaderBack: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 32,
    padding: 8,
  },
  description: {
    color: '#d5d7e0',
    fontSize: 16,
    lineHeight: 24,
  },
  row: {
    color: '#ddd',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#303442',
  },
  input: {
    color: '#fff',
    borderWidth: 1,
    borderColor: '#6772e5',
    padding: 12,
  },
});
export default function NavigationFixture({
  scenario,
  testMode = false,
}: {
  scenario?: string;
  testMode?: boolean;
}) {
  const selectedScenario = scenario ?? (testMode ? 'stack' : 'tabs');
  enableScreens(selectedScenario.startsWith('native-stack'));
  return (
    <NavigationContext.Provider
      value={{
        scenario: selectedScenario,
        isE2ETest: testMode,
      }}
    >
      <NavigationRoot key={selectedScenario} />
    </NavigationContext.Provider>
  );
}
