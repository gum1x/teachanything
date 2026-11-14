import { protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import {
  conversations,
  messages,
  chatbots,
  messageRatings,
  studyToolResponses,
} from "@teachanything/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * One conversation's transcript for the professor's viewer: a page of
 * messages, plus every study-tool attempt and student rating in it.
 */
export const getConversationMessagesProcedure = protectedProcedure
  .input(
    z.object({
      chatbotId: z.string().uuid(),
      conversationId: z.string().uuid(),
      limit: z.number().min(1).max(200).default(100),
      offset: z.number().min(0).default(0),
    }),
  )
  .query(async ({ ctx, input }) => {
    // Single JOIN verifies chatbot ownership AND conversation binding
    // in one round-trip.
    const [row] = await ctx.db
      .select({ conversation: conversations })
      .from(conversations)
      .innerJoin(chatbots, eq(chatbots.id, conversations.chatbotId))
      .where(
        and(
          eq(conversations.id, input.conversationId),
          eq(conversations.chatbotId, input.chatbotId),
          eq(chatbots.userId, ctx.session.user.id),
        ),
      )
      .limit(1);

    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }

    const [totalResult] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.conversationId, input.conversationId));

    const conversationMessages = await ctx.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, input.conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    // Student study-tool attempts for this conversation (quiz answers, etc.),
    // in chronological order so the client can label them Attempt 1, 2, ...
    // per toolCallId. Loaded in full (not tied to the message page) so a quiz
    // on any message page shows all its attempts; responses per conversation
    // are small, but capped defensively against a pathological conversation.
    const studyResponses = await ctx.db
      .select({
        toolCallId: studyToolResponses.toolCallId,
        toolName: studyToolResponses.toolName,
        attempt: studyToolResponses.attempt,
        response: studyToolResponses.response,
      })
      .from(studyToolResponses)
      .where(eq(studyToolResponses.conversationId, input.conversationId))
      .orderBy(asc(studyToolResponses.createdAt))
      .limit(500);

    // At most one per assistant message, so loaded in full.
    const ratings = await ctx.db
      .select({
        messageId: messageRatings.messageId,
        rating: messageRatings.rating,
      })
      .from(messageRatings)
      .where(eq(messageRatings.conversationId, input.conversationId));

    return {
      messages: conversationMessages,
      conversation: row.conversation,
      totalCount: totalResult?.count ?? 0,
      studyResponses,
      ratings,
    };
  });
