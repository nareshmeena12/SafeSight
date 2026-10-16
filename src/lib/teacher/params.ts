import { z } from "zod";

type SearchParams = Record<string, string | string[] | undefined>;

const uuid = z.uuid();

/** First value of a search param, if any. */
export function param(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** `?course=` as a validated id, or null for "all courses". */
export function courseParam(params: SearchParams): string | null {
  const parsed = uuid.safeParse(param(params, "course"));
  return parsed.success ? parsed.data : null;
}

/** A search param restricted to known values. */
export function enumParam<T extends string>(params: SearchParams, key: string, values: readonly T[]): T | null {
  const value = param(params, key);
  return value && (values as readonly string[]).includes(value) ? (value as T) : null;
}
