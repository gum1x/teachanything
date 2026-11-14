import type { StudyUIMessage } from "@/server/chat/study-tools";
import {
  assistantMessageForDb,
  hasPersistableStudyPart,
} from "@/lib/chat/ui-messages";

/** 1 = thumbs up, -1 = thumbs down. */
export type MessageRating = 1 | -1;

export function ratingLabel(rating: MessageRating): string {
  return rating === 1 ? "Thumbs up" : "Thumbs down";
}

/**
 * Whether a student can rate this message: a finished assistant response that
 * the server saved. Only a turn that ran to completion gets `responseTime`,
 * and the content check mirrors what `persistTurn` saves.
 */
export function isRatableMessage(message: StudyUIMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.metadata?.responseTime === undefined) return false;
  const { content, parts } = assistantMessageForDb(message);
  return content.trim().length > 0 || hasPersistableStudyPart(parts);
}

/**
 * How a save ended. `unavailable` means the server has no such response for
 * this session (it was never saved, or sharing was turned off), so retrying
 * cannot help; `failed` is anything worth retrying.
 */
export type RatingSaveResult = "saved" | "unavailable" | "failed";

/** Save a rating in a shared chat (`null` clears it). */
export async function postMessageRating(input: {
  shareToken: string;
  sessionId: string;
  messageId: string;
  rating: MessageRating | null;
}): Promise<RatingSaveResult> {
  try {
    const res = await fetch("/api/message-rating/shared", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) return "saved";
    return res.status === 404 ? "unavailable" : "failed";
  } catch {
    return "failed";
  }
}
