import { type BackendEvent } from '@/api';

type Props = {
  change?: BackendEvent['latestScheduleChange'];
  className?: string;
  showActorDetails?: boolean;
};

const formatEventDate = (value: string) => {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatScheduleLabel = (date: string, time: string) => `${formatEventDate(date)} at ${time}`;

export function EventScheduleChangeNotice({
  change,
  className = '',
  showActorDetails = false,
}: Props) {
  if (!change) return null;

  return (
    <div className={`rounded-lg border border-info/30 bg-info/5 p-3 ${className}`.trim()}>
      <p className="text-xs font-semibold uppercase tracking-wide text-info">Schedule Updated</p>
      <p className="mt-1 text-sm text-foreground">
        Event changed from {formatScheduleLabel(change.previousDate, change.previousTime)} to{' '}
        {formatScheduleLabel(change.newDate, change.newTime)}.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Reason: {change.reason}</p>
      {showActorDetails && (change.changedByName || change.changedAt) && (
        <p className="mt-1 text-xs text-muted-foreground">
          Updated by {change.changedByName || 'M-Taka'} on{' '}
          {new Date(change.changedAt).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
