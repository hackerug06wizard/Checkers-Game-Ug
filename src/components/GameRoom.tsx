import React, { useState, useEffect, useMemo } from 'react';
import {
  GameRoom as IGameRoom,
  UserProfile,
  PieceColor,
  Position,
  MoveOption,
  ChatMessage,
} from '../types';
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
  RotateCw,
  History,
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
  const [latestEmojiReaction, setLatestEmojiReaction] = useState<{
    emoji: string;
    sender: string;
  } | null>(null);

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
    <div className="w-full h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] flex flex-col justify-between p-2 sm:p-3 relative select-none overflow-hidden bg-slate-950">
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
      <div className="flex items-center justify-between gap-2 bg-slate-900/95 border border-slate-800 px-3 sm:px-4 py-1.5 rounded-2xl shadow-xl shrink-0 z-30">
        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs border border-slate-700 transition active:scale-95 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit Table</span>
        </button>

        {/* Center: Turn Timer Badge */}
        <div className="flex items-center gap-2 min-w-0">
          {room.status === 'playing' ? (
            isMyTurn ? (
              <div className="flex items-center gap-1.5 bg-emerald-950 text-emerald-300 font-black text-xs px-3 py-1 rounded-full border border-emerald-600 shadow animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>YOUR TURN ({timeLeft}s)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-950 text-slate-300 font-bold text-xs px-3 py-1 rounded-full border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="truncate max-w-[140px]">
                  {room.currentTurn === 'red'
                    ? room.redPlayer?.username
                    : room.blackPlayer?.username}{' '}
                  ({timeLeft}s)
                </span>
              </div>
            )
          ) : (
            <div className="bg-amber-950 text-amber-300 font-black text-xs px-3 py-1 rounded-full border border-amber-700">
              {room.winner
                ? `Winner: ${room.winner.toUpperCase()}`
                : 'Match Concluded'}
            </div>
          )}
        </div>

        {/* Right: Resign / Spectator info */}
        <div className="shrink-0">
          {playerColor !== 'spectator' && room.status === 'playing' ? (
            <button
              onClick={onResign}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold text-xs border border-rose-800 transition active:scale-95"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Resign</span>
            </button>
          ) : (
            <div className="text-[10px] text-purple-400 font-bold bg-purple-950 px-2.5 py-1 rounded-lg border border-purple-800">
              Spectating ({room.spectatorsCount})
            </div>
          )}
        </div>
      </div>

      {/* LANDSCAPE TABLE ARENA: True Landscape Flanked Multi-Column Layout */}
      <div className="flex-1 flex flex-row items-center justify-between gap-2 sm:gap-4 overflow-hidden relative min-h-0 my-1.5">
        
        {/* LEFT FLANK: OPPONENT PROFILE & CAPTURED PIECES */}
        <div className="w-48 sm:w-56 h-full shrink-0 flex flex-col justify-between gap-2 bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl shadow-xl overflow-hidden min-h-0">
          {/* Opponent Card */}
          <div
            className={`p-2.5 rounded-xl border transition ${
              room.currentTurn === opponentColor
                ? 'bg-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <AvatarBadge
                avatarId={opponent?.avatarId || 'avatar-knight'}
                size="sm"
                color={opponentColor}
              />
              <div className="min-w-0">
                <div className="font-black text-slate-100 text-xs truncate">
                  {opponent?.username || (isBotGame ? 'Checkers Bot 🤖' : 'Opponent')}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {opponentColor.toUpperCase()} PIECES
                </div>
              </div>
            </div>

            {/* Captured Black/Red counter */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-1.5 flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-400">Captured:</span>
              <span className="text-amber-400 font-black">
                {opponentColor === 'red' ? room.capturedBlack : room.capturedRed} / 12
              </span>
            </div>
          </div>

          {/* Table Details / Bot Mode Notice */}
          <div className="flex-1 flex flex-col justify-center items-center text-center p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 min-h-0 overflow-y-auto custom-scrollbar">
            {isBotGame ? (
              <div className="space-y-1">
                <div className="text-2xl">🤖</div>
                <div className="text-xs font-black text-slate-200">AI Practice Arena</div>
                <div className="text-[10px] text-slate-500">
                  Real-time algorithmic engine testing your tactics.
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-2xl">⚔️</div>
                <div className="text-xs font-black text-amber-400">Live Ranked Match</div>
                <div className="text-[10px] text-slate-400">
                  Mandatory jumps enforced. Standard 8x8 rules.
                </div>
              </div>
            )}
          </div>

          {/* Quick Reaction Emoji Panel on Left (Landscape) */}
          {!isBotGame && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 space-y-1.5">
              <div className="text-[9px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <Smile className="w-3 h-3" /> Quick React
              </div>
              <div className="grid grid-cols-5 gap-1">
                {REACTION_EMOJIS.slice(0, 5).map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleEmojiClick(emoji)}
                    className="p-1 text-sm bg-slate-900 hover:bg-amber-500/20 rounded-lg border border-slate-800 hover:scale-110 transition active:scale-90 flex items-center justify-center shadow"
                    title={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CENTER: SCREEN-FITTED 2D LANDSCAPE CHECKERS BOARD */}
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
            theme={activeTheme}
          />
        </div>

        {/* RIGHT FLANK: USER PROFILE, MOVE LOG & EXTRA REACTION DOCK */}
        <div className="w-48 sm:w-56 h-full shrink-0 flex flex-col justify-between gap-2 bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl shadow-xl overflow-hidden min-h-0">
          {/* User Profile Card */}
          <div
            className={`p-2.5 rounded-xl border transition ${
              room.currentTurn === myColor
                ? 'bg-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <AvatarBadge
                avatarId={currentUser.avatarId || 'avatar-crown'}
                size="sm"
                color={myColor}
              />
              <div className="min-w-0">
                <div className="font-black text-slate-100 text-xs truncate">
                  {currentUser.username} (You)
                </div>
                <div className="text-[10px] text-amber-400 font-mono">
                  {myColor.toUpperCase()} PIECES
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-1.5 flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-400">Captured:</span>
              <span className="text-amber-400 font-black">
                {myColor === 'red' ? room.capturedBlack : room.capturedRed} / 12
              </span>
            </div>
          </div>

          {/* Move Log */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/80 rounded-xl border border-slate-800 p-2 min-h-0">
            <div className="text-[9px] font-black text-amber-400 uppercase tracking-wider border-b border-slate-800 pb-1 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1">
                <History className="w-3 h-3" /> Move Log
              </span>
              <span>#{room.history.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pt-1.5 custom-scrollbar min-h-0 pr-0.5">
              {room.history.length === 0 ? (
                <div className="text-[10px] text-slate-500 text-center py-4 italic">
                  Game in progress...
                </div>
              ) : (
                room.history.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-[10px] px-1.5 py-1 bg-slate-900 rounded border border-slate-800/90 font-mono"
                  >
                    <span className="text-slate-500 font-bold">#{idx + 1}</span>
                    <span
                      className={
                        m.playerColor === 'red'
                          ? 'text-rose-400 font-bold'
                          : 'text-slate-200 font-bold'
                      }
                    >
                      {String.fromCharCode(65 + m.from.col)}
                      {8 - m.from.row}&rarr;
                      {String.fromCharCode(65 + m.to.col)}
                      {8 - m.to.row}
                    </span>
                    {m.capturedCount > 0 && (
                      <span className="text-amber-400 font-black text-[9px]">
                        x{m.capturedCount}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Extra Reaction Emojis on Right */}
          {!isBotGame && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 space-y-1.5">
              <div className="text-[9px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Reaction Blast
              </div>
              <div className="grid grid-cols-5 gap-1">
                {REACTION_EMOJIS.slice(5, 10).map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleEmojiClick(emoji)}
                    className="p-1 text-sm bg-slate-900 hover:bg-amber-500/20 rounded-lg border border-slate-800 hover:scale-110 transition active:scale-90 flex items-center justify-center shadow"
                    title={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
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
