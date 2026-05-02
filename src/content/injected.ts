/**
 * Injected Script — Cocos Creator Scene Graph Poller
 *
 * Runs in page context. Polls the Cocos Creator v3 scene graph every 10s
 * to detect players (LabelNickname nodes), their positions, and game state.
 *
 * Direct scene graph access eliminates the need for Canvas text hooking
 * and heuristic text classification.
 */

// =============================================================================
// 1. Types & Constants
// =============================================================================

interface CocosNodeData {
  nickname: string;
  worldX: number;
  worldY: number;
}

interface PlayerPositionData {
  nickname: string;
  screenX: number;
  screenY: number;
}

interface TrackedPlayer {
  nickname: string;
  firstSeen: number;
  lastSeen: number;
  pollCount: number;
  consecutiveMisses: number;
}

interface SceneGraphResult {
  players: CocosNodeData[];
  gameInfo: {
    blinds?: string;
    timer?: string;
  };
}

const POLL_INTERVAL_MS = 10_000;
const COCOS_CHECK_INTERVAL_MS = 1_000;
const COCOS_CHECK_MAX_ATTEMPTS = 120;
const MISS_THRESHOLD = 3;

const NICKNAME_PLACEHOLDER = 'NickName';
const MAX_TRAVERSE_DEPTH = 30;

// =============================================================================
// 2. Player Tracker
// =============================================================================

class PlayerTracker {
  private readonly players = new Map<string, TrackedPlayer>();

  update(currentNicknames: string[]): {
    joined: string[];
    left: string[];
    current: string[];
  } {
    const now = Date.now();
    const currentSet = new Set(currentNicknames);
    const joined: string[] = [];

    for (const nickname of currentNicknames) {
      const existing = this.players.get(nickname);
      if (existing) {
        this.players.set(nickname, {
          ...existing,
          lastSeen: now,
          pollCount: existing.pollCount + 1,
          consecutiveMisses: 0,
        });
      } else {
        this.players.set(nickname, {
          nickname,
          firstSeen: now,
          lastSeen: now,
          pollCount: 1,
          consecutiveMisses: 0,
        });
        joined.push(nickname);
      }
    }

    const left: string[] = [];
    for (const [nickname, player] of this.players) {
      if (!currentSet.has(nickname)) {
        const updatedMisses = player.consecutiveMisses + 1;
        if (updatedMisses >= MISS_THRESHOLD) {
          left.push(nickname);
          this.players.delete(nickname);
        } else {
          this.players.set(nickname, {
            ...player,
            consecutiveMisses: updatedMisses,
          });
        }
      }
    }

    const current = Array.from(this.players.values()).map(p => p.nickname);
    return { joined, left, current };
  }
}

const playerTracker = new PlayerTracker();

// =============================================================================
// 3. Scene Graph Traversal
// =============================================================================

function pollSceneGraph(): SceneGraphResult | null {
  const cc = (window as any).cc;
  const scene = cc?.director?.getScene();
  if (!scene) return null;

  const players: CocosNodeData[] = [];
  const gameInfo: SceneGraphResult['gameInfo'] = {};

  function traverse(node: any, depth = 0): void {
    if (depth > MAX_TRAVERSE_DEPTH) return;

    try {
      const name = node.name;

      if (name === 'LabelNickname') {
        const label = node.getComponent(cc.Label);
        if (label?.string && label.string !== NICKNAME_PLACEHOLDER) {
          const pos = node.worldPosition ?? node.position;
          players.push({
            nickname: label.string,
            worldX: pos.x,
            worldY: pos.y,
          });
        }
      } else if (name === 'LabelBlind') {
        const label = node.getComponent(cc.Label);
        if (label?.string) {
          gameInfo.blinds = label.string;
        }
      } else if (name === 'LabelRemainTime') {
        const label = node.getComponent(cc.Label);
        if (label?.string) {
          gameInfo.timer = label.string;
        }
      }
    } catch {
      // Skip nodes that throw
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(scene);
  return { players, gameInfo };
}

// =============================================================================
// 4. Coordinate Conversion
// =============================================================================

function convertToScreenPositions(nodes: CocosNodeData[]): PlayerPositionData[] {
  const cc = (window as any).cc;
  const canvasEl = document.getElementById('GameCanvas') as HTMLCanvasElement | null;
  if (!canvasEl) return [];

  const rect = canvasEl.getBoundingClientRect();
  const designSize = cc.view?.getDesignResolutionSize?.();
  if (!designSize?.width || !designSize?.height) return [];
  const { width: designWidth, height: designHeight } = designSize;

  return nodes.map(({ nickname, worldX, worldY }) => ({
    nickname,
    screenX: rect.left + (worldX / designWidth) * rect.width,
    screenY: rect.top + ((designHeight - worldY) / designHeight) * rect.height,
  }));
}

// =============================================================================
// 5. Polling Loop
// =============================================================================

function executePoll(): void {
  const result = pollSceneGraph();
  if (!result) return;

  const nicknames = result.players.map(p => p.nickname);
  const tracking = playerTracker.update(nicknames);

  console.log('[Poker Notes] Poll:', nicknames.length, 'players',
    nicknames.length > 0 ? `(${nicknames.join(', ')})` : '');

  if (tracking.joined.length > 0) {
    console.log('[Poker Notes] Joined:', tracking.joined);
  }

  if (tracking.current.length > 0) {
    window.postMessage({
      type: 'PLAYERS_DETECTED',
      players: tracking.current.map(nickname => ({ nickname })),
    }, '*');

    const positions = convertToScreenPositions(result.players);
    if (positions.length > 0) {
      window.postMessage({ type: 'PLAYER_POSITIONS', positions }, '*');
    }
  }

  if (tracking.left.length > 0) {
    console.log('[Poker Notes] Left:', tracking.left);
    window.postMessage({
      type: 'PLAYERS_LEFT',
      leftPlayers: tracking.left,
    }, '*');
  }

  if (result.gameInfo.blinds || result.gameInfo.timer) {
    window.postMessage({
      type: 'GAME_STATE_UPDATE',
      gameInfo: result.gameInfo,
    }, '*');
  }
}

let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (pollingIntervalId !== null) return;
  executePoll();
  pollingIntervalId = window.setInterval(executePoll, POLL_INTERVAL_MS);
  console.log('[Poker Notes] Polling started (every', POLL_INTERVAL_MS / 1000, 's)');
}

// =============================================================================
// 6. Cocos Readiness + Entry Point
// =============================================================================

function waitForCocos(): void {
  let attempts = 0;

  const checkInterval = window.setInterval(() => {
    attempts++;

    const cc = (window as any).cc;
    if (cc?.director?.getScene()) {
      window.clearInterval(checkInterval);
      console.log('[Poker Notes] Cocos Creator detected after', attempts, 'attempt(s)');
      startPolling();
      return;
    }

    if (attempts >= COCOS_CHECK_MAX_ATTEMPTS) {
      window.clearInterval(checkInterval);
      console.warn('[Poker Notes] Cocos Creator not detected after', attempts, 'attempts. Giving up.');
    }
  }, COCOS_CHECK_INTERVAL_MS);
}

if (!(window as any).__pokerNotesInjected) {
  (window as any).__pokerNotesInjected = true;
  console.log('[Poker Notes] Injected — waiting for Cocos Creator...');
  waitForCocos();
}
