import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { EmojiChatPanel } from './EmojiChatPanel';
import {
  Flag,
  ArrowLeft,
  Crown,
  Trophy,
  Sparkles,
  Smile,
  History,
  Bot,
  User,
  Trash2,
  AlertTriangle,
  Clock,
  MessageCircle,
  Zap,
  CheckCircle,
} from 'lucide-react';
import { sounds } from '../lib/sound';
import { getValidMovesForPlayer } from '../lib/checkersEngine';
import { BOT_DIFFICULTIES } from '../lib/botEngine';

// High-impact reaction emojis
const REACTION_EMOJIS = [
  '🔥', '👑', '🎉', '👏', '😎', '⚡', '🤯', '💥', '🎯', '🏆',
  '😂', '💪', '💀', '🤐', '👋', '❤️', '😱', '🥳', '🍿', '🎲'
];

interface GameRoomProps {
  room: IGameRoom;
  currentUser: UserProfile;
  activeTheme?: BoardTheme;
  onSendMove: (move: MoveOption) => void;
  onResign: () => void;
  onLeaveRoom: () => void;
  onDeleteTable?: () => void;
  onClaimTimeout?: () => void;
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
  onClaimTimeout,
  onSendGameChat,
  gameChatMessages,
}) => {
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(room.turnTimeLimitSeconds || 15);
  const [latestEmojiReaction, setLatestEmojiReaction] = useState<{
    emoji: string;
    sender: string;
  } | null>(null);
  const [isMoveLogOpen, setIsMoveLogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [moveNotification, setMoveNotification] = useState<string | null>(null);

  const prevHistoryLenRef = useRef<number>(room.history?.length || 0);
  const warned15Ref = useRef<boolean>(false);
  const warned5Ref = useRef<boolean>(false);

  const isBotGame = Boolean(room.blackPlayer?.isBot || room.id.includes('bot'));
  const botDiffConfig = room.botDifficulty ? BOT_DIFFICULTIES[room.botDifficulty] : BOT_DIFFICULTIES.medium;

  // Format seconds into MM:SS or seconds
  const formatTime = (seconds: number) => {
    if (seconds <= 60) {
      return `${seconds}s`;
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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

  // Opponent disconnection status
  const isOpponentDisconnected = Boolean(
    room.disconnectedPlayerId && opponent && room.disconnectedPlayerId === opponent.id
  );
  const isMeDisconnected = Boolean(
    room.disconnectedPlayerId && room.disconnectedPlayerId === currentUser.id
  );

  // Compute all valid move options for current turn player (enforcing mandatory jumps)
  const validMoveOptions = useMemo(() => {
    if (room.status !== 'playing' || !room.board) return [];
    return getValidMovesForPlayer(room.board, room.currentTurn, true);
  }, [room.board, room.currentTurn, room.status]);

  // Show floating reaction whenever a new game chat emoji arrives
  useEffect(() => {
    if (gameChatMessages.length > 0) {
      const lastMsg = gameChatMessages[gameChatMessages.length - 1];
      setLatestEmojiReaction({ emoji: lastMsg.text, sender: lastMsg.senderName });
      sounds.playBlast();
      const timer = setTimeout(() => {
        setLatestEmojiReaction(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameChatMessages.length]);

  // Reset audio warning flags when turn or deadline resets
  useEffect(() => {
    warned15Ref.current = false;
    warned5Ref.current = false;
  }, [room.currentTurn, room.turnDeadline]);

  // Turn Countdown Timer effect (15-second per-turn countdown with low-time chime)
  useEffect(() => {
    if (room.status !== 'playing' || !room.turnDeadline) return;

    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((room.turnDeadline! - now) / 1000));
      setTimeLeft(diff);

      // Low time audio chime notifications
      if (diff <= 10 && diff > 5 && !warned15Ref.current) {
        warned15Ref.current = true;
        sounds.playTimeWarning();
      }
      if (diff <= 5 && diff > 0 && !warned5Ref.current) {
        warned5Ref.current = true;
        sounds.playTimeWarning();
      }
      if (diff <= 5 && diff > 0 && (isMyTurn || isOpponentDisconnected)) {
        sounds.playTick();
      }

      // Auto trigger claim timeout if opponent's turn hits 0
      if (diff === 0 && !isMyTurn && playerColor !== 'spectator') {
        onClaimTimeout?.();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [room.turnDeadline, room.status, isMyTurn, isOpponentDisconnected, playerColor, onClaimTimeout]);

  // Audio feedback and notifications when moves are executed
  useEffect(() => {
    const currentLen = room.history?.length || 0;
    if (currentLen > prevHistoryLenRef.current) {
      const lastMove = room.history[room.history.length - 1];
      if (lastMove) {
        // Sound trigger
        if (lastMove.capturedCount > 0) {
          sounds.playCapture();
        } else {
          sounds.playMove();
        }
        if (lastMove.becameKing) {
          setTimeout(() => sounds.playKing(), 250);
        }

        // Notify if opponent moved
        if (lastMove.playerColor !== playerColor && playerColor !== 'spectator') {
          const oppName = opponent?.username || (isBotGame ? 'Bot AI' : 'Opponent');
          setMoveNotification(`🔔 ${oppName} made a move! It's your turn!`);
          const timer = setTimeout(() => setMoveNotification(null), 3500);
          prevHistoryLenRef.current = currentLen;
          return () => clearTimeout(timer);
        }
      }
      prevHistoryLenRef.current = currentLen;
    }
  }, [room.history?.length, playerColor, opponent?.username, isBotGame]);

  // Victory / Defeat sounds
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
    room.history && room.history.length > 0
      ? {
          from: room.history[room.history.length - 1].from,
          to: room.history[room.history.length - 1].to,
        }
      : null;

  const isLowTime = isMyTurn && timeLeft <= 30 && timeLeft > 0;

  return (
    <div className="w-full h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] flex flex-col justify-between p-1 sm:p-2.5 relative select-none overflow-hidden bg-slate-950">
      
      {/* Floating Animated Emoji Reaction Badge */}
      {latestEmojiReaction && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border-2 border-amber-400 px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 animate-bounce pointer-events-none">
          <span className="text-2xl">{latestEmojiReaction.emoji}</span>
          <span className="text-xs font-black text-amber-300">
            {latestEmojiReaction.sender}
          </span>
        </div>
      )}

      {/* Opponent Move Notification Toast */}
      {moveNotification && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-emerald-900/95 border border-emerald-500 text-emerald-100 font-black text-xs px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 animate-fade-in pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
          <span>{moveNotification}</span>
        </div>
      )}

      {/* TOP HEADER CONTROLS BAR */}
      <div className="flex items-center justify-between gap-2 bg-slate-900/95 border border-slate-800 px-2.5 sm:px-4 py-1.5 rounded-2xl shadow-xl shrink-0 z-30">
        
        {/* Left: Exit Table */}
        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs border border-slate-700 transition active:scale-95 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Exit Table</span>
          <span className="sm:hidden">Exit</span>
        </button>

        {/* Center: Turn Status, Turn Order & 15-Min Timer */}
        <div className="flex items-center gap-2 min-w-0">
          {room.status === 'waiting' ? (
            <div className="flex items-center gap-1.5 bg-amber-950/80 text-amber-300 font-black text-[11px] sm:text-xs px-3 py-1 rounded-full border border-amber-600/80 shadow animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>WAITING FOR OPPONENT TO JOIN TABLE...</span>
            </div>
          ) : room.status === 'playing' ? (
            isMyTurn ? (
              <div
                className={`flex items-center gap-1.5 font-black text-[11px] sm:text-xs px-3 py-1 rounded-full border shadow transition ${
                  isLowTime
                    ? 'bg-rose-950 text-rose-200 border-rose-500 animate-bounce'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-600 animate-pulse'
                }`}
              >
                {isLowTime ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                )}
                <span>
                  YOUR TURN ({myColor.toUpperCase()}) • {formatTime(timeLeft)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-950 text-slate-300 font-bold text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1 rounded-full border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="truncate max-w-[130px] sm:max-w-[180px]">
                  {room.currentTurn === 'red'
                    ? room.redPlayer?.username || 'Red'
                    : room.blackPlayer?.username || 'Black'}{' '}
                  ({formatTime(timeLeft)})
                </span>
              </div>
            )
          ) : (
            <div className="bg-amber-950 text-amber-300 font-black text-xs px-3 py-1 rounded-full border border-amber-700">
              {room.winner
                ? `Winner: ${room.winner.toUpperCase()} (${room.winner === 'red' ? room.redPlayer?.username : room.blackPlayer?.username})`
                : 'Match Ended'}
            </div>
          )}
        </div>

        {/* Right: Emoji Chat / Move Log / Delete Table / Resign */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* In-Game Emoji Chat Button */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-bold border transition active:scale-95 ${
              isChatOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                : 'bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-750'
            }`}
            title="Open Emoji Chat"
          >
            <Smile className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat</span>
            {gameChatMessages.length > 0 && (
              <span className="text-[10px] font-mono px-1 rounded-full bg-amber-400/20 text-amber-300">
                {gameChatMessages.length}
              </span>
            )}
          </button>

          {/* Delete Table button if owner or waiting */}
          {(room.status === 'waiting' || room.redPlayer?.id === currentUser.id) && onDeleteTable && (
            <button
              onClick={onDeleteTable}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs border border-rose-500 shadow-md shadow-rose-950/40 transition active:scale-95"
              title="Delete and close this Game Table"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete Table</span>
            </button>
          )}

          {/* Toggle Move History Log */}
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
            <span className="text-[10px] font-mono opacity-80">({room.history?.length || 0})</span>
          </button>

          {playerColor !== 'spectator' && room.status === 'playing' && (
            <button
              onClick={onResign}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold text-xs border border-rose-800 transition active:scale-95"
            >
              <Flag className="w-3 h-3" />
              <span className="hidden sm:inline">Resign</span>
            </button>
          )}
        </div>
      </div>

      {/* TURN ORDER & MATCH OVERVIEW STRIP */}
      <div className="flex items-center justify-between px-2.5 sm:px-4 py-1 bg-slate-900/80 border border-slate-800/80 rounded-xl my-1 text-[10px] sm:text-xs shrink-0 font-bold">
        {/* Red Player (1st to Move) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-black uppercase">
            👑 1st Move
          </span>
          <span className="text-slate-300 truncate max-w-[100px] sm:max-w-[160px]">
            {room.redPlayer?.username || 'Red Player'} (Red)
          </span>
        </div>

        {/* VS / Turn Timer Info */}
        <div className="flex items-center gap-1.5 text-amber-400 font-mono text-[10px] sm:text-xs">
          <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
          <span>15s Turn Clock</span>
        </div>

        {/* Black Player (2nd to Move) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-slate-300 truncate max-w-[100px] sm:max-w-[160px] text-right">
            {room.blackPlayer?.username || (isBotGame ? 'Checkers Bot' : 'Waiting...')} (Black)
          </span>
          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-black uppercase">
            ⚫ 2nd Move
          </span>
        </div>
      </div>

      {/* DISCONNECTION / NO INTERNET 15-SECOND COUNTDOWN WARNING BANNER */}
      {isOpponentDisconnected && room.status === 'playing' && (
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 text-white font-black text-xs py-1.5 px-3 rounded-xl shadow-lg border border-amber-400 flex items-center justify-center gap-2 animate-bounce shrink-0 z-30">
          <AlertTriangle className="w-4 h-4 text-amber-200 animate-spin" />
          <span>
            ⚠️ OPPONENT DISCONNECTED: 15s Countdown ({formatTime(timeLeft)}) to Victory! If they don't play, you win!
          </span>
        </div>
      )}

      {isMeDisconnected && room.status === 'playing' && (
        <div className="bg-rose-700 text-white font-black text-xs py-1.5 px-3 rounded-xl shadow-lg border border-rose-400 flex items-center justify-center gap-2 animate-pulse shrink-0 z-30">
          <AlertTriangle className="w-4 h-4 text-rose-200" />
          <span>
            ⚠️ CONNECTION LOST: Reconnect and make a move within {formatTime(timeLeft)} or match will be forfeited!
          </span>
        </div>
      )}

      {/* CRITICAL LOW-TIME WARNING BANNER (15s Turn limit) */}
      {!isOpponentDisconnected && !isMeDisconnected && isLowTime && (
        <div className="bg-rose-600 text-white font-black text-xs py-1 px-3 rounded-xl shadow-lg border border-rose-400 flex items-center justify-center gap-2 animate-bounce shrink-0 z-30">
          <AlertTriangle className="w-4 h-4" />
          <span>
            ⚠️ TIME RUNNING OUT: Only {formatTime(timeLeft)} remaining to execute your move!
          </span>
        </div>
      )}

      {/* MOBILE PORTRAIT COMPACT TOP BAR (< md screens) */}
      <div className="flex md:hidden items-center justify-between px-2.5 py-1 bg-slate-900/80 border border-slate-800/90 rounded-xl mb-1 text-xs shrink-0">
        {/* Opponent Info */}
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
            <span className="text-[9px] font-bold text-slate-400">
              {opponentColor === 'red' ? '1st Move (Red)' : '2nd Move (Black)'}
            </span>
          </div>
        </div>

        {/* Captured Counts Comparison */}
        <div className="flex items-center gap-2 font-mono text-[11px] font-black bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
          <span className="text-rose-400">🔴 {room.capturedBlack}/12</span>
          <span className="text-slate-600">vs</span>
          <span className="text-slate-300">⚫ {room.capturedRed}/12</span>
        </div>

        {/* User Info */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-right min-w-0">
            <div className="font-black text-slate-200 text-xs truncate max-w-[90px]">
              {currentUser.username}
            </div>
            <div className="text-[9px] text-amber-400 font-bold">
              {myColor === 'red' ? '1st Move (Red)' : '2nd Move (Black)'}
            </div>
          </div>
          <AvatarBadge
            avatarId={currentUser.avatarId || 'avatar-crown'}
            size="sm"
            color={myColor}
          />
        </div>
      </div>

      {/* MAIN ARENA (Checkers Board and Flanks) */}
      <div className="flex-1 flex flex-row items-center justify-center gap-1.5 sm:gap-3 overflow-hidden relative min-h-0">
        
        {/* LEFT COMPACT SLIM FLANK (Opponent / Bot AI) - Visible on md+ */}
        <div className="hidden md:flex w-24 sm:w-28 lg:w-32 h-full shrink-0 flex-col justify-between gap-1.5 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl shadow-xl overflow-hidden min-h-0">
          {/* Opponent Card */}
          <div
            className={`p-1.5 rounded-xl border transition text-center space-y-1 ${
              room.currentTurn === opponentColor
                ? 'bg-slate-950 border-amber-400 shadow-md shadow-amber-500/20 ring-1 ring-amber-400/50'
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
            
            {/* Turn Order Tag */}
            <div className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
              {opponentColor === 'red' ? '👑 1st (Red)' : '⚫ 2nd (Black)'}
            </div>

            {/* Pieces captured */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 text-[10px] font-bold flex items-center justify-between">
              <span className="text-slate-400">Captured:</span>
              <span className="text-amber-400 font-black">
                {opponentColor === 'red' ? room.capturedBlack : room.capturedRed}/12
              </span>
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

        {/* CENTER STAGE: CHECKERS BOARD */}
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
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px] flex items-center justify-center p-4 z-20">
              <div className="bg-slate-900/95 border-2 border-amber-500/80 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
                  <span className="w-4 h-4 rounded-full bg-amber-400 animate-ping" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-black text-white">Table Created & Waiting</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    This game table is active in the lobby. Waiting for an opponent to accept or join...
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

          {/* Match Ended / Victory / Timeout Overlay */}
          {room.status === 'ended' && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-fade-in">
              <div className="bg-slate-900 border-2 border-amber-500/90 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl relative overflow-hidden">
                <div
                  className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-xl ${
                    room.winner === playerColor
                      ? 'bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 shadow-amber-500/30'
                      : room.winner === 'draw'
                      ? 'bg-slate-800 text-slate-300 border border-slate-700'
                      : 'bg-rose-950 border border-rose-700 text-rose-300'
                  }`}
                >
                  {room.winner === playerColor ? (
                    <Trophy className="w-8 h-8 font-black animate-bounce" />
                  ) : room.winner === 'draw' ? (
                    <Clock className="w-8 h-8 text-slate-300" />
                  ) : (
                    <Crown className="w-8 h-8 text-amber-400" />
                  )}
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-xl font-black text-white">
                    {room.winner === playerColor
                      ? '🎉 VICTORY!'
                      : room.winner === 'draw'
                      ? '🤝 MATCH DRAW'
                      : 'MATCH COMPLETED'}
                  </h3>
                  <p className="text-xs text-amber-300 font-bold leading-relaxed px-2">
                    {room.winReason ||
                      (room.winner === playerColor
                        ? 'Congratulations! You won the checkers match.'
                        : room.winner
                        ? `${room.winner.toUpperCase()} player won the match.`
                        : 'Game concluded.')}
                  </p>
                </div>

                {/* Pot or Stakes Details */}
                {(room.stakeAmount || 0) > 0 && (
                  <div className="p-3 rounded-2xl bg-amber-950/50 border border-amber-500/40 text-center space-y-1">
                    <span className="text-[11px] font-bold text-amber-300">
                      {room.winner === playerColor
                        ? '💰 Pot Prize Credited to Your Wallet:'
                        : '💰 Match Pot:'}
                    </span>
                    <div className="text-lg font-black text-emerald-400">
                      +{(room.potAmount || (room.stakeAmount || 0) * 2).toLocaleString()} UGX
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={onLeaveRoom}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Return to Lobby</span>
                  </button>
                </div>
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
                ? 'bg-slate-950 border-amber-400 shadow-md shadow-amber-500/20 ring-1 ring-amber-400/50'
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
            
            {/* Turn Order Tag */}
            <div className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-amber-300">
              {myColor === 'red' ? '👑 1st (Red)' : '⚫ 2nd (Black)'}
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
              <span>#{room.history?.length || 0}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pt-1 custom-scrollbar min-h-0 text-[10px]">
              {!room.history || room.history.length === 0 ? (
                <div className="text-[9px] text-slate-500 text-center py-2 italic">
                  No moves
                </div>
              ) : (
                room.history.slice(-6).map((m) => (
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

      {/* BOTTOM QUICK EMOJI REACTS BAR (< md screens and quick bar) */}
      <div className="flex items-center justify-between gap-1 px-2 py-1 bg-slate-900/90 border border-slate-800 rounded-xl shrink-0 mt-1">
        <span className="text-[10px] font-black text-amber-400 hidden sm:inline">
          Quick Emojis:
        </span>
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5 flex-1">
          {REACTION_EMOJIS.slice(0, 10).map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => handleEmojiClick(emoji)}
              className="p-1 text-sm sm:text-base bg-slate-950 hover:bg-amber-500/20 rounded-lg border border-slate-800 hover:scale-110 transition active:scale-90 shrink-0"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* IN-GAME EMOJI CHAT MODAL / DRAWER */}
      {isChatOpen && (
        <div className="absolute inset-x-2 sm:inset-x-auto sm:right-6 bottom-14 z-50 w-auto sm:w-80 shadow-2xl animate-fade-in">
          <EmojiChatPanel
            title="Opponent Emoji Chat"
            messages={gameChatMessages}
            onSendEmoji={handleEmojiClick}
            heightClass="h-[360px]"
          />
        </div>
      )}

      {/* OVERLAY MOVE LOG DRAWER */}
      {isMoveLogOpen && (
        <div className="absolute bottom-14 right-2 sm:right-6 z-40 w-72 max-w-[90vw] bg-slate-900/95 border-2 border-slate-700 rounded-2xl p-3 shadow-2xl backdrop-blur-md animate-fade-in space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
              <History className="w-3.5 h-3.5" />
              <span>Full Move History ({room.history?.length || 0})</span>
            </div>
            <button
              onClick={() => setIsMoveLogOpen(false)}
              className="text-slate-400 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded bg-slate-800"
            >
              &times;
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {!room.history || room.history.length === 0 ? (
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
