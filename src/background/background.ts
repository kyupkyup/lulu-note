/**
 * Background Service Worker
 * Primary: server API. Fallback: chrome.storage.local.
 */

import type { MessageToBackground, MessageFromBackground, PlayerNote } from '../types';

console.log('[Poker Notes] Background service worker started');

// Default API base — can be overridden via chrome.storage.sync { apiBaseUrl: '...' }
const DEFAULT_API_BASE = 'http://localhost:3001/api';

async function getApiBase(): Promise<string> {
  try {
    const result = await chrome.storage.sync.get('apiBaseUrl');
    return (result['apiBaseUrl'] as string) || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

// =============================================================================
// Message Listener
// =============================================================================

chrome.runtime.onMessage.addListener((
  request: MessageToBackground,
  _sender,
  sendResponse: (response: MessageFromBackground) => void,
) => {
  switch (request.type) {
    case 'LOAD_NOTES':
      handleLoadNotes(request.nicknames ?? [], sendResponse);
      return true;

    case 'SAVE_NOTE':
      handleSaveNote(request.note ?? {}, sendResponse);
      return true;

    case 'UPDATE_NOTE':
      handleUpdateNote(request.nickname ?? '', request.noteId ?? '', request.note ?? {}, sendResponse);
      return true;

    case 'DELETE_NOTE':
      handleDeleteNote(request.nickname ?? '', request.noteId ?? '', sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return false;
});

// =============================================================================
// LOAD NOTES
// =============================================================================

async function handleLoadNotes(
  nicknames: string[],
  sendResponse: (r: MessageFromBackground) => void,
): Promise<void> {
  try {
    const apiBase = await getApiBase();
    // Fetch from server in parallel
    const results = await Promise.all(
      nicknames.map(async (nickname) => {
        const res = await fetch(`${apiBase}/players/${encodeURIComponent(nickname)}/notes`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PlayerNote[]>;
      }),
    );

    const allNotes = results.flat();
    sendResponse({ success: true, notes: allNotes });
  } catch {
    // Fallback: chrome.storage.local
    console.warn('[Poker Notes] Server unreachable, falling back to local storage');
    try {
      const result = await chrome.storage.local.get(nicknames);
      const allNotes: PlayerNote[] = [];
      for (const nickname of nicknames) {
        if (result[nickname]) {
          allNotes.push(...(result[nickname] as PlayerNote[]));
        }
      }
      sendResponse({ success: true, notes: allNotes });
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  }
}

// =============================================================================
// SAVE NOTE
// =============================================================================

async function handleSaveNote(
  note: Partial<PlayerNote>,
  sendResponse: (r: MessageFromBackground) => void,
): Promise<void> {
  if (!note.nickname || !note.content) {
    sendResponse({ success: false, error: 'Missing required fields' });
    return;
  }

  try {
    const apiBase = await getApiBase();
    const res = await fetch(
      `${apiBase}/players/${encodeURIComponent(note.nickname)}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: note.content,
          userId: note.userId ?? 'default-user',
          tags: note.tags ?? [],
        }),
      },
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const saved = (await res.json()) as PlayerNote;

    // Update local cache too
    await updateLocalCache(note.nickname, (notes) => [...notes, saved]);

    sendResponse({ success: true, note: saved });
  } catch {
    // Fallback: save to local storage
    console.warn('[Poker Notes] Server unreachable, saving locally');
    try {
      const newNote = createLocalNote(note);
      await updateLocalCache(note.nickname!, (notes) => [...notes, newNote]);
      sendResponse({ success: true, note: newNote });
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  }
}

// =============================================================================
// UPDATE NOTE
// =============================================================================

async function handleUpdateNote(
  nickname: string,
  noteId: string,
  updates: Partial<PlayerNote>,
  sendResponse: (r: MessageFromBackground) => void,
): Promise<void> {
  if (!nickname || !noteId) {
    sendResponse({ success: false, error: 'Missing required fields' });
    return;
  }

  try {
    const apiBase = await getApiBase();
    const res = await fetch(
      `${apiBase}/players/${encodeURIComponent(nickname)}/notes/${encodeURIComponent(noteId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: updates.content,
          tags: updates.tags,
        }),
      },
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const updated = (await res.json()) as PlayerNote;

    await updateLocalCache(nickname, (notes) =>
      notes.map((n) => (n.id === noteId ? updated : n)),
    );

    sendResponse({ success: true, note: updated });
  } catch {
    // Fallback
    console.warn('[Poker Notes] Server unreachable, updating locally');
    try {
      let updatedNote: PlayerNote | null = null;
      await updateLocalCache(nickname, (notes) =>
        notes.map((n) => {
          if (n.id === noteId) {
            updatedNote = {
              ...n,
              content: updates.content ?? n.content,
              tags: updates.tags ?? n.tags,
              updatedAt: new Date().toISOString(),
            };
            return updatedNote;
          }
          return n;
        }),
      );
      if (updatedNote) {
        sendResponse({ success: true, note: updatedNote });
      } else {
        sendResponse({ success: false, error: 'Note not found' });
      }
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  }
}

// =============================================================================
// DELETE NOTE
// =============================================================================

async function handleDeleteNote(
  nickname: string,
  noteId: string,
  sendResponse: (r: MessageFromBackground) => void,
): Promise<void> {
  if (!nickname || !noteId) {
    sendResponse({ success: false, error: 'Missing required fields' });
    return;
  }

  try {
    const apiBase = await getApiBase();
    const res = await fetch(
      `${apiBase}/players/${encodeURIComponent(nickname)}/notes/${encodeURIComponent(noteId)}`,
      { method: 'DELETE' },
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    await updateLocalCache(nickname, (notes) => notes.filter((n) => n.id !== noteId));
    sendResponse({ success: true });
  } catch {
    console.warn('[Poker Notes] Server unreachable, deleting locally');
    try {
      await updateLocalCache(nickname, (notes) => notes.filter((n) => n.id !== noteId));
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  }
}

// =============================================================================
// Local Storage Helpers
// =============================================================================

async function updateLocalCache(
  nickname: string,
  transform: (notes: PlayerNote[]) => PlayerNote[],
): Promise<void> {
  const result = await chrome.storage.local.get(nickname);
  const existing: PlayerNote[] = result[nickname] ?? [];
  const updated = transform(existing);
  await chrome.storage.local.set({ [nickname]: updated });
}

function createLocalNote(partial: Partial<PlayerNote>): PlayerNote {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    nickname: partial.nickname ?? '',
    content: partial.content ?? '',
    userId: partial.userId ?? 'default-user',
    tags: partial.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
}
