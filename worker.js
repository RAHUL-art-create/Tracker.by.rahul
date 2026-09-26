// Cloudflare Worker entrypoint: handles /api/sync with D1 database and serves static assets
import { onRequestGet, onRequestPost, onRequestOptions } from "./functions/api/sync.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/sync" || url.pathname === "/api/sync/") {
      const context = { request, env, ctx, params: {} };
      if (request.method === "OPTIONS") return onRequestOptions(context);
      if (request.method === "GET") return onRequestGet(context);
      if (request.method === "POST") return onRequestPost(context);
      return new Response("Method not allowed", { status: 405 });
    }

    // Serve static assets (index.html, etc.)
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
