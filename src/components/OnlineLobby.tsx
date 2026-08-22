import React from 'react';
import { UserProfile, GameRoom } from '../types';
import { AvatarBadge } from './AvatarBadge';
import {
  Users,
  Swords,
  Bot,
  PlusCircle,
  Eye,
  Trophy,
  Flame,
  Settings,
} from 'lucide-react';

interface OnlineLobbyProps {
  currentUser: UserProfile;
  onlineUsers: UserProfile[];
  gameRooms: GameRoom[];
  onSendChallenge: (targetUserId: string) => void;
  onCreateCustomGame: (vsBot: boolean) => void;
  onJoinGameRoom: (roomId: string) => void;
  onOpenLeaderboard: () => void;
  onOpenSettings: () => void;
}

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  currentUser,
  onlineUsers,
  gameRooms,
  onSendChallenge,
  onCreateCustomGame,
  onJoinGameRoom,
  onOpenLeaderboard,
  onOpenSettings,
}) => {
  // Filter out self from online players list
  const otherOnlinePlayers = onlineUsers.filter((u) => u.id !== currentUser.id);

  return (
    <div className="w-full max-w-7xl mx-auto h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] p-2.5 sm:p-4 flex flex-col justify-between gap-3 overflow-hidden select-none">
      {/* Top Banner / Play Action Bar */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border border-slate-800 p-3 sm:p-4 shadow-xl shrink-0">
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="space-y-0.5 text-center sm:text-left min-w-0">
            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight truncate">
              Welcome, <span className="text-amber-400">{currentUser.username}</span>
            </h2>
            <p className="text-xs text-slate-400 truncate max-w-md hidden sm:block">
              Challenge online players, host a game table, or practice with the AI Bot.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            {/* Play vs Bot */}
            <button
              onClick={() => onCreateCustomGame(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-100 font-bold text-xs border border-slate-700 shadow-md transition transform active:scale-95"
            >
              <Bot className="w-4 h-4 text-amber-400" />
              <span>Practice vs Bot</span>
            </button>

            {/* Create Public Table */}
            <button
              onClick={() => onCreateCustomGame(false)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-950/40 transition transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Table</span>
            </button>

            {/* Settings Panel Button */}
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-center p-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-300 hover:text-amber-400 border border-slate-700/80 transition active:scale-95 shadow"
              title="Game Settings (Themes, Audio, Account)"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Online Players & Active Game Tables (Static, non-scrolling container with internal smooth lists) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0 overflow-hidden">
        {/* Left Column: Online Players List */}
        <div className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-lg overflow-hidden min-h-0">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm sm:text-base font-black text-white">Online Players</h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 text-[10px] font-bold border border-slate-700">
                {otherOnlinePlayers.length}
              </span>
            </div>

            <button
              onClick={onOpenLeaderboard}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition"
            >
              <Trophy className="w-3.5 h-3.5" /> Leaderboard
            </button>
          </div>

          {/* Online Users List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 py-2 min-h-0 pr-1">
            {otherOnlinePlayers.length === 0 ? (
              <div className="py-8 text-center space-y-2 flex flex-col items-center justify-center h-full">
                <Users className="w-8 h-8 text-slate-600" />
                <p className="text-slate-400 text-xs font-medium">
                  No other players are currently online in the arena.
                </p>
              </div>
            ) : (
              otherOnlinePlayers.map((player) => (
                <div
                  key={player.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AvatarBadge
                      avatarId={player.avatarId}
                      size="sm"
                      showStatus
                      status={player.status}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-100 truncate">
                        {player.username}
                      </div>
                      <div className="text-[10px] text-amber-400 font-semibold flex items-center gap-1.5">
                        <span>{player.rating || player.elo || 1200} ELO</span>
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
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition shadow ${
                      player.status === 'in-game'
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-95'
                    }`}
                  >
                    <Swords className="w-3 h-3" />
                    <span>{player.status === 'in-game' ? 'In Match' : 'Challenge'}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Active Game Tables */}
        <div className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-lg overflow-hidden min-h-0">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm sm:text-base font-black text-white">Active Game Tables</h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-rose-400 text-[10px] font-bold border border-slate-700">
                {gameRooms.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 py-2 min-h-0 pr-1">
            {gameRooms.length === 0 ? (
              <div className="py-8 text-center space-y-2 flex flex-col items-center justify-center h-full">
                <Swords className="w-8 h-8 text-slate-600" />
                <p className="text-slate-400 text-xs font-medium">
                  No active game tables right now.
                </p>
              </div>
            ) : (
              gameRooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-black text-slate-200 truncate">
                      {room.name}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
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

                  <div className="flex items-center justify-around bg-slate-900/90 py-1.5 px-3 rounded-lg border border-slate-800/80 text-xs">
                    <div className="text-center font-bold text-rose-400 text-xs truncate max-w-[40%]">
                      {room.redPlayer ? room.redPlayer.username : 'Waiting...'}
                    </div>
                    <span className="text-slate-600 font-extrabold text-[10px]">VS</span>
                    <div className="text-center font-bold text-slate-300 text-xs truncate max-w-[40%]">
                      {room.blackPlayer ? room.blackPlayer.username : 'Waiting...'}
                    </div>
                  </div>

                  <button
                    onClick={() => onJoinGameRoom(room.id)}
                    className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-1.5"
                  >
                    {room.status === 'waiting' && !room.blackPlayer ? (
                      <>
                        <Swords className="w-3.5 h-3.5 text-amber-400" /> Join Table
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-amber-400" /> Spectate
                      </>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
