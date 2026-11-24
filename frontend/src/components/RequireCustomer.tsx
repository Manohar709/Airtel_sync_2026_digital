"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./session";
import { Skeleton } from "./ui";

/** Pages that hold personal data (KYC, review, orders) need a signed-in customer. */
export default function RequireCustomer({ children }: { children: React.ReactNode }) {
  const user = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (user === null) router.replace(`/account?tab=signin&next=${encodeURIComponent(path)}`);
  }, [user, router, path]);
  if (!user) return <div className="container-x py-10"><Skeleton className="h-96" /></div>;
  return <>{children}</>;
}
