import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { createDoc, getDocs, getDocVal } from "../utils/database.js";
import {
  applyOp,
  getOrCreateRoom,
  joinRoom,
  leaveRoom,
  schedulePersist,
} from "./doc-room.js";
import type { AwarenessState, YataOp } from "../lib/yata/types.js";

const app = express();
const port = 3001;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(express.json());
app.use(cors());

app.post("/api/doc", async (req, res) => {
  const { docName } = req.body;

  try {
    const result = await createDoc(docName);
    if (!result) {
      throw Error("Failed to create Doc");
    }
    res.status(200).json({ docId: result });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to create document" });
  }
});

app.get("/api/docs", async (_req, res) => {
  const result = await getDocs();
  if (!result || !result.rows) {
    res.status(200).json({ docs: [] });
    return;
  }

  res.status(200).json({ docs: [...result.rows] });
});

app.get("/api/docVal", async (req, res) => {
  const docId = req.query.id as string;
  try {
    const request = await getDocVal(docId);
    if (!request || !request.rows) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.status(200).json({ result: request });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

const awarenessByDoc = new Map<string, Map<string, AwarenessState>>();

io.on("connection", (socket) => {
  let currentDocId: string | null = null;
  let currentSiteId: string | null = null;
  let hasJoinedRoom = false;

  socket.on("doc_connect", async (payload: { docId: string; siteId: string }) => {
    const { docId, siteId } = payload;

    if (hasJoinedRoom && currentDocId && currentDocId !== docId) {
      await leaveRoom(currentDocId);
      hasJoinedRoom = false;
    }

    currentDocId = docId;
    currentSiteId = siteId;

    try {
      const room = await getOrCreateRoom(docId);

      if (!hasJoinedRoom) {
        joinRoom(docId);
        hasJoinedRoom = true;
      }

      socket.join(docId);

      socket.emit("doc_ready", {
        siteId,
        state: room.sequence.serialize(),
      });

      if (!awarenessByDoc.has(docId)) {
        awarenessByDoc.set(docId, new Map());
      }

      const peers = [...awarenessByDoc.get(docId)!.values()].filter(
        (peer) => peer.userId !== siteId
      );
      socket.emit("awareness_sync", peers);

      socket.to(docId).emit("user_joined", { siteId });
    } catch (error) {
      console.log("doc_connect error", error);
      socket.emit("doc_error", { message: "Failed to join document" });
    }
  });

  socket.on("yata_ops", (payload: { docId: string; ops: YataOp[] }) => {
    const { docId, ops } = payload;
    const applied: YataOp[] = [];

    for (const op of ops) {
      if (applyOp(docId, op)) {
        applied.push(op);
      }
    }

    if (applied.length === 0) return;

    schedulePersist(docId);
    socket.to(docId).emit("yata_ops", { docId, ops: applied });
  });

  socket.on(
    "awareness_update",
    (payload: { docId: string; state: AwarenessState }) => {
      const { docId, state } = payload;
      if (!awarenessByDoc.has(docId)) {
        awarenessByDoc.set(docId, new Map());
      }
      awarenessByDoc.get(docId)!.set(state.userId, state);
      socket.to(docId).emit("awareness_update", state);
    }
  );

  socket.on("doc_leave", async (payload: { docId: string }) => {
    const { docId } = payload;
    if (!hasJoinedRoom || currentDocId !== docId) return;

    socket.leave(docId);
    await leaveRoom(docId);
    hasJoinedRoom = false;
  });

  socket.on("disconnect", async () => {
    if (!currentDocId || !hasJoinedRoom) return;

    await leaveRoom(currentDocId);
    hasJoinedRoom = false;

    if (currentSiteId) {
      const awareness = awarenessByDoc.get(currentDocId);
      if (awareness?.has(currentSiteId)) {
        awareness.delete(currentSiteId);
        socket.to(currentDocId).emit("awareness_remove", {
          userId: currentSiteId,
        });
        if (awareness.size === 0) {
          awarenessByDoc.delete(currentDocId);
        }
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
