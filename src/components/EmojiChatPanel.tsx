import React from 'react';
import { Smile, MessageSquare, Send } from 'lucide-react';
import { ChatMessage } from '../types';
import { AvatarBadge } from './AvatarBadge';

const EMOJI_LIST = [
  '👑', '🎯', '🔥', '👏', '🏆', '😂', '😮', '🍿', '⚔️', '🧠',
  '🏁', '💣', '🚀', '🤖', '👊', '🎲', '💯', '🤝', '🏅', '💥',
  '⚡', '🤩', '🤐', '🥳', '💀', '🛡️', '⏳', '👋', '😎', '🎉',
  '💪', '👍', '👎', '❤️', '😱', '🧐', '😴', '😜', '👻', '🤡'
];

interface EmojiChatPanelProps {
  title?: string;
  messages: ChatMessage[];
  onSendEmoji: (emoji: string) => void;
  heightClass?: string;
}

export const EmojiChatPanel: React.FC<EmojiChatPanelProps> = ({
  title = 'In-Game Emoji Chat',
  messages,
  onSendEmoji,
  heightClass = 'h-[320px]',
}) => {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col ${heightClass} shadow-xl`}>
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <h3 className="text-xs font-extrabold text-white flex items-center gap-2">
          <Smile className="w-4 h-4 text-amber-400" /> {title}
        </h3>
        <span className="text-[10px] text-amber-400/90 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
          Emoji Only Chat
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar mb-2">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] text-slate-500 text-center px-4">
            Tap any emoji below to express yourself!
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className="bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AvatarBadge avatarId={msg.avatarId} size="sm" />
                <span className="font-bold text-amber-300 text-xs truncate">
                  {msg.senderName}:
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black shrink-0 tracking-widest animate-bounce">
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Emoji Picker Grid - NO Letters Input */}
      <div className="space-y-1 pt-2 border-t border-slate-800">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span>Tap to send emoji:</span>
        </div>
        <div className="grid grid-cols-10 sm:grid-cols-10 gap-1 max-h-24 overflow-y-auto p-1 bg-slate-950 rounded-2xl border border-slate-800/80 custom-scrollbar">
          {EMOJI_LIST.map((emoji, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSendEmoji(emoji)}
              className="h-8 w-8 text-base flex items-center justify-center rounded-lg bg-slate-900 hover:bg-amber-500/20 hover:scale-125 transition active:scale-95 border border-slate-800/60"
              title={`Send ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
