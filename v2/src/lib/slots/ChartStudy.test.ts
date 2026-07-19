import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ChartStudy from './ChartStudy.svelte';
import type { ChartProps } from './chart';

const W = 320, H = 150;

function setup(props: Partial<ChartProps> = {}) {
  const { container } = render(ChartStudy, {
    props: { props: { fn: 'x', x0: 0, x1: 10, hover: true, ...props }, scope: {} },
  });
  const host = container.querySelector('.chart-study') as HTMLElement;
  const svg = container.querySelector('svg.chart-svg[data-hover="1"]') as SVGSVGElement;
  return { container, host, svg };
}

// jsdom has no layout: give the svg a real client rect and a viewBox baseVal so
// onMove's px math (rect.width, viewBox.width) runs. Mirrors the getBoundingClientRect
// stubbing the other component tests use for hit-testing.
function giveLayout(svg: SVGSVGElement) {
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperty(svg, 'viewBox', {
    configurable: true,
    value: { baseVal: { x: 0, y: 0, width: W, height: H } },
  });
}

const cur = (svg: SVGSVGElement) => svg.querySelector('.chart-cur') as SVGLineElement;
const val = (svg: SVGSVGElement) => svg.querySelector('.chart-val') as SVGTextElement;

describe('ChartStudy — hover crosshair', () => {
  it('renders the crosshair elements hidden initially', () => {
    const { svg } = setup();
    expect(cur(svg).style.display).toBe('none');
    expect(val(svg).style.display).toBe('none');
  });

  it('shows and positions the crosshair after a mousemove over the svg', () => {
    const { host, svg } = setup();
    giveLayout(svg);
    host.dispatchEvent(new MouseEvent('mousemove', { clientX: W / 2, clientY: H / 2, bubbles: true }));

    expect(cur(svg).style.display).toBe('');
    expect(val(svg).style.display).toBe('');
    // crosshair is positioned (x1 attribute written) and the readout is filled
    expect(cur(svg).getAttribute('x1')).not.toBeNull();
    expect(val(svg).textContent).toMatch(/\(.+,.+\)/);
  });

  it('hides the crosshair again on mouseleave', () => {
    const { host, svg } = setup();
    giveLayout(svg);
    host.dispatchEvent(new MouseEvent('mousemove', { clientX: W / 2, clientY: H / 2, bubbles: true }));
    expect(cur(svg).style.display).toBe('');

    host.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(cur(svg).style.display).toBe('none');
    expect(val(svg).style.display).toBe('none');
  });

  it('no hover geometry is emitted when hover is disabled', () => {
    const { svg } = setup({ hover: false });
    expect(svg).toBeNull();
  });
});
