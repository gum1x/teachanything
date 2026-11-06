import { describe, it, expect } from "@jest/globals";
import en from "../../../messages/en.json";
import { createI18n } from "@/i18n/create-i18n";
import { authErrorMessage } from "@/lib/auth-error-message";

const english = createI18n("en", en);

describe("authErrorMessage", () => {
  it("maps Better Auth codes and uses the fallback otherwise", () => {
    expect(
      authErrorMessage(
        english.t,
        { code: "INVALID_EMAIL_OR_PASSWORD" },
        "fallback",
      ),
    ).toBe(en.auth.errors.invalidCredentials);
    expect(authErrorMessage(english.t, { status: 429 }, "fallback")).toBe(
      en.auth.errors.tooManyAttempts,
    );
    expect(authErrorMessage(english.t, { code: "OTHER" }, "fallback")).toBe(
      "fallback",
    );
  });
});
