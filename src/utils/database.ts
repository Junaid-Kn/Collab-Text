import cassandra from "cassandra-driver";
import { randomUUID } from "crypto";

const contactPoints = ["127.0.0.1:9042"];
const localDataCenter = "DC1";

export const client = new cassandra.Client({
  contactPoints,
  localDataCenter,
  keyspace: "editor",
});

export async function createDoc(name: string) {
  const docId = randomUUID();
  const query = `INSERT INTO doc(id, name, value, crdt_state, last_updated) VALUES (?, ?, null, null, toTimestamp(now())) IF NOT EXISTS`;
  try {
    const result = await client.execute(query, [docId, name], {
      prepare: true,
    });
    return result.wasApplied() && docId;
  } catch (error) {
    console.log("Create Doc Error", error);
    throw error;
  }
}

export async function updateDoc(id: string, value: string) {
  if (!id) {
    throw new Error("updateDoc called with missing id");
  }
  const query = `
    UPDATE editor.doc
    SET value = ?, last_updated = toTimestamp(now())
    WHERE id = ?
  `;
  try {
    const result = await client.execute(query, [value, id], { prepare: true });
    return result;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function saveCrdtState(
  id: string,
  crdtState: string,
  value: string
) {
  if (!id) {
    throw new Error("saveCrdtState called with missing id");
  }
  const query = `
    UPDATE editor.doc
    SET crdt_state = ?, value = ?, last_updated = toTimestamp(now())
    WHERE id = ?
  `;
  try {
    return await client.execute(query, [crdtState, value, id], {
      prepare: true,
    });
  } catch (error) {
    console.log("saveCrdtState error", error);
    throw error;
  }
}

export async function getCrdtState(id: string): Promise<string | null> {
  const query = `SELECT crdt_state FROM editor.doc WHERE id = ?`;
  try {
    const result = await client.execute(query, [id], { prepare: true });
    const state = result.rows?.[0]?.crdt_state;
    if (state == null || state === "") {
      return null;
    }
    return typeof state === "string" ? state : String(state);
  } catch (error) {
    console.log("getCrdtState error", error);
    throw error;
  }
}

export async function getDocVal(id: string) {
  const query = `SELECT value, crdt_state FROM editor.doc WHERE id = ?`;

  try {
    const result = await client.execute(query, [id], { prepare: true });
    return result;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function getDocs() {
  const query = `SELECT * FROM editor.doc`;
  try {
    const result = await client.execute(query);
    return result;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
