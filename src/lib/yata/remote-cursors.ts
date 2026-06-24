import type { AwarenessState } from "./types";

type MonacoPosition = { lineNumber: number; column: number };

type MonacoModel = {
  getValueLength(): number;
  getPositionAt(offset: number): MonacoPosition;
};

type MonacoEditor = {
  getModel(): MonacoModel | null;
  addContentWidget(widget: RemoteCursorWidget): void;
  removeContentWidget(widget: RemoteCursorWidget): void;
  deltaDecorations(
    oldDecorations: string[],
    newDecorations: RemoteSelectionDecoration[]
  ): string[];
  layoutContentWidget(widget: RemoteCursorWidget): void;
};

type MonacoNS = {
  editor: {
    ContentWidgetPositionPreference: { EXACT: number };
    TrackedRangeStickiness: { NeverGrowsWhenTypingAtEdges: number };
    Range: new (
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number
    ) => unknown;
  };
};

type RemoteSelectionDecoration = {
  range: unknown;
  options: {
    className: string;
    stickiness: number;
  };
};

class RemoteCursorWidget {
  private readonly root: HTMLDivElement;
  private readonly caret: HTMLDivElement;
  private readonly label: HTMLSpanElement;
  private position: MonacoPosition = { lineNumber: 1, column: 1 };
  private readonly preference: number;

  constructor(
    private readonly userId: string,
    color: string,
    monaco: MonacoNS
  ) {
    this.preference = monaco.editor.ContentWidgetPositionPreference.EXACT;

    this.root = document.createElement("div");
    this.root.className = "remote-cursor-widget";

    this.caret = document.createElement("div");
    this.caret.className = "remote-cursor-caret";

    this.label = document.createElement("span");
    this.label.className = "remote-cursor-label";
    this.label.textContent = userId.slice(0, 8);

    this.root.appendChild(this.caret);
    this.root.appendChild(this.label);
    this.setColor(color);
  }

  getId(): string {
    return `remote-cursor-${this.userId}`;
  }

  getDomNode(): HTMLDivElement {
    return this.root;
  }

  getPosition() {
    return {
      position: this.position,
      preference: [this.preference],
    };
  }

  setState(color: string, position: MonacoPosition): void {
    this.setColor(color);
    this.position = position;
  }

  private setColor(color: string): void {
    this.caret.style.backgroundColor = color;
    this.label.style.backgroundColor = color;
  }
}

function clampOffset(model: MonacoModel, offset: number): number {
  return Math.min(Math.max(0, offset), model.getValueLength());
}

function offsetToPosition(model: MonacoModel, offset: number): MonacoPosition {
  return model.getPositionAt(clampOffset(model, offset));
}

export class RemoteCursorManager {
  private readonly widgets = new Map<string, RemoteCursorWidget>();
  private readonly states = new Map<string, AwarenessState>();
  private selectionDecorationIds: string[] = [];

  constructor(
    private readonly editor: MonacoEditor,
    private readonly monaco: MonacoNS,
    private readonly localUserId: string
  ) {}

  update(state: AwarenessState): void {
    if (state.userId === this.localUserId) return;
    this.states.set(state.userId, state);
    this.renderUser(state);
    this.renderSelections();
  }

  remove(userId: string): void {
    this.states.delete(userId);
    const widget = this.widgets.get(userId);
    if (widget) {
      this.editor.removeContentWidget(widget);
      this.widgets.delete(userId);
    }
    this.renderSelections();
  }

  sync(peers: AwarenessState[]): void {
    const peerIds = new Set(peers.map((peer) => peer.userId));

    for (const id of this.widgets.keys()) {
      if (!peerIds.has(id)) {
        this.remove(id);
      }
    }

    for (const peer of peers) {
      if (peer.userId !== this.localUserId) {
        this.update(peer);
      }
    }
  }

  /** Recompute widget positions after the document changes. */
  refresh(): void {
    for (const state of this.states.values()) {
      this.renderUser(state);
    }
    this.renderSelections();
  }

  getPeers(): AwarenessState[] {
    return [...this.states.values()];
  }

  destroy(): void {
    for (const widget of this.widgets.values()) {
      this.editor.removeContentWidget(widget);
    }
    this.widgets.clear();
    this.states.clear();
    this.selectionDecorationIds = this.editor.deltaDecorations(
      this.selectionDecorationIds,
      []
    );
  }

  private renderUser(state: AwarenessState): void {
    const model = this.editor.getModel();
    if (!model) return;

    const position = offsetToPosition(model, state.offset);
    let widget = this.widgets.get(state.userId);

    if (!widget) {
      widget = new RemoteCursorWidget(state.userId, state.color, this.monaco);
      this.widgets.set(state.userId, widget);
      this.editor.addContentWidget(widget);
    }

    widget.setState(state.color, position);
    this.editor.layoutContentWidget(widget);
  }

  private renderSelections(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const decorations: RemoteSelectionDecoration[] = [];

    for (const state of this.states.values()) {
      if (
        state.selectionEnd === undefined ||
        state.selectionEnd === state.offset
      ) {
        continue;
      }

      const start = clampOffset(
        model,
        Math.min(state.offset, state.selectionEnd)
      );
      const end = clampOffset(
        model,
        Math.max(state.offset, state.selectionEnd)
      );
      const startPos = model.getPositionAt(start);
      const endPos = model.getPositionAt(end);

      decorations.push({
        range: new this.monaco.editor.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column
        ),
        options: {
          className: "remote-selection",
          stickiness:
            this.monaco.editor.TrackedRangeStickiness
              .NeverGrowsWhenTypingAtEdges,
        },
      });
    }

    this.selectionDecorationIds = this.editor.deltaDecorations(
      this.selectionDecorationIds,
      decorations
    );
  }
}
