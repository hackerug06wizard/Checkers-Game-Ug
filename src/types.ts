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

export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'stake_entry' | 'stake_win' | 'stake_refund';
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed';
  description: string;
  reference?: string;
  pesapalTrackingId?: string;
  roomId?: string;
  timestamp: number;
}

export interface StakeTier {
  id: string;
  name: string;
  amount: number;
  label: string;
  badge: string;
  pot: number;
  description: string;
  category?: string;
  isFree?: boolean;
}

export const STAKE_TIERS: StakeTier[] = [
  {
    id: 'free',
    name: 'Free / Practice',
    amount: 0,
    label: 'Free (0 UGX)',
    badge: 'Free Mode',
    category: 'Free Play',
    pot: 0,
    description: 'Play for fun, ratings & practice with 0 cash required',
    isFree: true,
  },
  {
    id: '500',
    name: '500 UGX Stake',
    amount: 500,
    label: '500 UGX',
    badge: '500 UGX',
    category: 'Casual Stakes',
    pot: 1000,
    description: 'Entry: 500 UGX • Winner takes 1,000 UGX pot',
  },
  {
    id: '1000',
    name: '1,000 UGX Stake',
    amount: 1000,
    label: '1,000 UGX',
    badge: '1,000 UGX',
    category: 'Casual Stakes',
    pot: 2000,
    description: 'Entry: 1,000 UGX • Winner takes 2,000 UGX pot',
  },
  {
    id: '2000',
    name: '2,000 UGX Stake',
    amount: 2000,
    label: '2,000 UGX',
    badge: '2,000 UGX',
    category: 'Popular Stakes',
    pot: 4000,
    description: 'Entry: 2,000 UGX • Winner takes 4,000 UGX pot',
  },
  {
    id: '5000',
    name: '5,000 UGX Stake',
    amount: 5000,
    label: '5,000 UGX',
    badge: '5,000 UGX',
    category: 'Popular Stakes',
    pot: 10000,
    description: 'Entry: 5,000 UGX • Winner takes 10,000 UGX pot',
  },
  {
    id: '10000',
    name: '10,000 UGX Stake',
    amount: 10000,
    label: '10,000 UGX',
    badge: '10,000 UGX',
    category: 'High Stakes',
    pot: 20000,
    description: 'Entry: 10,000 UGX • Winner takes 20,000 UGX pot',
  },
  {
    id: '20000',
    name: '20,000 UGX Stake',
    amount: 20000,
    label: '20,000 UGX',
    badge: '20,000 UGX',
    category: 'High Stakes',
    pot: 40000,
    description: 'Entry: 20,000 UGX • Winner takes 40,000 UGX pot',
  },
];

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
  walletBalance?: number; // In UGX, default 0
  totalWon?: number;
  totalStaked?: number;
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
  stakeAmount?: number; // 0 for free/practice, or 500, 1000, 2000, 5000, 10000, 20000 UGX
  potAmount?: number; // 2x stakeAmount
  escrowCollected?: {
    [userId: string]: number;
  };
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
  isBotGame?: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

export interface Challenge {
  id: string;
  fromUser: UserProfile;
  toUser: UserProfile;
  stakeAmount: number; // 0 for free, or specific stake tier
  createdAt: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export interface PesapalPaymentInitResponse {
  success: boolean;
  orderTrackingId?: string;
  merchantReference?: string;
  redirectUrl?: string;
  amount: number;
  currency: string;
  message?: string;
  isSandboxDemo?: boolean;
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
