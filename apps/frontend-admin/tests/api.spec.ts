import { describe, expect, it } from 'vitest';
import { apiBase, formatDateTime } from '../src/api';

describe('apiBase', () => {
  it('default /api senza config runtime', () => {
    expect(apiBase(undefined)).toBe('/api');
  });

  it('toglie lo slash finale', () => {
    expect(apiBase({ apiBase: 'http://localhost:8080/', sentryDsn: '', sentryEnvironment: '' })).toBe(
      'http://localhost:8080',
    );
  });
});

describe('formatDateTime', () => {
  it('null → mai', () => {
    expect(formatDateTime(null)).toBe('mai');
  });

  it('data in formato italiano, ora di Roma', () => {
    expect(formatDateTime('2026-11-26T03:54:00Z')).toBe('26/11/26, 04:54');
  });
});
