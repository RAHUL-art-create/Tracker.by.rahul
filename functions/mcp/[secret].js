// Cloudflare Pages Function: /mcp/<secret> - Personal Tracker MCP server
import { handleMcp } from "../../mcp-server/tracker-mcp.js";

export async function onRequest(context) {
  return handleMcp(context.request, context.env, context.params.secret);
}
