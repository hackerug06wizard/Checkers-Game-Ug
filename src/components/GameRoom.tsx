import React, { useState, useEffect, useMemo } from 'react';
import { GameRoom as IGameRoom, UserProfile, PieceColor, Position, MoveOption, ChatMessage } from '../types';
import { CheckersBoard } from './CheckersBoard';
import { AvatarBadge } from './AvatarBadge';
import {
  Flag,
  ArrowLeft,
  Crown,
  Trophy,
  Timer,
  Sparkles,
  Smile,
  ChevronRight,
  ChevronLeft,
  RotateCw,
} from 'lucide-react';
import { sounds } from '../lib/sound';
import { getValidMovesForPlayer } from '../lib/checkersEngine';

const REACTION_EMOJIS = ['👑', '♟️', '🔥', '👏', '😂', '🎯', '💡', '🏆', '😭', '⚡'];

interface GameRoomProps {
  room: IGameRoom;
  currentUser: UserProfile;
  onSendMove: (move: MoveOption) => void;
  onResign: () => void;
  onLeaveRoom: () => void;
  onSendGameChat: (text: string) => void;
  gameChatMessages: ChatMessage[];
}

export const GameRoom: React.FC<GameRoomProps> = ({
  room,
  currentUser,
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

  // Lock or request landscape orientation
  useEffect(() => {
    if (typeof window !== 'undefined' && window.screen && (window.screen as any).orientation?.lock) {
      try {
        (window.screen as any).orientation.lock('landscape').catch(() => {});
      } catch (e) {
        // ignore
      }
    }
  }, []);

  // Show floating reaction whenever a new game chat emoji arrives
  useEffect(() => {
    if (gameChatMessages.length > 0) {
      const lastMsg = gameChatMessages[gameChatMessages.length - 1];
      setLatestEmojiReaction({ emoji: lastMsg.text, sender: lastMsg.senderName });
      const timer = setTimeout(() => {
        setLatestEmojiReaction(null);
      }, 3000);
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

  const lastMove =
    room.history.length > 0
      ? {
          from: room.history[room.history.length - 1].from,
          to: room.history[room.history.length - 1].to,
        }
      : null;

  return (
    <div className="w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-2 sm:p-3 relative select-none overflow-hidden animate-fade-in">
      {/* Floating Animated Reaction Badge */}
      {latestEmojiReaction && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 border-2 border-amber-400 px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
          <span className="text-2xl sm:text-3xl">{latestEmojiReaction.emoji}</span>
          <span className="text-xs font-bold text-amber-300">
            {latestEmojiReaction.sender}
          </span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-2xl shadow-xl shrink-0">
        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>

        {/* Turn & Status Title */}
        <div className="text-center flex items-center gap-3">
          <div className="text-xs font-extrabold text-amber-400 uppercase tracking-widest hidden sm:inline">
            {room.name}
          </div>
          {room.status === 'playing' ? (
            isMyTurn ? (
              <span className="text-emerald-400 font-black text-xs sm:text-sm flex items-center gap-1.5 bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-800">
                <Sparkles className="w-3.5 h-3.5 animate-bounce" /> YOUR TURN ({timeLeft}s)
              </span>
            ) : (
              <span className="text-slate-400 font-bold text-xs bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                Turn: {room.currentTurn === 'red' ? room.redPlayer?.username : room.blackPlayer?.username} ({timeLeft}s)
              </span>
            )
          ) : (
            <span className="text-amber-400 font-extrabold text-xs">
              Winner: {room.winner ? room.winner.toUpperCase() : 'Draw'}
            </span>
          )}
        </div>

        {/* Resign / Spectator info */}
        {playerColor !== 'spectator' && room.status === 'playing' ? (
          <button
            onClick={onResign}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold text-xs border border-rose-800 transition"
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

      {/* Main Game Arena Container (3 Columns: Left Move Log, Center Enlarged Board, Right Emoji Sidebar) */}
      <div className="flex-1 my-1.5 flex flex-row items-center justify-between gap-2 sm:gap-4 overflow-hidden relative">
        
        {/* LEFT HAND SIDE: Narrowed Match Move Log & Player Headers */}
        <div className="w-32 sm:w-44 shrink-0 h-full flex flex-col justify-between gap-2 bg-slate-900/90 border border-slate-800/90 p-2 rounded-2xl shadow-xl overflow-hidden">
          {/* Black Player Summary */}
          <div className={`p-2 rounded-xl border text-xs ${room.currentTurn === 'black' ? 'bg-slate-950 border-amber-500/80' : 'bg-slate-950/60 border-slate-800'}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-400 shrink-0" />
              <span className="font-extrabold text-slate-100 text-[11px] truncate">
                {room.blackPlayer?.username || 'Black'}
              </span>
            </div>
            <div className="text-[10px] text-amber-400 font-bold mt-0.5">
              Cap: {room.capturedRed}/12
            </div>
          </div>

          {/* Narrow Move Log Panel */}
          <div className="flex-1 my-1 flex flex-col overflow-hidden bg-slate-950/80 rounded-xl border border-slate-800/80 p-2">
            <div className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider border-b border-slate-800 pb-1 flex items-center justify-between">
              <span>Moves Log</span>
              <span>#{room.history.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 pt-1.5 custom-scrollbar">
              {room.history.length === 0 ? (
                <div className="text-[10px] text-slate-500 text-center py-4 italic">
                  Game starting...
                </div>
              ) : (
                room.history.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-[10px] p-1 bg-slate-900 rounded border border-slate-800/80 font-mono"
                  >
                    <span className="text-slate-500 font-bold">#{idx + 1}</span>
                    <span className={m.playerColor === 'red' ? 'text-rose-400 font-bold' : 'text-slate-300 font-bold'}>
                      {String.fromCharCode(65 + m.from.col)}{8 - m.from.row}&rarr;{String.fromCharCode(65 + m.to.col)}{8 - m.to.row}
                    </span>
                    {m.capturedCount > 0 && <span className="text-amber-400 font-extrabold text-[9px]">x{m.capturedCount}</span>}
                    {m.becameKing && <span>👑</span>}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Red Player Summary */}
          <div className={`p-2 rounded-xl border text-xs ${room.currentTurn === 'red' ? 'bg-slate-950 border-amber-500/80' : 'bg-slate-950/60 border-slate-800'}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-red-300 shrink-0" />
              <span className="font-extrabold text-slate-100 text-[11px] truncate">
                {room.redPlayer?.username || 'Red'}
              </span>
            </div>
            <div className="text-[10px] text-rose-400 font-bold mt-0.5">
              Cap: {room.capturedBlack}/12
            </div>
          </div>
        </div>

        {/* CENTER: Enlarged Checkers Board */}
        <div className="flex-1 flex items-center justify-center h-full overflow-hidden">
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

        {/* RIGHT HAND SIDE: Toggle Side Bar with Emojis (Vertical 1 Column, Max 10 Emojis) */}
        <div className="shrink-0 flex items-center h-full">
          {/* Toggle Button */}
          <button
            onClick={() => setIsEmojiSidebarOpen(!isEmojiSidebarOpen)}
            className="p-2 rounded-l-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-2xl transition z-20 flex flex-col items-center gap-1"
            title="Toggle Emoji Reaction Side Bar"
          >
            <Smile className="w-5 h-5" />
            {isEmojiSidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          {/* Pop-Out Vertical Sidebar - 1 Column Format */}
          {isEmojiSidebarOpen && (
            <div className="h-full bg-slate-900 border border-amber-500/30 rounded-2xl p-2 shadow-2xl flex flex-col items-center justify-between gap-1 w-14 sm:w-16 animate-fade-in z-20">
              <div className="text-[9px] font-extrabold text-amber-400 uppercase tracking-widest text-center border-b border-slate-800 pb-1 w-full">
                Emoji
              </div>

              {/* Vertical Scrollable Column of 10 Emojis */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 my-1 custom-scrollbar w-full items-center">
                {REACTION_EMOJIS.map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSendGameChat(emoji)}
                    className="w-10 h-10 text-xl sm:text-2xl flex items-center justify-center rounded-xl bg-slate-950 hover:bg-amber-500/30 hover:scale-125 border border-slate-800 transition active:scale-90 shadow"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="text-[8px] text-slate-500 font-bold text-center">
                Scroll ↑
              </div>
            </div>
          )}
        </div>
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
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-xs shadow-lg transition"
            >
              Return to Arena Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
