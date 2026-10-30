// Cloudflare Pages Function: /api/mcp-link - create or replace the secret AI link
import { handleMcpLink } from "../../mcp-server/tracker-mcp.js";

export async function onRequest(context) {
  return handleMcpLink(context.request, context.env);
}
