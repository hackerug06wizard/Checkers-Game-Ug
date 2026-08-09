import { CheckersPiece, MoveOption, PieceColor, Position } from '../types';

export function createInitialBoard(): (CheckersPiece | null)[][] {
  const board: (CheckersPiece | null)[][] = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));

  let pieceCounter = 1;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        // Dark playable square
        if (r < 3) {
          // Red pieces at top (move down)
          board[r][c] = {
            id: `p-${pieceCounter++}`,
            color: 'red',
            type: 'pawn',
            row: r,
            col: c,
          };
        } else if (r > 4) {
          // Black pieces at bottom (move up)
          board[r][c] = {
            id: `p-${pieceCounter++}`,
            color: 'black',
            type: 'pawn',
            row: r,
            col: c,
          };
        }
      }
    }
  }

  return board;
}

export function isValidPosition(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function getDirectionsForPiece(piece: CheckersPiece): [number, number][] {
  if (piece.type === 'king') {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  if (piece.color === 'red') {
    // Red moves DOWN (row increases)
    return [
      [1, -1],
      [1, 1],
    ];
  } else {
    // Black moves UP (row decreases)
    return [
      [-1, -1],
      [-1, 1],
    ];
  }
}

// Helper to find all jump chains for a piece
function findJumpChains(
  board: (CheckersPiece | null)[][],
  piece: CheckersPiece,
  currentPos: Position,
  currentCaptures: Position[],
  currentPath: Position[]
): MoveOption[] {
  const results: MoveOption[] = [];
  const directions = getDirectionsForPiece(piece);

  let foundJump = false;

  for (const [dr, dc] of directions) {
    const midR = currentPos.row + dr;
    const midC = currentPos.col + dc;
    const landR = currentPos.row + dr * 2;
    const landC = currentPos.col + dc * 2;

    if (isValidPosition(landR, landC)) {
      const midPiece = board[midR][midC];
      const landPiece = board[landR][landC];

      // Opponent piece to capture
      if (
        midPiece &&
        midPiece.color !== piece.color &&
        !currentCaptures.some((p) => p.row === midR && p.col === midC)
      ) {
        // Landing square must be empty OR be the starting square if already jumped
        const isLandingEmpty =
          !landPiece ||
          (landR === currentPath[0].row && landC === currentPath[0].col);

        if (isLandingEmpty) {
          foundJump = true;
          const nextCaptures = [...currentCaptures, { row: midR, col: midC }];
          const nextPath = [...currentPath, { row: landR, col: landC }];

          // Check if crowning happens on this land
          const becomesKing =
            piece.type === 'pawn' &&
            ((piece.color === 'red' && landR === 7) ||
              (piece.color === 'black' && landR === 0));

          if (becomesKing) {
            // Crowned pawn stops jump sequence
            results.push({
              from: currentPath[0],
              to: { row: landR, col: landC },
              captures: nextCaptures,
              path: nextPath,
              becomesKing: true,
            });
          } else {
            // Temporarily update board for recursive jump check
            const tempPiece = { ...piece, row: landR, col: landC };
            const subJumps = findJumpChains(
              board,
              tempPiece,
              { row: landR, col: landC },
              nextCaptures,
              nextPath
            );

            if (subJumps.length > 0) {
              results.push(...subJumps);
            } else {
              results.push({
                from: currentPath[0],
                to: { row: landR, col: landC },
                captures: nextCaptures,
                path: nextPath,
                becomesKing: piece.type === 'king',
              });
            }
          }
        }
      }
    }
  }

  return results;
}

export function getValidMovesForPiece(
  board: (CheckersPiece | null)[][],
  piece: CheckersPiece
): MoveOption[] {
  const startPos = { row: piece.row, col: piece.col };

  // Get jump moves if available
  const jumps = findJumpChains(board, piece, startPos, [], [startPos]);

  // Also get regular 1-step diagonal moves
  const simpleMoves: MoveOption[] = [];
  const directions = getDirectionsForPiece(piece);

  for (const [dr, dc] of directions) {
    const nr = piece.row + dr;
    const nc = piece.col + dc;

    if (isValidPosition(nr, nc) && !board[nr][nc]) {
      const becomesKing =
        piece.type === 'pawn' &&
        ((piece.color === 'red' && nr === 7) ||
          (piece.color === 'black' && nr === 0));

      simpleMoves.push({
        from: startPos,
        to: { row: nr, col: nc },
        captures: [],
        path: [startPos, { row: nr, col: nc }],
        becomesKing,
      });
    }
  }

  // Return both jump moves and simple moves so player can choose any desired move
  return [...jumps, ...simpleMoves];
}

export function getValidMovesForPlayer(
  board: (CheckersPiece | null)[][],
  color: PieceColor,
  forcedJumps: boolean = true
): MoveOption[] {
  const movesPerPiece: MoveOption[] = [];

  // Find all pieces for this color
  const playerPieces: CheckersPiece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        playerPieces.push(p);
      }
    }
  }

  // Collect all valid moves for all pieces
  for (const piece of playerPieces) {
    const pieceMoves = getValidMovesForPiece(board, piece);
    movesPerPiece.push(...pieceMoves);
  }

  // Mandatory Jumps Rule: If capture moves exist, player MUST make a jump
  const jumpMoves = movesPerPiece.filter((m) => m.captures && m.captures.length > 0);
  if (forcedJumps && jumpMoves.length > 0) {
    return jumpMoves;
  }

  return movesPerPiece;
}

export function executeMove(
  board: (CheckersPiece | null)[][],
  move: MoveOption
): {
  newBoard: (CheckersPiece | null)[][];
  capturedPiece: CheckersPiece | null;
  becameKing: boolean;
} {
  // Deep clone board
  const newBoard: (CheckersPiece | null)[][] = board.map((row) =>
    row.map((cell) => (cell ? { ...cell } : null))
  );

  const piece = newBoard[move.from.row][move.from.col];
  if (!piece) {
    return { newBoard, capturedPiece: null, becameKing: false };
  }

  // Clear original square
  newBoard[move.from.row][move.from.col] = null;

  // Clear all captured squares
  let capturedPiece: CheckersPiece | null = null;
  for (const cap of move.captures) {
    if (newBoard[cap.row][cap.col]) {
      capturedPiece = newBoard[cap.row][cap.col];
      newBoard[cap.row][cap.col] = null;
    }
  }

  // Check kinging
  let becameKing = false;
  let newType = piece.type;
  if (
    piece.type === 'pawn' &&
    ((piece.color === 'red' && move.to.row === 7) ||
      (piece.color === 'black' && move.to.row === 0))
  ) {
    becameKing = true;
    newType = 'king';
  }

  // Place piece at final destination
  newBoard[move.to.row][move.to.col] = {
    ...piece,
    row: move.to.row,
    col: move.to.col,
    type: newType,
  };

  return { newBoard, capturedPiece, becameKing };
}

export function checkGameOver(
  board: (CheckersPiece | null)[][],
  currentTurn: PieceColor
): { isOver: boolean; winner: PieceColor | 'draw' | null; reason?: string } {
  let redCount = 0;
  let blackCount = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        if (p.color === 'red') redCount++;
        if (p.color === 'black') blackCount++;
      }
    }
  }

  if (redCount === 0) {
    return { isOver: true, winner: 'black', reason: 'All Red pieces captured' };
  }
  if (blackCount === 0) {
    return { isOver: true, winner: 'red', reason: 'All Black pieces captured' };
  }

  // Check if current player has any valid moves
  const moves = getValidMovesForPlayer(board, currentTurn);
  if (moves.length === 0) {
    const winner = currentTurn === 'red' ? 'black' : 'red';
    return {
      isOver: true,
      winner,
      reason: `${currentTurn.toUpperCase()} has no available moves`,
    };
  }

  return { isOver: false, winner: null };
}

// Smart Heuristic AI Bot move decision
export function getBestBotMove(
  board: (CheckersPiece | null)[][],
  botColor: PieceColor
): MoveOption | null {
  const validMoves = getValidMovesForPlayer(board, botColor);
  if (validMoves.length === 0) return null;

  // Filter moves with captures first
  const captureMoves = validMoves.filter((m) => m.captures.length > 0);
  if (captureMoves.length > 0) {
    // Sort by most captures
    captureMoves.sort((a, b) => b.captures.length - a.captures.length);
    return captureMoves[0];
  }

  // Score remaining moves based on position, king promotion, and safety
  let bestMove = validMoves[0];
  let bestScore = -Infinity;

  for (const move of validMoves) {
    let score = 0;

    // King creation bonus
    if (move.becomesKing) score += 50;

    // Center board preference
    const centerDist =
      Math.abs(3.5 - move.to.row) + Math.abs(3.5 - move.to.col);
    score -= centerDist * 2;

    // Forward advancement bonus
    if (botColor === 'red') {
      score += move.to.row * 3;
    } else {
      score += (7 - move.to.row) * 3;
    }

    // Edge protection (back row protection)
    if (
      (botColor === 'red' && move.from.row === 0) ||
      (botColor === 'black' && move.from.row === 7)
    ) {
      score -= 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
