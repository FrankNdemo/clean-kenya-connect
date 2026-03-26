import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

type EventCoverMediaProps = {
  src?: string | null;
  alt: string;
  className?: string;
  children?: ReactNode;
  fallbackIcon?: LucideIcon;
};

export function EventCoverMedia({
  src,
  alt,
  className,
  children,
  fallbackIcon: FallbackIcon = Calendar,
}: EventCoverMediaProps) {
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-primary/20 via-secondary/20 to-success/20', className)}>
      {src ? (
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 via-secondary/25 to-success/20">
          <FallbackIcon className="h-12 w-12 text-primary/90" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent" />
      {children}
    </div>
  );
}
