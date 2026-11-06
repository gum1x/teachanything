/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { initTRPC } from "@trpc/server";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

const t = initTRPC.context<{ db: unknown; session: unknown }>().create();
const mockCookieSet = jest.fn();

jest.unstable_mockModule("@/server/trpc", () => ({
  protectedProcedure: t.procedure,
}));
jest.unstable_mockModule("@/lib/env", () => ({
  env: { NODE_ENV: "production" },
}));
jest.unstable_mockModule("next/headers", () => ({
  cookies: async () => ({ set: mockCookieSet }),
}));

const { updatePreferredLocaleProcedure } =
  await import("@/server/routers/auth/procedures/locale");

const createCaller = t.createCallerFactory(
  t.router({ save: updatePreferredLocaleProcedure }),
);

function callerWith(returned: unknown[]) {
  const set = jest.fn(() => ({
    where: () => ({ returning: async () => returned }),
  }));
  const db = { update: () => ({ set }) };
  return {
    set,
    caller: createCaller({ db, session: { user: { id: "user-1" } } }),
  };
}

describe("updatePreferredLocale", () => {
  beforeEach(() => mockCookieSet.mockClear());

  it("saves the language and sets the browser cookie", async () => {
    const { caller, set } = callerWith([{ preferredLocale: "fr" }]);

    await expect(caller.save({ locale: "fr" })).resolves.toEqual({
      locale: "fr",
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ preferredLocale: "fr" }),
    );
    expect(mockCookieSet).toHaveBeenCalledWith(
      "NEXT_LOCALE",
      "fr",
      expect.objectContaining({
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: true,
      }),
    );
  });

  it("rejects a language that is not offered, without saving", async () => {
    const { caller, set } = callerWith([]);

    await expect(caller.save({ locale: "xx" as "fr" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(set).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("fails without a cookie when the user no longer exists", async () => {
    const { caller } = callerWith([]);

    await expect(caller.save({ locale: "de" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});
