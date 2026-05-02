export interface Player {
  nickname: string;
  position?: number;
  chips?: number;
  isAway?: boolean;
}

export interface PlayerPosition {
  nickname: string;
  screenX: number;
  screenY: number;
}

export interface PlayerNote {
  id: string;
  nickname: string;
  gameId?: string;
  userId: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GameInfo {
  blinds?: string;
  timer?: string;
}

export interface MessageFromPage {
  type: 'PLAYERS_DETECTED' | 'PLAYERS_LEFT' | 'GAME_STATE_UPDATE' | 'PLAYER_POSITIONS';
  players?: Player[];
  leftPlayers?: string[];
  gameInfo?: GameInfo;
  positions?: PlayerPosition[];
}

export interface MessageToBackground {
  type: 'LOAD_NOTES' | 'SAVE_NOTE' | 'UPDATE_NOTE' | 'DELETE_NOTE';
  nicknames?: string[];
  nickname?: string;
  note?: Partial<PlayerNote>;
  noteId?: string;
}

export interface MessageFromBackground {
  success: boolean;
  notes?: PlayerNote[];
  note?: PlayerNote;
  error?: string;
}
