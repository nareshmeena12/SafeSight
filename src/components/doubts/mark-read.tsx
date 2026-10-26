"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/lib/doubts/actions";

/** Marks the user's notices read once they've opened the page that shows them. */
export function MarkNotificationsRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) void markNotificationsRead();
  }, [unread]);
  return null;
}
