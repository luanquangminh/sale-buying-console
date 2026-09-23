-- Seeded administrator (same as the artifact). Change the password in the Accounts tab after first login.
INSERT INTO records (kind, id, sale_id, created_at, updated_at, data) VALUES (
  'accounts', 'admin-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
  '{"id":"admin-01","role":"admin","name":"Administrator","username":"admin","password":"changeme","createdAt":"2026-01-01T00:00:00.000Z"}'
);
