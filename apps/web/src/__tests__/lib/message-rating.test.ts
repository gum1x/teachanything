import { describe, it, expect } from "@jest/globals";
import { isRatableMessage } from "@/lib/message-rating";
import type { StudyUIMessage } from "@/server/chat/study-tools";

const quiz = {
  quiz_title: "Photosynthesis",
  questions: [
    {
      question: "What gas do plants absorb?",
      options: ["CO2", "O2"],
      correct_index: 0,
      explanation: "Plants take in carbon dioxide.",
    },
  ],
};

/** A turn that ran to completion carries `responseTime` in its metadata. */
const FINISHED = { responseTime: 1200 };

function assistant(
  parts: unknown[],
  metadata: StudyUIMessage["metadata"] | undefined,
): StudyUIMessage {
  return { id: "m1", role: "assistant", parts, metadata } as StudyUIMessage;
}

describe("isRatableMessage", () => {
  it("allows a finished response with text", () => {
    expect(
      isRatableMessage(
        assistant([{ type: "text", text: "Here you go." }], FINISHED),
      ),
    ).toBe(true);
  });

  it("allows a finished quiz-only response", () => {
    expect(
      isRatableMessage(
        assistant(
          [
            {
              type: "tool-showQuiz",
              toolCallId: "call_1",
              state: "input-available",
              input: quiz,
            },
          ],
          FINISHED,
        ),
      ),
    ).toBe(true);
  });

  it("refuses a response that never finished (still streaming, stopped, or failed)", () => {
    expect(
      isRatableMessage(
        assistant([{ type: "text", text: "Partial ans" }], undefined),
      ),
    ).toBe(false);
    expect(
      isRatableMessage(assistant([{ type: "text", text: "Partial ans" }], {})),
    ).toBe(false);
  });

  it("refuses a finished response with nothing in it", () => {
    expect(
      isRatableMessage(assistant([{ type: "text", text: "   " }], FINISHED)),
    ).toBe(false);
    expect(isRatableMessage(assistant([], FINISHED))).toBe(false);
  });

  it("refuses a response whose only content is a quiz that failed to build", () => {
    expect(
      isRatableMessage(
        assistant(
          [
            {
              type: "tool-showQuiz",
              toolCallId: "call_1",
              state: "output-error",
              errorText: "invalid input",
            },
          ],
          FINISHED,
        ),
      ),
    ).toBe(false);
  });

  it("refuses a user message", () => {
    expect(
      isRatableMessage({
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "What is mitosis?" }],
        metadata: FINISHED,
      } as StudyUIMessage),
    ).toBe(false);
  });
});
