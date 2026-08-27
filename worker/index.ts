import type { RevenueStatsDO as RevenueStatsType } from "./revenue-stats";

export { MyWorkflow } from "./workflow";
export { WorkflowStatusDO } from "./durable-object";
export { RevenueStatsDO } from "./revenue-stats";

const UPSTREAM_REVENUE_API =
  "https://moneyhi11s-revenue-engine.hwydfwwf4s.workers.dev";

type RuntimeEnv = Env & {
  REVENUE_STATS: DurableObjectNamespace<RevenueStatsType>;
  SALE_WEBHOOK_SECRET?: string;
  EXPLODELY_ISN_TOKEN?: string;
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

function integrationReadiness(runtime: RuntimeEnv) {
  const explodelyIsnReady = Boolean(runtime.EXPLODELY_ISN_TOKEN);
  const protectedSaleWebhookReady = Boolean(runtime.SALE_WEBHOOK_SECRET);

  return {
    explodelyIsnReady,
    protectedSaleWebhookReady,
    revenueAttributionReady: explodelyIsnReady,
    blockingIssues: explodelyIsnReady
      ? []
      : [
          "EXPLODELY_ISN_TOKEN is not configured; confirmed Explodely sales cannot be ingested.",
        ],
  };
}

async function parseExplodelyIsn(request: Request) {
  const url = new URL(request.url);
  const values: Record<string, string> = {};

  url.searchParams.forEach((value, key) => {
    values[key] = value;
  });

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const parsed: unknown = await request.json();
      if (isObject(parsed)) {
        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === "string" || typeof value === "number") {
            values[key] = String(value);
          }
        });
      }
    } else {
      const body = await request.text();
      const form = new URLSearchParams(body);
      form.forEach((value, key) => {
        values[key] = value;
      });
    }
  }

  return values;
}

function timingSafeEqualText(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtime = env as RuntimeEnv;
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "moneyhi11s-store",
        version: "2026.08.27-readiness-gate",
        integrations: integrationReadiness(runtime),
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

      return json({
        local,
        upstream,
        upstreamOk,
        integrations: integrationReadiness(runtime),
      });
    }

    if (
      url.pathname === "/api/explodely/isn" &&
      (request.method === "GET" || request.method === "POST")
    ) {
      const secret = runtime.EXPLODELY_ISN_TOKEN;
      const supplied =
        url.searchParams.get("key") ||
        request.headers.get("x-moneyhi11s-isn-token") ||
        "";

      if (!secret) {
        return json({ error: "Explodely ISN listener not configured" }, { status: 503 });
      }
      if (!supplied || !timingSafeEqualText(secret, supplied)) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        const isn = await parseExplodelyIsn(request);
        if (!isn.orderid || !isn.tid) {
          return json({ error: "orderid and tid are required" }, { status: 400 });
        }
        const duplicate = await revenue.recordExplodelySale(isn);
        return json({ ok: true, duplicate });
      } catch {
        return json({ error: "Invalid Explodely ISN" }, { status: 400 });
      }
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

        const duplicate = await revenue.recordSale(parsed);
        return json({ ok: true, duplicate });
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
