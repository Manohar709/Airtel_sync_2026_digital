"use client";
import { useEffect, useState } from "react";
import { getUser, type User } from "@/lib/api";

/** Current signed-in user for "customer" or "employee"; re-renders on sign in / out. undefined = not loaded yet. */
export function useSession(who: "customer" | "employee" = "customer") {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setUser(getUser(who));
    read();
    window.addEventListener("sync:session", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("sync:session", read); window.removeEventListener("storage", read); };
  }, [who]);
  return user;
}
