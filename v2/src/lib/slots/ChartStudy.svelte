<script lang="ts">
  import type { ChartProps } from './chart';
  import { plotSVG, hoverAt, fmtNum } from './plot';
  import type { Scope } from '../variable-graph';

  let { props, scope = {} }: { props: ChartProps; scope?: Scope } = $props();

  const svg = $derived(plotSVG(props, scope));

  let host: HTMLDivElement | undefined = $state();

  function currentSvg(): SVGSVGElement | null {
    return host?.querySelector('svg.chart-svg[data-hover="1"]') ?? null;
  }

  // Component-level listener (v1 used a document-level singleton): read the
  // svg's geometry dataset, recompute (x, f(x)) via the expr scope, move the crosshair.
  function onMove(e: MouseEvent) {
    const el = currentSvg();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vb = el.viewBox.baseVal;
    if (!rect.width) return;
    const px = (e.clientX - rect.left) / rect.width * vb.width;
    const d = el.dataset;
    const geom = { L: +d.l!, pw: +d.pw!, x0: +d.x0!, x1: +d.x1! };
    const { xv, yv, X } = hoverAt(px, geom, props.fn, scope);

    const cur = el.querySelector<SVGLineElement>('.chart-cur');
    const val = el.querySelector<SVGTextElement>('.chart-val');
    if (cur) {
      cur.setAttribute('x1', X.toFixed(1));
      cur.setAttribute('x2', X.toFixed(1));
      cur.style.display = '';
    }
    if (val) {
      val.textContent = '(' + fmtNum(xv) + ', ' + fmtNum(yv) + ')';
      const vx = Math.min(geom.L + geom.pw - 62, Math.max(geom.L + 2, X + 4));
      val.setAttribute('x', vx.toFixed(1));
      val.style.display = '';
    }
  }

  function onLeave() {
    const el = currentSvg();
    if (!el) return;
    el.querySelector<SVGElement>('.chart-cur')?.style.setProperty('display', 'none');
    el.querySelector<SVGElement>('.chart-val')?.style.setProperty('display', 'none');
  }
</script>

<div
  class="chart-study"
  bind:this={host}
  onmousemove={onMove}
  onmouseleave={onLeave}
  role="presentation"
>
  {#if props.label}<div class="label">{props.label}</div>{/if}
  {@html svg}
</div>

<style>
  .chart-study {
    font-size: 13px;
  }
  .label {
    opacity: 0.7;
    margin-bottom: 4px;
  }
</style>
