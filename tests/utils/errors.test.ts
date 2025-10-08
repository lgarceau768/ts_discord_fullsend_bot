import { describe, expect, it } from 'vitest';

import { getErrorMessage, toError } from '../../src/core/utils/errors.js';

describe('utils/errors', () => {
  it('wraps plain strings as Error', () => {
    expect(getErrorMessage('failure')).toBe('failure');
  });

  it('unwraps error-like objects', () => {
    expect(getErrorMessage({ message: 'boom' })).toBe('boom');
  });

  it('falls back to JSON stringification', () => {
    const err = toError({ code: 500, status: 'Internal' });
    expect(err.message).toContain('"code":500');
  });

  it('uses inspect when JSON serialization fails', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const err = toError(cyclic);
    expect(err.message).toContain('[Circular');
  });
});
