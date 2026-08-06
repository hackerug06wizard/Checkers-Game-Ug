import React from 'react';
import { getAvatarById } from '../lib/avatars';
import {
  Crown,
  Shield,
  Gem,
  Swords,
  Zap,
  Flame,
  Target,
  Star,
  Award,
  Trophy,
} from 'lucide-react';

interface AvatarBadgeProps {
  avatarId: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  status?: 'online' | 'in-game' | 'away';
  className?: string;
}

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  avatarId,
  size = 'md',
  showStatus = false,
  status = 'online',
  className = '',
}) => {
  const avatar = getAvatarById(avatarId);

  const renderIcon = () => {
    const iconProps = { className: 'text-white drop-shadow-sm' };
    switch (avatar.iconSvg) {
      case 'crown':
        return <Crown {...iconProps} size={getIconSize()} />;
      case 'shield':
        return <Shield {...iconProps} size={getIconSize()} />;
      case 'gem':
        return <Gem {...iconProps} size={getIconSize()} />;
      case 'sword':
        return <Swords {...iconProps} size={getIconSize()} />;
      case 'zap':
        return <Zap {...iconProps} size={getIconSize()} />;
      case 'flame':
        return <Flame {...iconProps} size={getIconSize()} />;
      case 'target':
        return <Target {...iconProps} size={getIconSize()} />;
      case 'star':
        return <Star {...iconProps} size={getIconSize()} />;
      case 'award':
        return <Award {...iconProps} size={getIconSize()} />;
      case 'trophy':
        return <Trophy {...iconProps} size={getIconSize()} />;
      default:
        return <Crown {...iconProps} size={getIconSize()} />;
    }
  };

  function getDimensions() {
    switch (size) {
      case 'sm':
        return 'w-8 h-8 rounded-full text-xs';
      case 'md':
        return 'w-11 h-11 rounded-xl text-sm';
      case 'lg':
        return 'w-16 h-16 rounded-2xl text-base';
      case 'xl':
        return 'w-24 h-24 rounded-3xl text-lg';
    }
  }

  function getIconSize() {
    switch (size) {
      case 'sm':
        return 16;
      case 'md':
        return 22;
      case 'lg':
        return 32;
      case 'xl':
        return 48;
    }
  }

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <div
        className={`bg-gradient-to-br ${avatar.bgGradient} flex items-center justify-center shadow-md ring-2 ring-white/10 ${getDimensions()}`}
      >
        {renderIcon()}
      </div>

      {showStatus && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-slate-900 ${
            size === 'sm' ? 'w-2.5 h-2.5' : size === 'md' ? 'w-3.5 h-3.5' : 'w-4 h-4'
          } ${
            status === 'online'
              ? 'bg-emerald-500'
              : status === 'in-game'
              ? 'bg-amber-500'
              : 'bg-slate-500'
          }`}
          title={`Status: ${status}`}
        />
      )}
    </div>
  );
};
