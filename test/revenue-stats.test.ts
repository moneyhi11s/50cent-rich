import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("RevenueStatsDO", () => {
  it("tracks clicks, commission, conversion rate and EPC", async () => {
    const id = env.REVENUE_STATS.idFromName(`metrics-${Date.now()}`);
    const stub = env.REVENUE_STATS.get(id);

    await stub.recordClick({
      offerId: "millionaire",
      offerName: "Millionaire Program",
      source: "youtube",
      campaign: "review-1",
      path: "/",
      ts: new Date().toISOString(),
    });

    const duplicateFirst = await stub.recordSale({
      orderId: "order-1",
      offerId: "millionaire",
      offerName: "Millionaire Program",
      source: "youtube",
      campaign: "review-1",
      commission: 25,
      ts: new Date().toISOString(),
    });

    const duplicateSecond = await stub.recordSale({
      orderId: "order-1",
      offerId: "millionaire",
      source: "youtube",
      campaign: "review-1",
      commission: 25,
    });

    const stats = await stub.getStats();

    expect(duplicateFirst).toBe(false);
    expect(duplicateSecond).toBe(true);
    expect(stats.clicks).toBe(1);
    expect(stats.confirmedSales).toBe(1);
    expect(stats.commission).toBe(25);
    expect(stats.conversionRate).toBe(1);
    expect(stats.epc).toBe(25);
    expect(stats.processedOrders).toBeUndefined();
  });
});
