import { protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { messageRatings } from "@teachanything/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { assertOwnedChatbot } from "@/server/queries/chatbot";
import { getRangeStart, summarizeRatings } from "../helpers";

/** Student ratings over the last 30 days: total, share helpful, and per day. */
export const getRatingSummaryProcedure = protectedProcedure
  .input(z.object({ chatbotId: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    await assertOwnedChatbot(ctx, input.chatbotId);

    const startDate = getRangeStart("month");
    const day = sql<string>`DATE(${messageRatings.createdAt})`;

    const rows = await ctx.db
      .select({
        date: day,
        up: sql<number>`count(*) FILTER (WHERE ${messageRatings.rating} = 1)::int`,
        down: sql<number>`count(*) FILTER (WHERE ${messageRatings.rating} = -1)::int`,
      })
      .from(messageRatings)
      .where(
        and(
          eq(messageRatings.chatbotId, input.chatbotId),
          gte(messageRatings.createdAt, startDate),
        ),
      )
      .groupBy(day)
      .orderBy(day);

    return summarizeRatings(rows, startDate, new Date());
  });
