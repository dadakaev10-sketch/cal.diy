"use client";

import {
  sdkActionManager,
  useEmbedNonStylesConfig,
  useEmbedStyles,
  useIsEmbed,
} from "@calcom/embed-core/embed-iframe";
import { useRouterQuery } from "@calcom/lib/hooks/useRouterQuery";
import useTheme from "@calcom/lib/hooks/useTheme";
import { UserAvatar } from "@calcom/ui/components/avatar";
import { Icon } from "@calcom/ui/components/icon";
import { OrgBanner } from "@calcom/ui/components/organization-banner";
import { UnpublishedEntity } from "@calcom/ui/components/unpublished-entity";
import { EventTypeDescriptionLazy as EventTypeDescription } from "@calcom/web/modules/event-types/components";
import EmptyPage from "@calcom/web/modules/event-types/components/EmptyPage";
import { getPublicPagePalette } from "@lib/publicPagePalette";
import type { getServerSideProps } from "@server/lib/[user]/getServerSideProps";
import classNames from "classnames";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import styles from "./public-profile.module.css";

export type PageProps = InferGetServerSidePropsType<typeof getServerSideProps>;
export function UserPage(props: PageProps) {
  const { users, profile, eventTypes, entity } = props;

  const [user] = users; //To be used when we only have a single user, not dynamic group
  const palette = getPublicPagePalette(profile.brandColor);
  useTheme("light");

  const isBioEmpty = !user.bio || !user.bio.replace("<p><br></p>", "").length;

  const isEmbed = useIsEmbed(props.isEmbed);
  const eventTypeListItemEmbedStyles = useEmbedStyles("eventTypeListItem");
  const shouldAlignCentrallyInEmbed = useEmbedNonStylesConfig("align") !== "left";
  const shouldAlignCentrally = !isEmbed || shouldAlignCentrallyInEmbed;
  const {
    // So it doesn't display in the Link (and make tests fail)
    user: _user,
    orgSlug: _orgSlug,
    redirect: _redirect,
    ...query
  } = useRouterQuery();

  if (entity.considerUnpublished) {
    return (
      <div className="flex h-full min-h-[calc(100dvh)] items-center justify-center">
        <UnpublishedEntity {...entity} />
      </div>
    );
  }

  const isEventListEmpty = eventTypes.length === 0;
  const isOrg = !!user?.profile?.organization;

  return (
    <>
      <div
        data-testid="public-profile"
        data-palette={palette.id}
        style={
          {
            "--profile-background": palette.background,
            "--profile-soft": palette.soft,
            "--profile-accent": palette.accent,
          } as CSSProperties
        }
        className={classNames(
          styles.page,
          shouldAlignCentrally ? "mx-auto" : "",
          isEmbed ? "max-w-3xl" : ""
        )}>
        <main
          className={classNames(
            shouldAlignCentrally ? "mx-auto" : "",
            isEmbed ? "border-booker border-booker-width  bg-default rounded-md" : "",
            "w-full max-w-2xl px-4 py-8 sm:py-14"
          )}>
          <div
            className={classNames(
              styles.card,
              styles.hero,
              "text-default mb-6 overflow-hidden rounded-2xl border"
            )}>
            {isOrg && user.profile.organization?.bannerUrl && (
              <OrgBanner
                alt={user.profile.organization.name ?? "Organization banner"}
                imageSrc={user.profile.organization.bannerUrl}
                className="p-1 border border-subtle rounded-xl w-full object-cover"
              />
            )}
            <div
              className={classNames(
                "flex flex-col px-6 py-8 sm:px-8 sm:py-10",
                shouldAlignCentrally ? "items-center text-center" : "items-start text-left"
              )}>
              <UserAvatar
                size="xl"
                user={{
                  avatarUrl: user.avatarUrl,
                  profile: user.profile,
                  name: profile.name,
                  username: profile.username,
                }}
                fallback={
                  <span className="text-3xl font-semibold">
                    {profile.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                }
                className={classNames(
                  styles.avatar,
                  isOrg && user.profile.organization?.bannerUrl ? "-mt-14" : ""
                )}
              />
              <h1
                className={classNames(
                  "font-cal text-emphasis mb-2 text-2xl tracking-tight",
                  isOrg && user.profile.organization?.bannerUrl ? "" : "mt-4"
                )}
                data-testid="name-title">
                {profile.name}
                {!isOrg && user.verified && (
                  <Icon
                    name="badge-check"
                    className="mx-1 -mt-1 inline h-6 w-6 fill-blue-500 text-white dark:text-black"
                  />
                )}
                {isOrg && (
                  <Icon
                    name="badge-check"
                    className="mx-1 -mt-1 inline h-6 w-6 fill-yellow-500 text-white dark:text-black"
                  />
                )}
              </h1>
              {!isBioEmpty && (
                <>
                  {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via safeBio */}
                  <div
                    data-testid="public-profile-bio"
                    className={classNames(
                      styles.bio,
                      "text-default max-w-md wrap-break-word text-sm leading-relaxed [&_a]:underline"
                    )}
                    dangerouslySetInnerHTML={{ __html: props.safeBio }}
                  />
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3" data-testid="event-types">
            {eventTypes.map((type) => (
              <Link
                key={type.id}
                style={{ display: "flex", ...eventTypeListItemEmbedStyles }}
                prefetch={false}
                href={{
                  pathname: `/${user.profile.username}/${type.slug}`,
                  query,
                }}
                passHref
                onClick={async () => {
                  sdkActionManager?.fire("eventTypeSelected", {
                    eventType: type,
                  });
                }}
                className={classNames(
                  styles.card,
                  styles.event,
                  "group relative rounded-xl border transition-all focus-visible:outline-2 focus-visible:outline-offset-4"
                )}
                data-testid="event-type-link">
                <Icon
                  name="arrow-right"
                  className={classNames(
                    styles.arrow,
                    "absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  )}
                />
                {/* Don't prefetch till the time we drop the amount of javascript in [user][type] page which is impacting score for [user] page */}
                <div className="block w-full py-6 pl-6 pr-14">
                  <div className="flex flex-wrap items-center">
                    <h2 className="text-default pr-2 text-base font-semibold">{type.title}</h2>
                  </div>
                  <EventTypeDescription eventType={type} isPublic={true} shortenDescription />
                </div>
              </Link>
            ))}
          </div>

          {isEventListEmpty && <EmptyPage name={profile.name || "User"} />}
        </main>
        <Toaster position="bottom-right" />
      </div>
    </>
  );
}

export default UserPage;
