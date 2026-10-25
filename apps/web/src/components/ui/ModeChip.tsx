import React from 'react';
import type { Mode } from '@pocketroute/shared';
import {
  Footprints,
  TrainFront,
  Bus as BusIcon,
  Car,
  Navigation,
} from 'lucide-react';

export type ModeVariant = Mode | 'METRO_PURPLE' | 'METRO_AQUA';

export interface ModeChipProps {
  mode: ModeVariant;
  label?: string;
  iconOnly?: boolean;
  className?: string;
}

export const ModeChip: React.FC<ModeChipProps> = ({
  mode,
  label,
  iconOnly = false,
  className = '',
}) => {
  const getModeConfig = () => {
    switch (mode) {
      case 'METRO':
      case 'METRO_PURPLE':
        return {
          label: label ?? 'Purple Line',
          colorVar: 'var(--metro-purple)',
          bgColor: 'rgba(124, 58, 237, 0.12)',
          icon: <TrainFront className="w-3.5 h-3.5" aria-hidden="true" />,
        };
      case 'METRO_AQUA':
        return {
          label: label ?? 'Aqua Line',
          colorVar: 'var(--metro-aqua)',
          bgColor: 'rgba(8, 145, 178, 0.12)',
          icon: <TrainFront className="w-3.5 h-3.5" aria-hidden="true" />,
        };
      case 'BUS':
        return {
          label: label ?? 'PMPML Bus',
          colorVar: 'var(--bus)',
          bgColor: 'rgba(5, 150, 105, 0.12)',
          icon: <BusIcon className="w-3.5 h-3.5" aria-hidden="true" />,
        };
      case 'AUTO':
        return {
          label: label ?? 'Auto',
          colorVar: 'var(--auto)',
          bgColor: 'rgba(217, 119, 6, 0.12)',
          icon: <Navigation className="w-3.5 h-3.5" aria-hidden="true" />,
        };
      case 'CAB':
        return {
          label: label ?? 'Cab',
          colorVar: 'var(--cab)',
          bgColor: 'rgba(79, 70, 229, 0.12)',
          icon: <Car className="w-3.5 h-3.5" aria-hidden="true" />,
        };
      case 'WALK':
      default:
        return {
          label: label ?? 'Walk',
          colorVar: 'var(--walk)',
          bgColor: 'rgba(2, 132, 199, 0.12)',
          icon: <Footprints className="w-3.5 h-3.5" aria-hidden="true" />,
        };
    }
  };

  const config = getModeConfig();

  return (
    <span
      style={{
        backgroundColor: config.bgColor,
        color: 'var(--ink)',
      }}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium select-none border border-black/[0.04] dark:border-white/[0.08] ${className}`}
      title={config.label}
    >
      <span
        style={{ color: config.colorVar }}
        className="shrink-0 flex items-center justify-center"
      >
        {config.icon}
      </span>
      {!iconOnly && <span className="truncate">{config.label}</span>}
    </span>
  );
};
