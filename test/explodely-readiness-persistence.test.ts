import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Explodely attribution readiness persistence", () => {
  it("keeps verified Explodely attribution after more than 100 later clicks", async () => {
    const id = env.REVENUE_STATS.idFromName(`readiness-${Date.now()}`);
    const revenue = env.REVENUE_STATS.get(id);
    const clickId = `m11.test.direct.persistence.${Date.now()}`;

    await revenue.recordClick({
      clickId,
      tid: clickId,
      offerId: "test-offer",
      offerName: "Test Offer",
      source: "direct",
      campaign: "persistence",
      path: "/",
      ts: new Date().toISOString(),
    });

    await revenue.recordExplodelySale({
      orderid: `order-${Date.now()}`,
      transactiontype: "sale",
      amount: "25",
      tid: clickId,
      saletimestamp: String(Date.now()),
    });

    for (let index = 0; index < 101; index += 1) {
      const laterClickId = `m11.test.direct.after-${index}.${Date.now()}`;
      await revenue.recordClick({
        clickId: laterClickId,
        tid: laterClickId,
        offerId: "test-offer",
        source: "direct",
        campaign: "after-sale",
      });
    }

    const stats = await revenue.getStats();
    expect(stats.explodelyAttributedSalesTotal).toBe(1);
    expect(stats.attributedSalesInRecentEvents).toBe(1);
    expect(typeof stats.lastExplodelyAttributedSaleAt).toBe("string");
  });

  it("does not let a generic webhook certify Explodely", async () => {
    const id = env.REVENUE_STATS.idFromName(`generic-${Date.now()}`);
    const revenue = env.REVENUE_STATS.get(id);
    const clickId = `m11.test.direct.generic.${Date.now()}`;

    await revenue.recordClick({
      clickId,
      tid: clickId,
      offerId: "test-offer",
      source: "direct",
      campaign: "generic",
    });

    await revenue.recordSale({
      orderId: `generic-order-${Date.now()}`,
      commission: 10,
      tid: clickId,
    });

    const stats = await revenue.getStats();
    expect(stats.explodelyAttributedSalesTotal).toBe(0);
    expect(stats.attributedSalesInRecentEvents).toBe(0);
  });
});
