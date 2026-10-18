<script lang="ts">
  /**
   * W7 — the open notebook's version history: a folded "🕘 Versions" list (when, why, how many
   * cards), "Save version now", and Restore per row. Props and callbacks only: the host stores
   * versions, confirms and performs a restore (undoably), and keeps `versions` current.
   */
  import { relativeTime, reasonLabel, type SnapshotMeta } from '../snapshots';

  let {
    versions,
    now = undefined,
    onsave,
    onrestore,
  }: {
    /** Newest first. */
    versions: SnapshotMeta[];
    /** Fixed clock for the relative times (tests); the panel keeps its own while open otherwise. */
    now?: number;
    onsave: () => void;
    onrestore: (id: string) => void;
  } = $props();

  const uid = $props.id();
  let open = $state(false);
  let clock = $state(Date.now());

  // Relative times ("5 min ago") stay true while the list is on screen.
  $effect(() => {
    if (!open || now !== undefined) return;
    clock = Date.now();
    const timer = setInterval(() => (clock = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  const at = $derived(now ?? clock);
  const exact = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t).toLocaleString() : iso;
  };
</script>

<div class="versions-panel">
  <button
    class="vp-head"
    aria-expanded={open}
    aria-controls={open ? `${uid}-versions` : undefined}
    title="Earlier versions of this notebook, kept on this computer"
    onclick={() => (open = !open)}
  >
    <span aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span aria-hidden="true">🕘</span> Versions
    <span class="vp-count muted sm">{versions.length}</span>
  </button>
  {#if open}
    <div class="vp-body" id="{uid}-versions">
      <button class="btn sm" title="Keep the notebook as it is right now" onclick={onsave}>Save version now</button>
      {#if versions.length === 0}
        <p class="muted sm vp-empty">No versions yet — one is kept automatically as you work.</p>
      {:else}
        <ul class="vp-list" aria-label="Saved versions">
          {#each versions as v (v.id)}
            {@const when = relativeTime(v.createdAt, at)}
            <li class="vp-row">
              <span class="vp-meta">
                <time datetime={v.createdAt} title={exact(v.createdAt)}>{when}</time>
                <span class="vp-reason sm">{reasonLabel(v.reason)}</span>
                <span class="muted sm">{v.cardCount} card{v.cardCount === 1 ? '' : 's'}</span>
              </span>
              <button
                class="btn sm ghost"
                aria-label="Restore the version from {when} ({reasonLabel(v.reason)})"
                title="Put this version back (your current notebook is kept as a version first; Undo reverses it)"
                onclick={() => onrestore(v.id)}>Restore</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .vp-head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: none;
    border: none;
    color: inherit;
    padding: 2px 0;
    text-align: left;
  }
  .vp-head:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .vp-count {
    margin-left: auto;
  }
  .vp-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
    align-items: flex-start;
  }
  .vp-empty {
    margin: 0;
  }
  .vp-list {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    max-height: 260px;
    overflow: auto;
  }
  .vp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    border-top: 1px solid var(--line);
  }
  .vp-meta {
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    min-width: 0;
  }
  .vp-reason {
    color: var(--muted);
  }
</style>
