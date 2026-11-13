import { eq, and } from "drizzle-orm";
import { db } from "@teachanything/db";
import { chatbots } from "@teachanything/db/schema";
import { logError } from "@/lib/logger";
import {
  checkRateLimit,
  publicMessageRatingRateLimit,
} from "@/server/rate-limit";
import { getTrustedClientIp } from "@/lib/get-client-ip";
import {
  sharedRatingRequestSchema,
  recordMessageRating,
} from "@/server/message-rating";

/**
 * Save a student's thumbs up / down from a shared link or embed. No auth;
 * rate limited per (IP, shareToken), fail-open like study-tool responses.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = sharedRatingRequestSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      return new Response("Invalid request", { status: 400 });
    }
    const { shareToken, sessionId, messageId, rating } = parsed.data;

    const clientIp = getTrustedClientIp(req.headers);
    const { success } = await checkRateLimit(
      publicMessageRatingRateLimit,
      `${shareToken}:${clientIp}`,
    );
    if (!success) {
      return new Response("Too many requests. Please slow down.", {
        status: 429,
      });
    }

    const [chatbot] = await db
      .select({ id: chatbots.id })
      .from(chatbots)
      .where(
        and(
          eq(chatbots.shareToken, shareToken),
          eq(chatbots.sharingEnabled, true),
        ),
      )
      .limit(1);
    if (!chatbot) {
      return new Response("Chatbot not found or sharing is disabled", {
        status: 404,
      });
    }

    const saved = await recordMessageRating({
      chatbotId: chatbot.id,
      sessionId,
      messageId,
      rating,
      db,
    });
    if (!saved) {
      return new Response("Message not found", { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    logError(error, "POST /api/message-rating/shared failed");
    return new Response("Failed to save rating", { status: 500 });
  }
}
