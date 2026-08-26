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
  ChevronUp,
  ChevronDown,
  History,
  Bot,
  User,
  Volume2,
  VolumeX,
  Trash2,
} from 'lucide-react';
import { sounds } from '../lib/sound';
import { getValidMovesForPlayer } from '../lib/checkersEngine';
import { BOT_DIFFICULTIES } from '../lib/botEngine';

// High-impact reaction emojis
const REACTION_EMOJIS = ['🔥', '👑', '🎉', '👏', '😎', '⚡', '🤯', '💥', '🎯', '🏆'];

interface GameRoomProps {
  room: IGameRoom;
  currentUser: UserProfile;
  activeTheme?: BoardTheme;
  onSendMove: (move: MoveOption) => void;
  onResign: () => void;
  onLeaveRoom: () => void;
  onDeleteTable?: () => void;
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
  onDeleteTable,
  onSendGameChat,
  gameChatMessages,
}) => {
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(room.turnTimeLimitSeconds);
  const [latestEmojiReaction, setLatestEmojiReaction] = useState<{
    emoji: string;
    sender: string;
  } | null>(null);
  const [isMoveLogOpen, setIsMoveLogOpen] = useState(false);

  const isBotGame = Boolean(room.blackPlayer?.isBot || room.id.includes('bot'));
  const botDiffConfig = room.botDifficulty ? BOT_DIFFICULTIES[room.botDifficulty] : BOT_DIFFICULTIES.medium;

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
    <div className="w-full h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] flex flex-col justify-between p-1 sm:p-2.5 relative select-none overflow-hidden bg-slate-950">
      {/* Floating Animated Emoji Reaction Badge */}
      {latestEmojiReaction && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border-2 border-amber-400 px-3.5 py-1 rounded-full shadow-2xl flex items-center gap-2 animate-bounce pointer-events-none">
          <span className="text-xl">{latestEmojiReaction.emoji}</span>
          <span className="text-xs font-black text-amber-300">
            {latestEmojiReaction.sender}
          </span>
        </div>
      )}

      {/* TOP HEADER CONTROLS BAR */}
      <div className="flex items-center justify-between gap-2 bg-slate-900/95 border border-slate-800 px-2.5 sm:px-4 py-1.5 rounded-2xl shadow-xl shrink-0 z-30">
        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs border border-slate-700 transition active:scale-95 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit Table</span>
        </button>

        {/* Center: Turn Timer Badge & Status */}
        <div className="flex items-center gap-2 min-w-0">
          {room.status === 'waiting' ? (
            <div className="flex items-center gap-1.5 bg-amber-950/80 text-amber-300 font-black text-[11px] sm:text-xs px-3 py-1 rounded-full border border-amber-600/80 shadow animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>WAITING FOR OPPONENT TO JOIN TABLE...</span>
            </div>
          ) : room.status === 'playing' ? (
            isMyTurn ? (
              <div className="flex items-center gap-1.5 bg-emerald-950 text-emerald-300 font-black text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1 rounded-full border border-emerald-600 shadow animate-pulse">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>YOUR TURN ({timeLeft}s)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-950 text-slate-300 font-bold text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 rounded-full border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="truncate max-w-[120px] sm:max-w-[160px]">
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
                : 'Match Ended'}
            </div>
          )}
        </div>

        {/* Right: Delete Table / Resign / Spectator info / Move log toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Delete Table button if owner or waiting */}
          {(room.status === 'waiting' || room.redPlayer?.id === currentUser.id) && onDeleteTable && (
            <button
              onClick={onDeleteTable}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs border border-rose-500 shadow-md shadow-rose-950/40 transition active:scale-95"
              title="Delete and close this Game Table"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Table</span>
            </button>
          )}

          <button
            onClick={() => setIsMoveLogOpen(!isMoveLogOpen)}
            className={`flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-bold border transition ${
              isMoveLogOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
            }`}
            title="Toggle Move History"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Log</span>
            <span className="text-[10px] font-mono opacity-80">({room.history.length})</span>
          </button>

          {playerColor !== 'spectator' && room.status === 'playing' && (
            <button
              onClick={onResign}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold text-xs border border-rose-800 transition active:scale-95"
            >
              <Flag className="w-3 h-3" />
              <span>Resign</span>
            </button>
          )}
        </div>
      </div>

      {/* MOBILE PORTRAIT COMPACT TOP BAR (< md screens) */}
      <div className="flex md:hidden items-center justify-between px-2.5 py-1 bg-slate-900/80 border border-slate-800/90 rounded-xl my-1 text-xs shrink-0">
        {/* Opponent Info (Top) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <AvatarBadge
            avatarId={opponent?.avatarId || 'avatar-cyber'}
            size="sm"
            color={opponentColor}
          />
          <div className="min-w-0">
            <div className="font-black text-slate-200 text-xs truncate max-w-[100px]">
              {opponent?.username || (isBotGame ? 'Bot AI' : 'Opponent')}
            </div>
            {isBotGame && (
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${botDiffConfig.badgeColor}`}>
                {botDiffConfig.name.split(' ')[0]}
              </span>
            )}
          </div>
        </div>

        {/* Captured Counts Comparison */}
        <div className="flex items-center gap-2 font-mono text-[11px] font-black bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
          <span className="text-rose-400">🔴 {room.capturedBlack}/12</span>
          <span className="text-slate-600">vs</span>
          <span className="text-slate-300">⚫ {room.capturedRed}/12</span>
        </div>

        {/* User Info (Top preview) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-right min-w-0">
            <div className="font-black text-slate-200 text-xs truncate max-w-[90px]">
              {currentUser.username}
            </div>
            <div className="text-[9px] text-amber-400 font-bold">
              {myColor.toUpperCase()}
            </div>
          </div>
          <AvatarBadge
            avatarId={currentUser.avatarId || 'avatar-crown'}
            size="sm"
            color={myColor}
          />
        </div>
      </div>

      {/* MAIN LANDSCAPE ARENA (95% SCREEN OCCUPANCY) */}
      <div className="flex-1 flex flex-row items-center justify-center gap-1.5 sm:gap-3 overflow-hidden relative min-h-0">
        
        {/* LEFT COMPACT SLIM FLANK (Opponent / Bot AI) - Visible on md+ */}
        <div className="hidden md:flex w-24 sm:w-28 lg:w-32 h-full shrink-0 flex-col justify-between gap-1.5 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl shadow-xl overflow-hidden min-h-0">
          {/* Opponent Card */}
          <div
            className={`p-1.5 rounded-xl border transition text-center space-y-1 ${
              room.currentTurn === opponentColor
                ? 'bg-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="flex justify-center">
              <AvatarBadge
                avatarId={opponent?.avatarId || 'avatar-cyber'}
                size="sm"
                color={opponentColor}
              />
            </div>
            <div className="font-black text-slate-100 text-[11px] truncate">
              {opponent?.username || (isBotGame ? 'Checkers Bot' : 'Opponent')}
            </div>
            
            {/* Bot Difficulty Tag or Rank */}
            {isBotGame ? (
              <div className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${botDiffConfig.badgeColor} truncate`}>
                {botDiffConfig.icon} {botDiffConfig.name.split(' ')[0]}
              </div>
            ) : (
              <div className="text-[9px] text-amber-400 font-bold">
                {opponent?.rating || 1200} ELO
              </div>
            )}

            {/* Pieces captured */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 text-[10px] font-bold flex items-center justify-between">
              <span className="text-slate-400">Captured:</span>
              <span className="text-amber-400 font-black">
                {opponentColor === 'red' ? room.capturedBlack : room.capturedRed}/12
              </span>
            </div>
          </div>

          {/* Opponent pieces indicator */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-1.5 text-center space-y-0.5">
            <div className="text-[9px] text-slate-400 uppercase font-black">Color</div>
            <div className={`text-xs font-black ${opponentColor === 'red' ? 'text-rose-400' : 'text-slate-300'}`}>
              {opponentColor.toUpperCase()}
            </div>
          </div>

          {/* Quick Reaction Emoji Column */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-1 space-y-1">
            <div className="text-[8px] font-black text-amber-400 text-center uppercase">
              React
            </div>
            <div className="grid grid-cols-2 gap-1">
              {REACTION_EMOJIS.slice(0, 4).map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => handleEmojiClick(emoji)}
                  className="p-1 text-xs bg-slate-900 hover:bg-amber-500/20 rounded-md border border-slate-800 hover:scale-110 transition active:scale-90 flex items-center justify-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER STAGE: CHECKERS BOARD (95% SCREEN FIT) */}
        <div className="flex-1 flex items-center justify-center w-full h-full max-h-full overflow-hidden min-h-0 relative">
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

          {/* Waiting For Opponent Overlay on Board */}
          {room.status === 'waiting' && (
            <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px] flex items-center justify-center p-4 z-20">
              <div className="bg-slate-900/95 border-2 border-amber-500/80 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
                  <span className="w-4 h-4 rounded-full bg-amber-400 animate-ping" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-black text-white">Table Created & Waiting</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    This game table is active in the lobby. Waiting for another player to join...
                  </p>
                </div>

                {onDeleteTable && (
                  <button
                    onClick={onDeleteTable}
                    className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-950/50 transition flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Table</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COMPACT SLIM FLANK (Player Profile & Quick Moves) - Visible on md+ */}
        <div className="hidden md:flex w-24 sm:w-28 lg:w-32 h-full shrink-0 flex-col justify-between gap-1.5 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl shadow-xl overflow-hidden min-h-0">
          {/* User Profile Card */}
          <div
            className={`p-1.5 rounded-xl border transition text-center space-y-1 ${
              room.currentTurn === myColor
                ? 'bg-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-950/70 border-slate-800'
            }`}
          >
            <div className="flex justify-center">
              <AvatarBadge
                avatarId={currentUser.avatarId || 'avatar-crown'}
                size="sm"
                color={myColor}
              />
            </div>
            <div className="font-black text-slate-100 text-[11px] truncate">
              {currentUser.username} (You)
            </div>
            <div className="text-[9px] text-amber-400 font-bold">
              {currentUser.rating || 1200} ELO
            </div>

            {/* Pieces captured */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 text-[10px] font-bold flex items-center justify-between">
              <span className="text-slate-400">Captured:</span>
              <span className="text-amber-400 font-black">
                {myColor === 'red' ? room.capturedBlack : room.capturedRed}/12
              </span>
            </div>
          </div>

          {/* Move Log Miniature */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/80 rounded-xl border border-slate-800 p-1.5 min-h-0">
            <div className="text-[8px] font-black text-amber-400 uppercase text-center border-b border-slate-800 pb-0.5 flex items-center justify-between">
              <span>Moves</span>
              <span>#{room.history.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pt-1 custom-scrollbar min-h-0 text-[10px]">
              {room.history.length === 0 ? (
                <div className="text-[9px] text-slate-500 text-center py-2 italic">
                  No moves
                </div>
              ) : (
                room.history.slice(-6).map((m, idx) => (
                  <div
                    key={m.id}
                    className="p-1 rounded bg-slate-900/90 border border-slate-800/80 flex items-center justify-between"
                  >
                    <span className={m.playerColor === 'red' ? 'text-rose-400 font-bold' : 'text-slate-300 font-bold'}>
                      {String.fromCharCode(65 + m.from.col)}{8 - m.from.row}&rarr;{String.fromCharCode(65 + m.to.col)}{8 - m.to.row}
                    </span>
                    {m.capturedCount > 0 && (
                      <span className="text-[9px] text-amber-400 font-black">
                        +{m.capturedCount}⚔️
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick React Column 2 */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-1 space-y-1">
            <div className="grid grid-cols-2 gap-1">
              {REACTION_EMOJIS.slice(4, 8).map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => handleEmojiClick(emoji)}
                  className="p-1 text-xs bg-slate-900 hover:bg-amber-500/20 rounded-md border border-slate-800 hover:scale-110 transition active:scale-90 flex items-center justify-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE PORTRAIT BOTTOM BAR WITH QUICK EMOJI REACTS (< md screens) */}
      <div className="flex md:hidden items-center justify-between gap-1 px-2 py-1 bg-slate-900/90 border border-slate-800 rounded-xl shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5">
          {REACTION_EMOJIS.slice(0, 6).map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => handleEmojiClick(emoji)}
              className="p-1 text-base bg-slate-950 hover:bg-amber-500/20 rounded-lg border border-slate-800 transition active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* OVERLAY MOVE LOG DRAWER (Expandable when clicking Log) */}
      {isMoveLogOpen && (
        <div className="absolute bottom-12 right-2 sm:right-6 z-40 w-72 max-w-[90vw] bg-slate-900/95 border-2 border-slate-700 rounded-2xl p-3 shadow-2xl backdrop-blur-md animate-fade-in space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
              <History className="w-3.5 h-3.5" />
              <span>Full Move History ({room.history.length})</span>
            </div>
            <button
              onClick={() => setIsMoveLogOpen(false)}
              className="text-slate-400 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded bg-slate-800"
            >
              &times;
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {room.history.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-4">
                No moves executed yet.
              </div>
            ) : (
              room.history.map((m, idx) => (
                <div
                  key={m.id}
                  className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                    <span className={m.playerColor === 'red' ? 'text-rose-400 font-black' : 'text-slate-300 font-black'}>
                      {m.playerColor.toUpperCase()}
                    </span>
                    <span className="text-slate-200 font-mono">
                      {String.fromCharCode(65 + m.from.col)}{8 - m.from.row} &rarr; {String.fromCharCode(65 + m.to.col)}{8 - m.to.row}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {m.becameKing && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                        👑 King
                      </span>
                    )}
                    {m.capturedCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                        ⚔️ +{m.capturedCount}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
