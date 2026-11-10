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
import DesktopNativeSlotNativeComponent from '../../specs/DesktopNativeSlotNativeComponent';
import { createNativeRoot, type NativeRootHandle } from './reconciler';
import { SlotContext, type SlotApi, type SlotContent } from './slots';

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

  const [slots, setSlots] = React.useState<ReadonlyMap<number, SlotContent>>(
    () => new Map(),
  );
  const api = React.useMemo<SlotApi>(() => {
    let nextSlotId = 1;
    return {
      rootId,
      allocate: () => nextSlotId++,
      set(slotId, content) {
        setSlots(previous => {
          const current = previous.get(slotId);
          if (
            current != null &&
            current.children === content.children &&
            current.width === content.width &&
            current.height === content.height &&
            current.fill === content.fill &&
            current.style === content.style
          ) {
            return previous;
          }
          const next = new Map(previous);
          next.set(slotId, content);
          return next;
        });
      },
      remove(slotId) {
        setSlots(previous => {
          if (!previous.has(slotId)) {
            return previous;
          }
          const next = new Map(previous);
          next.delete(slotId);
          return next;
        });
      },
    };
  }, [rootId]);

  React.useLayoutEffect(() => {
    handle.current?.render(
      <FiberProvider>
        <Bridge>
          <SlotContext.Provider value={api}>{children}</SlotContext.Provider>
        </Bridge>
      </FiberProvider>,
    );
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
    >
      {Array.from(slots, ([slotId, content]) => (
        <DesktopNativeSlotNativeComponent
          key={slotId}
          rootId={rootId}
          slotId={slotId}
          style={[
            { position: 'absolute', left: 0, top: 0 },
            content.width > 0 ? { width: content.width } : null,
            content.fill && content.height > 0
              ? { height: content.height }
              : null,
            content.style,
          ]}
        >
          {content.children}
        </DesktopNativeSlotNativeComponent>
      ))}
    </DesktopNativeRootNativeComponent>
  );
}

export function NativeRoot(props: NativeRootProps) {
  return (
    <FiberProvider>
      <NativeRootInner {...props} />
    </FiberProvider>
  );
}
