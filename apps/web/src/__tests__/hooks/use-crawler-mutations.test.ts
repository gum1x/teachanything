import { jest, describe, it, expect } from "@jest/globals";

type MutationOptions = {
  onSuccess?: (...args: unknown[]) => unknown;
};

/** `useMutation` options captured per procedure name (attachToChatbot, …). */
const mockCaptured = new Map<string, MutationOptions>();

jest.unstable_mockModule("@/lib/trpc", () => ({
  trpc: {
    crawler: new Proxy(
      {},
      {
        get: (_target, name) => ({
          useMutation: (options: MutationOptions) => {
            mockCaptured.set(String(name), options);
            return {
              mutate: () => undefined,
              mutateAsync: async () => undefined,
              isPending: false,
              variables: undefined,
            };
          },
        }),
      },
    ),
  },
}));
jest.unstable_mockModule("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const { useCrawlerMutations } = await import("@/hooks/use-crawler-mutations");
const { toast } = await import("sonner");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe.each(["attachToChatbot", "detachFromChatbot"])(
  "useCrawlerMutations %s onSuccess",
  (procedure) => {
    it("holds the mutation pending until the list refresh settles", async () => {
      const refresh = deferred();
      useCrawlerMutations({ refresh: () => refresh.promise });

      let settled = false;
      const result = Promise.resolve(
        mockCaptured.get(procedure)?.onSuccess?.(),
      ).then(() => {
        settled = true;
      });

      await flushMicrotasks();
      expect(settled).toBe(false);

      refresh.resolve();
      await result;
      expect(settled).toBe(true);
    });

    it("fires the toast and attachment refresh before the list refresh settles", () => {
      const refresh = deferred();
      const refreshAttachments = jest.fn();
      useCrawlerMutations({
        refresh: () => refresh.promise,
        refreshAttachments,
        attachSuccessMessage: "attached",
        detachSuccessMessage: "detached",
      });

      void mockCaptured.get(procedure)?.onSuccess?.();

      expect(refreshAttachments).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith(
        procedure === "attachToChatbot" ? "attached" : "detached",
      );
    });
  },
);
