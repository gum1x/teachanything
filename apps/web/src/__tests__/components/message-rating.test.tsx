/** The thumbs a student sees under an assistant response, rendered for real. */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudyUIMessage } from "@/server/chat/study-tools";
import type { MessageRating, RatingSaveResult } from "@/lib/message-rating";

jest.unstable_mockModule("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const { ChatMessage } = await import("@/components/chat/messages/ChatMessage");
const { toast } = await import("sonner");

type OnRate = (
  messageId: string,
  rating: MessageRating | null,
) => Promise<RatingSaveResult>;

/** A finished assistant response: the closing chunk sets `responseTime`. */
const finished: StudyUIMessage = {
  id: "9a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d",
  role: "assistant",
  parts: [{ type: "text", text: "Mitosis has four phases." }],
  metadata: { responseTime: 1200 },
};

const up = () => screen.getByRole("button", { name: "Thumbs up" });
const down = () => screen.getByRole("button", { name: "Thumbs down" });

function savingRate(result: RatingSaveResult = "saved") {
  return jest.fn<OnRate>().mockResolvedValue(result);
}

beforeEach(() => {
  jest.mocked(toast.error).mockClear();
});

describe("where the rating buttons appear", () => {
  it("shows both thumbs on a finished response when students can rate", () => {
    render(<ChatMessage message={finished} onRate={savingRate()} />);

    expect(up()).toHaveAttribute("aria-pressed", "false");
    expect(down()).toHaveAttribute("aria-pressed", "false");
  });

  it("shows none without a rating callback (the professor's own Chat tab)", () => {
    render(<ChatMessage message={finished} />);

    expect(screen.queryByRole("button", { name: "Thumbs up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thumbs down" })).toBeNull();
  });

  it("shows none on a response that has not finished", () => {
    render(
      <ChatMessage
        message={{ ...finished, metadata: undefined }}
        onRate={savingRate()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Thumbs up" })).toBeNull();
  });

  it("shows none on a student's own message", () => {
    render(
      <ChatMessage
        message={{ ...finished, role: "user" }}
        onRate={savingRate()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Thumbs up" })).toBeNull();
  });

  it("says what a thumb does on hover", async () => {
    render(<ChatMessage message={finished} onRate={savingRate()} />);

    await userEvent.hover(up());

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Helpful");
  });

  it("offers to remove the rating when hovering the selected thumb", async () => {
    render(
      <ChatMessage message={finished} rating={-1} onRate={savingRate()} />,
    );

    await userEvent.hover(down());

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Remove your rating",
    );
  });

  it("shows the professor the student's rating, read-only", () => {
    render(<ChatMessage message={finished} readOnly rating={-1} />);

    expect(screen.getByText("Student rating: thumbs down")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Thumbs down" })).toBeNull();
  });
});

/** Holds the rating the way `useChat` does: set only once a save succeeds. */
function StudentChat({ save }: { save: OnRate }) {
  const [rating, setRating] = useState<MessageRating | undefined>();
  const [isOpen, setIsOpen] = useState(true);
  const onRate: OnRate = async (messageId, next) => {
    const result = await save(messageId, next);
    if (result === "saved") setRating(next ?? undefined);
    return result;
  };
  return (
    <>
      <button onClick={() => setIsOpen((open) => !open)}>Toggle chat</button>
      {isOpen && (
        <ChatMessage message={finished} rating={rating} onRate={onRate} />
      )}
    </>
  );
}

describe("rating a response", () => {
  it("selects a thumb and saves it against the message id", async () => {
    const save = savingRate();
    render(<StudentChat save={save} />);

    await userEvent.click(up());

    expect(save).toHaveBeenCalledWith(finished.id, 1);
    expect(up()).toHaveAttribute("aria-pressed", "true");
    expect(down()).toHaveAttribute("aria-pressed", "false");
  });

  it("clears the rating when the selected thumb is clicked again", async () => {
    const save = savingRate();
    render(<StudentChat save={save} />);

    await userEvent.click(up());
    await userEvent.click(up());

    expect(save).toHaveBeenLastCalledWith(finished.id, null);
    expect(up()).toHaveAttribute("aria-pressed", "false");
  });

  it("switches when the other thumb is clicked", async () => {
    const save = savingRate();
    render(<StudentChat save={save} />);

    await userEvent.click(up());
    await userEvent.click(down());

    expect(save).toHaveBeenLastCalledWith(finished.id, -1);
    expect(up()).toHaveAttribute("aria-pressed", "false");
    expect(down()).toHaveAttribute("aria-pressed", "true");
  });

  it("undoes the choice and says so when the save fails", async () => {
    render(<StudentChat save={savingRate("failed")} />);

    await userEvent.click(up());

    expect(up()).toHaveAttribute("aria-pressed", "false");
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't save your rating. Please try again.",
    );
  });

  it("says the answer can't be rated when the server has no such response", async () => {
    render(<StudentChat save={savingRate("unavailable")} />);

    await userEvent.click(up());

    expect(up()).toHaveAttribute("aria-pressed", "false");
    expect(toast.error).toHaveBeenCalledWith("This answer can't be rated.");
  });

  it("goes back to the saved rating when a switch fails to save", async () => {
    const save = jest
      .fn<OnRate>()
      .mockResolvedValueOnce("saved")
      .mockResolvedValueOnce("failed");
    render(<StudentChat save={save} />);

    await userEvent.click(up());
    await userEvent.click(down());

    expect(up()).toHaveAttribute("aria-pressed", "true");
    expect(down()).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the choice at once and takes one click at a time while saving", async () => {
    let finishSave!: (result: RatingSaveResult) => void;
    const save = jest.fn<OnRate>().mockReturnValue(
      new Promise<RatingSaveResult>((resolve) => {
        finishSave = resolve;
      }),
    );
    render(<StudentChat save={save} />);

    await userEvent.click(up());
    expect(up()).toHaveAttribute("aria-pressed", "true");
    expect(down()).toBeDisabled();
    await userEvent.click(down());
    expect(save).toHaveBeenCalledTimes(1);

    finishSave("saved");
    await waitFor(() => expect(down()).toBeEnabled());
    expect(up()).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the rating when the chat is closed and reopened, as the embed does", async () => {
    render(<StudentChat save={savingRate()} />);
    const toggle = screen.getByRole("button", { name: "Toggle chat" });

    await userEvent.click(down());
    await userEvent.click(toggle);
    await userEvent.click(toggle);

    expect(down()).toHaveAttribute("aria-pressed", "true");
  });
});
