import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  variant?: 'full' | 'icon';
}

export function BrandLogo({ className, variant = 'full' }: BrandLogoProps) {
  return (
    <img
      src={variant === 'icon' ? '/mtaka-logo-icon.png' : '/mtaka-logo.png'}
      alt="M-Taka"
      className={cn('block object-contain', className)}
      draggable={false}
    />
  );
}
