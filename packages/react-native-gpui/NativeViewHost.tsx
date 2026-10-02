import React from 'react';
import type { ViewProps } from 'react-native';

import NativeViewHostNativeComponent from './NativeViewHostNativeComponent';

export type NativeViewHostProps = ViewProps & {
  /** Name passed to the matching Rust NativeViewFactory registration. */
  viewName: string;
  /** JSON-serializable props passed to NativeViewFactory::create_view. */
  nativeProps?: Record<string, unknown>;
};

/** Fabric host that mounts a registered AppKit view at the Yoga layout bounds. */
export default function NativeViewHost({
  viewName,
  nativeProps,
  ...props
}: NativeViewHostProps): React.JSX.Element {
  return (
    <NativeViewHostNativeComponent
      {...props}
      viewName={viewName}
      nativePropsJson={JSON.stringify(nativeProps ?? {})}
    />
  );
}
