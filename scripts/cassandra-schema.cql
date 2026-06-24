-- Run with: docker exec -i cassandra1 cqlsh < scripts/cassandra-schema.cql

CREATE KEYSPACE IF NOT EXISTS editor
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE editor;

CREATE TABLE IF NOT EXISTS doc (
  id uuid PRIMARY KEY,
  name text,
  value text,
  crdt_state text,
  last_updated timestamp
);
