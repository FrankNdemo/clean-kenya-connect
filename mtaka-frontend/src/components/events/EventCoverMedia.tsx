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
  deferLoad?: boolean;
  deferDelayMs?: number;
};

export function EventCoverMedia({
  src,
  alt,
  className,
  children,
  fallbackIcon: FallbackIcon = Calendar,
  loading = 'lazy',
  deferLoad = true,
  deferDelayMs = 120,
}: EventCoverMediaProps) {
  const resolvedSrc = resolveEventCoverUrl(src);
  const [hasImageError, setHasImageError] = useState(false);
  const [shouldLoadImage, setShouldLoadImage] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  useEffect(() => {
    setHasImageError(false);
    setIsImageLoaded(false);

    if (!resolvedSrc) {
      setShouldLoadImage(false);
      return;
    }

    if (!deferLoad || loading === 'eager') {
      setShouldLoadImage(true);
      return;
    }

    setShouldLoadImage(false);
    const timerId = window.setTimeout(() => {
      setShouldLoadImage(true);
    }, deferDelayMs);

    return () => window.clearTimeout(timerId);
  }, [resolvedSrc, deferLoad, deferDelayMs, loading]);

  const showFallback = !resolvedSrc || hasImageError || !shouldLoadImage || !isImageLoaded;

  return (
    <div className={cn('relative isolate overflow-hidden bg-gradient-to-br from-primary/20 via-secondary/20 to-success/20', className)}>
      {resolvedSrc && !hasImageError && shouldLoadImage ? (
        <img
          src={resolvedSrc}
          alt={alt}
          className={cn(
            'absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-300',
            isImageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          loading={loading}
          decoding="async"
          fetchPriority={loading === 'eager' ? 'high' : 'low'}
          onLoad={() => setIsImageLoaded(true)}
          onError={() => setHasImageError(true)}
        />
      ) : null}
      {showFallback ? (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-gradient-to-br from-primary/20 via-secondary/25 to-success/20">
          <FallbackIcon className="h-12 w-12 text-primary/90" />
        </div>
      ) : null}
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-background/30 via-transparent to-transparent" />
      {children ? <div className="absolute inset-0 z-20">{children}</div> : null}
    </div>
  );
}
