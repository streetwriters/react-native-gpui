/**
 * Types for the React Native internals the desktop platform imports by path.
 *
 * React Native 0.87's `exports` map gives these paths `"types": null`, so they
 * resolve at runtime but have no declarations. Only the members this repo uses
 * are declared. Development only: it is referenced from the repo's tsconfigs and
 * is not published.
 *
 * @format
 */

declare module 'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry' {
  export const customDirectEventTypes: Record<
    string,
    { registrationName: string }
  >;
  export const customBubblingEventTypes: Record<
    string,
    {
      phasedRegistrationNames: {
        bubbled: string;
        captured: string;
        skipBubbling?: boolean;
      };
    }
  >;
}

declare module 'react-native/Libraries/NativeComponent/BaseViewConfig.ios' {
  const config: {
    bubblingEventTypes: Record<string, unknown>;
    directEventTypes: Record<string, unknown>;
    validAttributes: Record<string, unknown>;
  };
  export default config;
}
