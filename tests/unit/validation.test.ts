import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadConfig } from '../../server/src/config.js';
import { AppError } from '../../server/src/domain/errors.js';
import { buildRequestWhere } from '../../server/src/modules/requests/repo.js';
import { escapeLike } from '../../server/src/modules/customers/repo.js';
import { csvEnum, parse } from '../../server/src/http/validation.js';
import { stableId } from '../../server/src/db/seed.js';
import { niceMax } from '../../web/src/lib/chart.js';

describe('parse', () => {
  it('turns schema failures into a 400 with one message per field', () => {
    const schema = z.object({ a: z.string().min(2), b: z.number() });
    try {
      parse(schema, { a: 'x', b: 'nope' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.status).toBe(400);
      expect(Object.keys(e.details!.fields as object).sort()).toEqual(['a', 'b']);
    }
  });

  it('parses comma lists only from the allowed set', () => {
    const schema = z.object({ s: csvEnum(['new', 'closed'] as const) });
    expect(parse(schema, { s: 'new, closed' }).s).toEqual(['new', 'closed']);
    expect(parse(schema, {}).s).toBeUndefined();
    expect(() => parse(schema, { s: 'new,evil' })).toThrow(AppError);
  });
});

describe('query building', () => {
  it('passes every user value as a bind parameter', () => {
    const { sql, params } = buildRequestWhere({
      q: "o'brien%",
      status: ['new'],
      sort: '-created',
      page: 1,
      pageSize: 25,
    });
    expect(sql).not.toContain("o'brien");
    expect(params).toContain("%o'brien\\%%");
  });

  it('matches SR numbers by exact ref', () => {
    const { sql, params } = buildRequestWhere({ q: 'sr-1042', sort: '-created', page: 1, pageSize: 25 });
    expect(sql).toContain('r.ref =');
    expect(params).toContain(1042);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});

describe('configuration', () => {
  it('rejects a missing database URL and an invalid timezone', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', APP_TIMEZONE: 'Mars/Olympus' })).toThrow(
      /APP_TIMEZONE/,
    );
  });

  it('defaults to non-secure cookies only because the default bind is loopback', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x' });
    expect(c.HOST).toBe('127.0.0.1');
    expect(c.COOKIE_SECURE).toBe(false);
  });
});

describe('seed ids', () => {
  it('are stable, distinct and valid RFC 4122 UUIDs', () => {
    expect(stableId('a')).toBe(stableId('a'));
    expect(stableId('a')).not.toBe(stableId('b'));
    expect(z.uuid().safeParse(stableId('customer:x')).success).toBe(true);
  });
});

describe('chart axis', () => {
  it.each([
    [0, 4],
    [3, 4],
    [8, 8],
    [10, 12],
    [17, 20],
    [41, 80],
    [130, 200],
  ])('niceMax(%i) = %i', (input, expected) => {
    const max = niceMax(input);
    expect(max).toBe(expected);
    expect(max % 4).toBe(0);
    expect(max).toBeGreaterThanOrEqual(input);
  });
});
