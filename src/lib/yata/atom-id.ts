import type { AtomId } from "./types";

export function atomIdKey(id: AtomId): string {
  return `${id.lamport}:${id.site}`;
}

export function atomIdEquals(a: AtomId | null, b: AtomId | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.lamport === b.lamport && a.site === b.site;
}

/** YATA tie-break: lower lamport first, then lexicographic site id. */
export function compareAtomIds(a: AtomId, b: AtomId): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  return a.site.localeCompare(b.site);
}

export function parseAtomIdKey(key: string): AtomId {
  const [lamport, site] = key.split(":");
  return { lamport: Number(lamport), site };
}
