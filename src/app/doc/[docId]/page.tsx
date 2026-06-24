"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { socket } from "@/utils/socket";
import { randomColor } from "@/utils/helper";
import { getSiteId } from "@/utils/site-id";
import { TextArea } from "@/components/textArea";
import { UserTag } from "@/components/userTag";
import {
  RemoteCursorManager,
  YataMonacoBinding,
  YataSequence,
} from "@/lib/yata";
import type { AwarenessState, YataOp, YataSerializedState } from "@/lib/yata/types";

type MonacoEditor = {
  getModel(): {
    getValueLength(): number;
    getOffsetAt(position: { lineNumber: number; column: number }): number;
    onDidChangeContent(listener: () => void): { dispose(): void };
  } | null;
  getPosition(): { lineNumber: number; column: number } | null;
  getSelection(): {
    getStartPosition(): { lineNumber: number; column: number };
    getEndPosition(): { lineNumber: number; column: number };
  } | null;
  onDidChangeCursorPosition(
    listener: () => void
  ): { dispose: () => void };
  onDidChangeCursorSelection(
    listener: () => void
  ): { dispose: () => void };
};

type ClientIdentity = {
  siteId: string;
  color: string;
};

export default function Doc() {
  const params = useParams();
  const docId = params!.docId as string;
  const [identity, setIdentity] = useState<ClientIdentity | null>(null);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<AwarenessState[]>([]);

  const siteId = useRef("");
  const userColor = useRef("");
  const sequenceRef = useRef<YataSequence | null>(null);
  const bindingRef = useRef<YataMonacoBinding | null>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<unknown>(null);
  const cursorManagerRef = useRef<RemoteCursorManager | null>(null);
  const awarenessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelContentDisposableRef = useRef<{ dispose: () => void } | null>(
    null
  );

  useEffect(() => {
    const id = getSiteId();
    const color = randomColor();
    siteId.current = id;
    userColor.current = color;
    setIdentity({ siteId: id, color });
  }, []);

  const emitAwareness = useCallback(() => {
    if (!siteId.current) return;

    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (!editor || !model || !position) return;

    const anchorOffset = model.getOffsetAt(position);
    const selection = editor.getSelection();
    let selectionEnd: number | undefined;

    if (selection) {
      const start = model.getOffsetAt(selection.getStartPosition());
      const end = model.getOffsetAt(selection.getEndPosition());
      if (start !== end) {
        selectionEnd = end;
      }
    }

    const state: AwarenessState = {
      userId: siteId.current,
      color: userColor.current,
      offset: anchorOffset,
      selectionEnd,
    };

    socket.emit("awareness_update", { docId, state });
  }, [docId]);

  const scheduleAwareness = useCallback(() => {
    if (awarenessTimerRef.current) return;
    awarenessTimerRef.current = setTimeout(() => {
      awarenessTimerRef.current = null;
      emitAwareness();
    }, 40);
  }, [emitAwareness]);

  const syncPeers = useCallback(() => {
    const manager = cursorManagerRef.current;
    if (!manager) return;
    setPeers(manager.getPeers());
  }, []);

  const setupCursorListeners = useCallback(
    (editor: MonacoEditor) => {
      editor.onDidChangeCursorPosition(scheduleAwareness);
      editor.onDidChangeCursorSelection(scheduleAwareness);

      const model = editor.getModel();
      modelContentDisposableRef.current?.dispose();
      modelContentDisposableRef.current = model?.onDidChangeContent(() => {
        cursorManagerRef.current?.refresh();
      }) ?? null;
    },
    [scheduleAwareness]
  );

  const initCursorManager = useCallback(
    (editor: MonacoEditor, monaco: unknown) => {
      if (cursorManagerRef.current || !siteId.current) return;

      monacoRef.current = monaco;
      cursorManagerRef.current = new RemoteCursorManager(
        editor as unknown as ConstructorParameters<typeof RemoteCursorManager>[0],
        monaco as ConstructorParameters<typeof RemoteCursorManager>[1],
        siteId.current
      );
      setupCursorListeners(editor);
    },
    [setupCursorListeners]
  );

  const createBinding = useCallback(
    (sequence: YataSequence, editor: MonacoEditor) => {
      if (bindingRef.current) return;

      const binding = new YataMonacoBinding(
        sequence,
        editor as ConstructorParameters<typeof YataMonacoBinding>[1],
        (ops: YataOp[]) => {
          socket.emit("yata_ops", { docId, ops });
          scheduleAwareness();
        }
      );
      binding.start();
      bindingRef.current = binding;
    },
    [docId, scheduleAwareness]
  );

  useEffect(() => {
    if (!identity) return;

    const handleReady = (payload: { state: YataSerializedState }) => {
      const sequence = YataSequence.fromSerialized(siteId.current, payload.state);
      sequenceRef.current = sequence;
      setConnected(true);

      if (editorRef.current) {
        initCursorManager(editorRef.current, monacoRef.current);
        createBinding(sequence, editorRef.current);
      }

      scheduleAwareness();
    };

    const handleRemoteOps = (payload: { docId: string; ops: YataOp[] }) => {
      if (payload.docId !== docId || !bindingRef.current) return;
      bindingRef.current.applyRemoteOps(payload.ops);
      cursorManagerRef.current?.refresh();
    };

    const handleAwareness = (state: AwarenessState) => {
      cursorManagerRef.current?.update(state);
      syncPeers();
    };

    const handleAwarenessSync = (peerStates: AwarenessState[]) => {
      cursorManagerRef.current?.sync(peerStates);
      syncPeers();
    };

    const handleAwarenessRemove = (payload: { userId: string }) => {
      cursorManagerRef.current?.remove(payload.userId);
      syncPeers();
    };

    socket.emit("doc_connect", { docId, siteId: siteId.current });

    socket.on("doc_ready", handleReady);
    socket.on("yata_ops", handleRemoteOps);
    socket.on("awareness_update", handleAwareness);
    socket.on("awareness_sync", handleAwarenessSync);
    socket.on("awareness_remove", handleAwarenessRemove);

    return () => {
      socket.emit("doc_leave", { docId });
      socket.off("doc_ready", handleReady);
      socket.off("yata_ops", handleRemoteOps);
      socket.off("awareness_update", handleAwareness);
      socket.off("awareness_sync", handleAwarenessSync);
      socket.off("awareness_remove", handleAwarenessRemove);
      bindingRef.current?.destroy();
      bindingRef.current = null;
      cursorManagerRef.current?.destroy();
      cursorManagerRef.current = null;
      modelContentDisposableRef.current?.dispose();
      modelContentDisposableRef.current = null;
      if (awarenessTimerRef.current) {
        clearTimeout(awarenessTimerRef.current);
      }
    };
  }, [
    docId,
    identity,
    createBinding,
    initCursorManager,
    scheduleAwareness,
    syncPeers,
  ]);

  const handleEditorMount = (editor: unknown, monaco: unknown) => {
    const monacoEditor = editor as MonacoEditor;
    editorRef.current = monacoEditor;
    monacoRef.current = monaco;

    if (!siteId.current) return;

    initCursorManager(monacoEditor, monaco);

    if (sequenceRef.current) {
      createBinding(sequenceRef.current, monacoEditor);
      scheduleAwareness();
    }
  };

  useEffect(() => {
    if (!identity || !editorRef.current) return;

    initCursorManager(editorRef.current, monacoRef.current);

    if (sequenceRef.current) {
      createBinding(sequenceRef.current, editorRef.current);
      scheduleAwareness();
    }
  }, [identity, initCursorManager, createBinding, scheduleAwareness]);

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 px-4">
        <span className="text-sm text-black">
          {connected ? "Connected" : "Connecting…"}
        </span>
        {identity ? (
          <UserTag id={identity.siteId} color={identity.color} />
        ) : null}
        {peers.map((peer) => (
          <UserTag key={peer.userId} id={peer.userId} color={peer.color} />
        ))}
      </div>
      <div className="flex justify-center">
        <TextArea onMount={handleEditorMount} />
      </div>
    </>
  );
}
