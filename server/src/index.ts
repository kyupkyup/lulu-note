/**
 * Poker Notes API Server
 * Express + SQLite (better-sqlite3)
 */

import express from 'express';
import cors from 'cors';
import { notesRouter } from './routes/notes.js';
import { closeDb } from './database.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const app = express();

// CORS — allow all by default, or restrict to specific origins via env
const corsOrigins = process.env['CORS_ORIGINS'] ?? '*';
app.use(cors({
  origin: corsOrigins === '*' ? true : corsOrigins.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

app.use(express.json());

// Routes
app.use('/api/players', notesRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[Poker Notes Server] Running on http://${HOST}:${PORT}`);
});

// Graceful shutdown
function shutdown(): void {
  console.log('[Poker Notes Server] Shutting down...');
  closeDb();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
