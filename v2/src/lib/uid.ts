let _idCounter = 0;

/** Collision-safe id for notebooks/sections/cards/slots created in this session. */
export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;
}
