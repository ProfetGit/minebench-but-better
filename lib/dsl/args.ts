import { isRoleName, type RoleName } from "@/lib/build/roles";
import type { Facing, Vec3 } from "@/lib/build/types";
import { DslError } from "@/lib/dsl/errors";

// Argument objects arrive from a sandboxed program, so every property is read
// once and copied into plain data. Nothing from the caller is retained.

export type ArgContext = {
  op: string;
  opIndex: number;
  raw: unknown;
};

const FACES: readonly Facing[] = ["north", "south", "east", "west"];

export function fail(ctx: ArgContext, message: string): never {
  throw new DslError(message, { op: ctx.op, opIndex: ctx.opIndex, args: safeArgs(ctx.raw) });
}

function safeArgs(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    const value = (raw as Record<string, unknown>)[key];
    out[key] = typeof value === "function" ? "[function]" : value;
  }
  return out;
}

export function readObject(ctx: ArgContext): Record<string, unknown> {
  const raw = ctx.raw;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail(ctx, "expects a single options object");
  }
  return raw as Record<string, unknown>;
}

export function requireInt(ctx: ArgContext, source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (value === undefined) fail(ctx, `missing required option "${key}"`);
  return coerceInt(ctx, key, value);
}

export function optionalInt(
  ctx: ArgContext,
  source: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = source[key];
  if (value === undefined) return fallback;
  return coerceInt(ctx, key, value);
}

function coerceInt(ctx: ArgContext, key: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(ctx, `option "${key}" must be a finite number, received ${describe(value)}`);
  }
  if (!Number.isInteger(value)) {
    fail(ctx, `option "${key}" must be an integer, received ${value}`);
  }
  return value;
}

export function requireRange(
  ctx: ArgContext,
  key: string,
  value: number,
  min: number,
  max: number,
): number {
  if (value < min || value > max) {
    fail(ctx, `option "${key}" must be between ${min} and ${max}, received ${value}`);
  }
  return value;
}

export function requireRole(
  ctx: ArgContext,
  source: Record<string, unknown>,
  key: string,
): RoleName {
  const value = source[key];
  if (value === undefined) fail(ctx, `missing required option "${key}"`);
  return coerceRole(ctx, key, value);
}

export function optionalRole(
  ctx: ArgContext,
  source: Record<string, unknown>,
  key: string,
): RoleName | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  return coerceRole(ctx, key, value);
}

function coerceRole(ctx: ArgContext, key: string, value: unknown): RoleName {
  if (!isRoleName(value)) {
    fail(
      ctx,
      `option "${key}" must be a known role, received ${describe(value)}. Roles are semantic, never block ids`,
    );
  }
  return value;
}

export function requireFace(ctx: ArgContext, source: Record<string, unknown>, key: string): Facing {
  const value = source[key];
  if (value === undefined) fail(ctx, `missing required option "${key}"`);
  if (typeof value !== "string" || !FACES.includes(value as Facing)) {
    fail(ctx, `option "${key}" must be one of north, south, east, west, received ${describe(value)}`);
  }
  return value as Facing;
}

export function optionalEnum<T extends string>(
  ctx: ArgContext,
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = source[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(ctx, `option "${key}" must be one of ${allowed.join(", ")}, received ${describe(value)}`);
  }
  return value as T;
}

export function requireVec3(ctx: ArgContext, source: Record<string, unknown>, key: string): Vec3 {
  const value = source[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(ctx, `option "${key}" must be an object with x, y and z`);
  }
  const point = value as Record<string, unknown>;
  return {
    x: coerceInt(ctx, `${key}.x`, point.x),
    y: coerceInt(ctx, `${key}.y`, point.y),
    z: coerceInt(ctx, `${key}.z`, point.z),
  };
}

export function optionalVec3(
  ctx: ArgContext,
  source: Record<string, unknown>,
  key: string,
  fallback: Vec3,
): Vec3 {
  if (source[key] === undefined) return fallback;
  return requireVec3(ctx, source, key);
}

export function requireCallback(ctx: ArgContext, value: unknown): () => void {
  if (typeof value !== "function") {
    fail(ctx, `expects a callback function, received ${describe(value)}`);
  }
  return value as () => void;
}

export function rejectUnknownKeys(
  ctx: ArgContext,
  source: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      fail(ctx, `unknown option "${key}". Allowed options are ${allowed.join(", ")}`);
    }
  }
}

function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  if (typeof value === "object") return Array.isArray(value) ? "an array" : "an object";
  return String(value);
}
