import React from 'react';

export const AppLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  }[size];

  return (
    <div
      className={`${sizeClasses} relative rounded-xl bg-gradient-to-br from-amber-400 via-rose-600 to-slate-950 p-[1.5px] shadow-lg shadow-amber-500/20 shrink-0 group flex items-center justify-center`}
    >
      <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center overflow-hidden relative">
        {/* Subtle checkered grid background */}
        <div className="absolute inset-0 opacity-25 grid grid-cols-4 grid-rows-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className={(Math.floor(i / 4) + (i % 4)) % 2 === 0 ? 'bg-amber-400/20' : 'bg-rose-500/20'}
            />
          ))}
        </div>

        {/* Crown & King Piece Emblem */}
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-4/5 h-4/5 relative z-10 drop-shadow-[0_2px_8px_rgba(245,158,11,0.6)] transition-transform duration-300 group-hover:scale-110"
        >
          <defs>
            <linearGradient id="crownGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
            <linearGradient id="pieceRed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F43F5E" />
              <stop offset="100%" stopColor="#881337" />
            </linearGradient>
          </defs>

          {/* King Checkers Base Disc */}
          <circle cx="24" cy="27" r="15" fill="url(#pieceRed)" stroke="#FDA4AF" strokeWidth="1.5" />
          <circle cx="24" cy="27" r="11" fill="none" stroke="#FDE68A" strokeWidth="1" strokeDasharray="3 2" />

          {/* Royal Crown Crest */}
          <path
            d="M13 29L16 16L24 22L32 16L35 29H13Z"
            fill="url(#crownGold)"
            stroke="#FEF3C7"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="15" r="2" fill="#FEF3C7" />
          <circle cx="24" cy="14" r="2.5" fill="#FEF3C7" />
          <circle cx="32" cy="15" r="2" fill="#FEF3C7" />

          {/* Center Gem */}
          <circle cx="24" cy="25" r="2" fill="#FFFFFF" opacity="0.9" />
        </svg>
      </div>
    </div>
  );
};
