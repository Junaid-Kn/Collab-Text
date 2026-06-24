"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { socket } from "@/utils/socket";
import { randomColor } from "@/utils/helper";
import { TextArea } from "@/components/textArea";

type Cursor = {
  row: number;
  col: number;
  color: string;
};

export default function Doc() {
  const params = useParams();
  const docId = params!.docId as string;
  const [userId, setUserId] = useState("");

  // document text (ONLY state we actually need for UI)
  const [docTextVal, setDocTextVal] = useState("");

  // local user info
  const userRef = useRef({
    userId: "",
    color: "",
  });

  // remote cursors (NO rerender)
  const remoteCursorRef = useRef<Record<string, Cursor>>({});

  // Monaco editor + decorations
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  // fetch doc value
  const currDbVal = useCallback(async (id: string) => {
    const request = await fetch(
      `http://localhost:3001/api/docVal?id=${id}`,
      {
        method: "GET",
        mode: "cors",
      }
    );

    const response = await request.json();
    return response.result.rows[0].value;
  }, []);

  // connect socket + assign user
  useEffect(() => {
    socket.emit("doc_connect", docId);

    const assignUserId = (id: string) => {
        if (userRef.current.userId) return;

        userRef.current.userId = id;
        userRef.current.color = randomColor();

        setUserId(id);
        console.log("ASSIGNED USER:", userRef.current);
    };

    socket.on("user_joined", assignUserId);

    return () => {
        socket.off("user_joined", assignUserId);
    };
    }, [docId, userRef]);

  // load initial doc
  useEffect(() => {
    const load = async () => {
      const val = await currDbVal(docId);
      setDocTextVal(val);
    };

    load();
  }, [docId, currDbVal]);

  // helper: update Monaco cursors
  const updateDecorations = () => {
    if (!editorRef.current || typeof window === "undefined") return;
    const monaco = (window as any).monaco;
    if (!monaco) return;

    const editor = editorRef.current;

    const decorations = Object.entries(remoteCursorRef.current).map(
      ([userId, cursor]) => ({
        range: new monaco.Range(
          cursor.row,
          cursor.col,
          cursor.row,
          cursor.col
        ),
        options: {
          className: "remote-cursor",
          afterContentClassName: "remote-cursor-after",
          stickiness: 1,
        },
      })
    );

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      decorations
    );
  };

  // receive remote updates (TEXT + CURSOR)
  useEffect(() => {
    const handleDocWrite = (data: any) => {
      const {
        userId,
        cursorRow,
        cursorCol,
        value,
        color,
      } = data;

      // update text only
      if (typeof value === "string") {
        setDocTextVal(value);
      }
    console.log("here", remoteCursorRef.current);
    const safeRow = cursorRow ?? 1;
    const safeCol = cursorCol ?? 1;

    remoteCursorRef.current[userId] = {
    row: Math.max(1, safeRow),
    col: Math.max(1, safeCol),
    color: color || "#ff0000",
    };
      // update Monaco decorations
      updateDecorations();
    };

    socket.on("doc_write", handleDocWrite);

    return () => {
      socket.off("doc_write", handleDocWrite);
    };
  }, []);

  // local typing → emit to server
  const handleTextChange = (textAreaMetaData: Record<string, any>) => {
    const payload = {
      ...textAreaMetaData,
      userId: userRef.current.userId,
      color: userRef.current.color,
    };

    socket.emit("doc_write", payload);
    setDocTextVal(textAreaMetaData.value);
  };

  return (
    <>
    <p className="text-black">{userId}</p>
    <div className="flex justify-center">
      <TextArea
        currVal={docTextVal}
        onChange={handleTextChange}
        docId={docId}
        user={userRef.current}
        onMount={(editor: any) => {
          editorRef.current = editor;
        }}
      />
    </div>
    </>
    
  );
}