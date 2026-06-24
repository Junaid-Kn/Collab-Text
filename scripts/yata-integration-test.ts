import { io } from "socket.io-client";
import { YataSequence } from "../src/lib/yata/yata-sequence.ts";

const SERVER = "http://localhost:3001";

async function main() {
  const createRes = await fetch(`${SERVER}/api/doc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docName: "integration-test" }),
  });
  const { docId } = (await createRes.json()) as { docId: string };
  if (!docId) {
    throw new Error("Failed to create document");
  }

  const siteA = "site-a";
  const siteB = "site-b";

  const readyA = new Promise<void>((resolve) => {
    const socketA = io(SERVER, { transports: ["websocket"] });
    socketA.on("doc_ready", (payload) => {
      const seq = YataSequence.fromSerialized(siteA, payload.state);
      const ops = seq.localInsert(0, "Hello");
      socketA.emit("yata_ops", { docId, ops });
      setTimeout(() => socketA.disconnect(), 500);
      resolve();
    });
    socketA.emit("doc_connect", { docId, siteId: siteA });
  });

  await readyA;
  await new Promise((r) => setTimeout(r, 300));

  const textB = await new Promise<string>((resolve, reject) => {
    const socketB = io(SERVER, { transports: ["websocket"] });
    socketB.on("doc_ready", (payload) => {
      const seq = YataSequence.fromSerialized(siteB, payload.state);
      socketB.on("yata_ops", (payload) => {
        seq.applyOps(payload.ops);
      });

      setTimeout(() => {
        const ops = seq.localInsert(seq.getText().length, " CRDT");
        socketB.emit("yata_ops", { docId, ops });
      }, 200);

      setTimeout(async () => {
        socketB.disconnect();
        const res = await fetch(`${SERVER}/api/docVal?id=${docId}`);
        const json = await res.json();
        resolve(json.result.rows[0].value as string);
      }, 2500);
    });
    socketB.emit("doc_connect", { docId, siteId: siteB });
    setTimeout(() => reject(new Error("timeout")), 8000);
  });

  if (textB !== "Hello CRDT") {
    throw new Error(`Expected "Hello CRDT", got "${textB}"`);
  }

  console.log("Integration test passed:", textB);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
