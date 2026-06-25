/**
 * KeyedMutex tests — verifies per-session serialization (the fix for the
 * read-modify-write session race) without deadlocking on rejection.
 */
const KeyedMutex = require('../keyedMutex');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('KeyedMutex', () => {
  test('serializes operations sharing a key (no interleave)', async () => {
    const m = new KeyedMutex();
    const log = [];
    await Promise.all([
      m.runExclusive('A', async () => { log.push('A1-start'); await sleep(20); log.push('A1-end'); }),
      m.runExclusive('A', async () => { log.push('A2-start'); await sleep(1); log.push('A2-end'); })
    ]);
    expect(log).toEqual(['A1-start', 'A1-end', 'A2-start', 'A2-end']);
  });

  test('runs different keys concurrently', async () => {
    const m = new KeyedMutex();
    const order = [];
    await Promise.all([
      m.runExclusive('A', async () => { await sleep(30); order.push('A'); }),
      m.runExclusive('B', async () => { await sleep(5); order.push('B'); })
    ]);
    // B (shorter) finishes first because it is not blocked by A.
    expect(order).toEqual(['B', 'A']);
  });

  test('a rejected task does not deadlock the key', async () => {
    const m = new KeyedMutex();
    await expect(m.runExclusive('K', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const result = await m.runExclusive('K', async () => 'ok');
    expect(result).toBe('ok');
  });

  test('cleans up idle keys (no unbounded growth)', async () => {
    const m = new KeyedMutex();
    await m.runExclusive('X', async () => 1);
    await sleep(1);
    expect(m.activeKeys).toBe(0);
  });
});
