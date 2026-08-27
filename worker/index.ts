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
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-moneyhi11s-secret",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      ...(init.headers || {}),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const runtime = env as RuntimeEnv;
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type,x-moneyhi11s-secret",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
    }

    const revenueId = runtime.REVENUE_STATS.idFromName("global");
    const revenue = runtime.REVENUE_STATS.get(revenueId);

    if (url.pathname === "/api/click" && request.method === "POST") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        await revenue.recordClick(body);

        try {
          await fetch(`${UPSTREAM_REVENUE_API}/api/click`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch {}

        return json({ ok: true });
      } catch {
        return json({ error: "Invalid click event" }, { status: 400 });
      }
    }

    if (url.pathname === "/api/stats" && request.method === "GET") {
      const local = await revenue.getStats();
      let upstream: unknown = null;
      try {
        const response = await fetch(`${UPSTREAM_REVENUE_API}/api/stats`, {
          headers: { accept: "application/json" },
        });
        if (response.ok) upstream = await response.json();
      } catch {}
      return json({ local, upstream });
    }

    if (url.pathname === "/api/sale" && request.method === "POST") {
      const secret = runtime.SALE_WEBHOOK_SECRET;
      if (!secret || request.headers.get("x-moneyhi11s-secret") !== secret) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const state = await revenue.recordSale(body);
        return json({ ok: true, state });
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

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
