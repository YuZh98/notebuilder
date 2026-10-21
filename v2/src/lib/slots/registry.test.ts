// @vitest-environment node
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

  it('lists exactly the eleven registered slots', () => {
    expect(allSlots().map((s) => s.type).sort()).toEqual([
      'chart', 'choice', 'code', 'compute', 'image', 'list',
      'progress', 'slider', 'table', 'text', 'text-input',
    ]);
  });
});
