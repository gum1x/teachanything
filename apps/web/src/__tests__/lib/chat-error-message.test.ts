import { describe, it, expect } from "@jest/globals";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { createI18n } from "@/i18n/create-i18n";
import { describeChatError } from "@/lib/chat-error-message";

const english = createI18n("en", en);
const french = createI18n("fr", fr, en);

describe("describeChatError", () => {
  it("translates known route responses", () => {
    expect(
      describeChatError(
        new Error("Too many messages. Please slow down."),
        french.t,
      ),
    ).toBe(french.t("errors.chat.tooManyMessages"));
  });

  it("replaces unusable bodies with the generic message", () => {
    expect(describeChatError(new Error("{}"), english.t)).toBe(
      en.errors.chat.sendFailed,
    );
  });
});
