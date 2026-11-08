import { WEBAPP_URL } from "@calcom/lib/constants";
import { useSession } from "next-auth/react";
import { useBottomNavItems } from "../useBottomNavItems";
import type { NavigationItemType } from "./NavigationItem";

export function useMobileMoreItems(): NavigationItemType[] {
  const { data: session } = useSession();
  const user = session?.user;
  const username = user?.orgAwareUsername ?? user?.username;
  const publicPageUrl = username ? `${WEBAPP_URL}/${username}` : null;

  const bottomNavItems = useBottomNavItems({
    publicPageUrl,
  });

  const filteredBottomNavItems = bottomNavItems.filter(
    (item: NavigationItemType) => item.name !== "settings"
  );
  return filteredBottomNavItems;
}
