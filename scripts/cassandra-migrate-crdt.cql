-- Run once when upgrading an existing editor.doc table:
-- docker exec -i cassandra1 cqlsh -e "ALTER TABLE editor.doc ADD crdt_state text;"

ALTER TABLE editor.doc ADD crdt_state text;
