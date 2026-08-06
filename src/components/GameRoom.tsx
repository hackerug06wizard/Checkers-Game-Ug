import React, { useState, useEffect, useMemo } from 'react';
import { GameRoom as IGameRoom, UserProfile, PieceColor, Position, MoveOption, ChatMessage } from '../types';
import { CheckersBoard } from './CheckersBoard';
import { AvatarBadge } from './AvatarBadge';
import {
  Flag,
  Handshake,
  ArrowLeft,
  Crown,
  Trophy,
  MessageSquare,
  Send,
  Timer,
  Volume2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { sounds } from '../lib/sound';
import { getValidMovesForPlayer } from '../lib/checkersEngine';
import { EmojiChatPanel } from './EmojiChatPanel';

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
  const [chatText, setChatText] = useState('');
  const [timeLeft, setTimeLeft] = useState<number>(room.turnTimeLimitSeconds);

  // Determine current player's color
  const isRed = room.redPlayer?.id === currentUser.id;
  const isBlack = room.blackPlayer?.id === currentUser.id;
  const playerColor: PieceColor | 'spectator' = isRed
    ? 'red'
    : isBlack
    ? 'black'
    : 'spectator';

  const isMyTurn = playerColor === room.currentTurn;

  // Compute all valid move options for current turn player
  const validMoveOptions = useMemo(() => {
    if (room.status !== 'playing' || !room.board) return [];
    return getValidMovesForPlayer(room.board, room.currentTurn);
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

  // Valid moves for selected piece
  const handleSelectPiece = (pos: Position | null) => {
    if (!isMyTurn && playerColor !== 'spectator') return;
    setSelectedPos(pos);
  };

  const handleExecuteMove = (move: MoveOption) => {
    onSendMove(move);
    setSelectedPos(null);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendGameChat(chatText);
    setChatText('');
  };

  const lastMove =
    room.history.length > 0
      ? {
          from: room.history[room.history.length - 1].from,
          to: room.history[room.history.length - 1].to,
        }
      : null;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in">
      {/* Top Match Bar */}
      <div className="flex items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-xl">
        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm border border-slate-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Leave Room</span>
        </button>

        <div className="text-center">
          <div className="text-xs font-bold text-amber-400 uppercase tracking-widest">
            {room.name}
          </div>
          <div className="text-sm font-extrabold text-white flex items-center justify-center gap-2">
            <span>Match Room</span>
            {playerColor === 'spectator' && (
              <span className="px-2 py-0.5 rounded-full bg-purple-950 text-purple-400 border border-purple-800 text-[10px] uppercase font-bold">
                Spectating ({room.spectatorsCount})
              </span>
            )}
          </div>
        </div>

        {/* Resign Action */}
        {playerColor !== 'spectator' && room.status === 'playing' ? (
          <button
            onClick={onResign}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold text-xs sm:text-sm border border-rose-800 transition"
          >
            <Flag className="w-4 h-4" />
            <span>Resign</span>
          </button>
        ) : (
          <div className="w-20" />
        )}
      </div>

      {/* Main Game Grid: Left Players/Board, Right Chat/History */}
      <div className="grid grid-cols-1 md:landscape:grid-cols-3 lg:grid-cols-3 gap-4 md:gap-6 items-start">
        {/* Left Column: Player Headers + Board */}
        <div className="md:landscape:col-span-2 lg:col-span-2 space-y-3 sm:space-y-4">
          {/* Black Player (Top Player Header) */}
          <div
            className={`p-4 rounded-2xl border transition shadow-lg flex items-center justify-between ${
              room.currentTurn === 'black' && room.status === 'playing'
                ? 'bg-slate-900 border-amber-500/80 ring-2 ring-amber-500/30'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <AvatarBadge
                avatarId={room.blackPlayer?.avatarId || 'avatar-shadow'}
                size="md"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-900 border border-slate-500" />
                  <span className="text-sm font-extrabold text-white">
                    {room.blackPlayer?.username || 'Waiting for Black...'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium">
                  Rating: {room.blackPlayer?.rating || 1200} ELO
                </div>
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="text-xs font-extrabold text-amber-400">
                Captured Red: {room.capturedRed} / 12
              </div>
              {room.currentTurn === 'black' && room.status === 'playing' && (
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-800/80">
                  <Timer className="w-3.5 h-3.5 animate-spin" /> {timeLeft}s
                </div>
              )}
            </div>
          </div>

          {/* Turn Banner Status */}
          <div className="text-center py-2 px-4 rounded-xl bg-slate-950/90 border border-slate-800 text-xs font-bold">
            {room.status === 'playing' ? (
              isMyTurn ? (
                <span className="text-emerald-400 flex items-center justify-center gap-2 text-sm">
                  <Sparkles className="w-4 h-4 animate-bounce" /> Your Turn! Choose a piece to move.
                </span>
              ) : (
                <span className="text-slate-400">
                  Waiting for {room.currentTurn === 'red' ? room.redPlayer?.username : room.blackPlayer?.username}&apos;s move...
                </span>
              )
            ) : (
              <span className="text-amber-400 font-extrabold text-sm">
                Game Ended! Winner: {room.winner ? room.winner.toUpperCase() : 'Draw'}
              </span>
            )}
          </div>

          {/* Interactive Checkers Board */}
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

          {/* Red Player (Bottom Player Header) */}
          <div
            className={`p-4 rounded-2xl border transition shadow-lg flex items-center justify-between ${
              room.currentTurn === 'red' && room.status === 'playing'
                ? 'bg-slate-900 border-amber-500/80 ring-2 ring-amber-500/30'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <AvatarBadge
                avatarId={room.redPlayer?.avatarId || 'avatar-crown'}
                size="md"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-600 border border-red-400" />
                  <span className="text-sm font-extrabold text-white">
                    {room.redPlayer?.username || 'Waiting for Red...'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium">
                  Rating: {room.redPlayer?.rating || 1200} ELO
                </div>
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="text-xs font-extrabold text-rose-400">
                Captured Black: {room.capturedBlack} / 12
              </div>
              {room.currentTurn === 'red' && room.status === 'playing' && (
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-800/80">
                  <Timer className="w-3.5 h-3.5 animate-spin" /> {timeLeft}s
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Move History & In-Game Chat */}
        <div className="space-y-6">
          {/* Move Log Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <Crown className="w-4 h-4 text-amber-400" /> Match Move Log
            </h3>
            <div className="h-36 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {room.history.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-6">
                  No moves played yet.
                </div>
              ) : (
                room.history.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-xs p-2 bg-slate-950/60 rounded-xl border border-slate-800/60 font-mono"
                  >
                    <span className="text-slate-500 font-bold">#{idx + 1}</span>
                    <span
                      className={`font-bold ${
                        m.playerColor === 'red' ? 'text-rose-400' : 'text-slate-300'
                      }`}
                    >
                      {m.playerColor.toUpperCase()}
                    </span>
                    <span className="text-slate-300">
                      {String.fromCharCode(65 + m.from.col)}
                      {8 - m.from.row} &rarr; {String.fromCharCode(65 + m.to.col)}
                      {8 - m.to.row}
                    </span>
                    {m.capturedCount > 0 && (
                      <span className="text-amber-400 font-extrabold text-[10px] bg-amber-950 px-1.5 py-0.5 rounded border border-amber-800">
                        x{m.capturedCount} JUMP
                      </span>
                    )}
                    {m.becameKing && (
                      <span className="text-yellow-300 text-[10px] font-bold">
                        👑 KING
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* In-Game Emoji-Only Chat */}
          <EmojiChatPanel
            title="In-Game Emoji Reactions"
            messages={gameChatMessages}
            onSendEmoji={(emoji) => onSendGameChat(emoji)}
            heightClass="h-[320px]"
          />
        </div>
      </div>

      {/* Game Over Victory / Defeat Modal */}
      {room.status === 'ended' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 to-red-600 shadow-xl shadow-amber-950/40">
              <Trophy className="w-8 h-8 text-slate-950 animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">
                {room.winner === playerColor
                  ? '🏆 Victory!'
                  : room.winner === 'draw'
                  ? '🤝 Match Drawn!'
                  : 'Defeat'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                {room.winReason || 'The checkers match has concluded.'}
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-around">
              <div>
                <div className="text-xs text-slate-500">Winner</div>
                <div className="text-sm font-extrabold text-amber-400 uppercase">
                  {room.winner || 'None'}
                </div>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div>
                <div className="text-xs text-slate-500">Total Moves</div>
                <div className="text-sm font-extrabold text-slate-200">
                  {room.history.length}
                </div>
              </div>
            </div>

            <button
              onClick={onLeaveRoom}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm shadow-lg transition transform active:scale-95"
            >
              Return to Arena Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
