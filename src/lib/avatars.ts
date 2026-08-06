import { AvatarOption } from '../types';

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: 'avatar-crown',
    name: 'Royal Crown',
    bgGradient: 'from-amber-500 to-yellow-600',
    accentColor: '#f59e0b',
    iconSvg: 'crown',
  },
  {
    id: 'avatar-knight',
    name: 'Emerald Knight',
    bgGradient: 'from-emerald-500 to-teal-700',
    accentColor: '#10b981',
    iconSvg: 'shield',
  },
  {
    id: 'avatar-ruby',
    name: 'Ruby Monarch',
    bgGradient: 'from-rose-600 to-red-800',
    accentColor: '#e11d48',
    iconSvg: 'gem',
  },
  {
    id: 'avatar-sapphire',
    name: 'Sapphire King',
    bgGradient: 'from-blue-600 to-indigo-800',
    accentColor: '#2563eb',
    iconSvg: 'sword',
  },
  {
    id: 'avatar-cyber',
    name: 'Cyber Checker',
    bgGradient: 'from-purple-600 to-violet-900',
    accentColor: '#8b5cf6',
    iconSvg: 'zap',
  },
];

export function getAvatarById(id: string): AvatarOption {
  return AVATAR_OPTIONS.find((a) => a.id === id) || AVATAR_OPTIONS[0];
}

