import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: { value: number; positive: boolean };
  className?: string;
  iconClassName?: string;
}

export function StatCard({ title, value, icon: Icon, description, trend, className, iconClassName }: StatCardProps) {
  return (
    <div className={cn('stat-card p-4 sm:p-6', className)}>
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">{title}</p>
          <p className="text-xl sm:text-2xl font-bold mt-1 leading-none">{value}</p>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-tight">{description}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs sm:text-sm font-medium mt-1 leading-tight',
              trend.positive ? 'text-success' : 'text-destructive'
            )}>
              {trend.positive ? '+' : ''}{trend.value}% from last week
            </p>
          )}
        </div>
        <div className={cn(
          'w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0',
          iconClassName || 'bg-primary/10'
        )}>
          <Icon className={cn('w-5 h-5 sm:w-6 sm:h-6', iconClassName ? 'text-current' : 'text-primary')} />
        </div>
      </div>
    </div>
  );
}
