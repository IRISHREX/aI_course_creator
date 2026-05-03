import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { env } from "./env.js";
import { prisma } from "./db.js";

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; roles: string[] };
}

export function signToken(payload: { sub: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(h.slice(7), env.JWT_SECRET) as { sub: string; email: string };
    const roles = await prisma.userRole.findMany({ where: { userId: decoded.sub } });
    req.user = { id: decoded.sub, email: decoded.email, roles: roles.map(r => r.role) };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...allowed: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.user.roles.some(r => allowed.includes(r)))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(h.slice(7), env.JWT_SECRET) as { sub: string; email: string };
      const roles = await prisma.userRole.findMany({ where: { userId: decoded.sub } });
      req.user = { id: decoded.sub, email: decoded.email, roles: roles.map(r => r.role) };
    } catch { /* ignore */ }
  }
  next();
}
