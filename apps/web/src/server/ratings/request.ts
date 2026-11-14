import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { db as DbType } from "@teachanything/db";
import {
  conversations,
  messages,
  messageRatings,
} from "@teachanything/db/schema";
import { sessionIdSchema } from "@/server/utils";
import type { MessageRating } from "@/lib/message-rating";

export const sharedRatingRequestSchema = z.object({
  shareToken: z.string().min(1).max(100),
  sessionId: sessionIdSchema,
  messageId: z.string().uuid(),
  // null clears the rating.
  rating: z.union([z.literal(1), z.literal(-1), z.null()]),
});

/**
 * Save, change or clear the rating on one assistant response. Returns false,
 * writing nothing, unless the message is an assistant turn in the conversation
 * that belongs to this (chatbot, session).
 */
export async function recordMessageRating(params: {
  chatbotId: string;
  sessionId: string;
  messageId: string;
  rating: MessageRating | null;
  db: typeof DbType;
}): Promise<boolean> {
  const { chatbotId, sessionId, messageId, rating, db } = params;

  // One lookup proves the whole chain: the message is an assistant turn, in a
  // conversation on this chatbot, owned by the caller's session.
  const [owned] = await db
    .select({ conversationId: messages.conversationId })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.role, "assistant"),
        eq(conversations.chatbotId, chatbotId),
        eq(conversations.sessionId, sessionId),
      ),
    )
    .limit(1);
  if (!owned) return false;

  if (rating === null) {
    await db
      .delete(messageRatings)
      .where(eq(messageRatings.messageId, messageId));
    return true;
  }

  await db
    .insert(messageRatings)
    .values({
      messageId,
      conversationId: owned.conversationId,
      chatbotId,
      rating,
    })
    .onConflictDoUpdate({
      target: messageRatings.messageId,
      set: { rating, updatedAt: new Date() },
    });
  return true;
}
