import React, { useState, useEffect, useMemo } from 'react';
import { GameRoom as IGameRoom, UserProfile, PieceColor, Position, MoveOption, ChatMessage } from '../types';
import { CheckersBoard, BoardTheme } from './CheckersBoard';
import { AvatarBadge } from './AvatarBadge';
import {
  Flag,
  ArrowLeft,
  Crown,
  Trophy,
  Sparkles,
  Smile,
  ChevronRight,
  ChevronLeft,
  Smartphone,
  Box,
  RotateCw,
} from 'lucide-react';
import { sounds } from '../lib/sound';
import { getValidMovesForPlayer } from '../lib/checkersEngine';

// Exactly 10 high-impact reaction emojis
const REACTION_EMOJIS = ['🔥', '👑', '🎉', '👏', '😎', '⚡', '🤯', '💥', '🎯', '🏆'];

interface GameRoomProps {
  room: IGameRoom;
  currentUser: UserProfile;
  activeTheme?: BoardTheme;
  onSendMove: (move: MoveOption) => void;
  onResign: () => void;
  onLeaveRoom: () => void;
  onSendGameChat: (text: string) => void;
  gameChatMessages: ChatMessage[];
}

export const GameRoom: React.FC<GameRoomProps> = ({
  room,
  currentUser,
  activeTheme = 'wood',
  onSendMove,
  onResign,
  onLeaveRoom,
  onSendGameChat,
  gameChatMessages,
}) => {
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(room.turnTimeLimitSeconds);
  const [isEmojiSidebarOpen, setIsEmojiSidebarOpen] = useState(false);
  const [latestEmojiReaction, setLatestEmojiReaction] = useState<{ emoji: string; sender: string } | null>(null);
  const [is3DTilted, setIs3DTilted] = useState(true);
  const [isScreenTilted90, setIsScreenTilted90] = useState(false);

  const isBotGame = Boolean(room.blackPlayer?.isBot || room.id.includes('bot'));

  // Show floating reaction whenever a new game chat emoji arrives
  useEffect(() => {
    if (gameChatMessages.length > 0) {
      const lastMsg = gameChatMessages[gameChatMessages.length - 1];
      setLatestEmojiReaction({ emoji: lastMsg.text, sender: lastMsg.senderName });
      sounds.playBlast();
      const timer = setTimeout(() => {
        setLatestEmojiReaction(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [gameChatMessages.length]);

  // Determine current player's color
  const isRed = room.redPlayer?.id === currentUser.id;
  const isBlack = room.blackPlayer?.id === currentUser.id;
  const playerColor: PieceColor | 'spectator' = isRed
    ? 'red'
    : isBlack
    ? 'black'
    : 'spectator';

  const isMyTurn = playerColor === room.currentTurn;

  // Opponent player object
  const opponent = isRed ? room.blackPlayer : room.redPlayer;
  const opponentColor: PieceColor = isRed ? 'black' : 'red';
  const myColor: PieceColor = isRed ? 'red' : 'black';

  // Compute all valid move options for current turn player (enforcing mandatory jumps)
  const validMoveOptions = useMemo(() => {
    if (room.status !== 'playing' || !room.board) return [];
    return getValidMovesForPlayer(room.board, room.currentTurn, true);
  }, [room.board, room.currentTurn, room.status]);

  // Turn Countdown Timer effect
  useEffect(() => {
    if (room.status !== 'playing' || !room.turnDeadline) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((room.turnDeadline! - now) / 1000));
      setTimeLeft(diff);

      if (diff <= 5 && diff > 0 && isMyTurn) {
        sounds.playTick();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room.turnDeadline, room.status, isMyTurn]);

  // Audio feedback on move / game over
  useEffect(() => {
    if (room.history.length > 0) {
      const lastMove = room.history[room.history.length - 1];
      if (lastMove.capturedCount > 0) {
        sounds.playCapture();
      } else {
        sounds.playMove();
      }
      if (lastMove.becameKing) {
        setTimeout(() => sounds.playKing(), 200);
      }
    }
  }, [room.history.length]);

  useEffect(() => {
    if (room.status === 'ended' && room.winner) {
      if (room.winner === playerColor) {
        sounds.playVictory();
      } else if (playerColor !== 'spectator') {
        sounds.playDefeat();
      }
    }
  }, [room.status, room.winner, playerColor]);

  // Clear selection when turn changes
  useEffect(() => {
    setSelectedPos(null);
  }, [room.currentTurn]);

  const handleSelectPiece = (pos: Position | null) => {
    if (!isMyTurn && playerColor !== 'spectator') return;
    setSelectedPos(pos);
  };

  const handleExecuteMove = (move: MoveOption) => {
    onSendMove(move);
    setSelectedPos(null);
  };

  const handleEmojiClick = (emoji: string) => {
    sounds.playBlast();
    onSendGameChat(emoji);
  };

  const lastMove =
    room.history.length > 0
      ? {
          from: room.history[room.history.length - 1].from,
          to: room.history[room.history.length - 1].to,
        }
      : null;

  return (
    <div
      className={`w-full h-full flex flex-col justify-between p-2 sm:p-3 relative select-none overflow-hidden transition-all duration-300 ${
        isScreenTilted90
          ? 'rotate-90 origin-center scale-[0.98] max-h-screen max-w-screen'
          : ''
      }`}
    >
      {/* Floating Animated Emoji Reaction Badge */}
      {latestEmojiReaction && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border-2 border-amber-400 px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2.5 animate-bounce pointer-events-none">
          <span className="text-2xl">{latestEmojiReaction.emoji}</span>
          <span className="text-xs font-black text-amber-300">
            {latestEmojiReaction.sender}
          </span>
        </div>
      )}

      {/* TOP HEADER CONTROLS BAR */}
      <div className="flex items-center justify-between gap-2 bg-slate-900/95 border border-slate-800 px-2.5 sm:px-4 py-1.5 rounded-2xl shadow-xl shrink-0 z-30">
        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs border border-slate-700 transition active:scale-95 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Exit</span>
        </button>

        {/* Center: Turn Timer Badge & Mode Toggles */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {room.status === 'playing' ? (
            isMyTurn ? (
              <div className="flex items-center gap-1.5 bg-emerald-950/90 text-emerald-300 font-black text-[11px] sm:text-xs px-2.5 py-1 rounded-full border border-emerald-700 shadow animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>YOUR TURN ({timeLeft}s)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-950 text-slate-300 font-bold text-[11px] sm:text-xs px-2.5 py-1 rounded-full border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="truncate max-w-[120px]">
                  {room.currentTurn === 'red' ? room.redPlayer?.username : room.blackPlayer?.username} ({timeLeft}s)
                </span>
              </div>
            )
          ) : (
            <div className="bg-amber-950 text-amber-300 font-black text-xs px-3 py-1 rounded-full border border-amber-700">
              {room.winner ? `Winner: ${room.winner.toUpperCase()}` : 'Match Concluded'}
            </div>
          )}

          {/* 3D Tilted Format Toggle */}
          <button
            onClick={() => setIs3DTilted(!is3DTilted)}
            className={`hidden xs:flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] sm:text-xs font-bold border transition ${
              is3DTilted
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Toggle 3D Tilted Board Angle"
          >
            <Box className="w-3 h-3" />
            <span className="hidden sm:inline">3D Tilt</span>
          </button>

          {/* 90° Screen Tilt / Rotate Button */}
          <button
            onClick={() => setIsScreenTilted90(!isScreenTilted90)}
            className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] sm:text-xs font-bold border transition ${
              isScreenTilted90
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-cyan-400'
            }`}
            title="Rotate / Tilt Game 90 Degrees"
          >
            <RotateCw className="w-3 h-3" />
            <span className="hidden sm:inline">Tilt 90°</span>
          </button>
        </div>

        {/* Resign / Spectator info */}
        <div className="shrink-0">
          {playerColor !== 'spectator' && room.status === 'playing' ? (
            <button
              onClick={onResign}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold text-xs border border-rose-800 transition active:scale-95"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Resign</span>
            </button>
          ) : (
            <div className="text-[10px] text-purple-400 font-bold bg-purple-950 px-2 py-1 rounded-lg border border-purple-800">
              Spectating ({room.spectatorsCount})
            </div>
          )}
        </div>
      </div>

      {/* RESPONSIVE GAME ARENA: Stacked on Mobile Portrait, Side-by-Side on Desktop Landscape */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-2 sm:gap-3 overflow-hidden relative min-h-0 my-1">
        
        {/* OPPONENT BAR (Shows at TOP on mobile, or in Left Column on desktop) */}
        <div className="w-full md:w-44 md:h-full shrink-0 flex flex-row md:flex-col justify-between items-center md:items-stretch gap-1.5 bg-slate-900/90 border border-slate-800/90 px-3 py-1.5 md:p-2 rounded-2xl shadow-xl">
          {/* Opponent Card */}
          <div
            className={`w-full p-1.5 md:p-2 rounded-xl border transition ${
              room.currentTurn === opponentColor
                ? 'bg-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-3 h-3 rounded-full shrink-0 border ${
                    opponentColor === 'red'
                      ? 'bg-red-600 border-red-300'
                      : 'bg-slate-900 border-slate-400'
                  }`}
                />
                <span className="font-black text-slate-100 text-xs truncate">
                  {opponent?.username || (isBotGame ? 'Checkers Bot 🤖' : 'Opponent')}
                </span>
              </div>
              <div className="text-[10px] font-black text-amber-400 shrink-0">
                Captured: {opponentColor === 'red' ? room.capturedBlack : room.capturedRed}/12
              </div>
            </div>
          </div>

          {/* Practice Bot info / Desktop Moves log */}
          <div className="hidden md:flex flex-1 my-1 flex-col overflow-hidden bg-slate-950/80 rounded-xl border border-slate-800/80 p-2 min-h-0">
            {isBotGame ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-2">
                <div className="text-2xl mb-1">🤖</div>
                <div className="text-xs font-black text-slate-200">Practice Arena</div>
                <div className="text-[10px] text-slate-500">Play without pressure</div>
              </div>
            ) : (
              <>
                <div className="text-[9px] font-black text-amber-400 uppercase tracking-wider border-b border-slate-800 pb-1 flex items-center justify-between">
                  <span>Match Moves</span>
                  <span>#{room.history.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 pt-1 custom-scrollbar min-h-0">
                  {room.history.length === 0 ? (
                    <div className="text-[10px] text-slate-500 text-center py-4 italic">
                      Match start
                    </div>
                  ) : (
                    room.history.map((m, idx) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between text-[10px] p-1 bg-slate-900 rounded border border-slate-800 font-mono"
                      >
                        <span className="text-slate-500 font-bold">#{idx + 1}</span>
                        <span className={m.playerColor === 'red' ? 'text-rose-400 font-bold' : 'text-slate-300 font-bold'}>
                          {String.fromCharCode(65 + m.from.col)}{8 - m.from.row}&rarr;{String.fromCharCode(65 + m.to.col)}{8 - m.to.row}
                        </span>
                        {m.capturedCount > 0 && <span className="text-amber-400 font-black text-[9px]">x{m.capturedCount}</span>}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* On Desktop: User Card at Bottom of Left Sidebar */}
          <div
            className={`hidden md:block w-full p-2 rounded-xl border transition ${
              room.currentTurn === myColor
                ? 'bg-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-3 h-3 rounded-full shrink-0 border ${
                    myColor === 'red'
                      ? 'bg-red-600 border-red-300'
                      : 'bg-slate-900 border-slate-400'
                  }`}
                />
                <span className="font-black text-slate-100 text-xs truncate">
                  {currentUser.username} (You)
                </span>
              </div>
              <div className="text-[10px] font-black text-amber-400 shrink-0">
                Captured: {myColor === 'red' ? room.capturedBlack : room.capturedRed}/12
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: SCREEN-FITTED CHECKERS BOARD */}
        <div className="flex-1 flex items-center justify-center w-full h-full overflow-hidden min-h-0">
          <CheckersBoard
            board={room.board}
            currentTurn={room.currentTurn}
            playerColor={playerColor}
            selectedPiecePos={selectedPos}
            validMoveOptions={room.status === 'playing' ? validMoveOptions : []}
            onSelectPiece={handleSelectPiece}
            onExecuteMove={handleExecuteMove}
            lastMove={lastMove}
            theme={activeTheme}
            is3DTilted={is3DTilted}
            onToggle3DTilt={() => setIs3DTilted(!is3DTilted)}
          />
        </div>

        {/* MOBILE BOTTOM PLAYER BAR (Only visible on mobile screens) */}
        <div
          className={`md:hidden w-full p-1.5 rounded-xl border transition shrink-0 bg-slate-900/90 ${
            room.currentTurn === myColor
              ? 'border-amber-400 shadow-md shadow-amber-500/20'
              : 'border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-3 h-3 rounded-full shrink-0 border ${
                  myColor === 'red'
                    ? 'bg-red-600 border-red-300'
                    : 'bg-slate-900 border-slate-400'
                }`}
              />
              <span className="font-black text-slate-100 text-xs truncate">
                {currentUser.username} (You)
              </span>
            </div>
            <div className="text-[10px] font-black text-amber-400 shrink-0">
              Captured: {myColor === 'red' ? room.capturedBlack : room.capturedRed}/12
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: REACTION EMOJIS (Multiplayer Only) */}
        {!isBotGame && (
          <div className="hidden md:flex shrink-0 items-center h-full min-h-0">
            <button
              onClick={() => setIsEmojiSidebarOpen(!isEmojiSidebarOpen)}
              className="p-1.5 rounded-l-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-xl transition z-20 flex flex-col items-center gap-1"
              title="Toggle Reaction Emojis"
            >
              <Smile className="w-4 h-4" />
              {isEmojiSidebarOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>

            {isEmojiSidebarOpen && (
              <div className="h-full bg-slate-900 border border-amber-500/30 rounded-2xl p-1 shadow-2xl flex flex-col items-center justify-between gap-1 w-12 animate-fade-in z-20 min-h-0">
                <div className="text-[8px] font-black text-amber-400 uppercase tracking-widest text-center border-b border-slate-800 pb-0.5 w-full">
                  Blast
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 my-0.5 custom-scrollbar w-full items-center min-h-0 pr-0.5">
                  {REACTION_EMOJIS.map((emoji, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleEmojiClick(emoji)}
                      className="w-8 h-8 text-base flex items-center justify-center rounded-xl bg-slate-950 hover:bg-amber-500/30 hover:scale-110 border border-slate-800 transition active:scale-90 shadow shrink-0"
                      title={`React ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MOBILE REACTION EMOJI DOCK (Multiplayer only) */}
      {!isBotGame && (
        <div className="md:hidden flex items-center justify-between gap-1 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded-xl shrink-0 overflow-x-auto custom-scrollbar">
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider shrink-0 mr-1">
            React:
          </span>
          {REACTION_EMOJIS.slice(0, 7).map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => handleEmojiClick(emoji)}
              className="p-1 text-base hover:scale-125 transition active:scale-90 shrink-0"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Game Over Modal */}
      {room.status === 'ended' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 shadow-xl shadow-amber-950/40">
              <Trophy className="w-7 h-7 text-slate-950 animate-bounce" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-black text-white">
                {room.winner === playerColor
                  ? '🏆 Victory!'
                  : room.winner === 'draw'
                  ? '🤝 Match Drawn!'
                  : 'Match Concluded'}
              </h2>
              <p className="text-xs text-slate-400">
                {room.winReason || 'The checkers match has ended.'}
              </p>
            </div>

            <button
              onClick={onLeaveRoom}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-xs shadow-lg transition active:scale-95"
            >
              Return to Arena Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
