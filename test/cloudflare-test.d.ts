declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {
		REVENUE_STATS: DurableObjectNamespace;
	}
}
