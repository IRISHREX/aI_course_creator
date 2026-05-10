import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "./logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "HTTP_ERROR",
    public detail?: unknown,
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({
    error: "Route not found",
    code: "ROUTE_NOT_FOUND",
  });
}

function prismaError(error: Prisma.PrismaClientKnownRequestError) {
  if (error.code === "P2002") {
    return new HttpError(409, "Record already exists", "CONFLICT", error.meta);
  }
  if (error.code === "P2025") {
    return new HttpError(404, "Record not found", "NOT_FOUND");
  }
  if (error.code === "P2003") {
    return new HttpError(409, "Related record constraint failed", "RELATION_CONSTRAINT", error.meta);
  }
  return new HttpError(500, "Database request failed", "DATABASE_ERROR");
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = res.getHeader("x-request-id");
  let httpError: HttpError;

  if (err instanceof HttpError) {
    httpError = err;
  } else if (err instanceof ZodError) {
    httpError = new HttpError(400, "Invalid request body", "VALIDATION_ERROR", err.flatten());
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    httpError = prismaError(err);
  } else if (err instanceof SyntaxError && "body" in err) {
    httpError = new HttpError(400, "Malformed JSON body", "MALFORMED_JSON");
  } else if (err instanceof Error && err.message === "Not found") {
    httpError = new HttpError(404, "Record not found", "NOT_FOUND");
  } else {
    httpError = new HttpError(500, "Server error", "SERVER_ERROR");
  }

  const shouldLogStack = httpError.status >= 500;
  logger[shouldLogStack ? "error" : "warn"]({
    err,
    requestId,
    method: req.method,
    path: req.originalUrl,
    status: httpError.status,
    code: httpError.code,
  }, httpError.message);

  res.status(httpError.status).json({
    error: httpError.message,
    code: httpError.code,
    requestId,
    ...(envSafeDetail(httpError) ? { detail: httpError.detail } : {}),
  });
}

function envSafeDetail(error: HttpError) {
  return error.detail !== undefined && error.status < 500;
}
