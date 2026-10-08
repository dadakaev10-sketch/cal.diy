import prismaMock from "@calcom/testing/lib/__mocks__/prisma";
import { getGoogleMeetCredential, TestData } from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { describe, expect, it } from "vitest";
import { MeetLocationType } from "../locations";
import { getDefaultLocations } from "./getDefaultLocations";

type User = {
  id: number;
  email: string;
  name?: string;
  metadata: {
    defaultConferencingApp?: {
      appSlug: string;
      appLink: string;
    };
  };
  credentials?: [
    {
      key: {
        expiry_date?: number;
        token_type?: string;
        access_token?: string;
        refresh_token?: string;
        scope: string;
      };
    },
  ];
};
describe("getDefaultLocation ", async () => {
  it("should return location based on user default conferencing app", async () => {
    const user: User = {
      id: 101,
      email: "test@example.com",
      metadata: {
        defaultConferencingApp: {
          appSlug: "google-meet",
          appLink: "https://example.com",
        },
      },
      credentials: [getGoogleMeetCredential()],
    };
    await mockUser(user);
    await addAppsToDb([TestData.apps["google-meet"]]);
    const res = await getDefaultLocations(user);
    expect(res[0]).toEqual({
      link: "https://example.com",
      type: MeetLocationType,
    });
  });
  it("should leave location unset even when the retired provider has keys", async () => {
    const user: User = {
      id: 101,
      email: "test@example.com",
      metadata: {},
    };
    await mockUser(user);
    await addAppsToDb([TestData.apps["daily-video"]]);
    await prismaMock.app.create({
      data: {
        ...TestData.apps["daily-video"],
        enabled: true,
      },
    });
    const res = await getDefaultLocations(user);
    expect(res).toEqual([]);
  });
  it("should ignore a retired default provider", async () => {
    expect(
      await getDefaultLocations({
        id: 101,
        email: "test@example.com",
        metadata: {
          defaultConferencingApp: { appSlug: "daily-video", appLink: "" },
        },
      })
    ).toEqual([]);
  });
  it("should not replace an unavailable provider with another provider", async () => {
    const user: User = {
      id: 101,
      email: "test@example.com",
      metadata: {
        defaultConferencingApp: { appSlug: "unavailable-provider", appLink: "" },
      },
    };
    await mockUser(user);
    expect(await getDefaultLocations(user)).toEqual([]);
  });
});

async function mockUser(user: User) {
  const userToCreate: any = {
    ...TestData.users.example,
    ...user,
  };
  if (user.credentials) {
    userToCreate.credentials = {
      createMany: {
        data: user.credentials,
      },
    };
  }
  return await prismaMock.user.create({
    data: userToCreate,
  });
}
async function addAppsToDb(apps: any[]) {
  await prismaMock.app.createMany({
    data: apps.map((app) => {
      return { ...app, enabled: true };
    }),
  });
}
