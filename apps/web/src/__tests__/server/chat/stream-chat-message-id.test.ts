/**
 * @jest-environment node
 *
 * The id the browser gets for an assistant message must be the id of its
 * `messages` row, because a student's rating sends that id back. Runs the real
 * `streamChat` with a scripted model.
 */
import { jest, describe, it, expect } from "@jest/globals";
import { readUIMessageStream, type UIMessageChunk } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";

jest.unstable_mockModule("@/lib/env", () => ({
  env: { OPENROUTER_API_KEY: "test-key", OPENAI_API_KEY: "test-key" },
}));

jest.unstable_mockModule("@/lib/logger", () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
}));

function scriptedModel() {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Mitosis has four phases." },
        { type: "text-end", id: "t1" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
      ] as never),
    }),
  });
}

// Only the model provider is faked; the registry and token budget are real.
const models = await import("@teachanything/ai/models");
const tokenBudget = await import("@teachanything/ai/token-budget");
jest.unstable_mockModule("@teachanything/ai", () => ({
  ...models,
  ...tokenBudget,
  createOpenRouterClient: () => ({ getModel: () => scriptedModel() }),
}));

// Embeddings, the job queue and retrieval tools.
jest.unstable_mockModule("@/server/rag-context", () => ({
  buildRAGContext: async () => ({
    contextText: "",
    sources: [],
    ragUsed: false,
    fileManifest: "",
    ragFailureNote: "",
    fileIds: [],
    chunkIds: [],
  }),
}));
jest.unstable_mockModule("@/server/reprocess", () => ({
  maybeEnqueueReprocess: async () => {},
}));
jest.unstable_mockModule("@/server/retrieval-tools", () => ({
  createRetrievalTools: jest.fn(),
}));

const { streamChat } = await import("@/server/chat/stream-chat");
const { isRatableMessage } = await import("@/lib/message-rating");
const { conversations, messages } = await import("@teachanything/db/schema");
type StreamChatParams = Parameters<typeof streamChat>[0];
type StudyUIMessage = import("@/server/chat/study-tools").StudyUIMessage;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A database with one existing conversation that records every insert. */
function fakeDatabase() {
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const rows = (table: unknown) => {
    const result = table === conversations ? [{ id: "conversation-1" }] : [];
    const query = {
      where: () => query,
      orderBy: () => query,
      limit: async () => result,
    };
    return query;
  };
  const database = {
    select: () => ({ from: rows }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return Promise.resolve();
      },
    }),
  } as unknown as StreamChatParams["db"];
  return { database, inserts };
}

/** The UI message chunks in a `streamChat` response body, in order. */
async function readChunks(response: Response): Promise<UIMessageChunk[]> {
  const body = await response.text();
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)) as UIMessageChunk);
}

describe("streamChat assistant message id", () => {
  it("streams the same id it gives the persisted message row", async () => {
    const { database, inserts } = fakeDatabase();

    const response = await streamChat({
      chatbot: {
        id: "chatbot-1",
        model: "openai/gpt-oss-120b",
        systemPrompt: "You are a biology tutor.",
        maxTokens: 500,
        temperature: 70,
      } as StreamChatParams["chatbot"],
      userMessage: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "What are the phases of mitosis?" }],
      },
      sessionId: "V1StGXR8_Z5jdHi6B-myT",
      db: database,
      eventType: "shared_message_sent",
    });
    // The body only ends once the turn has been persisted.
    const chunks = await readChunks(response);

    // The message as the browser assembles it from the stream.
    let browserMessage: StudyUIMessage | undefined;
    for await (const message of readUIMessageStream<StudyUIMessage>({
      stream: convertArrayToReadableStream(chunks),
    })) {
      browserMessage = message;
    }

    const assistantRow = inserts.find(
      (insert) =>
        insert.table === messages && insert.values.role === "assistant",
    );
    expect(assistantRow?.values.content).toBe("Mitosis has four phases.");
    expect(assistantRow?.values.id).toMatch(UUID);
    expect(browserMessage?.id).toBe(assistantRow?.values.id);
    // The finished stream is also what makes the thumbs appear.
    expect(isRatableMessage(browserMessage!)).toBe(true);
  });
});
