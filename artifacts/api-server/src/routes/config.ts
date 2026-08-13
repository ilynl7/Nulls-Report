import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * Public bootstrap config for the web app (no auth required).
 *
 * The frontend fetches this at startup so the Clerk publishable key can be
 * supplied at RUNTIME (env vars) instead of being baked into the static
 * build — this is what lets the prebuilt Docker edition run with any keys.
 */
router.get("/config", (_req, res) => {
  res.json({
    publishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? null,
  });
});

export default router;
