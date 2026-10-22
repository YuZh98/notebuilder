import { describe, it, expect, afterEach } from 'vitest';
import { setAppInert } from './modal-inert';

function shell(): void {
  document.body.innerHTML = `
    <div id="app">
      <div id="top"><button>Factory</button></div>
      <button id="topbump">˄</button>
      <div id="main"><button>card</button></div>
      <button id="sidebump">‹</button>
      <div class="modal kb-modal"><button>Close</button></div>
    </div>`;
}

const inertFlags = () =>
  ['#top', '#topbump', '#main', '#sidebump'].map((s) => document.querySelector(s)?.hasAttribute('inert'));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('setAppInert', () => {
  it('inerts every shell region beside #main, and leaves the overlay reachable', () => {
    shell();
    setAppInert(true);
    expect(inertFlags()).toEqual([true, true, true, true]);
    expect(document.querySelector('.kb-modal')?.hasAttribute('inert')).toBe(false);
  });

  it('takes the attribute off again when the overlay closes', () => {
    shell();
    setAppInert(true);
    setAppInert(false);
    expect(inertFlags()).toEqual([false, false, false, false]);
  });

  it('is a no-op before the shell has mounted', () => {
    expect(() => setAppInert(true)).not.toThrow();
  });
});
