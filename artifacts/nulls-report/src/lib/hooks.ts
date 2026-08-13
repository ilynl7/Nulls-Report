import { useMemo } from 'react';
import {
  getGetCurrentUserQueryKey,
  getListNotificationsQueryKey,
  getListReportsQueryKey,
  useGetCurrentUser,
  useListNotifications,
  useListReports,
} from '@workspace/api-client-react';
import type { ListReportsParams, User } from '@workspace/api-client-react';
import { API_KEYS, queryClient } from '@/lib/api';

export interface PortalUserState {
  user: User | null;
  isLoading: boolean;
  /** True when the /api/me request returned 401 (no portal session). */
  signedOut: boolean;
  error: unknown;
  refetch: () => void;
}

function isUnauthorized(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status?: unknown }).status === 401,
  );
}

/**
 * The signed-in portal account (or null when there is no session). An account
 * always exists behind the session — it is created automatically on first
 * provider sign-in — so this hook only reflects whether a session exists.
 */
export function usePortalUser(): PortalUserState {
  const query = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
  return {
    user: query.data ?? null,
    isLoading: query.isLoading && !query.data,
    signedOut: isUnauthorized(query.error),
    error: query.error,
    refetch: query.refetch,
  };
}

export function useNotifications() {
  const { user } = usePortalUser();
  const query = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), enabled: !!user, retry: false },
  });
  const unread = useMemo(
    () => (query.data ?? []).filter((n) => !n.readAt).length,
    [query.data],
  );
  return { notifications: query.data ?? [], unread, isLoading: query.isLoading, refetch: query.refetch };
}

/** All reports visible to the signed-in user (backend-scoped by role). */
export function useReports(params?: ListReportsParams) {
  const { user } = usePortalUser();
  const query = useListReports(params, {
    query: { queryKey: getListReportsQueryKey(params), enabled: !!user, retry: false },
  });
  return { reports: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/**
 * The community report feed: every report whose effective visibility is
 * public (server-enforced). Optional filters are passed through as query
 * params (game, issueType, category, priority, status, verification, search).
 */
export function useCommunityReports(params?: Omit<ListReportsParams, 'scope'>) {
  const queryParams: ListReportsParams = { ...params, scope: 'community' };
  const { user } = usePortalUser();
  const query = useListReports(queryParams, {
    query: { queryKey: getListReportsQueryKey(queryParams), enabled: !!user, retry: false },
  });
  return { reports: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/**
 * Refreshes session-scoped data after login, logout, registration or an
 * authentication-method change (the session cookie is already set by then).
 */
export function refreshAuthQueries() {
  void queryClient.invalidateQueries({ queryKey: API_KEYS.me });
  void queryClient.invalidateQueries({ queryKey: API_KEYS.reports });
  void queryClient.invalidateQueries({ queryKey: API_KEYS.notifications });
  void queryClient.invalidateQueries({ queryKey: API_KEYS.users });
}
