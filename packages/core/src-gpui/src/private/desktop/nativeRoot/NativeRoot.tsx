/**
 * Renders React elements whose types name native components into one native
 * tree, instead of one Fabric node each.
 *
 * ```tsx
 * <NativeRoot style={{ width: 240, height: 120 }}>
 *   <Dialog title="Delete">
 *     <Button label="Cancel" onPress={close} />
 *   </Dialog>
 * </NativeRoot>
 * ```
 *
 * The children are described to a second reconciler: hooks, state and effects
 * work as everywhere, and the contexts the NativeRoot is rendered under are
 * visible inside it. A component that needs a React Native view inside the tree
 * puts it in a slot; everything else becomes an instance in the runtime and
 * costs no layout pass of its own.
 *
 * @format
 */

import * as React from 'react';
import { FiberProvider, useContextBridge } from 'its-fine';
import type { ViewProps } from 'react-native';
import DesktopNativeRootNativeComponent from '../../specs/DesktopNativeRootNativeComponent';
import { createNativeRoot, type NativeRootHandle } from './reconciler';

export type NativeRootProps = ViewProps & {
  children?: React.ReactNode;
};

let nextRootId = 1 + Math.floor(Math.random() * 0x3fffff) * 256;

function NativeRootInner({ children, ...viewProps }: NativeRootProps) {
  const Bridge = useContextBridge();
  const [rootId] = React.useState(() => nextRootId++);
  const [failure, setFailure] = React.useState<{ error: unknown } | null>(null);
  const handle = React.useRef<NativeRootHandle | null>(null);

  if (failure != null) {
    throw failure.error;
  }

  React.useLayoutEffect(() => {
    handle.current = createNativeRoot(rootId, error => setFailure({ error }));
    return () => {
      handle.current?.unmount();
      handle.current = null;
    };
  }, [rootId]);

  React.useLayoutEffect(() => {
    handle.current?.render(<Bridge>{children}</Bridge>);
  });

  const onNativeEvent = React.useCallback(
    (event: {
      nativeEvent: { id: number; name: string; payload?: unknown };
    }) => {
      handle.current?.dispatch(event.nativeEvent);
    },
    [],
  );

  return (
    <DesktopNativeRootNativeComponent
      {...viewProps}
      rootId={rootId}
      onNativeEvent={onNativeEvent}
    />
  );
}

export function NativeRoot(props: NativeRootProps) {
  return (
    <FiberProvider>
      <NativeRootInner {...props} />
    </FiberProvider>
  );
}
