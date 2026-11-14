import { eq } from "drizzle-orm";
import { conversations } from "@teachanything/db/schema";
import { formatPreview } from "@/server/utils";
import {
  buildMessageStatsSubquery,
  buildRatingStatsSubquery,
} from "../helpers";

type Db = typeof import("@teachanything/db").db;

/**
 * The Student Chats list row, shared by the list and search procedures: each
 * conversation with its message stats and rating totals joined on. Callers add
 * `where`, ordering and paging. `msgStats` is returned for sorting.
 */
export function selectConversationRows(db: Db, chatbotId: string) {
  const msgStats = buildMessageStatsSubquery(db, chatbotId);
  const ratingStats = buildRatingStatsSubquery(db, chatbotId);
  const query = db
    .select({
      id: conversations.id,
      sessionId: conversations.sessionId,
      metadata: conversations.metadata,
      createdAt: conversations.createdAt,
      messageCount: msgStats.messageCount,
      firstUserMessage: msgStats.firstUserMessage,
      firstMessageAt: msgStats.firstMessageAt,
      lastMessageAt: msgStats.lastMessageAt,
      ratingsUp: ratingStats.ratingsUp,
      ratingsDown: ratingStats.ratingsDown,
    })
    .from(conversations)
    .leftJoin(msgStats, eq(conversations.id, msgStats.conversationId))
    .leftJoin(ratingStats, eq(conversations.id, ratingStats.conversationId))
    .$dynamic();
  return { query, msgStats };
}

type ConversationRowResult = Awaited<
  ReturnType<typeof selectConversationRows>["query"]
>[number];

/** Fills the left-joined gaps a conversation with no messages or ratings has. */
export function toConversationRow(r: ConversationRowResult) {
  return {
    id: r.id,
    sessionId: r.sessionId,
    metadata: r.metadata,
    createdAt: r.createdAt,
    messageCount: r.messageCount ?? 0,
    preview: formatPreview(r.firstUserMessage),
    firstMessageAt: r.firstMessageAt,
    lastMessageAt: r.lastMessageAt,
    ratingsUp: r.ratingsUp ?? 0,
    ratingsDown: r.ratingsDown ?? 0,
  };
}
