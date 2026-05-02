/**
 * SQLite Database — schema + CRUD operations
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env['DB_PATH']
  ? path.resolve(process.env['DB_PATH'])
  : path.join(__dirname, '..', 'data', 'notes.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// =============================================================================
// Schema Migration
// =============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS player_notes (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'default-user',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_player_notes_nickname
    ON player_notes(nickname);
`);

// =============================================================================
// Types
// =============================================================================

interface NoteRow {
  id: string;
  nickname: string;
  content: string;
  user_id: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface PlayerNote {
  id: string;
  nickname: string;
  content: string;
  userId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function rowToNote(row: NoteRow): PlayerNote {
  return {
    id: row.id,
    nickname: row.nickname,
    content: row.content,
    userId: row.user_id,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// Prepared Statements
// =============================================================================

const stmtGetByNickname = db.prepare<[string]>(
  'SELECT * FROM player_notes WHERE nickname = ? ORDER BY updated_at DESC'
);

const stmtGetById = db.prepare<[string]>(
  'SELECT * FROM player_notes WHERE id = ?'
);

const stmtInsert = db.prepare<[string, string, string, string, string, string, string]>(
  `INSERT INTO player_notes (id, nickname, content, user_id, tags, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const stmtUpdate = db.prepare<[string, string, string, string]>(
  `UPDATE player_notes SET content = ?, tags = ?, updated_at = ? WHERE id = ?`
);

const stmtDelete = db.prepare<[string]>(
  'DELETE FROM player_notes WHERE id = ?'
);

// =============================================================================
// Public API
// =============================================================================

export function getNotesByNickname(nickname: string): PlayerNote[] {
  const rows = stmtGetByNickname.all(nickname) as NoteRow[];
  return rows.map(rowToNote);
}

export function createNote(
  nickname: string,
  content: string,
  userId: string,
  tags: string[] = [],
): PlayerNote {
  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const now = new Date().toISOString();

  stmtInsert.run(id, nickname, content, userId, JSON.stringify(tags), now, now);
  return { id, nickname, content, userId, tags, createdAt: now, updatedAt: now };
}

export function updateNote(
  noteId: string,
  content: string,
  tags?: string[],
): PlayerNote | null {
  const existing = stmtGetById.get(noteId) as NoteRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  const newTags = tags ?? (JSON.parse(existing.tags) as string[]);

  stmtUpdate.run(content, JSON.stringify(newTags), now, noteId);

  return {
    ...rowToNote(existing),
    content,
    tags: newTags,
    updatedAt: now,
  };
}

export function deleteNote(noteId: string): boolean {
  const result = stmtDelete.run(noteId);
  return result.changes > 0;
}

export function closeDb(): void {
  db.close();
}
