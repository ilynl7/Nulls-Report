/**
 * Runtime config fetched from GET /api/config before the app mounts. Kept in
 * its own module so main.tsx (which renders the tree) and the auth page (which
 * decides which sign-in providers to show) don't create an import cycle.
 */
export type PortalConfig = {
  discordConfigured?: boolean;
  /** Canonical public origin the server derives OAuth callbacks from. */
  publicUrl?: string;
};

export const portalConfig: PortalConfig = {};
