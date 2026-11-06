import { protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { user } from "@teachanything/db/schema";
import { env } from "@/lib/env";
import { isEnabledLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { appError } from "@/server/app-error";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Save the signed-in user's dashboard language. The cookie keeps that language
 * on this browser after sign-out, for the sign-in pages.
 */
export const updatePreferredLocaleProcedure = protectedProcedure
  .input(
    z.object({
      locale: z.custom<Locale>((value) => isEnabledLocale(value), {
        message: "Unsupported language",
      }),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const [saved] = await ctx.db
      .update(user)
      .set({ preferredLocale: input.locale, updatedAt: new Date() })
      .where(eq(user.id, ctx.session.user.id))
      .returning({ preferredLocale: user.preferredLocale });

    if (!saved) {
      throw appError("NOT_FOUND", "errors.notFoundItems.user");
    }

    (await cookies()).set(LOCALE_COOKIE, input.locale, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      maxAge: ONE_YEAR_SECONDS,
    });

    return { locale: input.locale };
  });
