import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Moneyhi11s revenue API", () => {
  it("reports a healthy Worker", async () => {
    const response = await SELF.fetch("https://example.com/api/health");
    const body = await response.json() as { ok: boolean; service: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("moneyhi11s-store");
  });

  it("records a legitimate click and exposes conversion metrics", async () => {
    const click = await SELF.fetch("https://example.com/api/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        offerId: "millionaire",
        offerName: "Millionaire Program",
        source: "youtube",
        campaign: "review-1",
        path: "/",
        ts: new Date().toISOString(),
      }),
    });

    expect(click.status).toBe(200);

    const statsResponse = await SELF.fetch("https://example.com/api/stats");
    const stats = await statsResponse.json() as {
      local: {
        clicks: number;
        confirmedSales: number;
        commission: number;
        conversionRate: number;
        epc: number;
      };
    };

    expect(statsResponse.status).toBe(200);
    expect(stats.local.clicks).toBeGreaterThanOrEqual(1);
    expect(stats.local.confirmedSales).toBeGreaterThanOrEqual(0);
    expect(stats.local.commission).toBeGreaterThanOrEqual(0);
    expect(stats.local.conversionRate).toBeGreaterThanOrEqual(0);
    expect(stats.local.epc).toBeGreaterThanOrEqual(0);
  });

  it("rejects untrusted sale callbacks", async () => {
    const response = await SELF.fetch("https://example.com/api/sale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "fake-order", commission: 999 }),
    });

    expect(response.status).toBe(401);
  });
});
