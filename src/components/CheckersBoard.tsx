import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckersPiece, MoveOption, PieceColor, Position } from '../types';
import { Crown, Palette } from 'lucide-react';
import { sounds } from '../lib/sound';

export type BoardTheme = 'wood' | 'crimson' | 'neon' | 'emerald' | 'slate';

interface BoardThemeConfig {
  name: string;
  darkSquare: string;
  lightSquare: string;
  selectedSquare: string;
  targetSquare: string;
  borderFrame: string;
  labelColorDark: string;
  labelColorLight: string;
}

const BOARD_TEMPLATES: Record<BoardTheme, BoardThemeConfig> = {
  wood: {
    name: 'Classic Mahogany',
    darkSquare: 'bg-[#2a1e17]',
    lightSquare: 'bg-[#e3d1b6]',
    selectedSquare: 'bg-amber-900/90 ring-4 ring-amber-400',
    targetSquare: 'bg-emerald-900/90 border-2 border-emerald-400/80 shadow-inner',
    borderFrame: 'border-amber-950/90 bg-slate-950',
    labelColorDark: 'text-amber-200/30',
    labelColorLight: 'text-amber-950/40',
  },
  crimson: {
    name: 'Royal Crimson',
    darkSquare: 'bg-[#4a0e17]',
    lightSquare: 'bg-[#f4e4bc]',
    selectedSquare: 'bg-rose-900/90 ring-4 ring-amber-400',
    targetSquare: 'bg-emerald-950/90 border-2 border-amber-300 shadow-inner',
    borderFrame: 'border-rose-950/90 bg-slate-950',
    labelColorDark: 'text-amber-200/30',
    labelColorLight: 'text-rose-950/40',
  },
  neon: {
    name: 'Cyberpunk Neon',
    darkSquare: 'bg-[#0f172a]',
    lightSquare: 'bg-[#1e293b]',
    selectedSquare: 'bg-cyan-950/90 ring-4 ring-cyan-400 shadow-lg shadow-cyan-500/50',
    targetSquare: 'bg-fuchsia-950/90 border-2 border-fuchsia-400 shadow-inner',
    borderFrame: 'border-cyan-900/80 bg-slate-950',
    labelColorDark: 'text-cyan-400/40',
    labelColorLight: 'text-slate-400/40',
  },
  emerald: {
    name: 'Emerald Marble',
    darkSquare: 'bg-[#064e3b]',
    lightSquare: 'bg-[#e2e8f0]',
    selectedSquare: 'bg-emerald-800/90 ring-4 ring-emerald-300',
    targetSquare: 'bg-amber-950/90 border-2 border-amber-400 shadow-inner',
    borderFrame: 'border-emerald-950/90 bg-slate-950',
    labelColorDark: 'text-emerald-200/30',
    labelColorLight: 'text-emerald-950/40',
  },
  slate: {
    name: 'Midnight Steel',
    darkSquare: 'bg-[#18181b]',
    lightSquare: 'bg-[#cbd5e1]',
    selectedSquare: 'bg-slate-800/90 ring-4 ring-amber-400',
    targetSquare: 'bg-blue-950/90 border-2 border-blue-400 shadow-inner',
    borderFrame: 'border-slate-800 bg-slate-950',
    labelColorDark: 'text-slate-400/30',
    labelColorLight: 'text-slate-950/40',
  },
};

interface CheckersBoardProps {
  board: (CheckersPiece | null)[][];
  currentTurn: PieceColor;
  playerColor: PieceColor | 'spectator';
  selectedPiecePos: Position | null;
  validMoveOptions: MoveOption[];
  onSelectPiece: (pos: Position | null) => void;
  onExecuteMove: (move: MoveOption) => void;
  lastMove: { from: Position; to: Position } | null;
  theme?: BoardTheme;
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
  theme,
}) => {
  const [internalTheme, setInternalTheme] = useState<BoardTheme>(() => {
    return (localStorage.getItem('checkers_board_theme') as BoardTheme) || 'wood';
  });
  const [showThemePicker, setShowThemePicker] = useState(false);

  const activeTheme = theme || internalTheme;
  const template = BOARD_TEMPLATES[activeTheme] || BOARD_TEMPLATES.wood;

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
      if (selectedPiecePos && selectedPiecePos.row === r && selectedPiecePos.col === c) {
        onSelectPiece(null);
      } else {
        onSelectPiece({ row: r, col: c });
      }
    } else {
      onSelectPiece(null);
    }
  };

  const isLastMoveSquare = (r: number, c: number) => {
    if (!lastMove) return false;
    return (
      (lastMove.from.row === r && lastMove.from.col === c) ||
      (lastMove.to.row === r && lastMove.to.col === c)
    );
  };

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Top Theme Selector Button */}
      <div className="absolute -top-10 right-2 z-30 flex items-center gap-2">
        <button
          onClick={() => setShowThemePicker(!showThemePicker)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400 font-bold text-xs shadow-lg transition"
        >
          <Palette className="w-3.5 h-3.5" />
          <span>Theme: {template.name}</span>
        </button>

        {showThemePicker && (
          <div className="absolute right-0 top-9 z-40 bg-slate-900 border border-amber-500/40 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 w-44 animate-fade-in">
            {(Object.keys(BOARD_TEMPLATES) as BoardTheme[]).map((themeKey) => (
              <button
                key={themeKey}
                onClick={() => {
                  setInternalTheme(themeKey);
                  localStorage.setItem('checkers_board_theme', themeKey);
                  setShowThemePicker(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                  activeTheme === themeKey
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{BOARD_TEMPLATES[themeKey].name}</span>
                {activeTheme === themeKey && <span>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Board Container - Screen-fitted Board Size */}
      <div className={`w-[min(74vw,74vh)] h-[min(74vw,74vh)] aspect-square mx-auto p-1.5 sm:p-2.5 rounded-2xl sm:rounded-3xl border-2 sm:border-4 shadow-2xl flex flex-col justify-between select-none transition-all duration-300 ${template.borderFrame}`}>
        {/* 8x8 Grid Container */}
        <div className="w-full h-full grid grid-cols-8 grid-rows-8 rounded-xl sm:rounded-2xl overflow-hidden border border-slate-800/60 relative shadow-inner">
          {Array.from({ length: 8 }).map((_, displayR) => {
            const r = isFlipped ? 7 - displayR : displayR;

            return Array.from({ length: 8 }).map((_, displayC) => {
              const c = isFlipped ? 7 - displayC : displayC;
              const isDarkSquare = (r + c) % 2 === 1;
              const piece = board[r][c];

              const isSelected =
                selectedPiecePos?.row === r && selectedPiecePos?.col === c;

              const moveOption = selectedMoves.find(
                (m) => m.to.row === r && m.to.col === c
              );
              const isTargetSquare = !!moveOption;

              const isCapturedSquare = selectedMoves.some((m) =>
                m.captures.some((cap) => cap.row === r && cap.col === c)
              );

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
                        ? template.selectedSquare
                        : isTargetSquare
                        ? template.targetSquare
                        : isLastMove
                        ? 'bg-amber-500/30'
                        : template.darkSquare
                      : template.lightSquare
                  }`}
                >
                  {/* Square Notation Labels */}
                  {displayR === 7 && (
                    <span
                      className={`absolute bottom-0.5 right-1 text-[8px] sm:text-[9px] font-extrabold ${
                        isDarkSquare ? template.labelColorDark : template.labelColorLight
                      }`}
                    >
                      {String.fromCharCode(65 + c)}
                    </span>
                  )}
                  {displayC === 0 && (
                    <span
                      className={`absolute top-0.5 left-1 text-[8px] sm:text-[9px] font-extrabold ${
                        isDarkSquare ? template.labelColorDark : template.labelColorLight
                      }`}
                    >
                      {8 - r}
                    </span>
                  )}

                  {/* Captured piece target ring */}
                  {isCapturedSquare && (
                    <div className="absolute inset-1 rounded-full border-2 border-dashed border-rose-500 animate-pulse pointer-events-none z-20" />
                  )}

                  {/* Landing Target Dot */}
                  {isTargetSquare && !piece && (
                    <div className="w-5 h-5 sm:w-8 sm:h-8 rounded-full bg-emerald-400 border-2 border-white shadow-lg shadow-emerald-400/80 animate-bounce z-10" />
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
                        className={`relative w-[84%] h-[84%] rounded-full flex items-center justify-center cursor-pointer shadow-xl transition-transform ${
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
                        {/* Inner Piece Ridge */}
                        <div
                          className={`w-[75%] h-[75%] rounded-full border-2 flex items-center justify-center ${
                            piece.color === 'red'
                              ? 'border-amber-300/60 bg-red-700/40'
                              : 'border-slate-400/40 bg-zinc-800/40'
                          }`}
                        >
                          {piece.type === 'king' && (
                            <motion.div
                              initial={{ scale: 0, rotate: -30 }}
                              animate={{ scale: 1, rotate: 0 }}
                              className="flex items-center justify-center"
                            >
                              <Crown
                                className={`w-5 h-5 sm:w-7 sm:h-7 drop-shadow-md ${
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
    </div>
  );
};
