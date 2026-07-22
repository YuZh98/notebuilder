<script lang="ts">
  import { onMount } from 'svelte';
  import { mode, toggleMode } from '../stores/mode';
  import { THEMES, type ThemeId } from '../themes';
  import type { Place } from '../stores/place';
  import { getPreference, setPreference, isTauri } from '../db';
  import { toast } from '../toast.svelte';

  let {
    notebooks,
    currentId,
    themeId,
    canSwitch,
    place,
    factoryPreview,
    onswitch,
    oncreate,
    onsettheme,
    onaddsection,
    onaddchapter,
    onshare,
    onexport,
    onimport,
    onplacehouse,
    onplacefactory,
    onenterstudy,
    onfacmode,
    onaddbench,
    canUndo = false,
    canRedo = false,
    onundo,
    onredo,
  }: {
    notebooks: { id: string; name: string }[];
    currentId: string;
    themeId: ThemeId;
    canSwitch: boolean;
    place: Place;
    factoryPreview: boolean;
    onswitch: (id: string) => void;
    oncreate: () => void;
    onsettheme: (id: ThemeId) => void;
    onaddsection: () => void;
    onaddchapter: () => void;
    onshare: () => void;
    onexport: () => void;
    onimport: () => void;
    onplacehouse: () => void;
    onplacefactory: () => void;
    onenterstudy: () => void;
    onfacmode: () => void;
    onaddbench: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onundo?: () => void;
    onredo?: () => void;
  } = $props();

  let openMenu: 'theme' | 'nb' | null = $state(null);
  let topHidden = $state(false);
  let topEl: HTMLDivElement | undefined = $state();
  let topHeight = $state(57);

  const themeChip = $derived(THEMES.find((t) => t.id === themeId)?.chip ?? THEMES[0].chip);
  const currentName = $derived(notebooks.find((n) => n.id === currentId)?.name ?? 'Untitled');
  const nbMenuAvailable = $derived(canSwitch && notebooks.length > 1);

  onMount(() => {
    if (isTauri()) {
      void getPreference('top_hidden').then((v) => {
        topHidden = v === '1';
      });
    }
  });

  $effect(() => {
    document.body.classList.toggle('top-hidden', topHidden);
  });

  $effect(() => {
    if (!topHidden && topEl) topHeight = topEl.offsetHeight;
  });

  function toggleTop() {
    topHidden = !topHidden;
    if (isTauri()) void setPreference('top_hidden', topHidden ? '1' : '0');
  }

  function pickTheme(id: ThemeId) {
    openMenu = null;
    onsettheme(id);
  }

  function pickNotebook(id: string) {
    openMenu = null;
    onswitch(id);
  }

  function printPdf() {
    if ($mode === 'edit') onenterstudy();
    toast('print dialog → Save as PDF');
    setTimeout(() => window.print(), 150);
  }
</script>

<svelte:window
  onclick={(e) => {
    if (openMenu !== null && !(e.target as Element).closest('.themewrap, .nbwrap')) openMenu = null;
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') openMenu = null;
  }}
/>

<div id="top" bind:this={topEl}>
  <div class="brand">Note<b>Builder</b></div>
  <div class="places row" id="places">
    <span class="themewrap">
      <button
        class="btn"
        title="App theme — applies everywhere"
        aria-haspopup="menu"
        aria-expanded={openMenu === 'theme'}
        onclick={() => (openMenu = openMenu === 'theme' ? null : 'theme')}
      >🎨 {themeChip} ▾</button>
      {#if openMenu === 'theme'}
        <div class="nbmenu thememenu" role="menu">
          {#each THEMES as t (t.id)}
            <button class="nbitem" class:on={t.id === themeId} role="menuitem" onclick={() => pickTheme(t.id)}>
              {t.name}
            </button>
          {/each}
        </div>
      {/if}
    </span>
    <button
      class="btn"
      class:on={place === 'factory'}
      title="Factory — build reusable product containers"
      onclick={onplacefactory}
    >🏭 Factory</button>
    <span class="nbwrap">
      <button
        class="btn"
        class:on={place === 'house'}
        data-act="nbmenu"
        title="switch notebook"
        aria-haspopup="menu"
        aria-expanded={openMenu === 'nb'}
        onclick={() => {
          onplacehouse();
          openMenu = openMenu === 'nb' ? null : nbMenuAvailable ? 'nb' : null;
        }}
      >📓 {currentName} ▾</button>
      {#if openMenu === 'nb'}
        <div class="nbmenu" role="menu">
          {#each notebooks as nb (nb.id)}
            <button class="nbitem" class:on={nb.id === currentId} role="menuitem" onclick={() => pickNotebook(nb.id)}>
              📓 {nb.name}
            </button>
          {/each}
        </div>
      {/if}
    </span>
    <button class="btn" title="New notebook" onclick={oncreate}>＋</button>
  </div>
  <div class="spacer"></div>
  <div class="row" id="topright">
    {#if place === 'factory'}
      <button
        class="btn sm"
        class:on={!factoryPreview}
        onclick={() => {
          if (factoryPreview) onfacmode();
        }}
      >Build</button>
      <button
        class="btn sm"
        class:on={factoryPreview}
        onclick={() => {
          if (!factoryPreview) onfacmode();
        }}
      >Preview</button>
      {#if !factoryPreview}
        <button class="btn sm" title="Add a new product container" onclick={onaddbench}>＋ container</button>
      {/if}
    {:else}
      <button
        class="btn sm"
        class:on={$mode === 'edit'}
        onclick={() => {
          if ($mode !== 'edit') toggleMode();
        }}
      >Edit</button>
      <button
        class="btn sm"
        class:on={$mode === 'study'}
        onclick={() => {
          if ($mode !== 'study') onenterstudy();
        }}
      >Study</button>
      {#if $mode === 'edit'}
        <button class="btn sm" onclick={onaddsection}>＋ section</button>
        <button class="btn sm" title="Add a chapter divider" onclick={onaddchapter}>＋ chapter</button>
      {/if}
    {/if}
    <span style="width:10px;display:inline-block"></span>
    <button class="btn sm" title="Undo" disabled={!canUndo} onclick={() => onundo?.()}>↶</button>
    <button class="btn sm" title="Redo" disabled={!canRedo} onclick={() => onredo?.()}>↷</button>
    {#if place !== 'factory'}
      <span style="width:8px;display:inline-block"></span>
      <button
        class="btn primary share-btn"
        title="Save this notebook as one living HTML file — opens anywhere, fully interactive, no app needed"
        onclick={onshare}
      >Share</button>
      <span class="util-grp">
        <button class="btn sm ghost" title="Backup as JSON (data only)" onclick={onexport}>⤓</button>
        <button class="btn sm ghost" title="Import a notebook JSON" onclick={onimport}>⤒</button>
        <button class="btn sm ghost" title="Print / Save as PDF" onclick={printPdf}>🖨</button>
      </span>
    {/if}
  </div>
</div>

<button
  id="topbump"
  style:top={topHidden ? '0px' : `${topHeight - 1}px`}
  title={topHidden ? 'show the top bar' : 'hide the top bar — focus on the note'}
  onclick={toggleTop}
>{topHidden ? '˅' : '˄'}</button>
