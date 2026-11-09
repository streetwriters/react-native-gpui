import { useEffect, useMemo, useState } from 'react';
import type { Kernel, PageRef } from '@embedpdf/core';
import {
  SearchToken,
  type SearchCapability,
  type SearchHit,
  type SearchQuery,
} from '@embedpdf/plugin-search';

export interface SearchState {
  query: string;
  status: 'idle' | 'searching' | 'complete' | 'cancelled' | 'error';
  hits: number;
  active: number;
  activePage: number;
}

export interface SearchController {
  search(query: string, options?: Partial<SearchQuery>): Promise<void>;
  next(): SearchHit | null;
  previous(): SearchHit | null;
  clear(): void;
}

export function useSearch(kernel: Kernel, documentId: string | null) {
  const capability = useMemo<SearchCapability | null>(
    () => (documentId ? kernel.tryCapability(SearchToken, documentId) : null),
    [kernel, documentId],
  );
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!capability) return;
    const bump = () => setVersion(previous => previous + 1);
    const stops = [
      capability.onProgressChanged(bump),
      capability.onCompleted(bump),
      capability.onCancelled(bump),
      capability.onFailed(bump),
      capability.onActiveHitChanged(bump),
      capability.onCleared(bump),
    ];
    return () => stops.forEach(stop => stop());
  }, [capability]);

  const state = useMemo<SearchState>(
    () => ({
      query: capability?.getQuery()?.text ?? '',
      status: capability?.getStatus() ?? 'idle',
      hits: capability?.listHits().length ?? 0,
      active: capability ? capability.getActiveHitIndex() : -1,
      activePage: (capability?.getActiveHit()?.pageIndex ?? -1) + 1,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [capability, version],
  );

  const hitsOn = (page: PageRef): readonly SearchHit[] =>
    capability ? capability.listHits({ page }) : [];

  return { capability, state, hitsOn };
}
