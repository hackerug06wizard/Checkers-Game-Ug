import React, { useState } from 'react';
import { UserProfile, GameRoom, ChatMessage } from '../types';
import { AvatarBadge } from './AvatarBadge';
import { EmojiChatPanel } from './EmojiChatPanel';
import {
  Users,
  Swords,
  Bot,
  PlusCircle,
  MessageSquare,
  Send,
  Eye,
  Trophy,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface OnlineLobbyProps {
  currentUser: UserProfile;
  onlineUsers: UserProfile[];
  gameRooms: GameRoom[];
  chatMessages: ChatMessage[];
  onSendChallenge: (targetUserId: string) => void;
  onCreateCustomGame: (vsBot: boolean) => void;
  onJoinGameRoom: (roomId: string) => void;
  onSendChatMessage: (text: string) => void;
  onOpenLeaderboard: () => void;
}

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  currentUser,
  onlineUsers,
  gameRooms,
  chatMessages,
  onSendChallenge,
  onCreateCustomGame,
  onJoinGameRoom,
  onSendChatMessage,
  onOpenLeaderboard,
}) => {
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'players' | 'rooms' | 'chat'>('players');

  // Filter out self from online players list
  const otherOnlinePlayers = onlineUsers.filter((u) => u.id !== currentUser.id);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChatMessage(chatInput);
    setChatInput('');
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Banner / Play Action Bar */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" /> Real-time Online Matches
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome, <span className="text-amber-400">{currentUser.username}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-lg">
              Challenge online players to a match, create a public table, or practice your skills against the Checkers AI Bot.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full md:w-auto">
            {/* Play vs Bot */}
            <button
              onClick={() => onCreateCustomGame(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm border border-slate-700 shadow-md transition transform active:scale-95"
            >
              <Bot className="w-5 h-5 text-amber-400" />
              <span>Practice vs Bot</span>
            </button>

            {/* Create Public Table */}
            <button
              onClick={() => onCreateCustomGame(false)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/40 transition transform active:scale-95"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Create Game Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Online Players List (2 columns on lg) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section Header with Tabs on Mobile */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-extrabold text-white">Online Players</h3>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 text-xs font-bold border border-slate-700">
                {otherOnlinePlayers.length}
              </span>
            </div>

            <button
              onClick={onOpenLeaderboard}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition"
            >
              <Trophy className="w-4 h-4" /> View Leaderboard
            </button>
          </div>

          {/* Online Users Cards Grid */}
          {otherOnlinePlayers.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-3">
              <Users className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm font-medium">
                No other players are currently online in the arena.
              </p>
              <p className="text-slate-500 text-xs">
                You can start a practice match vs Bot or open a new browser tab to test multiplayer!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {otherOnlinePlayers.map((player) => (
                <div
                  key={player.id}
                  className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between hover:border-slate-700 transition shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <AvatarBadge
                      avatarId={player.avatarId}
                      size="md"
                      showStatus
                      status={player.status}
                    />
                    <div>
                      <div className="text-sm font-extrabold text-slate-100 flex items-center gap-2">
                        {player.username}
                      </div>
                      <div className="text-xs text-amber-400 font-semibold flex items-center gap-2">
                        <span>{player.rating} ELO</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400">
                          {player.wins}W / {player.losses}L
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onSendChallenge(player.id)}
                    disabled={player.status === 'in-game'}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow ${
                      player.status === 'in-game'
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-95'
                    }`}
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>{player.status === 'in-game' ? 'In Match' : 'Challenge'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Active Game Tables Section */}
          <div className="pt-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <Swords className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-extrabold text-white">Active Game Tables</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 text-xs font-bold border border-slate-700">
                  {gameRooms.length}
                </span>
              </div>
            </div>

            {gameRooms.length === 0 ? (
              <div className="p-6 text-center bg-slate-900/60 border border-slate-800/80 rounded-2xl text-slate-400 text-xs font-medium">
                No active game rooms right now. Create one above to get started!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {gameRooms.map((room) => (
                  <div
                    key={room.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-extrabold text-slate-200 truncate">
                        {room.name}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          room.status === 'waiting'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : room.status === 'playing'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {room.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-around bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/60 text-xs">
                      <div className="text-center font-bold text-rose-400">
                        {room.redPlayer ? room.redPlayer.username : 'Waiting...'}
                      </div>
                      <span className="text-slate-600 font-extrabold text-xs">VS</span>
                      <div className="text-center font-bold text-slate-300">
                        {room.blackPlayer ? room.blackPlayer.username : 'Waiting...'}
                      </div>
                    </div>

                    <button
                      onClick={() => onJoinGameRoom(room.id)}
                      className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-2"
                    >
                      {room.status === 'waiting' && !room.blackPlayer ? (
                        <>
                          <Swords className="w-3.5 h-3.5 text-amber-400" /> Join as Black
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-amber-400" /> Watch Match
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Global Arena Emoji Chat */}
        <EmojiChatPanel
          title="Lobby Emoji Chat"
          messages={chatMessages}
          onSendEmoji={(emoji) => onSendChatMessage(emoji)}
          heightClass="h-[520px]"
        />
      </div>
    </div>
  );
};
