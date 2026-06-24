import {
  atomIdEquals,
  atomIdKey,
  compareAtomIds,
} from "./atom-id";
import type {
  AtomId,
  YataAtom,
  YataDeleteOp,
  YataInsertOp,
  YataOp,
  YataSerializedState,
} from "./types";

export class YataSequence {
  private atoms: YataAtom[] = [];
  private atomMap = new Map<string, YataAtom>();
  private lamport = 0;
  readonly siteId: string;

  constructor(siteId: string) {
    this.siteId = siteId;
  }

  static fromSerialized(siteId: string, state: YataSerializedState): YataSequence {
    const seq = new YataSequence(siteId);
    seq.lamport = state.lamport;
    for (const atom of state.atoms) {
      seq.integrateAtom(atom);
    }
    return seq;
  }

  serialize(): YataSerializedState {
    return {
      atoms: this.atoms.map((atom) => ({ ...atom })),
      lamport: this.lamport,
    };
  }

  getLamport(): number {
    return this.lamport;
  }

  getText(): string {
    return this.getVisibleAtoms()
      .map((atom) => atom.value)
      .join("");
  }

  getVisibleAtoms(): YataAtom[] {
    return this.atoms.filter((atom) => !atom.deleted);
  }

  getAtomById(id: AtomId): YataAtom | undefined {
    return this.atomMap.get(atomIdKey(id));
  }

  hasAtom(id: AtomId): boolean {
    return this.atomMap.has(atomIdKey(id));
  }

  applyOp(op: YataOp): boolean {
    if (op.type === "insert") {
      return this.applyInsert(op);
    }
    return this.applyDelete(op);
  }

  applyOps(ops: YataOp[]): YataOp[] {
    const applied: YataOp[] = [];
    for (const op of ops) {
      if (this.applyOp(op)) {
        applied.push(op);
      }
    }
    return applied;
  }

  /** Create and apply local insert operations at a visible-string index. */
  localInsert(visibleIndex: number, text: string): YataInsertOp[] {
    const ops: YataInsertOp[] = [];
    const visible = this.getVisibleAtoms();

    let originLeft: AtomId | null =
      visibleIndex > 0 ? visible[visibleIndex - 1].id : null;
    let originRight: AtomId | null =
      visibleIndex < visible.length ? visible[visibleIndex].id : null;

    for (const char of text) {
      const id = this.nextId();
      const op: YataInsertOp = {
        type: "insert",
        id,
        value: char,
        originLeft,
        originRight,
      };
      this.applyInsert(op);
      ops.push(op);
      originLeft = id;
    }

    return ops;
  }

  /** Create and apply local delete operations for visible-string range. */
  localDelete(visibleIndex: number, count: number): YataDeleteOp[] {
    const visible = this.getVisibleAtoms();
    const targets = visible.slice(visibleIndex, visibleIndex + count);
    const ops: YataDeleteOp[] = [];

    for (const atom of targets) {
      const op: YataDeleteOp = { type: "delete", id: atom.id };
      this.applyDelete(op);
      ops.push(op);
    }

    return ops;
  }

  private nextId(): AtomId {
    this.lamport += 1;
    return { lamport: this.lamport, site: this.siteId };
  }

  private applyInsert(op: YataInsertOp): boolean {
    if (this.hasAtom(op.id)) {
      return false;
    }

    this.lamport = Math.max(this.lamport, op.id.lamport);

    const atom: YataAtom = {
      id: op.id,
      value: op.value,
      originLeft: op.originLeft,
      originRight: op.originRight,
      deleted: false,
    };

    this.integrateAtom(atom);
    return true;
  }

  private applyDelete(op: YataDeleteOp): boolean {
    const atom = this.getAtomById(op.id);
    if (!atom || atom.deleted) {
      return false;
    }

    this.lamport = Math.max(this.lamport, op.id.lamport);
    atom.deleted = true;
    return true;
  }

  private integrateAtom(atom: YataAtom): void {
    const index = this.findInsertIndex(
      atom.id,
      atom.originLeft,
      atom.originRight
    );
    this.atoms.splice(index, 0, atom);
    this.atomMap.set(atomIdKey(atom.id), atom);
  }

  /**
   * YATA index finder: scan between originLeft and originRight,
   * using atom-id comparison for concurrent inserts at the same position.
   */
  private findInsertIndex(
    id: AtomId,
    originLeft: AtomId | null,
    originRight: AtomId | null
  ): number {
    let index = 0;

    if (originLeft) {
      const leftIndex = this.atoms.findIndex((atom) =>
        atomIdEquals(atom.id, originLeft)
      );
      index = leftIndex === -1 ? this.atoms.length : leftIndex + 1;
    }

    while (index < this.atoms.length) {
      const current = this.atoms[index];

      if (originRight && atomIdEquals(current.id, originRight)) {
        break;
      }

      if (
        atomIdEquals(current.originLeft, originLeft) &&
        atomIdEquals(current.originRight, originRight)
      ) {
        if (compareAtomIds(id, current.id) < 0) {
          break;
        }
      }

      index += 1;
    }

    return index;
  }
}
