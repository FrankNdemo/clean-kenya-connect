import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface EventDescriptionPreviewProps {
  title: string;
  description: string;
  className?: string;
}

export function EventDescriptionPreview({ title, description, className }: EventDescriptionPreviewProps) {
  const [open, setOpen] = useState(false);
  const trimmedDescription = description.trim();

  if (!trimmedDescription) return null;

  return (
    <>
      <div className={cn('space-y-1', className)}>
        <p className="text-sm text-muted-foreground leading-6 line-clamp-2 whitespace-pre-line break-words">
          {trimmedDescription}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex text-xs font-medium text-primary hover:underline"
        >
          View more
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Full event description</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg bg-secondary/40 p-4 text-sm leading-7 whitespace-pre-line break-words text-foreground">
            {trimmedDescription}
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
