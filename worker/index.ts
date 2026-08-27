import type { RevenueStatsDO as RevenueStatsType } from "./revenue-stats";

export { MyWorkflow } from "./workflow";
export { WorkflowStatusDO } from "./durable-object";
export { RevenueStatsDO } from "./revenue-stats";

const UPSTREAM_REVENUE_API =
  "https://moneyhi11s-revenue-engine.hwydfwwf4s.workers.dev";

type RuntimeEnv = Env & {
  REVENUE_STATS: DurableObjectNamespace<RevenueStatsType>;
  SALE_WEBHOOK_SECRET?: string;
};

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(init.headers || {}),
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validClick(body: Record<string, unknown>) {
  const offerId = body.offerId;
  return typeof offerId === "string" && offerId.trim().length > 0 && offerId.length <= 120;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtime = env as RuntimeEnv;
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "moneyhi11s-store",
        version: "2026.08.27-hardening",
        now: new Date().toISOString(),
      });
    }

    const revenueId = runtime.REVENUE_STATS.idFromName("global");
    const revenue = runtime.REVENUE_STATS.get(revenueId);

    if (url.pathname === "/api/click" && request.method === "POST") {
      try {
        const parsed: unknown = await request.json();
        if (!isObject(parsed) || !validClick(parsed)) {
          return json({ error: "Invalid click event" }, { status: 400 });
        }

        await revenue.recordClick(parsed);

        // Upstream synchronization should never delay the shopper's click response.
        ctx.waitUntil(
          fetch(`${UPSTREAM_REVENUE_API}/api/click`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(parsed),
            signal: AbortSignal.timeout(2000),
          }).catch(() => undefined),
        );

        return json({ ok: true });
      } catch {
        return json({ error: "Invalid click event" }, { status: 400 });
      }
    }

    if (url.pathname === "/api/stats" && request.method === "GET") {
      const local = await revenue.getStats();
      let upstream: unknown = null;
      let upstreamOk = false;

      try {
        const response = await fetch(`${UPSTREAM_REVENUE_API}/api/stats`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(2000),
        });
        upstreamOk = response.ok;
        if (response.ok) upstream = await response.json();
      } catch {
        upstreamOk = false;
      }

      return json({ local, upstream, upstreamOk });
    }

    if (url.pathname === "/api/sale" && request.method === "POST") {
      const secret = runtime.SALE_WEBHOOK_SECRET;
      if (!secret || request.headers.get("x-moneyhi11s-secret") !== secret) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        const parsed: unknown = await request.json();
        if (!isObject(parsed) || typeof parsed.orderId !== "string" || !parsed.orderId.trim()) {
          return json({ error: "orderId is required" }, { status: 400 });
        }

        const result = await revenue.recordSale(parsed);
        return json({ ok: true, duplicate: result.duplicate, state: result.state });
      } catch {
        return json({ error: "Invalid sale event" }, { status: 400 });
      }
    }

    if (url.pathname === "/api/workflow/start" && request.method === "POST") {
      try {
        const instance = await env.MY_WORKFLOW.create({ params: { timestamp: Date.now() } });
        return json({ instanceId: instance.id, message: "Workflow started successfully" });
      } catch {
        return json({ error: "Failed to start workflow" }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/workflow/status/")) {
      const instanceId = url.pathname.split("/").pop();
      if (!instanceId) return json({ error: "Instance ID required" }, { status: 400 });
      try {
        const instance = await env.MY_WORKFLOW.get(instanceId);
        return json(await instance.status());
      } catch {
        return json({ error: "Failed to get workflow status" }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/workflow/event/") && request.method === "POST") {
      const instanceId = url.pathname.split("/").pop();
      if (!instanceId) return json({ error: "Instance ID required" }, { status: 400 });
      try {
        const body = (await request.json()) as { approved: boolean; comment?: string };
        const instance = await env.MY_WORKFLOW.get(instanceId);
        await instance.sendEvent({ type: "user-approval", payload: body });
        return json({ success: true, message: "Event sent successfully" });
      } catch {
        return json({ error: "Failed to send event" }, { status: 500 });
      }
    }

    if (url.pathname === "/ws") {
      const instanceId = url.searchParams.get("instanceId");
      if (!instanceId) return new Response("instanceId query parameter required", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected Upgrade: websocket", { status: 426 });
      try {
        const doId = env.WORKFLOW_STATUS.idFromName(instanceId);
        return env.WORKFLOW_STATUS.get(doId).fetch(request);
      } catch {
        return new Response("Failed to establish WebSocket connection", { status: 500 });
      }
    }

    return new Response("Not Found", {
      status: 404,
      headers: { "x-content-type-options": "nosniff" },
    });
  },
} satisfies ExportedHandler<Env>;
