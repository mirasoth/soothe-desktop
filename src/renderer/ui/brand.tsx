import logoUrl from '../assets/logo.png';
import { cn } from '../lib/utils.js';

interface BrandMarkProps {
  /** Pixel size of the logo square. Wordmark scales with it. */
  size?: number;
  /** When false, render logo only (e.g. for compact toolbars). */
  showWordmark?: boolean;
  className?: string;
}

export function BrandMark({
  size = 20,
  showWordmark = true,
  className,
}: BrandMarkProps): React.ReactElement {
  return (
    <span className={cn('inline-flex items-center gap-2 select-none', className)}>
      <img
        src={logoUrl}
        alt="Soothe"
        width={size}
        height={size}
        draggable={false}
        className="flex-none"
      />
      {showWordmark ? (
        <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.8 }}>
          Soothe
        </span>
      ) : null}
    </span>
  );
}
