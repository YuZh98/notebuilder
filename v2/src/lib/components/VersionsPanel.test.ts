import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, within } from '@testing-library/svelte';
import VersionsPanel from './VersionsPanel.svelte';
import SideBar from './SideBar.svelte';
import { mode } from '../stores/mode';
import type { SnapshotMeta } from '../snapshots';

afterEach(() => {
  cleanup();
  mode.set('edit');
});

const NOW = new Date(2026, 9, 18, 15, 0).getTime();
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;

const VERSIONS: SnapshotMeta[] = [
  { id: 'v3', createdAt: at(5 * MIN), reason: 'auto', cardCount: 12, hash: 'a' },
  { id: 'v2', createdAt: at(3 * 60 * MIN), reason: 'manual', cardCount: 1, hash: 'b' },
  { id: 'v1', createdAt: new Date(2026, 9, 17, 9, 0).toISOString(), reason: 'before-restore', cardCount: 0, hash: 'c' },
];

const props = (over: Record<string, unknown> = {}) => ({
  versions: VERSIONS,
  now: NOW,
  onsave: vi.fn(),
  onrestore: vi.fn(),
  ...over,
});

async function expand() {
  const head = screen.getByRole('button', { name: /versions/i });
  await fireEvent.click(head);
  return head;
}

describe('VersionsPanel', () => {
  it('starts folded: a header button that says it is collapsed, and no list', () => {
    const { container } = render(VersionsPanel, { props: props() });
    const head = screen.getByRole('button', { name: /versions/i });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(head.textContent).toMatch(/🕘/);
    expect(container.querySelector('.vp-list')).toBeNull();
    expect(screen.queryByRole('button', { name: /save version now/i })).toBeNull();
  });

  it('unfolds to one row per version: relative time, reason and card count, newest first', async () => {
    const { container } = render(VersionsPanel, { props: props() });
    const head = await expand();
    expect(head.getAttribute('aria-expanded')).toBe('true');
    const controls = head.getAttribute('aria-controls');
    expect(controls && container.querySelector(`#${controls}`)).toBeTruthy();
    const list = screen.getByRole('list', { name: /saved versions/i });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '5 min ago Auto-saved 12 cards Restore',
      '3 h ago Saved by you 1 card Restore',
      'yesterday Before a restore 0 cards Restore',
    ]);
    // The exact time is one hover away, and machine-readable.
    const time = rows[0].querySelector('time');
    expect(time?.getAttribute('datetime')).toBe(VERSIONS[0].createdAt);
    expect(time?.getAttribute('title')).toBeTruthy();
  });

  it('folds again', async () => {
    const { container } = render(VersionsPanel, { props: props() });
    const head = await expand();
    await fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.vp-list')).toBeNull();
  });

  it('says when there are no versions yet', async () => {
    render(VersionsPanel, { props: props({ versions: [] }) });
    await expand();
    expect(screen.queryByRole('list')).toBeNull();
    expect(document.body.textContent).toMatch(/no versions yet/i);
  });

  it('“Save version now” calls onsave', async () => {
    const p = props();
    render(VersionsPanel, { props: p });
    await expand();
    await fireEvent.click(screen.getByRole('button', { name: /save version now/i }));
    expect(p.onsave).toHaveBeenCalledTimes(1);
    expect(p.onrestore).not.toHaveBeenCalled();
  });

  it('each Restore names its version for assistive tech and calls onrestore with its id', async () => {
    const p = props();
    render(VersionsPanel, { props: p });
    await expand();
    const restore = screen.getByRole('button', { name: /restore the version from 3 h ago/i });
    await fireEvent.click(restore);
    expect(p.onrestore).toHaveBeenCalledWith('v2');
  });

  it('the count in the header follows the list', async () => {
    const { rerender } = render(VersionsPanel, { props: props() });
    expect(screen.getByRole('button', { name: /versions/i }).textContent).toMatch(/3/);
    await rerender(props({ versions: VERSIONS.slice(0, 1) }));
    expect(screen.getByRole('button', { name: /versions/i }).textContent).toMatch(/1/);
  });
});

describe('SideBar — versions panel in the notebook panel', () => {
  const base = {
    notebookName: 'NB',
    canPersist: true,
    cardTypes: [],
    selProd: null,
    onrename: vi.fn(),
    ondelete: vi.fn(),
    onpickprod: vi.fn(),
    onplaceprod: vi.fn(),
    onclosedetail: vi.fn(),
  };

  it('shows the panel in Edit mode inside the app and wires both callbacks', async () => {
    const onversionsave = vi.fn();
    const onversionrestore = vi.fn();
    const { container } = render(SideBar, {
      props: { ...base, versions: VERSIONS, onversionsave, onversionrestore },
    });
    expect(container.querySelector('.versions-panel')).toBeTruthy();
    await expand();
    await fireEvent.click(screen.getByRole('button', { name: /save version now/i }));
    await fireEvent.click(screen.getAllByRole('button', { name: /^restore the version/i })[0]);
    expect(onversionsave).toHaveBeenCalledTimes(1);
    expect(onversionrestore).toHaveBeenCalledWith('v3');
  });

  it('shows nothing in the browser demo (no storage), even if handed versions', () => {
    const { container } = render(SideBar, { props: { ...base, canPersist: false, versions: VERSIONS } });
    expect(container.querySelector('.versions-panel')).toBeNull();
  });

  it('shows nothing until versions are available (before hydration, or the shared Reader)', () => {
    const { container } = render(SideBar, { props: base });
    expect(container.querySelector('.versions-panel')).toBeNull();
  });

  it('shows nothing in Study mode', () => {
    mode.set('study');
    const { container } = render(SideBar, { props: { ...base, versions: VERSIONS } });
    expect(container.querySelector('.versions-panel')).toBeNull();
  });
});
