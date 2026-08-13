import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

/**
 * Registered once inside <ClerkProvider/>. Every API call through the
 * generated client attaches `Authorization: Bearer <clerk token>` so the
 * backend can authenticate the request (Clerk session cookies are not sent
 * to the API by default).
 */
export function AuthBridge() {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded]);

  return null;
}
