import { and, eq, exists, sql } from "drizzle-orm";
import {
  analytics,
  conversations,
  messageRatings,
  messages,
} from "@teachanything/db/schema";

export type SessionTimeRange = "week" | "month" | "quarter";

export const MESSAGE_EVENT_TYPES = ["message_sent", "shared_message_sent"];
export const DAY_MS = 24 * 60 * 60 * 1000;

export function analyticsSessionId() {
  return sql<string>`COALESCE(${analytics.sessionId}, ${analytics.eventData}->>'sessionId')`;
}

export function getRangeStart(timeRange: SessionTimeRange): Date {
  const now = new Date();
  switch (timeRange) {
    case "week":
      return new Date(now.getTime() - 7 * DAY_MS);
    case "quarter":
      return new Date(now.getTime() - 90 * DAY_MS);
    case "month":
      return new Date(now.getTime() - 30 * DAY_MS);
  }
}

export function dateKey(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export function startOfUtcDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

export function startOfUtcWeek(date: Date): Date {
  const next = startOfUtcDay(date);
  const day = (next.getUTCDay() + 6) % 7;
  next.setUTCDate(next.getUTCDate() - day);
  return next;
}

export function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Per-day rating counts filled to one entry per UTC day, plus the totals. */
export function summarizeRatings(
  rows: Array<{ date: string; up: number; down: number }>,
  startDate: Date,
  now: Date,
) {
  const rowsByDate = new Map(rows.map((row) => [row.date, row]));
  const daily: Array<{ date: string; up: number; down: number }> = [];
  for (
    let current = startOfUtcDay(startDate);
    current <= now;
    current = new Date(current.getTime() + DAY_MS)
  ) {
    const date = dateKey(current);
    const row = rowsByDate.get(date);
    daily.push({ date, up: row?.up ?? 0, down: row?.down ?? 0 });
  }

  const helpfulCount = rows.reduce((sum, row) => sum + row.up, 0);
  const totalRatings = rows.reduce((sum, row) => sum + row.down, helpfulCount);
  return {
    totalRatings,
    helpfulCount,
    // null, not 0, when nothing was rated: 0% would read as "all unhelpful".
    helpfulPercentage:
      totalRatings > 0 ? Math.round((helpfulCount / totalRatings) * 100) : null,
    daily,
  };
}

export function buildMessageStatsSubquery(
  db: typeof import("@teachanything/db").db,
  chatbotId: string,
) {
  return db
    .select({
      conversationId: messages.conversationId,
      messageCount: sql<number>`count(*)::int`.as("message_count"),
      firstUserMessage: sql<string | null>`(
        SELECT m2.content FROM ${messages} m2
        WHERE m2.conversation_id = ${messages.conversationId}
          AND m2.role = 'user'
        ORDER BY m2.created_at ASC
        LIMIT 1
      )`.as("first_user_message"),
      firstMessageAt: sql<Date>`MIN(${messages.createdAt})`.as(
        "first_message_at",
      ),
      lastMessageAt: sql<Date>`MAX(${messages.createdAt})`.as(
        "last_message_at",
      ),
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.chatbotId, chatbotId))
    .groupBy(messages.conversationId)
    .as("msg_stats");
}

/** Per-conversation thumbs up / down totals for a chatbot's student chats. */
export function buildRatingStatsSubquery(
  db: typeof import("@teachanything/db").db,
  chatbotId: string,
) {
  return db
    .select({
      conversationId: messageRatings.conversationId,
      ratingsUp:
        sql<number>`count(*) FILTER (WHERE ${messageRatings.rating} = 1)::int`.as(
          "ratings_up",
        ),
      ratingsDown:
        sql<number>`count(*) FILTER (WHERE ${messageRatings.rating} = -1)::int`.as(
          "ratings_down",
        ),
    })
    .from(messageRatings)
    .where(eq(messageRatings.chatbotId, chatbotId))
    .groupBy(messageRatings.conversationId)
    .as("rating_stats");
}

/** Matches conversations in which a student gave at least one thumbs down. */
export function conversationHasThumbsDown(
  db: typeof import("@teachanything/db").db,
) {
  return exists(
    db
      .select({ id: messageRatings.id })
      .from(messageRatings)
      .where(
        and(
          eq(messageRatings.conversationId, conversations.id),
          eq(messageRatings.rating, -1),
        ),
      ),
  );
}
