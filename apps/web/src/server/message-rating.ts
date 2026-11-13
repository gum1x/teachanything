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

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.chatbotId, chatbotId),
        eq(conversations.sessionId, sessionId),
      ),
    )
    .limit(1);
  if (!conversation) return false;

  const [message] = await db
    .select({ conversationId: messages.conversationId, role: messages.role })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (
    !message ||
    message.conversationId !== conversation.id ||
    message.role !== "assistant"
  ) {
    return false;
  }

  if (rating === null) {
    await db
      .delete(messageRatings)
      .where(eq(messageRatings.messageId, messageId));
    return true;
  }

  await db
    .insert(messageRatings)
    .values({ messageId, conversationId: conversation.id, chatbotId, rating })
    .onConflictDoUpdate({
      target: messageRatings.messageId,
      set: { rating, updatedAt: new Date() },
    });
  return true;
}
