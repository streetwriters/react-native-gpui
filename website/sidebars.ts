import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

export default {
  docs: {
    'The Basics': [
      'getting-started',
      {
        type: 'link',
        label: 'Core Components and Native Components',
        href: 'https://reactnative.dev/docs/0.87/intro-react-native-components',
      },
      {
        type: 'link',
        label: 'React Fundamentals',
        href: 'https://reactnative.dev/docs/0.87/intro-react',
      },
      {
        type: 'link',
        label: 'Handling Text Input',
        href: 'https://reactnative.dev/docs/0.87/handling-text-input',
      },
      {
        type: 'link',
        label: 'Using a ScrollView',
        href: 'https://reactnative.dev/docs/0.87/using-a-scrollview',
      },
      {
        type: 'link',
        label: 'Using List Views',
        href: 'https://reactnative.dev/docs/0.87/using-a-listview',
      },
      'troubleshooting',
      'platform-specific-code',
      {
        type: 'link',
        label: 'More Resources',
        href: 'https://reactnative.dev/docs/0.87/more-resources',
      },
    ],
    'Environment setup': ['environment-setup', 'set-up-your-environment'],
    Desktop: [
      'desktop-windows',
      'desktop-title-bar',
      'desktop-application-menu',
      'desktop-context-menus',
      'desktop-input',
      'desktop-keyboard-shortcuts',
      'desktop-tray',
    ],
    Workflow: [
      {
        type: 'link',
        label: 'Fast Refresh',
        href: 'https://reactnative.dev/docs/0.87/fast-refresh',
      },
      'metro',
      'libraries',
      {
        type: 'link',
        label: 'Using TypeScript',
        href: 'https://reactnative.dev/docs/0.87/typescript',
      },
      {
        type: 'link',
        label: 'Strict TypeScript API',
        href: 'https://reactnative.dev/docs/0.87/strict-typescript-api',
      },
      'upgrading',
      'publishing-desktop',
    ],
    'UI & Interaction': [
      {
        type: 'link',
        label: 'Style',
        href: 'https://reactnative.dev/docs/0.87/style',
      },
      {
        type: 'link',
        label: 'Height and Width',
        href: 'https://reactnative.dev/docs/0.87/height-and-width',
      },
      {
        type: 'link',
        label: 'Layout with Flexbox',
        href: 'https://reactnative.dev/docs/0.87/flexbox',
      },
      {
        type: 'link',
        label: 'Images',
        href: 'https://reactnative.dev/docs/0.87/images',
      },
      {
        type: 'link',
        label: 'Color Reference',
        href: 'https://reactnative.dev/docs/0.87/colors',
      },
      {
        type: 'category',
        label: 'Interaction',
        collapsible: false,
        collapsed: false,
        items: [
          {
            type: 'link',
            label: 'Handling Touches',
            href: 'https://reactnative.dev/docs/0.87/handling-touches',
          },
          'navigation',
          {
            type: 'link',
            label: 'Animations',
            href: 'https://reactnative.dev/docs/0.87/animations',
          },
          {
            type: 'link',
            label: 'Gesture Responder System',
            href: 'https://reactnative.dev/docs/0.87/gesture-responder-system',
          },
        ],
      },
      {
        type: 'category',
        label: 'Connectivity',
        collapsible: false,
        collapsed: false,
        items: [
          {
            type: 'link',
            label: 'Networking',
            href: 'https://reactnative.dev/docs/0.87/network',
          },
          'security',
        ],
      },
      {
        type: 'category',
        label: 'Inclusion',
        collapsible: false,
        collapsed: false,
        items: ['accessibility'],
      },
    ],
    Debugging: [
      'debugging',
      {
        type: 'link',
        label: 'React Native DevTools',
        href: 'https://reactnative.dev/docs/0.87/react-native-devtools',
      },
      'debugging-native-code',
      'debugging-release-builds',
    ],
    Testing: [
      {
        type: 'link',
        label: 'Testing',
        href: 'https://reactnative.dev/docs/0.87/testing-overview',
      },
      'desktop-testing',
    ],
    Performance: [
      'performance',
      'build-speed',
      {
        type: 'link',
        label: 'Optimizing FlatList Configuration',
        href: 'https://reactnative.dev/docs/0.87/optimizing-flatlist-configuration',
      },
      {
        type: 'link',
        label: 'Optimizing JavaScript loading',
        href: 'https://reactnative.dev/docs/0.87/optimizing-javascript-loading',
      },
      'profiling',
    ],
    Reference: ['desktop-json', 'cli'],
    'Desktop libraries': [
      'desktop-file-system',
      'desktop-fonts',
      'desktop-image-manipulator',
      'desktop-notifications',
      'desktop-system',
      'desktop-updater',
    ],
    'JavaScript Runtime': [
      'javascript-environment',
      {
        type: 'link',
        label: 'Timers',
        href: 'https://reactnative.dev/docs/0.87/timers',
      },
      'hermes',
    ],
    Codegen: [
      'the-new-architecture/what-is-codegen',
      'the-new-architecture/using-codegen',
      'the-new-architecture/codegen-cli',
    ],
    'Native Development': [
      { type: 'doc', id: 'native-platform', label: 'Introduction' },
      {
        type: 'category',
        label: 'Modules',
        collapsible: false,
        collapsed: false,
        items: [
          {
            type: 'doc',
            id: 'turbo-native-modules',
            label: 'Introduction',
          },
          { type: 'doc', id: 'native-modules-rust', label: 'Rust' },
          {
            type: 'doc',
            id: 'the-new-architecture/pure-cxx-modules',
            label: 'C++',
          },
          {
            type: 'doc',
            id: 'native-modules-node-addons',
            label: 'Node addons',
          },
        ],
      },
      {
        type: 'category',
        label: 'Components',
        collapsible: false,
        collapsed: false,
        items: [
          {
            type: 'doc',
            id: 'fabric-native-components',
            label: 'Host components',
          },
          { type: 'doc', id: 'native-views', label: 'Native views' },
        ],
      },
      {
        type: 'category',
        label: 'Libraries',
        collapsible: false,
        collapsed: false,
        items: [
          {
            type: 'doc',
            id: 'the-new-architecture/create-module-library',
            label: 'Create a library',
          },
          'porting-libraries',
          'supported-libraries',
        ],
      },
      {
        type: 'category',
        label: 'Platform',
        collapsible: true,
        collapsed: true,
        items: [
          'autolinking',
          'desktop-project',
          'js-engines',
          'embedding',
          'platform-support',
        ],
      },
    ],
  },
  api: {
    APIs: [
      'accessibilityinfo',
      'alert',
      {
        type: 'link',
        label: 'Animated',
        href: 'https://reactnative.dev/docs/0.87/animated',
      },
      {
        type: 'link',
        label: 'Animated.Value',
        href: 'https://reactnative.dev/docs/0.87/animatedvalue',
      },
      {
        type: 'link',
        label: 'Animated.ValueXY',
        href: 'https://reactnative.dev/docs/0.87/animatedvaluexy',
      },
      {
        type: 'link',
        label: 'Appearance',
        href: 'https://reactnative.dev/docs/0.87/appearance',
      },
      {
        type: 'link',
        label: 'AppRegistry',
        href: 'https://reactnative.dev/docs/0.87/appregistry',
      },
      'appstate',
      'devsettings',
      {
        type: 'link',
        label: 'Dimensions',
        href: 'https://reactnative.dev/docs/0.87/dimensions',
      },
      {
        type: 'link',
        label: 'Easing',
        href: 'https://reactnative.dev/docs/0.87/easing',
      },
      {
        type: 'link',
        label: 'I18nManager',
        href: 'https://reactnative.dev/docs/0.87/i18nmanager',
      },
      'keyboard',
      {
        type: 'link',
        label: 'LayoutAnimation',
        href: 'https://reactnative.dev/docs/0.87/layoutanimation',
      },
      'linking',
      {
        type: 'link',
        label: 'PanResponder',
        href: 'https://reactnative.dev/docs/0.87/panresponder',
      },
      {
        type: 'link',
        label: 'PixelRatio',
        href: 'https://reactnative.dev/docs/0.87/pixelratio',
      },
      'platform',
      {
        type: 'link',
        label: 'PlatformColor',
        href: 'https://reactnative.dev/docs/0.87/platformcolor',
      },
      {
        type: 'link',
        label: 'ReactNativeVersion',
        href: 'https://reactnative.dev/docs/0.87/reactnativeversion',
      },
      {
        type: 'link',
        label: 'RootTag',
        href: 'https://reactnative.dev/docs/0.87/roottag',
      },
      {
        type: 'link',
        label: 'Settings',
        href: 'https://reactnative.dev/docs/0.87/settings',
      },
      'share',
      {
        type: 'link',
        label: 'StyleSheet',
        href: 'https://reactnative.dev/docs/0.87/stylesheet',
      },
      {
        type: 'link',
        label: 'Transforms',
        href: 'https://reactnative.dev/docs/0.87/transforms',
      },
      'vibration',
      {
        type: 'category',
        label: 'Globals',
        collapsed: true,
        items: [
          {
            type: 'link',
            label: '✨ __DEV__',
            href: 'https://reactnative.dev/docs/0.87/global-__DEV__',
          },
          {
            type: 'link',
            label: 'AbortController',
            href: 'https://reactnative.dev/docs/0.87/global-AbortController',
          },
          {
            type: 'link',
            label: 'AbortSignal',
            href: 'https://reactnative.dev/docs/0.87/global-AbortSignal',
          },
          {
            type: 'link',
            label: 'alert',
            href: 'https://reactnative.dev/docs/0.87/global-alert',
          },
          {
            type: 'link',
            label: 'Blob',
            href: 'https://reactnative.dev/docs/0.87/global-Blob',
          },
          {
            type: 'link',
            label: 'cancelAnimationFrame',
            href: 'https://reactnative.dev/docs/0.87/global-cancelAnimationFrame',
          },
          {
            type: 'link',
            label: 'cancelIdleCallback',
            href: 'https://reactnative.dev/docs/0.87/global-cancelIdleCallback',
          },
          {
            type: 'link',
            label: 'clearInterval',
            href: 'https://reactnative.dev/docs/0.87/global-clearInterval',
          },
          {
            type: 'link',
            label: 'clearTimeout',
            href: 'https://reactnative.dev/docs/0.87/global-clearTimeout',
          },
          {
            type: 'link',
            label: 'console',
            href: 'https://reactnative.dev/docs/0.87/global-console',
          },
          {
            type: 'link',
            label: 'EventCounts',
            href: 'https://reactnative.dev/docs/0.87/global-EventCounts',
          },
          {
            type: 'link',
            label: 'fetch',
            href: 'https://reactnative.dev/docs/0.87/global-fetch',
          },
          {
            type: 'link',
            label: 'File',
            href: 'https://reactnative.dev/docs/0.87/global-File',
          },
          {
            type: 'link',
            label: 'FileReader',
            href: 'https://reactnative.dev/docs/0.87/global-FileReader',
          },
          {
            type: 'link',
            label: 'FormData',
            href: 'https://reactnative.dev/docs/0.87/global-FormData',
          },
          {
            type: 'link',
            label: 'global',
            href: 'https://reactnative.dev/docs/0.87/global-global',
          },
          {
            type: 'link',
            label: 'Headers',
            href: 'https://reactnative.dev/docs/0.87/global-Headers',
          },
          {
            type: 'link',
            label: 'IntersectionObserver 🧪',
            href: 'https://reactnative.dev/docs/0.87/global-intersectionobserver',
          },
          {
            type: 'link',
            label: 'IntersectionObserverEntry 🧪',
            href: 'https://reactnative.dev/docs/0.87/global-intersectionobserverentry',
          },
          {
            type: 'link',
            label: 'navigator',
            href: 'https://reactnative.dev/docs/0.87/global-navigator',
          },
          {
            type: 'link',
            label: 'performance',
            href: 'https://reactnative.dev/docs/0.87/global-performance',
          },
          {
            type: 'link',
            label: 'PerformanceEntry',
            href: 'https://reactnative.dev/docs/0.87/global-PerformanceEntry',
          },
          {
            type: 'link',
            label: 'PerformanceEventTiming',
            href: 'https://reactnative.dev/docs/0.87/global-PerformanceEventTiming',
          },
          {
            type: 'link',
            label: 'PerformanceLongTaskTiming',
            href: 'https://reactnative.dev/docs/0.87/global-PerformanceLongTaskTiming',
          },
          {
            type: 'link',
            label: 'PerformanceMark',
            href: 'https://reactnative.dev/docs/0.87/global-PerformanceMark',
          },
          {
            type: 'link',
            label: 'PerformanceMeasure',
            href: 'https://reactnative.dev/docs/0.87/global-PerformanceMeasure',
          },
          {
            type: 'link',
            label: 'PerformanceObserver',
            href: 'https://reactnative.dev/docs/0.87/global-PerformanceObserver',
          },
          {
            type: 'link',
            label: 'PerformanceObserverEntryList',
            href: 'https://reactnative.dev/docs/0.87/global-PerformanceObserverEntryList',
          },
          {
            type: 'link',
            label: 'PerformanceResourceTiming',
            href: 'https://reactnative.dev/docs/0.87/global-PerformanceResourceTiming',
          },
          {
            type: 'link',
            label: 'process',
            href: 'https://reactnative.dev/docs/0.87/global-process',
          },
          {
            type: 'link',
            label: 'queueMicrotask',
            href: 'https://reactnative.dev/docs/0.87/global-queueMicrotask',
          },
          {
            type: 'link',
            label: 'Request',
            href: 'https://reactnative.dev/docs/0.87/global-Request',
          },
          {
            type: 'link',
            label: 'requestAnimationFrame',
            href: 'https://reactnative.dev/docs/0.87/global-requestAnimationFrame',
          },
          {
            type: 'link',
            label: 'requestIdleCallback',
            href: 'https://reactnative.dev/docs/0.87/global-requestIdleCallback',
          },
          {
            type: 'link',
            label: 'Response',
            href: 'https://reactnative.dev/docs/0.87/global-Response',
          },
          {
            type: 'link',
            label: 'setInterval',
            href: 'https://reactnative.dev/docs/0.87/global-setInterval',
          },
          {
            type: 'link',
            label: 'setTimeout',
            href: 'https://reactnative.dev/docs/0.87/global-setTimeout',
          },
          {
            type: 'link',
            label: 'URL',
            href: 'https://reactnative.dev/docs/0.87/global-URL',
          },
          {
            type: 'link',
            label: 'URLSearchParams',
            href: 'https://reactnative.dev/docs/0.87/global-URLSearchParams',
          },
          {
            type: 'link',
            label: 'WebSocket',
            href: 'https://reactnative.dev/docs/0.87/global-WebSocket',
          },
          {
            type: 'link',
            label: 'window',
            href: 'https://reactnative.dev/docs/0.87/global-window',
          },
          {
            type: 'link',
            label: 'XMLHttpRequest',
            href: 'https://reactnative.dev/docs/0.87/global-XMLHttpRequest',
          },
        ],
      },
      {
        type: 'category',
        label: 'Hooks',
        collapsed: false,
        items: [
          {
            type: 'link',
            label: 'useColorScheme',
            href: 'https://reactnative.dev/docs/0.87/usecolorscheme',
          },
          {
            type: 'link',
            label: 'useWindowDimensions',
            href: 'https://reactnative.dev/docs/0.87/usewindowdimensions',
          },
        ],
      },
    ],
    'Desktop APIs': [
      'desktop',
      'desktopwindow',
      'tray',
      'menu',
      'contextmenu',
      'shortcuts',
      'perfmonitor',
      'network',
      {
        type: 'link',
        label: 'BackHandler',
        href: 'https://reactnative.dev/docs/0.87/backhandler',
      },
    ],
  },
  components: {
    'Core Components': [
      'components-and-apis',
      'activityindicator',
      {
        type: 'link',
        label: 'Button',
        href: 'https://reactnative.dev/docs/0.87/button',
      },
      {
        type: 'link',
        label: 'FlatList',
        href: 'https://reactnative.dev/docs/0.87/flatlist',
      },
      'image',
      {
        type: 'link',
        label: '🗑️ ImageBackground',
        href: 'https://reactnative.dev/docs/0.87/imagebackground',
      },
      'keyboardavoidingview',
      'modal',
      'pressable',
      'refreshcontrol',
      'safeareaview',
      'scrollview',
      {
        type: 'link',
        label: 'SectionList',
        href: 'https://reactnative.dev/docs/0.87/sectionlist',
      },
      'switch',
      'text',
      'textinput',
      {
        type: 'link',
        label: 'TouchableHighlight',
        href: 'https://reactnative.dev/docs/0.87/touchablehighlight',
      },
      {
        type: 'link',
        label: 'TouchableOpacity',
        href: 'https://reactnative.dev/docs/0.87/touchableopacity',
      },
      'touchablewithoutfeedback',
      'view',
      {
        type: 'link',
        label: 'VirtualizedList',
        href: 'https://reactnative.dev/docs/0.87/virtualizedlist',
      },
    ],
    'Desktop Components': [
      'titlebar',
      'windowcontrol',
      'contextmenuview',
      'applicationmenu',
      'shortcutscope',
      'scrollbar',
    ],
    Refs: [
      {
        type: 'link',
        label: 'Nodes from refs',
        href: 'https://reactnative.dev/docs/0.87/nodes',
      },
      {
        type: 'link',
        label: 'Element nodes',
        href: 'https://reactnative.dev/docs/0.87/element-nodes',
      },
      {
        type: 'link',
        label: 'Text nodes',
        href: 'https://reactnative.dev/docs/0.87/text-nodes',
      },
      {
        type: 'link',
        label: 'Document nodes',
        href: 'https://reactnative.dev/docs/0.87/document-nodes',
      },
    ],
    Props: [
      {
        type: 'link',
        label: 'Image Style Props',
        href: 'https://reactnative.dev/docs/0.87/image-style-props',
      },
      'layout-props',
      {
        type: 'link',
        label: 'Shadow Props',
        href: 'https://reactnative.dev/docs/0.87/shadow-props',
      },
      'text-style-props',
      'view-style-props',
    ],
    'Object Types': [
      {
        type: 'link',
        label: 'BoxShadowValue Object Type',
        href: 'https://reactnative.dev/docs/0.87/boxshadowvalue',
      },
      {
        type: 'link',
        label: 'DropShadowValue Object Type',
        href: 'https://reactnative.dev/docs/0.87/dropshadowvalue',
      },
      {
        type: 'link',
        label: 'LayoutEvent Object Type',
        href: 'https://reactnative.dev/docs/0.87/layoutevent',
      },
      {
        type: 'link',
        label: 'PressEvent Object Type',
        href: 'https://reactnative.dev/docs/0.87/pressevent',
      },
      {
        type: 'link',
        label: 'React Node Object Type',
        href: 'https://reactnative.dev/docs/0.87/react-node',
      },
      {
        type: 'link',
        label: 'Rect Object Type',
        href: 'https://reactnative.dev/docs/0.87/rect',
      },
      {
        type: 'link',
        label: 'TargetEvent Object Type',
        href: 'https://reactnative.dev/docs/0.87/targetevent',
      },
      {
        type: 'link',
        label: 'ViewToken Object Type',
        href: 'https://reactnative.dev/docs/0.87/viewtoken',
      },
    ],
  },
} satisfies SidebarsConfig;
