import { protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { conversations, messages } from "@teachanything/db/schema";
import type { SQL } from "drizzle-orm";
import { eq, and, sql, desc, inArray, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { escapeLikePattern } from "@/server/utils";
import { assertOwnedChatbot } from "@/server/queries/chatbot";
import {
  checkRateLimit,
  conversationSearchRateLimit,
} from "@/server/rate-limit";
import { conversationHasThumbsDown } from "../helpers";
import { selectConversationRows, toConversationRow } from "./conversation-rows";

export const getConversationsListProcedure = protectedProcedure
  .input(
    z.object({
      chatbotId: z.string().uuid(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
      sortBy: z
        .enum(["recent", "mostMessages", "longestDuration"])
        .default("recent"),
      // Only chats where a student gave at least one thumbs down.
      hasThumbsDown: z.boolean().default(false),
    }),
  )
  .query(async ({ ctx, input }) => {
    await assertOwnedChatbot(ctx, input.chatbotId);

    const { query, msgStats } = selectConversationRows(ctx.db, input.chatbotId);
    const where = and(
      eq(conversations.chatbotId, input.chatbotId),
      input.hasThumbsDown ? conversationHasThumbsDown(ctx.db) : undefined,
    );

    // Count has no join (1:1 subquery doesn't change row count on leftJoin,
    // and we don't filter by any msg_stats column here).
    const [totalResult] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(where);

    const totalCount = totalResult?.count ?? 0;

    let primaryOrder: SQL;
    switch (input.sortBy) {
      case "mostMessages":
        primaryOrder = desc(sql`COALESCE(${msgStats.messageCount}, 0)`);
        break;
      case "longestDuration":
        primaryOrder = desc(
          sql`COALESCE(${msgStats.lastMessageAt} - ${msgStats.firstMessageAt}, interval '0')`,
        );
        break;
      default:
        primaryOrder = desc(conversations.createdAt);
    }

    const results = await query
      .where(where)
      .orderBy(
        primaryOrder,
        desc(conversations.createdAt),
        desc(conversations.id),
      )
      .limit(input.limit)
      .offset(input.offset);

    return { conversations: results.map(toConversationRow), totalCount };
  });

export const searchConversationsProcedure = protectedProcedure
  .input(
    z.object({
      chatbotId: z.string().uuid(),
      query: z.string().min(1).max(200),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
      // Only chats where a student gave at least one thumbs down.
      hasThumbsDown: z.boolean().default(false),
    }),
  )
  .query(async ({ ctx, input }) => {
    await assertOwnedChatbot(ctx, input.chatbotId);

    // ILIKE '%term%' is an unindexed scan without the pg_trgm GIN index,
    // and still expensive even with it. Cap per-user concurrency.
    const { success } = await checkRateLimit(
      conversationSearchRateLimit,
      ctx.session.user.id,
      { path: "analytics.searchConversations" },
    );
    if (!success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many search requests. Please slow down.",
      });
    }

    // Materialize matching ids once so the (expensive) ILIKE scan runs a
    // single time per request instead of once per downstream query. Cap
    // the materialized set so a chatbot with many matching conversations
    // can't balloon Node memory; user-facing pagination is capped at
    // `limit`, so more than a few thousand matches is never browsable.
    const SEARCH_MATCH_CAP = 5000;
    const matchingRows = await ctx.db
      .selectDistinct({ id: messages.conversationId })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.chatbotId, input.chatbotId),
          ilike(messages.content, `%${escapeLikePattern(input.query)}%`),
          input.hasThumbsDown ? conversationHasThumbsDown(ctx.db) : undefined,
        ),
      )
      .limit(SEARCH_MATCH_CAP);

    if (matchingRows.length === 0) {
      return { conversations: [], totalCount: 0 };
    }

    const matchingIds = matchingRows.map((r) => r.id);
    const totalCount = matchingIds.length;

    const results = await selectConversationRows(ctx.db, input.chatbotId)
      .query.where(
        and(
          eq(conversations.chatbotId, input.chatbotId),
          inArray(conversations.id, matchingIds),
        ),
      )
      .orderBy(desc(conversations.createdAt), desc(conversations.id))
      .limit(input.limit)
      .offset(input.offset);

    return { conversations: results.map(toConversationRow), totalCount };
  });

/**
 * Delete one or more conversations (and their messages, via cascade) for a
 * chatbot the caller owns. Used by the Student Chats tab to clear retry junk.
 */
export const deleteConversationsProcedure = protectedProcedure
  .input(
    z.object({
      chatbotId: z.string().uuid(),
      conversationIds: z.array(z.string().uuid()).min(1).max(100),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    await assertOwnedChatbot(ctx, input.chatbotId);

    // Scope the delete to this chatbot so a caller can't delete another
    // chatbot's conversations by id. Messages cascade-delete via FK.
    const deleted = await ctx.db
      .delete(conversations)
      .where(
        and(
          eq(conversations.chatbotId, input.chatbotId),
          inArray(conversations.id, input.conversationIds),
        ),
      )
      .returning({ id: conversations.id });

    return { deletedCount: deleted.length };
  });
