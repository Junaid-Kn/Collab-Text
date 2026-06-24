"use client";

import Editor from "@monaco-editor/react";

interface TextAreaProps {
  onMount: (editor: unknown, monaco: unknown) => void;
}

export const TextArea = ({ onMount }: TextAreaProps) => {
  return (
    <Editor
      height="400px"
      defaultLanguage="plaintext"
      defaultValue=""
      onMount={onMount}
    />
  );
};
