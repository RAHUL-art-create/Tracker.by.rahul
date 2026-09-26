-- Schema for Cloudflare D1 Database (tracker-db)
CREATE TABLE IF NOT EXISTS user_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE,
  user_name TEXT NOT NULL COLLATE NOCASE,
  pin TEXT NOT NULL,
  data TEXT NOT NULL,
  last_modified INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_backups_user_id ON user_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_backups_pin ON user_backups(pin);
CREATE INDEX IF NOT EXISTS idx_user_backups_user_name ON user_backups(user_name);
