/**
 * /api/players/:nickname/notes — CRUD routes
 */

import { Router } from 'express';
import {
  getNotesByNickname,
  createNote,
  updateNote,
  deleteNote,
  getAllPlayers,
} from '../database.js';

export const notesRouter = Router();

// GET /api/players — list all players with notes
notesRouter.get('/', (_req, res) => {
  const players = getAllPlayers();
  res.json(players);
});

// GET /api/players/:nickname/notes
notesRouter.get('/:nickname/notes', (req, res) => {
  const { nickname } = req.params;
  const notes = getNotesByNickname(nickname);
  res.json(notes);
});

// POST /api/players/:nickname/notes
notesRouter.post('/:nickname/notes', (req, res) => {
  const { nickname } = req.params;
  const { content, userId, tags } = req.body as {
    content?: string;
    userId?: string;
    tags?: string[];
  };

  if (!content || content.trim().length === 0) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const note = createNote(nickname, content.trim(), userId ?? 'default-user', tags);
  res.status(201).json(note);
});

// PUT /api/players/:nickname/notes/:id
notesRouter.put('/:nickname/notes/:id', (req, res) => {
  const { id } = req.params;
  const { content, tags } = req.body as {
    content?: string;
    tags?: string[];
  };

  if (!content || content.trim().length === 0) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const updated = updateNote(id, content.trim(), tags);
  if (!updated) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }

  res.json(updated);
});

// DELETE /api/players/:nickname/notes/:id
notesRouter.delete('/:nickname/notes/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deleteNote(id);

  if (!deleted) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }

  res.status(204).end();
});
