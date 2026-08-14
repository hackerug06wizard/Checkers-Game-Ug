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
  Sparkles,
  Flame,
} from 'lucide-react';

interface OnlineLobbyProps {
  currentUser: UserProfile;
  onlineUsers: UserProfile[];
  gameRooms: GameRoom[];
  onSendChallenge: (targetUserId: string) => void;
  onCreateCustomGame: (vsBot: boolean) => void;
  onJoinGameRoom: (roomId: string) => void;
  onOpenLeaderboard: () => void;
}

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  currentUser,
  onlineUsers,
  gameRooms,
  onSendChallenge,
  onCreateCustomGame,
  onJoinGameRoom,
  onOpenLeaderboard,
}) => {
  // Filter out self from online players list
  const otherOnlinePlayers = onlineUsers.filter((u) => u.id !== currentUser.id);

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-5 space-y-4">
      {/* Banner / Play Action Bar */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 border border-slate-800 p-4 sm:p-6 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" /> Real-time Online Matches
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Welcome, <span className="text-amber-400">{currentUser.username}</span>
            </h2>
            <p className="text-xs text-slate-400 max-w-xl">
              Challenge online players to a match, host a custom game table, or sharpen your skills against the Checkers AI Bot.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto">
            {/* Play vs Bot */}
            <button
              onClick={() => onCreateCustomGame(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs sm:text-sm border border-slate-700 shadow-md transition transform active:scale-95"
            >
              <Bot className="w-4 h-4 text-amber-400" />
              <span>Practice vs Bot</span>
            </button>

            {/* Create Public Table */}
            <button
              onClick={() => onCreateCustomGame(false)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-950/40 transition transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Game Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Online Players & Active Game Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Online Players List */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-amber-400" />
              <h3 className="text-base font-extrabold text-white">Online Players</h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 text-[11px] font-bold border border-slate-700">
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
          <div className="min-h-[220px] max-h-[360px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {otherOnlinePlayers.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-xs font-medium">
                  No other players are currently online in the arena.
                </p>
                <p className="text-slate-500 text-[11px]">
                  Start a practice match vs the AI Bot or open another tab to test multiplayer!
                </p>
              </div>
            ) : (
              otherOnlinePlayers.map((player) => (
                <div
                  key={player.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AvatarBadge
                      avatarId={player.avatarId}
                      size="sm"
                      showStatus
                      status={player.status}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-100 truncate">
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow ${
                      player.status === 'in-game'
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-95'
                    }`}
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>{player.status === 'in-game' ? 'In Match' : 'Challenge'}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Active Game Tables */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-rose-400" />
              <h3 className="text-base font-extrabold text-white">Active Game Tables</h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-rose-400 text-[11px] font-bold border border-slate-700">
                {gameRooms.length}
              </span>
            </div>
          </div>

          <div className="min-h-[220px] max-h-[360px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {gameRooms.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Swords className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-xs font-medium">
                  No active game tables right now.
                </p>
                <p className="text-slate-500 text-[11px]">
                  Click &quot;Create Game Table&quot; above to host a new game table!
                </p>
              </div>
            ) : (
              gameRooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-extrabold text-slate-200 truncate">
                      {room.name}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
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
                        <Swords className="w-3.5 h-3.5 text-amber-400" /> Join as Black
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-amber-400" /> Watch Match
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
