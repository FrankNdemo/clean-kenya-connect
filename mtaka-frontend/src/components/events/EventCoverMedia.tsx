import { useEffect, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Calendar } from 'lucide-react';
import { resolveEventCoverUrl } from '@/lib/eventMedia';
import { cn } from '@/lib/utils';

type EventCoverMediaProps = {
  src?: string | null;
  alt: string;
  className?: string;
  children?: ReactNode;
  fallbackIcon?: LucideIcon;
  loading?: 'eager' | 'lazy';
};

export function EventCoverMedia({
  src,
  alt,
  className,
  children,
  fallbackIcon: FallbackIcon = Calendar,
  loading = 'lazy',
}: EventCoverMediaProps) {
  const resolvedSrc = resolveEventCoverUrl(src);
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [resolvedSrc]);

  return (
    <div className={cn('relative isolate overflow-hidden bg-gradient-to-br from-primary/20 via-secondary/20 to-success/20', className)}>
      {resolvedSrc && !hasImageError ? (
        <img
          src={resolvedSrc}
          alt={alt}
          className="absolute inset-0 z-0 h-full w-full object-cover"
          loading={loading}
          decoding="async"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-gradient-to-br from-primary/20 via-secondary/25 to-success/20">
          <FallbackIcon className="h-12 w-12 text-primary/90" />
        </div>
      )}
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-background/30 via-transparent to-transparent" />
      {children ? <div className="absolute inset-0 z-20">{children}</div> : null}
    </div>
  );
}
