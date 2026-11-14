/**
 * @jest-environment node
 *
 * POST /api/message-rating/shared with the real request schema and the real
 * `recordMessageRating`, over a fake database.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mockLimit = jest.fn<() => Promise<{ success: boolean }>>();
const mockIpLimit = jest.fn<() => Promise<{ success: boolean }>>();
/** The identifier each limiter was called with, by limiter. */
let limitKeys: { session?: string; ip?: string };

type Row = Record<string, unknown>;
type Write =
  | { op: "upsert"; table: unknown; values: Row; target: unknown; set: Row }
  | { op: "delete"; table: unknown };

/**
 * What each lookup returns. The fake does not evaluate `where`; it records it.
 * `owned` is the one message-joined-to-conversation lookup that proves the
 * message is the caller's.
 */
let found: { chatbot?: Row; owned?: Row };
let writes: Write[];
/** Every `where` that ran, as SQL text and bound values. */
let filters: Array<{ table: unknown; sql: string; params: unknown[] }>;

const dialect = new PgDialect();
function recordFilter(table: unknown, condition: SQL) {
  filters.push({ table, ...dialect.sqlToQuery(condition) });
}

const schema = await import("@teachanything/db/schema");

function rowsFor(table: unknown): Row[] {
  const row =
    table === schema.chatbots
      ? found.chatbot
      : table === schema.messages
        ? found.owned
        : undefined;
  return row ? [row] : [];
}

/** A `where` that records its condition and returns the table's rows. */
function filtered(table: unknown) {
  return {
    where: (condition: SQL) => {
      recordFilter(table, condition);
      return { limit: async () => rowsFor(table) };
    },
  };
}

/** Joins the fake saw, as [from, joined, on-clause SQL]. */
let joins: Array<{ from: unknown; joined: unknown; on: string }>;

jest.unstable_mockModule("@teachanything/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        ...filtered(table),
        innerJoin: (joined: unknown, on: SQL) => {
          joins.push({ from: table, joined, on: dialect.sqlToQuery(on).sql });
          return filtered(table);
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => ({
        onConflictDoUpdate: async (conflict: { target: unknown; set: Row }) => {
          writes.push({ op: "upsert", table, values, ...conflict });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async (condition: SQL) => {
        recordFilter(table, condition);
        writes.push({ op: "delete", table });
      },
    }),
  },
}));

// The real module pulls in @upstash/redis.
jest.unstable_mockModule("@/server/rate-limit", () => ({
  checkRateLimit: (
    limiter: { name: "session" | "ip"; limit: () => Promise<unknown> },
    identifier: string,
  ) => {
    limitKeys[limiter.name] = identifier;
    return limiter.limit();
  },
  publicMessageRatingRateLimit: { name: "session", limit: mockLimit },
  publicMessageRatingIpRateLimit: { name: "ip", limit: mockIpLimit },
}));

jest.unstable_mockModule("@/lib/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
}));

const { POST } = await import("@/app/api/message-rating/shared/route");

const CHATBOT_ID = "0b0c8c2e-6f0f-4c59-9a3e-3d2f6c1a7b10";
const CONVERSATION_ID = "5f1d2a52-8a43-4b61-93f5-0f6d1c9a2e11";
const MESSAGE_ID = "9a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d";
const SESSION_ID = "V1StGXR8_Z5jdHi6B-myT";

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/message-rating/shared", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const validBody = {
  shareToken: "share-token-1",
  sessionId: SESSION_ID,
  messageId: MESSAGE_ID,
  rating: 1,
};

beforeEach(() => {
  writes = [];
  filters = [];
  joins = [];
  limitKeys = {};
  mockLimit.mockResolvedValue({ success: true });
  mockIpLimit.mockResolvedValue({ success: true });
  found = {
    chatbot: { id: CHATBOT_ID },
    owned: { conversationId: CONVERSATION_ID },
  };
});

describe("POST /api/message-rating/shared: saving", () => {
  it("saves a thumbs up against the message, its conversation and chatbot", async () => {
    const res = await post(validBody);

    expect(res.status).toBe(204);
    expect(writes).toEqual([
      {
        op: "upsert",
        table: schema.messageRatings,
        values: {
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          chatbotId: CHATBOT_ID,
          rating: 1,
        },
        target: schema.messageRatings.messageId,
        set: { rating: 1, updatedAt: expect.any(Date) },
      },
    ]);
  });

  it("switches an existing rating by overwriting the message's one row", async () => {
    const res = await post({ ...validBody, rating: -1 });

    expect(res.status).toBe(204);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      op: "upsert",
      set: { rating: -1 },
    });
  });

  it("clears the rating when sent null", async () => {
    const res = await post({ ...validBody, rating: null });

    expect(res.status).toBe(204);
    expect(writes).toEqual([{ op: "delete", table: schema.messageRatings }]);
  });
});

describe("POST /api/message-rating/shared: ownership", () => {
  // Which messages count as the caller's is decided in SQL; the scoping tests
  // below pin that query. Here: what the route does when it finds none.
  it("refuses a message the lookup does not find as the caller's", async () => {
    found.owned = undefined;

    const res = await post(validBody);

    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("refuses to clear a rating on a message that is not the caller's", async () => {
    found.owned = undefined;

    const res = await post({ ...validBody, rating: null });

    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("refuses when the share link is unknown or sharing is off", async () => {
    found.chatbot = undefined;

    const res = await post(validBody);

    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });
});

describe("POST /api/message-rating/shared: what each query is scoped to", () => {
  const filterOn = (table: unknown) => {
    const { sql, params } = filters.find((f) => f.table === table)!;
    return { sql, params };
  };

  it("finds the chatbot by share token, only while sharing is on", async () => {
    await post(validBody);

    expect(filterOn(schema.chatbots)).toEqual({
      sql: '("chatbots"."share_token" = $1 and "chatbots"."sharing_enabled" = $2)',
      params: ["share-token-1", true],
    });
  });

  it("finds the message only as an assistant turn in the caller's conversation on this chatbot", async () => {
    await post(validBody);

    expect(joins).toEqual([
      {
        from: schema.messages,
        joined: schema.conversations,
        on: '"messages"."conversation_id" = "conversations"."id"',
      },
    ]);
    expect(filterOn(schema.messages)).toEqual({
      sql: '("messages"."id" = $1 and "messages"."role" = $2 and "conversations"."chatbot_id" = $3 and "conversations"."session_id" = $4)',
      params: [MESSAGE_ID, "assistant", CHATBOT_ID, SESSION_ID],
    });
  });

  it("clears only that message's rating", async () => {
    await post({ ...validBody, rating: null });

    expect(filterOn(schema.messageRatings)).toEqual({
      sql: '"message_ratings"."message_id" = $1',
      params: [MESSAGE_ID],
    });
  });
});

describe("POST /api/message-rating/shared: validation", () => {
  it.each([
    ["a rating that is neither 1, -1 nor null", { ...validBody, rating: 0 }],
    ["a rating out of range", { ...validBody, rating: 2 }],
    ["a rating sent as a string", { ...validBody, rating: "1" }],
    [
      "a missing rating",
      { shareToken: "t", sessionId: SESSION_ID, messageId: MESSAGE_ID },
    ],
    ["a message id that is not a UUID", { ...validBody, messageId: "abc" }],
    ["a malformed session id", { ...validBody, sessionId: "bad id!" }],
    ["an empty share token", { ...validBody, shareToken: "" }],
    ["a body that is not JSON", "not json"],
  ])("rejects %s", async (_name, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("returns 429 once the session is rate limited", async () => {
    mockLimit.mockResolvedValue({ success: false });

    const res = await post(validBody);

    expect(res.status).toBe(429);
    expect(writes).toEqual([]);
  });

  it("returns 429 once the IP is rate limited", async () => {
    mockIpLimit.mockResolvedValue({ success: false });

    const res = await post(validBody);

    expect(res.status).toBe(429);
    expect(writes).toEqual([]);
  });

  it("limits per session, so students behind one IP do not share a bucket", async () => {
    await post(validBody);

    expect(limitKeys.session).toBe(`share-token-1:${SESSION_ID}`);
    expect(limitKeys.ip).toMatch(/^share-token-1:/);
  });
});
