import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import {
  getGetCurrentUserQueryKey,
  getListNotificationsQueryKey,
  getListReportsQueryKey,
  useGetCurrentUser,
  useListNotifications,
  useListReports,
} from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';

export interface PortalUserState {
  user: User | null;
  isLoading: boolean;
  error: unknown;
}

export function usePortalUser(): PortalUserState {
  const { isLoaded, isSignedIn } = useAuth();
  const enabled = isLoaded && isSignedIn;
  const query = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), enabled },
  });
  return {
    user: query.data ?? null,
    isLoading: !enabled || query.isLoading,
    error: query.error,
  };
}

export function useNotifications() {
  const { isLoaded, isSignedIn } = useAuth();
  const enabled = isLoaded && isSignedIn;
  const query = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), enabled },
  });
  const unread = useMemo(
    () => (query.data ?? []).filter((n) => !n.readAt).length,
    [query.data],
  );
  return { notifications: query.data ?? [], unread, isLoading: query.isLoading, refetch: query.refetch };
}

/** All reports visible to the signed-in user (backend-scoped by role). */
export function useReports() {
  const { isLoaded, isSignedIn } = useAuth();
  const enabled = isLoaded && isSignedIn;
  const query = useListReports(undefined, {
    query: { queryKey: getListReportsQueryKey(), enabled },
  });
  return { reports: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}
