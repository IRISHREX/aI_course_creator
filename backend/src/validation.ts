import type { Request } from "express";
import { z } from "zod";

export const IdParam = z.object({ id: z.string().uuid() });
export const SlugParam = z.object({ slug: z.string().min(1).max(220) });

export function body<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  return schema.parse(req.body);
}

export function params<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  return schema.parse(req.params);
}

export function query<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  return schema.parse(req.query);
}
