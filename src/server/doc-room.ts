import {
  getCrdtState,
  saveCrdtState,
  getDocVal,
} from "../utils/database";
import { YataSequence } from "../lib/yata/yata-sequence";
import type { YataOp, YataSerializedState } from "../lib/yata/types";

const PERSIST_DEBOUNCE_MS = 500;

type DocRoomState = {
  sequence: YataSequence;
  clients: number;
  dirty: boolean;
  persistTimer: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, DocRoomState>();
const loading = new Map<string, Promise<YataSequence>>();

async function loadSequence(docId: string): Promise<YataSequence> {
  const stored = await getCrdtState(docId);

  if (stored) {
    try {
      const state = JSON.parse(stored) as YataSerializedState;
      return YataSequence.fromSerialized("server", state);
    } catch (error) {
      console.error(`Failed to parse crdt_state for ${docId}`, error);
    }
  }

  const legacy = await getDocVal(docId);
  const legacyText = legacy?.rows?.[0]?.value as string | null | undefined;
  const sequence = new YataSequence("server");

  if (legacyText) {
    sequence.applyOps(sequence.localInsert(0, legacyText));
  }

  return sequence;
}

export async function getOrCreateRoom(docId: string): Promise<DocRoomState> {
  const existing = rooms.get(docId);
  if (existing) return existing;

  let loadPromise = loading.get(docId);
  if (!loadPromise) {
    loadPromise = loadSequence(docId);
    loading.set(docId, loadPromise);
  }

  const sequence = await loadPromise;
  loading.delete(docId);

  const room: DocRoomState = {
    sequence,
    clients: 0,
    dirty: false,
    persistTimer: null,
  };
  rooms.set(docId, room);
  return room;
}

export function joinRoom(docId: string): DocRoomState {
  const room = rooms.get(docId);
  if (!room) {
    throw new Error(`Room ${docId} not initialized`);
  }
  room.clients += 1;
  return room;
}

export async function leaveRoom(docId: string): Promise<void> {
  const room = rooms.get(docId);
  if (!room) return;

  room.clients -= 1;
  if (room.clients > 0) return;

  await flushPersist(docId, room);
  rooms.delete(docId);
}

export function applyOp(docId: string, op: YataOp): boolean {
  const room = rooms.get(docId);
  if (!room) return false;

  const applied = room.sequence.applyOp(op);
  if (applied) {
    room.dirty = true;
  }
  return applied;
}

export function schedulePersist(docId: string): void {
  const room = rooms.get(docId);
  if (!room || !room.dirty) return;

  if (room.persistTimer) {
    clearTimeout(room.persistTimer);
  }

  room.persistTimer = setTimeout(() => {
    room.persistTimer = null;
    void flushPersist(docId, room);
  }, PERSIST_DEBOUNCE_MS);
}

export async function flushPersist(
  docId: string,
  room?: DocRoomState
): Promise<void> {
  const target = room ?? rooms.get(docId);
  if (!target || !target.dirty) return;

  if (target.persistTimer) {
    clearTimeout(target.persistTimer);
    target.persistTimer = null;
  }

  try {
    const state = target.sequence.serialize();
    const text = target.sequence.getText();
    await saveCrdtState(docId, JSON.stringify(state), text);
    target.dirty = false;
  } catch (error) {
    console.error(`Failed to persist document ${docId}`, error);
    throw error;
  }
}

export function getRoomState(docId: string): YataSerializedState | null {
  const room = rooms.get(docId);
  return room ? room.sequence.serialize() : null;
}
