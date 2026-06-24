import { YataSequence } from "./yata-sequence";
import type { YataOp } from "./types";

type OnLocalOps = (ops: YataOp[]) => void;

type MonacoEditorInstance = {
  getModel(): MonacoTextModel | null;
};

type MonacoTextModel = {
  getValue(): string;
  setValue(value: string): void;
  getOffsetAt(position: { lineNumber: number; column: number }): number;
  getPositionAt(offset: number): { lineNumber: number; column: number };
  onDidChangeContent(
    listener: (event: { changes: MonacoContentChange[] }) => void
  ): { dispose(): void };
  pushEditOperations(
    beforeCursorState: unknown[],
    edits: MonacoEdit[],
    cursorStateComputer: unknown
  ): void;
};

type MonacoContentChange = {
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  text: string;
};

type MonacoEdit = {
  range: MonacoContentChange["range"];
  text: string;
  forceMoveMarkers?: boolean;
};

export class YataMonacoBinding {
  private readonly sequence: YataSequence;
  private readonly editor: MonacoEditorInstance;
  private readonly onLocalOps: OnLocalOps;
  private applyingRemote = false;
  private contentDisposable: { dispose(): void } | null = null;

  constructor(
    sequence: YataSequence,
    editor: MonacoEditorInstance,
    onLocalOps: OnLocalOps
  ) {
    this.sequence = sequence;
    this.editor = editor;
    this.onLocalOps = onLocalOps;
  }

  start(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const initialText = this.sequence.getText();
    if (model.getValue() !== initialText) {
      this.applyingRemote = true;
      model.setValue(initialText);
      this.applyingRemote = false;
    }

    this.contentDisposable = model.onDidChangeContent((event) => {
      if (this.applyingRemote) return;

      const ops: YataOp[] = [];

      for (const change of event.changes) {
        const startOffset = model.getOffsetAt({
          lineNumber: change.range.startLineNumber,
          column: change.range.startColumn,
        });
        const endOffset = model.getOffsetAt({
          lineNumber: change.range.endLineNumber,
          column: change.range.endColumn,
        });
        const deletedLength = endOffset - startOffset;
        // Range coordinates are in the pre-change document.
        const visibleIndex = startOffset;

        if (deletedLength > 0) {
          ops.push(...this.sequence.localDelete(visibleIndex, deletedLength));
        }

        if (change.text.length > 0) {
          ops.push(...this.sequence.localInsert(visibleIndex, change.text));
        }
      }

      if (ops.length > 0) {
        this.onLocalOps(ops);
      }
    });
  }

  applyRemoteOps(ops: YataOp[]): void {
    const model = this.editor.getModel();
    if (!model || ops.length === 0) return;

    const before = this.sequence.getText();
    this.sequence.applyOps(ops);
    const after = this.sequence.getText();

    if (before === after) return;

    this.applyingRemote = true;
    try {
      const edits = this.buildEdits(before, after);
      if (edits.length > 0) {
        model.pushEditOperations([], edits, () => null);
      } else {
        model.setValue(after);
      }
    } finally {
      this.applyingRemote = false;
    }
  }

  setTextFromState(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const text = this.sequence.getText();
    if (model.getValue() === text) return;

    this.applyingRemote = true;
    model.setValue(text);
    this.applyingRemote = false;
  }

  destroy(): void {
    this.contentDisposable?.dispose();
    this.contentDisposable = null;
  }

  private buildEdits(before: string, after: string): MonacoEdit[] {
    let prefix = 0;
    const minLen = Math.min(before.length, after.length);
    while (prefix < minLen && before[prefix] === after[prefix]) {
      prefix += 1;
    }

    let suffix = 0;
    while (
      suffix < minLen - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) {
      suffix += 1;
    }

    const deleteStart = prefix;
    const deleteEnd = before.length - suffix;
    const insertText = after.slice(prefix, after.length - suffix);

    const model = this.editor.getModel()!;
    const startPos = model.getPositionAt(deleteStart);
    const endPos = model.getPositionAt(deleteEnd);

    return [
      {
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        text: insertText,
        forceMoveMarkers: true,
      },
    ];
  }
}
