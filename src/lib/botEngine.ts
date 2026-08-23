import { CheckersPiece, MoveOption, PieceColor, Position } from '../types';
import { getValidMovesForPlayer, executeMove, checkGameOver } from './checkersEngine';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface BotDifficultyConfig {
  id: BotDifficulty;
  name: string;
  subtitle: string;
  rating: number;
  badgeColor: string;
  icon: string;
  description: string;
}

export const BOT_DIFFICULTIES: Record<BotDifficulty, BotDifficultyConfig> = {
  easy: {
    id: 'easy',
    name: 'Easy (Novice)',
    subtitle: 'Beginner friendly • Makes occasional mistakes',
    rating: 850,
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    icon: '🌱',
    description: 'Great for learning the basics of checkers and casual practice.',
  },
  medium: {
    id: 'medium',
    name: 'Medium (Challenger)',
    subtitle: 'Tactical play • Smart multi-jumps & kings',
    rating: 1350,
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    icon: '⚡',
    description: 'Solid competitive play with positional awareness and aggressive kinging.',
  },
  hard: {
    id: 'hard',
    name: 'Hard (Grandmaster)',
    subtitle: 'Minimax AI • Deep tactical lookahead',
    rating: 1900,
    badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    icon: '🔥',
    description: 'Deep minimax search with alpha-beta pruning. Difficult to defeat!',
  },
};

// Heuristic Evaluation of a board state for a given bot color
function evaluateBoardState(board: (CheckersPiece | null)[][], botColor: PieceColor): number {
  const opponentColor: PieceColor = botColor === 'red' ? 'black' : 'red';
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const isBot = piece.color === botColor;
      const multiplier = isBot ? 1 : -1;

      // Base piece values: Pawn = 100, King = 240
      const pieceVal = piece.type === 'king' ? 240 : 100;
      score += pieceVal * multiplier;

      // Positional weights
      if (piece.type === 'pawn') {
        // Distance towards promotion
        const advancement = piece.color === 'red' ? r : 7 - r;
        score += advancement * 8 * multiplier;

        // Back row defense: Keeping back row intact prevents enemy kings
        if ((piece.color === 'red' && r === 0) || (piece.color === 'black' && r === 7)) {
          score += 15 * multiplier;
        }
      }

      // Center board dominance
      const distFromCenter = Math.abs(3.5 - r) + Math.abs(3.5 - c);
      score += (7 - distFromCenter) * 3 * multiplier;

      // Edge safety (pieces on col 0 or 7 cannot be jumped from the outside)
      if (c === 0 || c === 7) {
        score += 8 * multiplier;
      }
    }
  }

  // Bonus for player mobility
  const botMoves = getValidMovesForPlayer(board, botColor, false);
  const oppMoves = getValidMovesForPlayer(board, opponentColor, false);
  score += (botMoves.length - oppMoves.length) * 4;

  return score;
}

// Minimax with Alpha-Beta Pruning
function minimax(
  board: (CheckersPiece | null)[][],
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  botColor: PieceColor
): number {
  const currentColor: PieceColor = isMaximizing
    ? botColor
    : botColor === 'red'
    ? 'black'
    : 'red';

  const over = checkGameOver(board, currentColor);
  if (over.isOver) {
    if (over.winner === botColor) return 10000 + depth;
    if (over.winner === 'draw') return 0;
    return -10000 - depth;
  }

  if (depth === 0) {
    return evaluateBoardState(board, botColor);
  }

  const moves = getValidMovesForPlayer(board, currentColor, true);
  if (moves.length === 0) {
    return isMaximizing ? -10000 - depth : 10000 + depth;
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const { newBoard } = executeMove(board, move);
      const evalScore = minimax(newBoard, depth - 1, alpha, beta, false, botColor);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // Beta cut-off
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const { newBoard } = executeMove(board, move);
      const evalScore = minimax(newBoard, depth - 1, alpha, beta, true, botColor);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Alpha cut-off
    }
    return minEval;
  }
}

// Compute the best move according to the chosen difficulty
export function getBotMoveForDifficulty(
  board: (CheckersPiece | null)[][],
  botColor: PieceColor,
  difficulty: BotDifficulty = 'medium'
): MoveOption | null {
  const validMoves = getValidMovesForPlayer(board, botColor, true);
  if (validMoves.length === 0) return null;

  // 1. EASY DIFFICULTY: 35% chance to make a random legal move, shallow 1-ply eval
  if (difficulty === 'easy') {
    if (Math.random() < 0.35) {
      const randomIndex = Math.floor(Math.random() * validMoves.length);
      return validMoves[randomIndex];
    }

    // Otherwise do a simple 1-ply greedy choice
    let bestMove = validMoves[0];
    let bestScore = -Infinity;
    for (const move of validMoves) {
      let score = move.captures.length * 100;
      if (move.becomesKing) score += 50;
      score += Math.random() * 20; // add noise
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  // 2. MEDIUM DIFFICULTY: 2-3 ply heuristic minimax
  if (difficulty === 'medium') {
    let bestMove = validMoves[0];
    let bestScore = -Infinity;

    for (const move of validMoves) {
      const { newBoard } = executeMove(board, move);
      // Minimax at depth 2
      const score = minimax(newBoard, 2, -Infinity, Infinity, false, botColor);
      // Small bonus for immediate kinging
      const finalScore = score + (move.becomesKing ? 40 : 0);

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMove = move;
      }
    }
    return bestMove;
  }

  // 3. HARD DIFFICULTY: 4-ply deep Minimax with Alpha-Beta pruning
  let bestMoves: MoveOption[] = [];
  let bestScore = -Infinity;

  for (const move of validMoves) {
    const { newBoard } = executeMove(board, move);
    // Deep minimax search (depth 4)
    const score = minimax(newBoard, 4, -Infinity, Infinity, false, botColor);

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  // Pick the best move from the highest evaluated options
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] || validMoves[0];
}
