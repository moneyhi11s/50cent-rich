import type { RevenueStatsDO } from "../worker/revenue-stats";

declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {
		REVENUE_STATS: DurableObjectNamespace<RevenueStatsDO>;
	}
}
