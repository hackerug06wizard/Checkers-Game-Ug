import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckersPiece, MoveOption, PieceColor, Position } from '../types';
import { Crown } from 'lucide-react';
import { sounds } from '../lib/sound';

interface CheckersBoardProps {
  board: (CheckersPiece | null)[][];
  currentTurn: PieceColor;
  playerColor: PieceColor | 'spectator';
  selectedPiecePos: Position | null;
  validMoveOptions: MoveOption[];
  onSelectPiece: (pos: Position | null) => void;
  onExecuteMove: (move: MoveOption) => void;
  lastMove: { from: Position; to: Position } | null;
}

export const CheckersBoard: React.FC<CheckersBoardProps> = ({
  board,
  currentTurn,
  playerColor,
  selectedPiecePos,
  validMoveOptions,
  onSelectPiece,
  onExecuteMove,
  lastMove,
}) => {
  // Flip board if player is Black so Black is at bottom
  const isFlipped = playerColor === 'black';

  // Get list of destination positions for currently selected piece
  const selectedMoves = selectedPiecePos
    ? validMoveOptions.filter(
        (m) =>
          m.from.row === selectedPiecePos.row &&
          m.from.col === selectedPiecePos.col
      )
    : [];

  const handleSquareClick = (r: number, c: number) => {
    sounds.init();
    const piece = board[r][c];

    // If a piece is selected and user clicked one of its valid destination targets
    if (selectedPiecePos) {
      const targetMove = selectedMoves.find(
        (m) => m.to.row === r && m.to.col === c
      );
      if (targetMove) {
        onExecuteMove(targetMove);
        return;
      }
    }

    // If clicking a piece that belongs to current turn and matches player's color
    if (
      piece &&
      piece.color === currentTurn &&
      (playerColor === 'spectator' || piece.color === playerColor)
    ) {
      // Toggle selection or select piece
      if (selectedPiecePos && selectedPiecePos.row === r && selectedPiecePos.col === c) {
        onSelectPiece(null);
      } else {
        onSelectPiece({ row: r, col: c });
      }
    } else {
      // Clicked on empty or non-target square -> clear selection
      onSelectPiece(null);
    }
  };

  // Check if square is highlighted as last move
  const isLastMoveSquare = (r: number, c: number) => {
    if (!lastMove) return false;
    return (
      (lastMove.from.row === r && lastMove.from.col === c) ||
      (lastMove.to.row === r && lastMove.to.col === c)
    );
  };

  return (
    <div className="w-[80vw] sm:w-[80vw] max-w-[80vh] h-[80vw] max-h-[80vh] aspect-square mx-auto bg-slate-950 p-2 sm:p-3.5 rounded-3xl border-4 border-amber-950/80 shadow-2xl shadow-black/80 flex flex-col justify-between select-none transition-all duration-300">
      {/* 8x8 Grid Container */}
      <div className="w-full h-full grid grid-cols-8 grid-rows-8 rounded-2xl overflow-hidden border-2 border-amber-900/40 relative shadow-inner">
        {Array.from({ length: 8 }).map((_, displayR) => {
          const r = isFlipped ? 7 - displayR : displayR;

          return Array.from({ length: 8 }).map((_, displayC) => {
            const c = isFlipped ? 7 - displayC : displayC;
            const isDarkSquare = (r + c) % 2 === 1;
            const piece = board[r][c];

            const isSelected =
              selectedPiecePos?.row === r && selectedPiecePos?.col === c;

            // Target move for selected piece
            const moveOption = selectedMoves.find(
              (m) => m.to.row === r && m.to.col === c
            );
            const isTargetSquare = !!moveOption;

            // Highlight captured squares in current target preview
            const isCapturedSquare = selectedMoves.some((m) =>
              m.captures.some((cap) => cap.row === r && cap.col === c)
            );

            // Piece has available moves
            const hasAvailableMoves =
              piece &&
              piece.color === currentTurn &&
              validMoveOptions.some(
                (m) => m.from.row === r && m.from.col === c
              );

            const isLastMove = isLastMoveSquare(r, c);

            return (
              <div
                key={`${r}-${c}`}
                onClick={() => handleSquareClick(r, c)}
                className={`relative w-full h-full flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                  isDarkSquare
                    ? isSelected
                      ? 'bg-amber-900/90'
                      : isTargetSquare
                      ? 'bg-emerald-900/90 border-2 border-emerald-400/80 shadow-inner'
                      : isLastMove
                      ? 'bg-amber-800/40'
                      : 'bg-[#2a1e17]'
                    : 'bg-[#e3d1b6]'
                }`}
              >
                {/* Board Square Label overlay */}
                {displayR === 7 && (
                  <span
                    className={`absolute bottom-0.5 right-1 text-[9px] font-bold ${
                      isDarkSquare ? 'text-amber-200/30' : 'text-amber-950/40'
                    }`}
                  >
                    {String.fromCharCode(65 + c)}
                  </span>
                )}
                {displayC === 0 && (
                  <span
                    className={`absolute top-0.5 left-1 text-[9px] font-bold ${
                      isDarkSquare ? 'text-amber-200/30' : 'text-amber-950/40'
                    }`}
                  >
                    {8 - r}
                  </span>
                )}

                {/* Captured highlight indicator on target piece */}
                {isCapturedSquare && (
                  <div className="absolute inset-1 rounded-full border-2 border-dashed border-rose-500 animate-pulse pointer-events-none z-20" />
                )}

                {/* Move Target Indicator Dot */}
                {isTargetSquare && !piece && (
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-emerald-400 border-2 border-white shadow-lg shadow-emerald-400/80 animate-bounce z-10" />
                )}

                {/* Checkers Piece */}
                <AnimatePresence mode="popLayout">
                  {piece && (
                    <motion.div
                      key={piece.id}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.2, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className={`relative w-[82%] h-[82%] rounded-full flex items-center justify-center cursor-pointer shadow-lg transition-transform ${
                        isSelected
                          ? 'scale-110 ring-4 ring-amber-400 z-20 shadow-amber-500/80'
                          : hasAvailableMoves && (playerColor === 'spectator' || piece.color === playerColor)
                          ? 'ring-2 ring-amber-400/80 shadow-amber-500/40 hover:scale-105'
                          : 'hover:scale-105'
                      } ${
                        piece.color === 'red'
                          ? 'bg-gradient-to-tr from-rose-800 via-red-600 to-rose-400 border-2 border-rose-300/80 shadow-rose-950/60'
                          : 'bg-gradient-to-tr from-slate-950 via-zinc-900 to-slate-700 border-2 border-slate-500/80 shadow-black/80'
                      }`}
                    >
                      {/* Inner Circular Ridge */}
                      <div
                        className={`w-[75%] h-[75%] rounded-full border-2 flex items-center justify-center ${
                          piece.color === 'red'
                            ? 'border-amber-300/60 bg-red-700/40'
                            : 'border-slate-400/40 bg-zinc-800/40'
                        }`}
                      >
                        {/* King Crown Symbol */}
                        {piece.type === 'king' && (
                          <motion.div
                            initial={{ scale: 0, rotate: -30 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="flex items-center justify-center"
                          >
                            <Crown
                              className={`w-5 h-5 sm:w-6 sm:h-6 drop-shadow ${
                                piece.color === 'red'
                                  ? 'text-amber-300'
                                  : 'text-amber-400'
                              }`}
                            />
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
};
