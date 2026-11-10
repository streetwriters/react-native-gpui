/**
 * A virtual list in a native tree. The list scrolls natively and reports which
 * items are in view; only those and `overscan` more on each side exist, as
 * items keyed by slot, so scrolling updates the items that are there instead of
 * creating new ones.
 *
 * ```tsx
 * <NativeVirtualList
 *   count={10000}
 *   itemHeight={32}
 *   renderItem={index => <Label text={`row ${index}`} />}
 * />
 * ```
 *
 * Use it inside a `NativeRoot`; `renderItem` may return native components and
 * `NativeSlot`s.
 *
 * @format
 */

import * as React from 'react';

export type NativeVirtualListProps = {
  count: number;
  itemHeight: number;
  renderItem: (index: number) => React.ReactNode;
  /** Items kept ready beyond the visible ones, on each side. Defaults to 3. */
  overscan?: number;
  testID?: string;
};

type Range = { first: number; last: number };

const List = 'NativeVirtualList' as unknown as React.ComponentType<
  Record<string, unknown>
>;
const Item = 'NativeVirtualItem' as unknown as React.ComponentType<
  Record<string, unknown>
>;

export function NativeVirtualList({
  count,
  itemHeight,
  renderItem,
  overscan = 3,
  testID,
}: NativeVirtualListProps) {
  const [range, setRange] = React.useState<Range>({
    first: 0,
    last: Math.min(count, 12) - 1,
  });
  const onRangeChange = React.useCallback((next: unknown) => {
    const { first, last } = next as Range;
    setRange(previous =>
      previous.first === first && previous.last === last
        ? previous
        : { first, last },
    );
  }, []);

  const start = Math.max(0, range.first - overscan);
  const end = Math.min(count - 1, range.last + overscan);
  const pool = range.last - range.first + 1 + 2 * overscan;
  const items: React.ReactNode[] = [];
  for (let index = start; index <= end; index++) {
    items.push(
      <Item key={index % pool} index={index} itemHeight={itemHeight}>
        {renderItem(index)}
      </Item>,
    );
  }
  return (
    <List
      testID={testID}
      count={count}
      itemHeight={itemHeight}
      onRangeChange={onRangeChange}
    >
      {items}
    </List>
  );
}
