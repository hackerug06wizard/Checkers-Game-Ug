import React, { useState, useEffect } from 'react';
import { CheckersPiece, MoveOption, PieceColor, Position } from '../types';
import { Crown, Sparkles } from 'lucide-react';
import { sounds } from '../lib/sound';

export type BoardTheme = 'wood' | 'crimson' | 'neon' | 'emerald' | 'slate';

export interface BoardThemeConfig {
  name: string;
  darkHex: string;
  lightHex: string;
  frameHex: string;
  borderHex: string;
  selectedGlow: string;
  targetHex: string;
  labelDark: string;
  labelLight: string;
  tagColor: string;
}

export const BOARD_TEMPLATES: Record<BoardTheme, BoardThemeConfig> = {
  wood: {
    name: 'Classic Mahogany',
    darkHex: '#382215',
    lightHex: '#e8d8be',
    frameHex: '#1e1109',
    borderHex: '#78350f',
    selectedGlow: '#f59e0b',
    targetHex: '#10b981',
    labelDark: 'rgba(232, 216, 190, 0.45)',
    labelLight: 'rgba(56, 34, 21, 0.5)',
    tagColor: 'text-amber-400',
  },
  crimson: {
    name: 'Royal Crimson',
    darkHex: '#52101a',
    lightHex: '#faebd7',
    frameHex: '#25050b',
    borderHex: '#e11d48',
    selectedGlow: '#fb7185',
    targetHex: '#34d399',
    labelDark: 'rgba(250, 235, 215, 0.45)',
    labelLight: 'rgba(82, 16, 26, 0.5)',
    tagColor: 'text-rose-400',
  },
  neon: {
    name: 'Cyberpunk Neon',
    darkHex: '#091022',
    lightHex: '#1e293b',
    frameHex: '#020617',
    borderHex: '#06b6d4',
    selectedGlow: '#22d3ee',
    targetHex: '#e879f9',
    labelDark: 'rgba(34, 211, 238, 0.5)',
    labelLight: 'rgba(148, 163, 184, 0.5)',
    tagColor: 'text-cyan-400',
  },
  emerald: {
    name: 'Emerald Marble',
    darkHex: '#064e3b',
    lightHex: '#dcfce7',
    frameHex: '#022119',
    borderHex: '#10b981',
    selectedGlow: '#34d399',
    targetHex: '#fbbf24',
    labelDark: 'rgba(220, 252, 231, 0.45)',
    labelLight: 'rgba(6, 78, 59, 0.5)',
    tagColor: 'text-emerald-400',
  },
  slate: {
    name: 'Midnight Steel',
    darkHex: '#18181b',
    lightHex: '#cbd5e1',
    frameHex: '#09090b',
    borderHex: '#64748b',
    selectedGlow: '#f59e0b',
    targetHex: '#60a5fa',
    labelDark: 'rgba(203, 213, 225, 0.45)',
    labelLight: 'rgba(24, 24, 27, 0.5)',
    tagColor: 'text-slate-300',
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

  useEffect(() => {
    if (theme) {
      setInternalTheme(theme);
    }
  }, [theme]);

  const activeTheme = theme || internalTheme;
  const template = BOARD_TEMPLATES[activeTheme] || BOARD_TEMPLATES.wood;

  // Flip board if player is Black so Black pieces are at the bottom
  const isFlipped = playerColor === 'black';

  // Destination positions for currently selected piece
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
    <div className="relative flex items-center justify-center select-none w-full h-full max-h-full p-0.5 sm:p-2 overflow-hidden">
      {/* Board Outer Wooden / Theme Frame - Takes 95% of screen area */}
      <div
        className="w-[min(96vw,calc(100vh-110px),580px)] h-[min(96vw,calc(100vh-110px),580px)] aspect-square p-2 sm:p-3 rounded-2xl sm:rounded-3xl border-2 sm:border-4 shadow-2xl flex flex-col justify-between"
        style={{
          backgroundColor: template.frameHex,
          borderColor: template.borderHex,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), inset 0 2px 4px rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* 8x8 Board Grid */}
        <div className="w-full h-full grid grid-cols-8 grid-rows-8 rounded-xl sm:rounded-2xl overflow-hidden border border-black/50 relative shadow-inner">
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
                  className="relative w-full h-full flex items-center justify-center transition-colors duration-150 cursor-pointer"
                  style={{
                    backgroundColor: isDarkSquare
                      ? isSelected
                        ? `${template.selectedGlow}dd`
                        : isTargetSquare
                        ? `${template.targetHex}88`
                        : isLastMove
                        ? 'rgba(245, 158, 11, 0.28)'
                        : template.darkHex
                      : template.lightHex,
                    boxShadow: isSelected
                      ? `inset 0 0 12px ${template.selectedGlow}, 0 0 15px ${template.selectedGlow}`
                      : isTargetSquare
                      ? `inset 0 0 10px ${template.targetHex}`
                      : undefined,
                  }}
                >
                  {/* Square Notation Labels (Letters at bottom, Numbers at left) */}
                  {displayR === 7 && (
                    <span
                      className="absolute bottom-0.5 right-1 text-[8px] sm:text-[9px] font-black pointer-events-none"
                      style={{
                        color: isDarkSquare ? template.labelDark : template.labelLight,
                      }}
                    >
                      {String.fromCharCode(65 + c)}
                    </span>
                  )}
                  {displayC === 0 && (
                    <span
                      className="absolute top-0.5 left-1 text-[8px] sm:text-[9px] font-black pointer-events-none"
                      style={{
                        color: isDarkSquare ? template.labelDark : template.labelLight,
                      }}
                    >
                      {8 - r}
                    </span>
                  )}

                  {/* Captured Piece Target Outline Indicator */}
                  {isCapturedSquare && (
                    <div className="absolute inset-1 rounded-full border-2 border-dashed border-rose-500 pointer-events-none z-20" />
                  )}

                  {/* Target Move Landing Ring & Dot */}
                  {isTargetSquare && !piece && (
                    <div
                      className="w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-white shadow-lg pointer-events-none z-10"
                      style={{
                        backgroundColor: template.targetHex,
                        boxShadow: `0 0 10px ${template.targetHex}`,
                      }}
                    />
                  )}

                  {/* Checkers Piece */}
                  {piece && (
                    <div
                      key={piece.id}
                      className={`relative w-[84%] h-[84%] rounded-full flex items-center justify-center cursor-pointer shadow-xl ${
                        isSelected
                          ? 'z-20 ring-4 ring-amber-400'
                          : hasAvailableMoves && (playerColor === 'spectator' || piece.color === playerColor)
                          ? 'ring-2 ring-amber-400/90'
                          : ''
                      } ${
                        piece.color === 'red'
                          ? 'bg-gradient-to-tr from-rose-900 via-red-600 to-rose-400 border-2 border-rose-300 shadow-rose-950/80'
                          : 'bg-gradient-to-tr from-slate-950 via-zinc-900 to-slate-750 border-2 border-slate-400 shadow-black/90'
                      }`}
                      style={{
                        filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.6))',
                      }}
                    >
                      {/* Inner Circular Piece Groove */}
                      <div
                        className={`w-[74%] h-[74%] rounded-full border-2 flex items-center justify-center shadow-inner ${
                          piece.color === 'red'
                            ? 'border-amber-300/70 bg-red-700/50'
                            : 'border-slate-400/50 bg-zinc-800/50'
                        }`}
                      >
                        {/* Crown for King Piece */}
                        {piece.type === 'king' && (
                          <div className="flex items-center justify-center">
                            <Crown
                              className={`w-4 h-4 sm:w-6 sm:h-6 drop-shadow-lg ${
                                piece.color === 'red'
                                  ? 'text-amber-300'
                                  : 'text-amber-400'
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
};
