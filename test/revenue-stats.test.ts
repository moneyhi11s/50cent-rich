import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

type StatsPayload = {
  local: {
    clicks: number;
    confirmedSales: number;
    commission: number;
    conversionRate: number;
    epc: number;
  };
  integrations: {
    explodelyIsnReady: boolean;
    protectedSaleWebhookReady: boolean;
    revenueAttributionReady: boolean;
    blockingIssues: string[];
  };
};

describe("Moneyhi11s revenue API", () => {
  it("reports a healthy Worker and integration readiness", async () => {
    const response = await SELF.fetch("https://example.com/api/health");
    const body = (await response.json()) as unknown as {
      ok: boolean;
      service: string;
      integrations: {
        explodelyIsnReady: boolean;
        protectedSaleWebhookReady: boolean;
        revenueAttributionReady: boolean;
        blockingIssues: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("moneyhi11s-store");
    expect(typeof body.integrations.explodelyIsnReady).toBe("boolean");
    expect(typeof body.integrations.protectedSaleWebhookReady).toBe("boolean");
    expect(body.integrations.revenueAttributionReady).toBe(
      body.integrations.explodelyIsnReady,
    );
    expect(Array.isArray(body.integrations.blockingIssues)).toBe(true);
    if (!body.integrations.explodelyIsnReady) {
      expect(body.integrations.blockingIssues.length).toBeGreaterThan(0);
    }
  });

  it("records a tracked click and exposes conversion metrics", async () => {
    const clickId = `m11.millionaire.youtube.review-1.${Date.now()}`;
    const click = await SELF.fetch("https://example.com/api/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clickId,
        tid: clickId,
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
    const stats = (await statsResponse.json()) as unknown as StatsPayload;

    expect(statsResponse.status).toBe(200);
    expect(stats.local.clicks).toBeGreaterThanOrEqual(1);
    expect(stats.local.confirmedSales).toBeGreaterThanOrEqual(0);
    expect(stats.local.commission).toBeGreaterThanOrEqual(0);
    expect(stats.local.conversionRate).toBeGreaterThanOrEqual(0);
    expect(stats.local.epc).toBeGreaterThanOrEqual(0);
    expect(typeof stats.integrations.explodelyIsnReady).toBe("boolean");
    expect(stats.integrations.revenueAttributionReady).toBe(
      stats.integrations.explodelyIsnReady,
    );
    expect(Array.isArray(stats.integrations.blockingIssues)).toBe(true);
  });

  it("fails closed when the Explodely ISN secret is not configured", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/explodely/isn?orderid=demo&tid=demo&amount=1",
    );
    expect([401, 503]).toContain(response.status);
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
