export type AtomId = {
  lamport: number;
  site: string;
};

export type YataAtom = {
  id: AtomId;
  value: string;
  originLeft: AtomId | null;
  originRight: AtomId | null;
  deleted: boolean;
};

export type YataInsertOp = {
  type: "insert";
  id: AtomId;
  value: string;
  originLeft: AtomId | null;
  originRight: AtomId | null;
};

export type YataDeleteOp = {
  type: "delete";
  id: AtomId;
};

export type YataOp = YataInsertOp | YataDeleteOp;

export type YataSerializedState = {
  atoms: YataAtom[];
  lamport: number;
};

/** Cursor/presence state broadcast between clients. Offsets are UTF-16 code unit indices. */
export type AwarenessState = {
  userId: string;
  color: string;
  offset: number;
  selectionEnd?: number;
};
