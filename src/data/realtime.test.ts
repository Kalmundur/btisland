import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Status = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

interface FakeChannel {
  topic: string;
  emit: (status: Status) => void;
  on: () => FakeChannel;
  subscribe: (cb: (status: Status) => void) => FakeChannel;
}

const channels: FakeChannel[] = [];
const removed: FakeChannel[] = [];

vi.mock('../lib/supabase', () => ({
  requireSupabase: () => ({
    channel(topic: string) {
      let cb: (status: Status) => void = () => undefined;
      const ch: FakeChannel = {
        topic,
        emit: (status) => cb(status),
        on: () => ch,
        subscribe: (fn) => {
          cb = fn;
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    },
    async removeChannel(ch: FakeChannel) {
      removed.push(ch);
      ch.emit('CLOSED'); // supabase-js reports CLOSED to the removed channel
    },
  }),
}));

const { subscribeToEncounter, RETRY_MIN_MS } = await import('./encounterRepository');
const { realtimeHealthy } = await import('../lib/connectivity');

describe('realtime reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    channels.length = 0;
    removed.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('replaces a dropped channel and clears the delayed-updates state when it reconnects', () => {
    const onChange = vi.fn();
    const stop = subscribeToEncounter('e1', onChange, 0);
    channels[0].emit('SUBSCRIBED');
    expect(realtimeHealthy.get()).toBe(true);

    channels[0].emit('CLOSED'); // e.g. server closed it while the phone slept
    expect(realtimeHealthy.get()).toBe(false);
    expect(channels).toHaveLength(1);

    vi.advanceTimersByTime(RETRY_MIN_MS);
    expect(channels).toHaveLength(2);
    expect(removed).toContain(channels[0]);
    expect(channels[1].topic).not.toBe(channels[0].topic);
    expect(realtimeHealthy.get()).toBe(false); // the removed channel's CLOSED is ignored

    channels[1].emit('SUBSCRIBED');
    expect(realtimeHealthy.get()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalled(); // refetch after reconnect: events may have been missed

    stop();
    expect(removed).toContain(channels[1]);
    expect(realtimeHealthy.get()).toBe(true);
  });

  it('backs off while reconnecting keeps failing, and polls meanwhile', () => {
    const onChange = vi.fn();
    const stop = subscribeToEncounter('e2', onChange, 0);
    channels[0].emit('CHANNEL_ERROR');

    vi.advanceTimersByTime(RETRY_MIN_MS); // 1st retry after 2 s
    expect(channels).toHaveLength(2);
    channels[1].emit('TIMED_OUT');

    vi.advanceTimersByTime(RETRY_MIN_MS); // 2nd retry waits 4 s
    expect(channels).toHaveLength(2);
    vi.advanceTimersByTime(RETRY_MIN_MS);
    expect(channels).toHaveLength(3);

    onChange.mockClear();
    vi.advanceTimersByTime(15_000); // fallback polling while degraded
    expect(onChange).toHaveBeenCalled();

    stop();
    expect(realtimeHealthy.get()).toBe(true);
  });

  it('stops retrying once unsubscribed', () => {
    const stop = subscribeToEncounter('e3', () => undefined, 0);
    channels[0].emit('CLOSED');
    stop();
    vi.advanceTimersByTime(60_000);
    expect(channels).toHaveLength(1);
  });
});
