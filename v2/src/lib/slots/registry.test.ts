import { describe, it, expect } from 'vitest';
import { getSlot, allSlots } from './registry';

describe('slot registry', () => {
  it('has text slot registered', () => {
    const text = getSlot('text');
    expect(text).toBeDefined();
    expect(text!.type).toBe('text');
  });

  it('returns undefined for unknown slot type', () => {
    expect(getSlot('nonexistent')).toBeUndefined();
  });

  it('lists all registered slots', () => {
    const all = allSlots();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.map((s) => s.type)).toContain('text');
  });
});
