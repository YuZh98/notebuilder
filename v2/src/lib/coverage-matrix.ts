import { isCardDone } from './card-done';
import type { Card } from './types';

export type MatrixAxis = 'tag' | 'slotType' | 'done';

export function axisValues(
  card: Card,
  axis: MatrixAxis,
  states: Record<string, Record<string, Record<string, unknown>>>,
): string[] {
  if (axis === 'tag') return card.tags ?? [];
  if (axis === 'slotType') return [...new Set(card.slots.map((s) => s.type))];
  // done
  const done = isCardDone(card.slots, states[card.id] ?? {});
  return [done ? 'done' : 'not done'];
}

export function coverageMatrix(
  cards: Card[],
  rowAxis: MatrixAxis,
  colAxis: MatrixAxis,
  states: Record<string, Record<string, Record<string, unknown>>>,
): { rows: string[]; cols: string[]; cell(row: string, col: string): string[] } {
  const rowSet = new Set<string>();
  const colSet = new Set<string>();

  for (const card of cards) {
    for (const r of axisValues(card, rowAxis, states)) rowSet.add(r);
    for (const c of axisValues(card, colAxis, states)) colSet.add(c);
  }

  const rows = [...rowSet].sort();
  const cols = [...colSet].sort();

  // Build cell map: "row\0col" → card ids
  const map = new Map<string, string[]>();
  for (const card of cards) {
    const cardRows = axisValues(card, rowAxis, states);
    const cardCols = axisValues(card, colAxis, states);
    for (const r of cardRows) {
      for (const c of cardCols) {
        const key = `${r}\0${c}`;
        const bucket = map.get(key);
        if (bucket) bucket.push(card.id);
        else map.set(key, [card.id]);
      }
    }
  }

  return {
    rows,
    cols,
    cell(row: string, col: string): string[] {
      return map.get(`${row}\0${col}`) ?? [];
    },
  };
}

export function filterCards(
  cards: Card[],
  rowAxis: MatrixAxis,
  rowVal: string,
  colAxis: MatrixAxis,
  colVal: string,
  states: Record<string, Record<string, Record<string, unknown>>>,
): Card[] {
  return cards.filter(
    (card) =>
      axisValues(card, rowAxis, states).includes(rowVal) &&
      axisValues(card, colAxis, states).includes(colVal),
  );
}
