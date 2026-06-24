import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { YataSequence } from "./yata-sequence.ts";

describe("YataSequence", () => {
  it("merges concurrent inserts at the same position deterministically", () => {
    const a = new YataSequence("site-a");
    const b = new YataSequence("site-b");

    const aOps = a.localInsert(0, "A");
    const bOps = b.localInsert(0, "B");

    a.applyOps(bOps);
    b.applyOps(aOps);

    assert.equal(a.getText(), b.getText());
    assert.equal(a.getText().length, 2);
  });

  it("handles interleaved edits from two sites", () => {
    const a = new YataSequence("site-a");
    const b = new YataSequence("site-b");

    const a1 = a.localInsert(0, "Hello");
    b.applyOps(a1);

    const b1 = b.localInsert(5, " World");
    a.applyOps(b1);

    const a2 = a.localInsert(11, "!");
    b.applyOps(a2);

    assert.equal(a.getText(), "Hello World!");
    assert.equal(b.getText(), "Hello World!");
  });

  it("tombstones deletes without removing other content", () => {
    const a = new YataSequence("site-a");
    const b = new YataSequence("site-b");

    const insertOps = a.localInsert(0, "abcd");
    b.applyOps(insertOps);

    const deleteOps = a.localDelete(1, 2);
    b.applyOps(deleteOps);

    assert.equal(a.getText(), "ad");
    assert.equal(b.getText(), "ad");
  });

  it("round-trips through serialization", () => {
    const seq = new YataSequence("site-a");
    seq.localInsert(0, "persist me");

    const restored = YataSequence.fromSerialized("site-b", seq.serialize());
    assert.equal(restored.getText(), "persist me");
  });
});
