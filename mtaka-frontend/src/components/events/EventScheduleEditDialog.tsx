import { useEffect, useState } from 'react';
import axios from 'axios';

import { type BackendEvent, updateEventSchedule } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type Props = {
  event: BackendEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => Promise<void> | void;
};

export function EventScheduleEditDialog({ event, open, onOpenChange, onUpdated }: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !event) return;
    setDate(event.date);
    setTime(event.time);
    setReason('');
  }, [event, open]);

  const handleSave = async () => {
    if (!event) return;
    if (!date || !time || !reason.trim()) {
      toast.error('Date, time, and reason are required.');
      return;
    }

    setIsSaving(true);
    try {
      await updateEventSchedule(event.id, {
        date,
        time,
        scheduleChangeReason: reason.trim(),
      });
      await onUpdated();
      toast.success('Event schedule updated successfully.');
      onOpenChange(false);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const payload = error.response.data as Record<string, unknown>;
        const firstMessage = Object.values(payload)[0];
        const message = Array.isArray(firstMessage)
          ? String(firstMessage[0])
          : String(firstMessage || 'Failed to update the event schedule.');
        toast.error(message);
      } else {
        toast.error('Failed to update the event schedule.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Event Schedule</DialogTitle>
          <DialogDescription>
            Update the event date or time and include a reason so participants can see what changed.
          </DialogDescription>
        </DialogHeader>

        {event && (
          <div className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{event.title}</p>
            <p className="mt-1">Current schedule: {event.date} at {event.time}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="event-schedule-date">New Date</Label>
            <Input
              id="event-schedule-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-schedule-time">New Time</Label>
            <Input
              id="event-schedule-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-schedule-reason">Reason for Change</Label>
          <Textarea
            id="event-schedule-reason"
            rows={4}
            placeholder="Explain why the event schedule changed."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
