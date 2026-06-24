"use client";

import { useRef } from "react";
import Editor from "@monaco-editor/react";

interface TextAreaProps {
  currVal: string;
  onChange: (value: Record<string, any>) => void;
  user: { userId: string; color: string };
  docId: string;

  onMount?: (editor: any, monaco: any) => void;
}

export const TextArea = ({
  currVal,
  onChange,
  user,
  docId,
  onMount,
}: TextAreaProps) => {
  const editorRef = useRef<any>(null);

  // Monaco mount
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    editor.focus();

    if (onMount) {
      onMount(editor, monaco);
    }
  };

  // text + cursor tracking
  const handleChange = () => {
    if (!editorRef.current) return;

    const position = editorRef.current.getPosition();

    const textAreaMetaData = {
      cursorRow: position.lineNumber,
      cursorCol: position.column,
      docId,
      value: editorRef.current.getValue() ?? "",
    };

    onChange(textAreaMetaData);
  };

  return (
    <Editor
      height="400px"
      defaultLanguage="plaintext"
      value={currVal}
      onMount={handleEditorDidMount}
      onChange={handleChange}
    />
  );
};