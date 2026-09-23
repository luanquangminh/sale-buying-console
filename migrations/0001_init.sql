-- One row per UI record. `kind` = store slice (customers, pfis, pos, ...), `data` = the record as the UI holds it.
CREATE TABLE records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  sale_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX records_kind_created ON records (kind, created_at);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_account ON sessions (account_id);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO meta (key, value) VALUES ('version', 0);
