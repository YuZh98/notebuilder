<script lang="ts">
  import { fuseSplit } from '../drag/geometry';
  import { pushHistory } from '../history.svelte';
  import type { Slot, VerbConfig } from '../types';

  let {
    slot,
    revKeys,
    hasNext,
    nextFuseW,
    onpatch,
    ondelete,
  }: {
    slot: Slot;
    revKeys: string[];
    hasNext: boolean;
    nextFuseW: number;
    onpatch: (patch: Partial<Slot>) => void;
    ondelete: () => void;
  } = $props();

  type RevOp = NonNullable<VerbConfig['reveal']>['op'];
  const REVOPS: RevOp[] = ['==', '!=', '>=', '<=', '>', '<'];

  const reveal = $derived(slot.verbs?.reveal);
  // Preserve whatever the pair currently sums to (v1 70-events.js:150), not a hardcoded 2.
  const fuseTotal = $derived((slot.fuseW ?? 1) + (nextFuseW ?? 1));
  const ratioPct = $derived(Math.round(((slot.fuseW ?? 1) / fuseTotal) * 100));

  function patchReveal(next: Partial<NonNullable<VerbConfig['reveal']>>) {
    if (!reveal) return;
    onpatch({ verbs: { ...slot.verbs, reveal: { ...reveal, ...next } } });
  }

  function coerce(raw: string): string | number {
    return raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  }

  function setRatio(pct: number) {
    const [leftW] = fuseSplit(fuseTotal, pct / 100);
    onpatch({ fuseW: leftW });
  }
</script>

<div class="sect">
  <h3>Slot: {slot.type}</h3>

  {#if reveal}
    <div class="benchcard" style="background:var(--panel2)">
      <div class="sm muted">Reveal when:</div>
      <div class="row" style="align-items:center">
        <span class="palette" style="display:inline-flex;gap:3px; /* token-exempt: 3px sits off the 2px scale; snapping it would rewrap the chip rows */">
          {#if revKeys.length}
            {#each revKeys as k (k)}
              <button
                class="chip xs"
                class:on={reveal.key === k}
                onclick={() => {
                  pushHistory();
                  patchReveal({ key: k });
                }}>{k}</button>
            {/each}
          {:else}
            <span class="muted sm">add a slider/number/choice first</span>
          {/if}
        </span>
        <span class="palette" style="display:inline-flex;gap:3px; /* token-exempt: 3px sits off the 2px scale; snapping it would rewrap the chip rows */">
          {#each REVOPS as o (o)}
            <button
              class="chip xs"
              class:on={reveal.op === o}
              onclick={() => {
                pushHistory();
                patchReveal({ op: o });
              }}>{o}</button>
          {/each}
        </span>
        <input
          style="width:64px; /* token-exempt: one-off field width sized to a numeric value */"
          data-history="edit"
          value={reveal.val ?? ''}
          placeholder="val"
          oninput={(e) => patchReveal({ val: coerce(e.currentTarget.value) })}
        />
      </div>
      <div class="sm muted">e.g. <code>pick == 0</code> (show after correct choice)</div>
    </div>
  {/if}

  {#if hasNext}
    <div class="kv">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label>Fuse</label>
      <button
        class="chip"
        class:on={slot.fuse}
        title="put this slot on the same row as the next one"
        onclick={() => {
          pushHistory();
          onpatch({ fuse: !slot.fuse });
        }}
        >⛓ {slot.fuse ? 'fused with next' : 'fuse with next'}</button>
    </div>
    {#if slot.fuse}
      <div class="kv">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>Split</label>
        <input
          type="range"
          min="15"
          max="85"
          data-history="edit"
          value={ratioPct}
          oninput={(e) => setRatio(Number(e.currentTarget.value))}
        />
      </div>
    {/if}
  {/if}

  <div style="margin-top:var(--space-4)">
    <button class="btn sm warn" onclick={ondelete}>🗑 delete slot</button>
  </div>
</div>
