import type { Request } from "express";

/**
 * Resolves the canonical public origin of this deployment.
 *
 * Precedence:
 *   1. `PUBLIC_URL` — set this in production / on managed hosts where the
 *      public URL differs from what the request headers report (proxies,
 *      tunnels, custom domains). No trailing slash.
 *   2. The request's forwarded scheme + host (`x-forwarded-proto` /
 *      `x-forwarded-host` first, then `secure`/`host`).
 *
 * OAuth redirect URIs (Discord) are derived from this value so the URI
 * registered in the provider portal, the URI sent in the authorization
 * request, and the URI used during the token exchange are always identical.
 */
export function publicUrl(req: Request): string {
  const configured = process.env.PUBLIC_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  const proto = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim();
  const scheme = proto || (req.secure ? "https" : "http");
  const host =
    String(req.headers["x-forwarded-host"] ?? "")
      .split(",")[0]
      .trim() ||
    req.headers.host ||
    `localhost:${process.env.PORT ?? "8080"}`;
  return `${scheme}://${host}`;
}

/** The canonical OAuth callback for a provider, e.g. https://host/api/auth/discord/callback. */
export function oauthCallbackUrl(req: Request, path: string): string {
  const base = publicUrl(req);
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}
