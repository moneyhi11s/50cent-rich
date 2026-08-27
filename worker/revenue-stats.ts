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

type RevenueState = {
  clicks: number;
  confirmedSales: number;
  commission: number;
  byOffer: Record<string, { clicks: number; sales: number; commission: number }>;
  bySource: Record<string, { clicks: number; sales: number; commission: number }>;
  byCampaign: Record<string, { clicks: number; sales: number; commission: number }>;
  recentEvents: Array<Record<string, unknown>>;
};

const EMPTY: RevenueState = {
  clicks: 0,
  confirmedSales: 0,
  commission: 0,
  byOffer: {},
  bySource: {},
  byCampaign: {},
  recentEvents: [],
};

function bucket(
  map: RevenueState["byOffer"],
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

export class RevenueStatsDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async state(): Promise<RevenueState> {
    return (await this.ctx.storage.get<RevenueState>("revenue")) || structuredClone(EMPTY);
  }

  async recordClick(event: ClickEvent): Promise<RevenueState> {
    const state = await this.state();
    const offer = event.offerId || "unknown";
    const source = event.source || "direct";
    const campaign = event.campaign || "organic";

    state.clicks += 1;
    bucket(state.byOffer, offer, "click");
    bucket(state.bySource, source, "click");
    bucket(state.byCampaign, campaign, "click");
    state.recentEvents.unshift({ type: "click", ...event, recordedAt: new Date().toISOString() });
    state.recentEvents = state.recentEvents.slice(0, 100);
    await this.ctx.storage.put("revenue", state);
    return state;
  }

  async recordSale(event: SaleEvent): Promise<RevenueState> {
    const state = await this.state();
    const offer = event.offerId || "unknown";
    const source = event.source || "unknown";
    const campaign = event.campaign || "unknown";
    const commission = Number.isFinite(event.commission) ? Number(event.commission) : 0;

    state.confirmedSales += 1;
    state.commission += commission;
    bucket(state.byOffer, offer, "sale", commission);
    bucket(state.bySource, source, "sale", commission);
    bucket(state.byCampaign, campaign, "sale", commission);
    state.recentEvents.unshift({ type: "sale", ...event, commission, recordedAt: new Date().toISOString() });
    state.recentEvents = state.recentEvents.slice(0, 100);
    await this.ctx.storage.put("revenue", state);
    return state;
  }

  async getStats(): Promise<Record<string, unknown>> {
    const state = await this.state();
    const conversionRate = state.clicks > 0 ? state.confirmedSales / state.clicks : 0;
    const epc = state.clicks > 0 ? state.commission / state.clicks : 0;
    return {
      ...state,
      conversionRate,
      epc,
      generatedAt: new Date().toISOString(),
    };
  }
}
