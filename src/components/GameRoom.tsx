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
  const [isEmojiSidebarOpen, setIsEmojiSidebarOpen] = useState(true);
  const [latestEmojiReaction, setLatestEmojiReaction] = useState<{ emoji: string; sender: string } | null>(null);
  const [isPortraitWarningVisible, setIsPortraitWarningVisible] = useState(false);

  const isBotGame = Boolean(room.blackPlayer?.isBot || room.id.includes('bot'));

  // Detect orientation to advise tilting device for optimal wide view
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window !== 'undefined') {
        const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 768;
        setIsPortraitWarningVisible(isPortrait);
      }
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    // Try to lock landscape if supported
    if (typeof window !== 'undefined' && window.screen && (window.screen as any).orientation?.lock) {
      try {
        (window.screen as any).orientation.lock('landscape').catch(() => {});
      } catch (e) {
        // ignore
      }
    }

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

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
    <div className="w-full h-screen max-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-2 sm:p-3 relative select-none overflow-hidden animate-fade-in">
      {/* Mobile Landscape Tilt Suggestion Banner */}
      {isPortraitWarningVisible && (
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-40 bg-amber-500/95 text-slate-950 px-3 py-1 rounded-full text-[11px] font-black flex items-center gap-1.5 shadow-xl animate-pulse">
          <Smartphone className="w-3.5 h-3.5 rotate-90" />
          <span>Tilt phone sideways for wider board view</span>
        </div>
      )}

      {/* Floating Animated Reaction Badge */}
      {latestEmojiReaction && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border-2 border-amber-400 px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2.5 animate-bounce">
          <span className="text-2xl">{latestEmojiReaction.emoji}</span>
          <span className="text-xs font-black text-amber-300">
            {latestEmojiReaction.sender}
          </span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-2xl shadow-xl shrink-0">
        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>

        {/* Turn & Status Title */}
        <div className="text-center flex items-center gap-2 sm:gap-3">
          <div className="text-xs font-black text-amber-400 uppercase tracking-widest hidden sm:inline">
            {room.name}
          </div>
          {room.status === 'playing' ? (
            isMyTurn ? (
              <span className="text-emerald-400 font-black text-xs sm:text-sm flex items-center gap-1.5 bg-emerald-950/80 px-3 py-0.5 rounded-full border border-emerald-800">
                <Sparkles className="w-3.5 h-3.5 animate-bounce" /> YOUR TURN ({timeLeft}s)
              </span>
            ) : (
              <span className="text-slate-400 font-bold text-xs bg-slate-950 px-3 py-0.5 rounded-full border border-slate-800">
                Turn: {room.currentTurn === 'red' ? room.redPlayer?.username : room.blackPlayer?.username} ({timeLeft}s)
              </span>
            )
          ) : (
            <span className="text-amber-400 font-black text-xs">
              Winner: {room.winner ? room.winner.toUpperCase() : 'Draw'}
            </span>
          )}
        </div>

        {/* Resign / Spectator info */}
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

      {/* Main Game Arena Container (Static & Screen-Fitted: Left Player Scores, Center Enlarged Board, Right Slender Emoji Sidebar) */}
      <div className="flex-1 my-1 flex flex-row items-center justify-between gap-2 sm:gap-3 overflow-hidden relative min-h-0">
        
        {/* LEFT HAND SIDE: Players Status (Move Log completely removed in Practice vs Bot!) */}
        <div className="w-28 sm:w-36 shrink-0 h-full flex flex-col justify-between gap-1.5 bg-slate-900/90 border border-slate-800/90 p-2 rounded-2xl shadow-xl overflow-hidden min-h-0">
          {/* Black / Bot Player Summary */}
          <div className={`p-2 rounded-xl border text-xs ${room.currentTurn === 'black' ? 'bg-slate-950 border-amber-500/80' : 'bg-slate-950/60 border-slate-800'}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-400 shrink-0" />
              <span className="font-black text-slate-100 text-[10px] sm:text-[11px] truncate">
                {room.blackPlayer?.username || (isBotGame ? 'AI Bot' : 'Black')}
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] text-amber-400 font-bold mt-1">
              Captured: {room.capturedRed}/12
            </div>
          </div>

          {/* Center Info / Mode Tag (Non-bot matches show small move count or compact log) */}
          {!isBotGame ? (
            <div className="flex-1 my-0.5 flex flex-col overflow-hidden bg-slate-950/80 rounded-xl border border-slate-800/80 p-1.5 min-h-0">
              <div className="text-[9px] font-black text-amber-400 uppercase tracking-wider border-b border-slate-800 pb-0.5 flex items-center justify-between">
                <span>Moves</span>
                <span>#{room.history.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 pt-1 custom-scrollbar min-h-0">
                {room.history.length === 0 ? (
                  <div className="text-[9px] text-slate-500 text-center py-2 italic">
                    Match start
                  </div>
                ) : (
                  room.history.map((m, idx) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between text-[9px] p-0.5 bg-slate-900 rounded border border-slate-800/80 font-mono"
                    >
                      <span className="text-slate-500 font-bold">#{idx + 1}</span>
                      <span className={m.playerColor === 'red' ? 'text-rose-400 font-bold' : 'text-slate-300 font-bold'}>
                        {String.fromCharCode(65 + m.from.col)}{8 - m.from.row}&rarr;{String.fromCharCode(65 + m.to.col)}{8 - m.to.row}
                      </span>
                      {m.capturedCount > 0 && <span className="text-amber-400 font-black text-[8px]">x{m.capturedCount}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 my-1 flex flex-col items-center justify-center p-2 text-center bg-slate-950/40 rounded-xl border border-slate-800/60">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-black text-xs mb-1">
                🤖
              </div>
              <div className="text-[10px] font-black text-slate-200">Practice Arena</div>
              <div className="text-[8px] text-slate-500">AI Bot Match</div>
            </div>
          )}

          {/* Red Player Summary */}
          <div className={`p-2 rounded-xl border text-xs ${room.currentTurn === 'red' ? 'bg-slate-950 border-amber-500/80' : 'bg-slate-950/60 border-slate-800'}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-red-300 shrink-0" />
              <span className="font-black text-slate-100 text-[10px] sm:text-[11px] truncate">
                {room.redPlayer?.username || 'Red'}
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] text-rose-400 font-bold mt-1">
              Captured: {room.capturedBlack}/12
            </div>
          </div>
        </div>

        {/* CENTER: Fixed, Screen-Fitted Checkers Board */}
        <div className="flex-1 flex items-center justify-center h-full overflow-hidden min-h-0">
          <CheckersBoard
            board={room.board}
            currentTurn={room.currentTurn}
            playerColor={playerColor}
            selectedPiecePos={selectedPos}
            validMoveOptions={room.status === 'playing' ? validMoveOptions : []}
            onSelectPiece={handleSelectPiece}
            onExecuteMove={handleExecuteMove}
            lastMove={lastMove}
          />
        </div>

        {/* RIGHT HAND SIDE: In-Game Emoji Reactions (Strictly removed in Practice vs Bot, active in multiplayer) */}
        {!isBotGame && (
          <div className="shrink-0 flex items-center h-full min-h-0">
            {/* Toggle Button */}
            <button
              onClick={() => setIsEmojiSidebarOpen(!isEmojiSidebarOpen)}
              className="p-1.5 sm:p-2 rounded-l-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-2xl transition z-20 flex flex-col items-center gap-1"
              title="Toggle Emoji Reactions"
            >
              <Smile className="w-4 h-4" />
              {isEmojiSidebarOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>

            {/* Slender vertical panel with wider length (tall) and small width (12-14) with scrollable 10 emojis */}
            {isEmojiSidebarOpen && (
              <div className="h-full bg-slate-900 border border-amber-500/30 rounded-2xl p-1 shadow-2xl flex flex-col items-center justify-between gap-1 w-11 sm:w-13 animate-fade-in z-20 min-h-0">
                <div className="text-[8px] font-black text-amber-400 uppercase tracking-widest text-center border-b border-slate-800 pb-0.5 w-full">
                  React
                </div>

                {/* Vertical Scrollable Column of 10 Emojis with blast sound on click */}
                <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 my-0.5 custom-scrollbar w-full items-center min-h-0 pr-0.5">
                  {REACTION_EMOJIS.map((emoji, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleEmojiClick(emoji)}
                      className="w-8 h-8 sm:w-9 sm:h-9 text-base sm:text-lg flex items-center justify-center rounded-xl bg-slate-950 hover:bg-amber-500/30 hover:scale-110 border border-slate-800 transition active:scale-90 shadow shrink-0"
                      title={`React ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <div className="text-[7px] text-slate-500 font-bold text-center">
                  Scroll
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
