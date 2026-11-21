// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createRateLimiter, getClientIp } from '@/lib/server/rate-limit';

describe('createRateLimiter', () => {
  it('permite hasta max peticiones por ventana y luego bloquea', () => {
    let now = 0;
    const rl = createRateLimiter({ max: 3, windowMs: 1000, now: () => now });
    expect([rl.check('a'), rl.check('a'), rl.check('a')].map((r) => r.remaining)).toEqual([2, 1, 0]);
    const blocked = rl.check('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    now = 400;
    expect(rl.check('a').retryAfterMs).toBe(600);
  });

  it('la ventana es deslizante', () => {
    let now = 0;
    const rl = createRateLimiter({ max: 2, windowMs: 1000, now: () => now });
    rl.check('a');
    now = 500;
    rl.check('a');
    now = 1000; // expira la primera
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
  });

  it('cuenta cada IP por separado', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('b').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
  });

  it('purga claves viejas para no crecer sin límite', () => {
    let now = 0;
    const rl = createRateLimiter({ max: 1, windowMs: 100, now: () => now, maxKeys: 3 });
    ['a', 'b', 'c'].forEach((k) => rl.check(k));
    now = 200;
    rl.check('d');
    expect(rl.size).toBe(1);
  });
});

describe('getClientIp', () => {
  it('usa la primera IP de x-forwarded-for, luego x-real-ip', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 10.0.0.1' }))).toBe('1.1.1.1');
    expect(getClientIp(new Headers({ 'x-real-ip': '2.2.2.2' }))).toBe('2.2.2.2');
    expect(getClientIp(new Headers())).toBe('unknown');
  });
});
