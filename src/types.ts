export type PieceColor = 'red' | 'black';
export type PieceType = 'pawn' | 'king';

export interface CheckersPiece {
  id: string;
  color: PieceColor;
  type: PieceType;
  row: number;
  col: number;
}

export interface Position {
  row: number;
  col: number;
}

export interface MoveOption {
  from: Position;
  to: Position;
  captures: Position[]; //Positions of pieces captured in this move/jump chain
  path: Position[];     //Step-by-step positions for multi-jump sequence
  becomesKing: boolean;
}

export interface GameMove {
  id: string;
  playerColor: PieceColor;
  from: Position;
  to: Position;
  capturedCount: number;
  becameKing: boolean;
  timestamp: number;
}

export interface AvatarOption {
  id: string;
  name: string;
  bgGradient: string;
  iconSvg: string; // SVG icon or emblem name
  accentColor: string;
}

export interface UserProfile {
  id: string;
  username: string;
  realName?: string;
  phoneNumber?: string;
  normalizedPhone?: string;
  isGuest?: boolean;
  termsAccepted?: boolean;
  avatarId: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed?: number;
  rating: number; // Elo rating, default 1200
  elo?: number;
  status: 'online' | 'in-game' | 'away' | 'offline';
  isOnline?: boolean;
  lastActiveTimestamp?: number;
  createdAt: number;
}

export interface GamePlayer {
  id: string;
  username: string;
  avatarId: string;
  rating: number;
  color: PieceColor;
  isBot?: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

export type GameStatus = 'waiting' | 'playing' | 'ended';

export interface GameRoom {
  id: string;
  name: string;
  status: GameStatus;
  redPlayer: GamePlayer | null;
  blackPlayer: GamePlayer | null;
  currentTurn: PieceColor;
  board: (CheckersPiece | null)[][];
  history: GameMove[];
  capturedRed: number; // Number of red pieces captured by black
  capturedBlack: number; // Number of black pieces captured by red
  winner: PieceColor | 'draw' | null;
  winReason?: string;
  createdAt: number;
  lastMoveTimestamp: number;
  turnTimeLimitSeconds: number; // e.g. 45 seconds per turn
  turnDeadline: number | null;
  spectatorsCount: number;
  isPrivate?: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

export interface Challenge {
  id: string;
  fromUser: UserProfile;
  toUser: UserProfile;
  createdAt: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  avatarId: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatarId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}
