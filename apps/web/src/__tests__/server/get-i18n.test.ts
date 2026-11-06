/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

let session: { user: { preferredLocale: string | null } } | null = null;
let sessionFailure: Error | null = null;
const mockLogError = jest.fn();

jest.unstable_mockModule("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "de" }) }),
  headers: async () => new Headers({ "accept-language": "es" }),
}));
jest.unstable_mockModule("@/server/auth/config", () => ({
  auth: {
    api: {
      getSession: async () => {
        if (sessionFailure) throw sessionFailure;
        return session;
      },
    },
  },
}));
jest.unstable_mockModule("@/lib/logger", () => ({ logError: mockLogError }));

const { getI18nProps, generateDashboardMetadata } =
  await import("@/server/i18n/get-i18n");

beforeEach(() => {
  sessionFailure = null;
  mockLogError.mockClear();
});

describe("getI18nProps", () => {
  beforeEach(() => {
    session = null;
  });

  it("uses the cookie for signed-out visitors", async () => {
    await expect(getI18nProps()).resolves.toMatchObject({ locale: "de" });
  });

  it("uses a signed-in user's saved language", async () => {
    session = { user: { preferredLocale: "fr" } };
    await expect(getI18nProps()).resolves.toMatchObject({ locale: "fr" });
  });

  it("ignores another user's cookie when a signed-in user has no preference", async () => {
    session = { user: { preferredLocale: null } };
    await expect(getI18nProps()).resolves.toMatchObject({ locale: "es" });
  });

  it("uses the cookie when the session lookup fails", async () => {
    sessionFailure = new Error("connection pool timeout");
    await expect(getI18nProps()).resolves.toMatchObject({ locale: "de" });
  });

  it("logs a failed session lookup", async () => {
    sessionFailure = new Error("connection pool timeout");
    await getI18nProps();
    expect(mockLogError).toHaveBeenCalledWith(
      sessionFailure,
      expect.any(String),
    );
  });
});

describe("generateDashboardMetadata", () => {
  it("titles the page in the user's saved language", async () => {
    session = { user: { preferredLocale: "fr" } };
    await expect(generateDashboardMetadata()).resolves.toEqual({
      title: "Tableau de bord",
    });
  });
});
