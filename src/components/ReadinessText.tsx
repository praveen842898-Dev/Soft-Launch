import { CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { ReadinessLabel } from '../types/softlaunch';

interface ReadinessTextProps {
  label: ReadinessLabel;
  size?: 'sm' | 'md' | 'lg';
}

export function ReadinessText({ label, size = 'md' }: ReadinessTextProps) {
  const config: Record<
    ReadinessLabel,
    { colorClass: string; Icon: typeof CheckCircle2 }
  > = {
    'Ready to launch': {
      colorClass: 'text-[#157A5E]',
      Icon: CheckCircle2,
    },
    'Almost there': {
      colorClass: 'text-[#B86B11]',
      Icon: Sparkles,
    },
    'Not ready yet': {
      colorClass: 'text-[#5A6270]',
      Icon: Clock,
    },
  };

  const { colorClass, Icon } = config[label] || config['Not ready yet'];
  const textSize =
    size === 'lg' ? 'text-base font-semibold' : size === 'sm' ? 'text-xs font-medium' : 'text-sm font-semibold';
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 14 : 16;

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${colorClass} ${textSize}`}>
      <Icon size={iconSize} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
