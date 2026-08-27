import { DurableObject } from "cloudflare:workers";

type ClickEvent = {
  clickId?: string;
  tid?: string;
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
  tid?: string;
  ts?: string;
};

type ExplodelySaleEvent = {
  orderid?: string;
  transactiontype?: string;
  amount?: string | number;
  tid?: string;
  affcup?: string;
  saletimedate?: string;
  saletimestamp?: string | number;
};

type Bucket = { clicks: number; sales: number; commission: number };
type ClickAttribution = {
  offerId: string;
  offerName: string;
  source: string;
  campaign: string;
  recordedAt: string;
};

type RevenueState = {
  clicks: number;
  confirmedSales: number;
  commission: number;
  byOffer: Record<string, Bucket>;
  bySource: Record<string, Bucket>;
  byCampaign: Record<string, Bucket>;
  recentEvents: Array<Record<string, unknown>>;
  processedOrders: Record<string, string>;
  clickIndex: Record<string, ClickAttribution>;
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
  clickIndex: {},
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

function pruneOldest<T extends Record<string, string | ClickAttribution>>(
  map: T,
  max: number,
) {
  const entries = Object.entries(map);
  if (entries.length <= max) return;
  entries
    .map(([key, value]) => [
      key,
      typeof value === "string" ? value : value.recordedAt,
    ] as const)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .slice(0, entries.length - max)
    .forEach(([key]) => delete map[key]);
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
      clickIndex: stored?.clickIndex || {},
    };
  }

  async recordClick(event: ClickEvent): Promise<void> {
    const state = await this.state();
    const offer = clean(event.offerId, "unknown");
    const offerName = clean(event.offerName, offer);
    const source = clean(event.source, "direct");
    const campaign = clean(event.campaign, "organic");
    const clickId = clean(event.clickId || event.tid, "", 160);
    const recordedAt = new Date().toISOString();

    state.clicks += 1;
    bucket(state.byOffer, offer, "click");
    bucket(state.bySource, source, "click");
    bucket(state.byCampaign, campaign, "click");

    if (clickId) {
      state.clickIndex[clickId] = {
        offerId: offer,
        offerName,
        source,
        campaign,
        recordedAt,
      };
      pruneOldest(state.clickIndex, 10000);
    }

    state.recentEvents.unshift({
      type: "click",
      clickId: clickId || undefined,
      offerId: offer,
      offerName,
      source,
      campaign,
      path: clean(event.path, "/", 160),
      ts: clean(event.ts, recordedAt, 40),
      recordedAt,
    });
    state.recentEvents = state.recentEvents.slice(0, 100);
    await this.ctx.storage.put("revenue", state);
  }

  private async recordSaleWithState(
    state: RevenueState,
    event: SaleEvent,
  ): Promise<boolean> {
    const orderId = clean(event.orderId, "", 160);
    if (!orderId) throw new Error("orderId is required");

    if (state.processedOrders[orderId]) {
      return true;
    }

    const tid = clean(event.tid, "", 160);
    const attribution = tid ? state.clickIndex[tid] : undefined;
    const offer = clean(event.offerId, attribution?.offerId || "unknown");
    const offerName = clean(event.offerName, attribution?.offerName || offer);
    const source = clean(event.source, attribution?.source || "unknown");
    const campaign = clean(event.campaign, attribution?.campaign || "unknown");
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
    pruneOldest(state.processedOrders, 10000);

    state.recentEvents.unshift({
      type: "sale",
      offerId: offer,
      offerName,
      source,
      campaign,
      commission,
      orderId,
      tid: tid || undefined,
      attributed: Boolean(attribution),
      ts: clean(event.ts, new Date().toISOString(), 40),
      recordedAt: new Date().toISOString(),
    });
    state.recentEvents = state.recentEvents.slice(0, 100);
    await this.ctx.storage.put("revenue", state);
    return false;
  }

  async recordSale(event: SaleEvent): Promise<boolean> {
    const state = await this.state();
    return this.recordSaleWithState(state, event);
  }

  async recordExplodelySale(event: ExplodelySaleEvent): Promise<boolean> {
    const state = await this.state();
    const transactionType = clean(event.transactiontype, "sale", 30).toLowerCase();
    if (transactionType !== "sale") {
      throw new Error("Unsupported transaction type");
    }

    return this.recordSaleWithState(state, {
      orderId: clean(event.orderid, "", 160),
      commission: Number(event.amount),
      tid: clean(event.tid, "", 160),
      ts: clean(
        event.saletimestamp ? String(event.saletimestamp) : event.saletimedate,
        new Date().toISOString(),
        80,
      ),
    });
  }

  async getStats(): Promise<Record<string, unknown>> {
    const state = await this.state();
    const conversionRate = state.clicks > 0 ? state.confirmedSales / state.clicks : 0;
    const epc = state.clicks > 0 ? state.commission / state.clicks : 0;
    const attributedSales = state.recentEvents.filter(
      (event) => event.type === "sale" && event.attributed === true,
    ).length;
    const { processedOrders: _processedOrders, clickIndex: _clickIndex, ...publicState } = state;
    return {
      ...publicState,
      conversionRate,
      epc,
      attributedSalesInRecentEvents: attributedSales,
      generatedAt: new Date().toISOString(),
    };
  }
}
