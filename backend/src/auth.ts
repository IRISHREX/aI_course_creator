import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; roles: string[] };
}

export function signToken(payload: { sub: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
}

async function getAuthUser(decoded: { sub: string; email: string }) {
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, email: true, roles: { select: { role: true } } },
  });
  if (!user) return null;
  return { id: user.id, email: user.email || decoded.email, roles: user.roles.map(r => r.role) };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
  try {
    const decoded = jwt.verify(h.slice(7), env.JWT_SECRET) as { sub: string; email: string };
    const user = await getAuthUser(decoded);
    if (!user) return res.status(401).json({ error: "Invalid token", code: "INVALID_TOKEN" });
    req.user = user;
    next();
  } catch (error) {
    logger.warn({ err: error }, "JWT verification failed");
    return res.status(401).json({ error: "Invalid token", code: "INVALID_TOKEN" });
  }
}

export function requireRole(...allowed: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    if (!req.user.roles.some(r => allowed.includes(r)))
      return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    next();
  };
}

export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(h.slice(7), env.JWT_SECRET) as { sub: string; email: string };
      req.user = await getAuthUser(decoded) || undefined;
    } catch { /* ignore invalid optional auth */ }
  }
  next();
}
