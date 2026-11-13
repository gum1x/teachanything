"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageAction } from "@/components/ui/message";
import { cn } from "@/lib/utils";
import { ratingLabel, type MessageRating } from "@/lib/message-rating";

const RATING_OPTIONS = [
  { value: 1, Icon: ThumbsUp },
  { value: -1, Icon: ThumbsDown },
] as const;

/** Thumbs up / down for a student to rate one assistant response. */
export function MessageRatingButtons({
  rating,
  onRate,
}: {
  rating: MessageRating | null;
  /** Saves the rating (`null` clears it); resolves to whether it was saved. */
  onRate: (rating: MessageRating | null) => Promise<boolean>;
}) {
  // The choice being saved, shown at once; `undefined` when no save is running.
  const [pending, setPending] = useState<MessageRating | null | undefined>();
  const shown = pending === undefined ? rating : pending;

  const choose = async (clicked: MessageRating) => {
    const next = clicked === rating ? null : clicked;
    setPending(next);
    const saved = await onRate(next);
    setPending(undefined);
    if (!saved) toast.error("Couldn't save your rating. Please try again.");
  };

  return (
    <>
      {RATING_OPTIONS.map(({ value, Icon }) => {
        const isSelected = shown === value;
        return (
          <MessageAction
            key={value}
            tooltip="Your ratings and feedback are anonymous."
          >
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 hover:bg-transparent hover:text-foreground transition-all duration-200 disabled:opacity-100",
                isSelected ? "text-foreground" : "text-muted-foreground",
              )}
              onClick={() => void choose(value)}
              disabled={pending !== undefined}
              aria-label={ratingLabel(value)}
              aria-pressed={isSelected}
            >
              <Icon
                className={cn("h-3.5 w-3.5", isSelected && "fill-current")}
                aria-hidden="true"
              />
            </Button>
          </MessageAction>
        );
      })}
    </>
  );
}

/** The rating a student gave a response, for the professor's read-only viewer. */
export function MessageRatingIndicator({ rating }: { rating: MessageRating }) {
  const Icon = rating === 1 ? ThumbsUp : ThumbsDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        rating === 1
          ? "text-muted-foreground"
          : "text-amber-600 dark:text-amber-500",
      )}
    >
      <Icon className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      Student rating: {ratingLabel(rating).toLowerCase()}
    </span>
  );
}
