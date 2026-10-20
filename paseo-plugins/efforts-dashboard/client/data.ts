import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState, type LayoutChangeEvent } from "react-native";
import { detailRpc, readRpc, searchRpc } from "../shared/rpc";
import { fetchOverview, latestOverview, onOverview } from "./runtime";

/** Files change under agents; surfaces re-read every 5 s while they are on screen. */
const POLL_MS = 5_000;

function subscribeAppState(listener: () => void) {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * Whether a surface is on screen: laid out with a size (hidden workspace decks measure 0) and the
 * app in the foreground. Spread `onLayout` on the surface's root.
 */
export function useVisible(): { visible: boolean; width: number; onLayout(event: LayoutChangeEvent): void } {
  const [width, setWidth] = useState(-1);
  const active = useSyncExternalStore(subscribeAppState, () => AppState.currentState !== "background");
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width), []);
  return { visible: active && width !== 0, width, onLayout };
}

export function useOverview(visible: boolean) {
  const queryClient = useQueryClient();
  // Bindings changed elsewhere (header popover, another panel) land here at once.
  useEffect(() => onOverview((overview) => queryClient.setQueryData(["efforts", "overview"], overview)), [queryClient]);
  return useQuery({
    queryKey: ["efforts", "overview"],
    queryFn: fetchOverview,
    initialData: latestOverview() ?? undefined,
    staleTime: 2_000,
    refetchInterval: visible ? POLL_MS : false,
    refetchOnMount: true,
  });
}

export function useDetail(effort: { root: string; slug: string } | null, visible: boolean) {
  const detail = useRpc(detailRpc);
  return useQuery({
    queryKey: ["efforts", "detail", effort?.root, effort?.slug],
    queryFn: () => detail({ root: effort!.root, slug: effort!.slug }),
    enabled: !!effort,
    staleTime: 2_000,
    refetchInterval: visible ? POLL_MS : false,
    retry: false,
  });
}

export function useDoc(effort: { root: string; slug: string }, rel: string, visible: boolean) {
  const read = useRpc(readRpc);
  return useQuery({
    queryKey: ["efforts", "doc", effort.root, effort.slug, rel],
    queryFn: () => read({ root: effort.root, slug: effort.slug, rel }),
    staleTime: 2_000,
    refetchInterval: visible ? POLL_MS : false,
    retry: false,
  });
}

/** Server search, 150 ms after the last keystroke. */
export function useSearch(query: string, scope: { root?: string; current?: string }) {
  const search = useRpc(searchRpc);
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);
  return useQuery({
    queryKey: ["efforts", "search", settled, scope.root, scope.current],
    queryFn: () => search({ query: settled, ...scope }),
    enabled: settled.length > 0,
    staleTime: 5_000,
    placeholderData: (previous) => previous,
  });
}
