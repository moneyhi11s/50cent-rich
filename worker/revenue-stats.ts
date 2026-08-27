import { DurableObject } from "cloudflare:workers";

type ClickEvent = {
  offerId?: string;
  offerName?: string;
  source?: string;
  campaign?: string;
  path?: string;
  ts?: string;
};

type SaleEvent = {
  offerId?: string;
  offerName?: string;
  source?: string;
  campaign?: string;
  commission?: number;
  orderId?: string;
  ts?: string;
};

type Bucket = { clicks: number; sales: number; commission: number };

type RevenueState = {
  clicks: number;
  confirmedSales: number;
  commission: number;
  byOffer: Record<string, Bucket>;
  bySource: Record<string, Bucket>;
  byCampaign: Record<string, Bucket>;
  recentEvents: Array<Record<string, unknown>>;
  processedOrders: Record<string, string>;
};

const EMPTY: RevenueState = {
  clicks: 0,
  confirmedSales: 0,
  commission: 0,
  byOffer: {},
  bySource: {},
  byCampaign: {},
  recentEvents: [],
  processedOrders: {},
};

function bucket(
  map: Record<string, Bucket>,
  key: string,
  type: "click" | "sale",
  commission = 0,
) {
  const current = map[key] || { clicks: 0, sales: 0, commission: 0 };
  if (type === "click") current.clicks += 1;
  if (type === "sale") {
    current.sales += 1;
    current.commission += commission;
  }
  map[key] = current;
}

function clean(value: unknown, fallback: string, max = 120) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

export class RevenueStatsDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async state(): Promise<RevenueState> {
    const stored = await this.ctx.storage.get<RevenueState>("revenue");
    return {
      ...structuredClone(EMPTY),
      ...(stored || {}),
      processedOrders: stored?.processedOrders || {},
    };
  }

  async recordClick(event: ClickEvent): Promise<RevenueState> {
    const state = await this.state();
    const offer = clean(event.offerId, "unknown");
    const source = clean(event.source, "direct");
    const campaign = clean(event.campaign, "organic");

    state.clicks += 1;
    bucket(state.byOffer, offer, "click");
    bucket(state.bySource, source, "click");
    bucket(state.byCampaign, campaign, "click");
    state.recentEvents.unshift({
      type: "click",
      offerId: offer,
      offerName: clean(event.offerName, offer),
      source,
      campaign,
      path: clean(event.path, "/", 160),
      ts: clean(event.ts, new Date().toISOString(), 40),
      recordedAt: new Date().toISOString(),
    });
    state.recentEvents = state.recentEvents.slice(0, 100);
    await this.ctx.storage.put("revenue", state);
    return state;
  }

  async recordSale(event: SaleEvent): Promise<{ state: RevenueState; duplicate: boolean }> {
    const state = await this.state();
    const orderId = clean(event.orderId, "", 160);
    if (!orderId) throw new Error("orderId is required");

    if (state.processedOrders[orderId]) {
      return { state, duplicate: true };
    }

    const offer = clean(event.offerId, "unknown");
    const source = clean(event.source, "unknown");
    const campaign = clean(event.campaign, "unknown");
    const rawCommission = Number(event.commission);
    const commission = Number.isFinite(rawCommission) && rawCommission >= 0 && rawCommission <= 100000
      ? rawCommission
      : 0;

    state.confirmedSales += 1;
    state.commission += commission;
    bucket(state.byOffer, offer, "sale", commission);
    bucket(state.bySource, source, "sale", commission);
    bucket(state.byCampaign, campaign, "sale", commission);
    state.processedOrders[orderId] = new Date().toISOString();

    // Keep enough dedupe history for retries without allowing the state object to
    // grow forever. Oldest entries are removed first.
    const processed = Object.entries(state.processedOrders);
    if (processed.length > 5000) {
      processed
        .sort((a, b) => a[1].localeCompare(b[1]))
        .slice(0, processed.length - 5000)
        .forEach(([id]) => delete state.processedOrders[id]);
    }

    state.recentEvents.unshift({
      type: "sale",
      offerId: offer,
      offerName: clean(event.offerName, offer),
      source,
      campaign,
      commission,
      orderId,
      ts: clean(event.ts, new Date().toISOString(), 40),
      recordedAt: new Date().toISOString(),
    });
    state.recentEvents = state.recentEvents.slice(0, 100);
    await this.ctx.storage.put("revenue", state);
    return { state, duplicate: false };
  }

  async getStats(): Promise<Record<string, unknown>> {
    const state = await this.state();
    const conversionRate = state.clicks > 0 ? state.confirmedSales / state.clicks : 0;
    const epc = state.clicks > 0 ? state.commission / state.clicks : 0;
    const { processedOrders: _processedOrders, ...publicState } = state;
    return {
      ...publicState,
      conversionRate,
      epc,
      generatedAt: new Date().toISOString(),
    };
  }
}
