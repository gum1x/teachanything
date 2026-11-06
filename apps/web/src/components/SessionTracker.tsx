"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { QueryClient } from "@tanstack/react-query";

export function SessionTracker({ queryClient }: { queryClient: QueryClient }) {
  const { data: session } = useSession();
  const previousUserIdRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUserId = session?.user?.id || null;
    const previousUserId = previousUserIdRef.current;

    // If user changed (logged in, logged out, or switched accounts)
    if (previousUserId !== null && previousUserId !== currentUserId) {
      // Clear all cached queries
      queryClient.clear();
      // Server layouts chose their language for the previous user
      router.refresh();
    }

    // Update the ref to track the current user
    previousUserIdRef.current = currentUserId;
  }, [session?.user?.id, queryClient, router]);

  return null;
}
