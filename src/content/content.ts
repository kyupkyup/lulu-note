/**
 * Content Script - Canvas Overlay + Note Popup
 *
 * Bridges page context (injected.ts) ↔ background service worker.
 * Renders note buttons over the game canvas at each player's seat position.
 * Clicking a button opens a popup with read/edit modes.
 */

import type {
  MessageFromPage,
  MessageToBackground,
  MessageFromBackground,
  PlayerNote,
  PlayerPosition,
} from '../types';

console.log('[Poker Notes] Content script loaded');

// =============================================================================
// 1. Script Injection (must execute before game code)
// =============================================================================

function injectScript(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => script.remove();
  (document.documentElement || document.head).appendChild(script);
}

injectScript();

// =============================================================================
// 2. State
// =============================================================================

interface PlayerState {
  nickname: string;
  note: PlayerNote | null;
  position: PlayerPosition | null;
}

const playerStates = new Map<string, PlayerState>();
let activePopupNickname: string | null = null;
let isEditMode = false;
let isSaving = false;

// =============================================================================
// 3. Message Handling from Page Context
// =============================================================================

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const message = event.data as MessageFromPage;

  switch (message.type) {
    case 'PLAYERS_DETECTED':
      if (message.players) {
        console.log('[Poker Notes][Content] PLAYERS_DETECTED:', message.players.map(p => p.nickname));
        handlePlayersDetected(message.players.map(p => p.nickname));
      }
      break;

    case 'PLAYERS_LEFT':
      if (message.leftPlayers) {
        console.log('[Poker Notes][Content] PLAYERS_LEFT:', message.leftPlayers);
        handlePlayersLeft(message.leftPlayers);
      }
      break;

    case 'PLAYER_POSITIONS':
      if (message.positions) {
        console.log('[Poker Notes][Content] PLAYER_POSITIONS:', message.positions.map(p =>
          `${p.nickname} → (${p.screenX.toFixed(0)}, ${p.screenY.toFixed(0)})`));
        handlePlayerPositions(message.positions);
      }
      break;

    case 'GAME_STATE_UPDATE':
      break;
  }
});

function handlePlayersDetected(nicknames: string[]): void {
  for (const nickname of nicknames) {
    if (!playerStates.has(nickname)) {
      playerStates.set(nickname, { nickname, note: null, position: null });
    }
  }
  loadNotesForPlayers(nicknames);
}

function handlePlayersLeft(nicknames: string[]): void {
  for (const nickname of nicknames) {
    playerStates.delete(nickname);
    removeNoteButton(nickname);
    if (activePopupNickname === nickname) {
      closePopup();
    }
  }
}

function handlePlayerPositions(positions: PlayerPosition[]): void {
  for (const pos of positions) {
    const state = playerStates.get(pos.nickname);
    if (state) {
      playerStates.set(pos.nickname, { ...state, position: pos });
    }
  }
  renderOverlayButtons();
}

// =============================================================================
// 4. Notes Loading via Background
// =============================================================================

function loadNotesForPlayers(nicknames: string[]): void {
  const request: MessageToBackground = { type: 'LOAD_NOTES', nicknames };

  chrome.runtime.sendMessage(request, (response: MessageFromBackground) => {
    if (!response?.success || !response.notes) return;

    // Keep only the latest note per player
    const latestByPlayer = new Map<string, PlayerNote>();
    for (const note of response.notes) {
      const existing = latestByPlayer.get(note.nickname);
      if (!existing || note.updatedAt > existing.updatedAt) {
        latestByPlayer.set(note.nickname, note);
      }
    }

    for (const [nickname, note] of latestByPlayer) {
      const state = playerStates.get(nickname);
      if (state) {
        playerStates.set(nickname, { ...state, note });
      }
    }

    renderOverlayButtons();
    refreshPopupIfOpen();
  });
}

function refreshPopupIfOpen(): void {
  if (!activePopupNickname || isEditMode) return;
  const state = playerStates.get(activePopupNickname);
  if (state) {
    renderPopupBody(state);
  }
}

// =============================================================================
// 5. Canvas Overlay — Note Buttons
// =============================================================================

let overlayEl: HTMLDivElement | null = null;
const buttonEls = new Map<string, HTMLButtonElement>();

function getOrCreateOverlay(): HTMLDivElement {
  if (overlayEl) return overlayEl;

  overlayEl = document.createElement('div');
  overlayEl.id = 'poker-notes-overlay';
  overlayEl.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100vw',
    'height: 100vh',
    'pointer-events: none',
    'z-index: 999998',
  ].join(';');

  document.body.appendChild(overlayEl);
  return overlayEl;
}

function renderOverlayButtons(): void {
  const overlay = getOrCreateOverlay();

  for (const [nickname, state] of playerStates) {
    if (!state.position) continue;

    let btn = buttonEls.get(nickname);
    if (!btn) {
      btn = createNoteButton(nickname);
      buttonEls.set(nickname, btn);
      overlay.appendChild(btn);
    }

    // Position
    btn.style.left = `${state.position.screenX}px`;
    btn.style.top = `${state.position.screenY}px`;

    // Color: green if has note, subtle if empty
    const hasNote = state.note != null && state.note.content.trim().length > 0;
    btn.style.background = hasNote ? '#4CAF50' : 'rgba(255,255,255,0.12)';
    btn.style.borderColor = hasNote ? '#66BB6A' : 'rgba(255,255,255,0.25)';
    btn.title = nickname;
  }

  // Remove stale buttons
  for (const [nickname, btn] of buttonEls) {
    if (!playerStates.has(nickname)) {
      btn.remove();
      buttonEls.delete(nickname);
    }
  }
}

function createNoteButton(nickname: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'poker-note-btn';
  btn.dataset.nickname = nickname;
  btn.setAttribute('aria-label', `Notes for ${nickname}`);
  btn.style.cssText = [
    'position: absolute',
    'transform: translate(-50%, -130%)',
    'width: 26px',
    'height: 26px',
    'border-radius: 50%',
    'border: 2px solid rgba(255,255,255,0.25)',
    'background: rgba(255,255,255,0.12)',
    'cursor: pointer',
    'pointer-events: auto',
    'padding: 0',
    'backdrop-filter: blur(4px)',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.3)',
    'transition: transform 0.15s ease, box-shadow 0.15s ease',
    'display: flex',
    'align-items: center',
    'justify-content: center',
  ].join(';');

  // Inner icon — simple SVG pencil
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'translate(-50%, -130%) scale(1.15)';
    btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.45)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'translate(-50%, -130%)';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const state = playerStates.get(nickname);
    if (state) openPopup(state, btn);
  });

  return btn;
}

function removeNoteButton(nickname: string): void {
  const btn = buttonEls.get(nickname);
  if (btn) {
    btn.remove();
    buttonEls.delete(nickname);
  }
}

// =============================================================================
// 6. Note Popup
// =============================================================================

let popupEl: HTMLDivElement | null = null;

function openPopup(state: PlayerState, anchorBtn: HTMLButtonElement): void {
  closePopup();

  activePopupNickname = state.nickname;
  isEditMode = false;

  const popup = document.createElement('div');
  popup.id = 'poker-notes-popup';
  popup.style.cssText = [
    'position: fixed',
    'width: 260px',
    'background: #1a1a2e',
    'border: 1px solid #3a3a5c',
    'border-radius: 10px',
    'box-shadow: 0 8px 32px rgba(0,0,0,0.5)',
    'z-index: 999999',
    'pointer-events: auto',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'overflow: hidden',
  ].join(';');

  // --- Header ---
  const header = document.createElement('div');
  header.style.cssText = [
    'display: flex',
    'justify-content: space-between',
    'align-items: center',
    'padding: 10px 14px',
    'background: #252540',
    'border-bottom: 1px solid #3a3a5c',
  ].join(';');

  const label = document.createElement('span');
  label.textContent = state.nickname;
  label.style.cssText = 'font-weight:600;font-size:13px;color:#fff';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText =
    'background:none;border:none;color:#888;font-size:14px;cursor:pointer;padding:0 2px;line-height:1';
  closeBtn.addEventListener('click', () => closePopup());

  header.appendChild(label);
  header.appendChild(closeBtn);

  // --- Body ---
  const body = document.createElement('div');
  body.id = 'poker-notes-popup-body';
  body.style.cssText = 'padding:12px 14px';

  popup.appendChild(header);
  popup.appendChild(body);

  // Position near anchor button
  const btnRect = anchorBtn.getBoundingClientRect();
  const popupLeft = Math.max(10, Math.min(btnRect.left - 100, window.innerWidth - 270));
  popup.style.left = `${popupLeft}px`;

  // Try placing above the button first
  popup.style.top = `${btnRect.top - 8}px`;
  popup.style.transform = 'translateY(-100%)';

  const overlay = getOrCreateOverlay();
  overlay.appendChild(popup);
  popupEl = popup;

  // Render initial content
  renderPopupBody(state);

  // Adjust if off-screen
  requestAnimationFrame(() => {
    const rect = popup.getBoundingClientRect();
    if (rect.top < 10) {
      popup.style.transform = 'none';
      popup.style.top = `${btnRect.bottom + 8}px`;
    }
  });

  // Close on outside click (delayed to avoid immediate trigger)
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 0);
}

function handleOutsideClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (popupEl && !popupEl.contains(target) && !target.classList?.contains('poker-note-btn')) {
    closePopup();
  }
}

function closePopup(): void {
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }
  activePopupNickname = null;
  isEditMode = false;
  document.removeEventListener('click', handleOutsideClick);
}

// =============================================================================
// 7. Popup Body — Read / Edit Modes
// =============================================================================

function renderPopupBody(state: PlayerState): void {
  const body = popupEl?.querySelector('#poker-notes-popup-body') as HTMLDivElement | null;
  if (!body) return;

  body.innerHTML = '';

  const hasNote = state.note != null && state.note.content.trim().length > 0;
  if (hasNote) {
    renderReadMode(body, state);
  } else {
    renderEditMode(body, state);
  }
}

function renderReadMode(container: HTMLDivElement, state: PlayerState): void {
  isEditMode = false;

  const display = document.createElement('div');
  display.style.cssText = [
    'min-height: 40px',
    'padding: 8px 10px',
    'background: #252540',
    'border-radius: 6px',
    'font-size: 13px',
    'color: #ccc',
    'white-space: pre-wrap',
    'word-break: break-word',
    'cursor: pointer',
    'border: 1px solid transparent',
    'transition: border-color 0.15s ease',
    'line-height: 1.5',
  ].join(';');
  display.textContent = state.note?.content ?? '';

  display.addEventListener('mouseenter', () => {
    display.style.borderColor = '#4CAF50';
  });
  display.addEventListener('mouseleave', () => {
    display.style.borderColor = 'transparent';
  });
  display.addEventListener('click', (e) => {
    e.stopPropagation();
    renderEditMode(container, state);
  });

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:10px;color:#555;text-align:right;margin-top:6px';
  hint.textContent = '\uD074\uB9AD\uD558\uC5EC \uC218\uC815';

  container.appendChild(display);
  container.appendChild(hint);
}

function renderEditMode(container: HTMLDivElement, state: PlayerState): void {
  isEditMode = true;
  container.innerHTML = '';

  const textarea = document.createElement('textarea');
  textarea.value = state.note?.content ?? '';
  textarea.placeholder = `${state.nickname}\uC5D0 \uB300\uD55C \uB178\uD2B8...`;
  textarea.style.cssText = [
    'width: 100%',
    'min-height: 80px',
    'padding: 8px 10px',
    'border: 1px solid #4CAF50',
    'border-radius: 6px',
    'font-size: 13px',
    'font-family: inherit',
    'resize: vertical',
    'box-sizing: border-box',
    'background: #252540',
    'color: #e0e0e0',
    'outline: none',
    'line-height: 1.5',
  ].join(';');

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isSaving) return;
      const text = textarea.value.trim();
      if (text.length > 0) {
        textarea.disabled = true;
        saveOrUpdateNote(state.nickname, text);
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (state.note && state.note.content.trim().length > 0) {
        renderReadMode(container, state);
      } else {
        closePopup();
      }
    }
  });

  textarea.addEventListener('click', (e) => e.stopPropagation());

  // Hint row
  const hintRow = document.createElement('div');
  hintRow.style.cssText =
    'display:flex;justify-content:space-between;font-size:10px;color:#555;margin-top:6px';

  const hintLeft = document.createElement('span');
  hintLeft.textContent = 'Shift+Enter: \uC904\uBC14\uAFC8';

  const hintRight = document.createElement('span');
  hintRight.textContent = 'Enter: \uC800\uC7A5 \u00B7 Esc: \uCDE8\uC18C';

  hintRow.appendChild(hintLeft);
  hintRow.appendChild(hintRight);

  container.appendChild(textarea);
  container.appendChild(hintRow);

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
}

// =============================================================================
// 8. Note CRUD
// =============================================================================

function saveOrUpdateNote(nickname: string, content: string): void {
  if (isSaving) return;
  isSaving = true;

  const state = playerStates.get(nickname);
  if (!state) { isSaving = false; return; }

  if (state.note) {
    updateNote(nickname, state.note.id, content);
  } else {
    saveNote(nickname, content);
  }
}

function saveNote(nickname: string, content: string): void {
  const request: MessageToBackground = {
    type: 'SAVE_NOTE',
    note: { nickname, content, userId: 'default-user', tags: [] },
  };

  chrome.runtime.sendMessage(request, (response: MessageFromBackground) => {
    isSaving = false;
    if (response?.success && response.note) {
      const state = playerStates.get(nickname);
      if (state) {
        const updated = { ...state, note: response.note };
        playerStates.set(nickname, updated);
        renderOverlayButtons();
        if (activePopupNickname === nickname) {
          renderPopupBody(updated);
        }
      }
    }
  });
}

function updateNote(nickname: string, noteId: string, content: string): void {
  const request: MessageToBackground = {
    type: 'UPDATE_NOTE',
    nickname,
    noteId,
    note: { content },
  };

  chrome.runtime.sendMessage(request, (response: MessageFromBackground) => {
    isSaving = false;
    if (response?.success && response.note) {
      const state = playerStates.get(nickname);
      if (state) {
        const updated = { ...state, note: response.note };
        playerStates.set(nickname, updated);
        renderOverlayButtons();
        if (activePopupNickname === nickname) {
          renderPopupBody(updated);
        }
      }
    }
  });
}
