import type { CardType } from '../card-types';

/** A CardType wrapped in a live Svelte 5 $state proxy — mirrors App's reactive `cardTypes`. */
export function proxiedCardType(): CardType {
  const ct = $state<CardType>({
    id: 'ct_proxy',
    name: 'Proxy Lab',
    accent: '#111111',
    slots: [{ type: 'text', props: { text: 'hi', meta: { nested: true } } }],
    varieties: [{ name: 'Blue', accent: '#2222ff' }],
  });
  return ct;
}

/** App's injection boundary un-proxies the type before it reaches the stamp path. */
export function snapshotType(ct: CardType): CardType {
  return $state.snapshot(ct) as CardType;
}
