import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { PortalUser } from "@workspace/db";

export interface AuthedRequest extends Request {
  portalUser?: PortalUser;
}

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function httpError(status: number, message: string): HttpError {
  return new HttpError(status, message);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Convenience accessor for the portal user attached by requireAuth(). */
export function portalUserOf(req: Request): PortalUser {
  const user = (req as AuthedRequest).portalUser;
  if (!user) {
    throw httpError(401, "Authentication required");
  }
  return user;
}

function isZodError(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "issues" in value &&
    Array.isArray((value as { issues: unknown }).issues)
  );
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (isZodError(err)) {
    res.status(400).json({ error: "Invalid request payload" });
    return;
  }
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
