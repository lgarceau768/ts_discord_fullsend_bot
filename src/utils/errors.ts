import { inspect } from 'node:util';

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') {
      return new Error(message);
    }
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(inspect(value));
  }
}

export function getErrorMessage(value: unknown): string {
  return toError(value).message;
}
