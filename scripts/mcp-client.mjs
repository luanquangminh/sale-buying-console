// Connect to the app's MCP endpoint like Claude / ChatGPT would and exercise the tools.
// Usage: node scripts/mcp-client.mjs [baseUrl] [username:password]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [base = "http://localhost:5173", key, pfiNo] = process.argv.slice(2);
if (!key) { console.error("usage: node scripts/mcp-client.mjs [baseUrl] <username:password> [pfiNo]"); process.exit(1); }
const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { "X-API-Key": key } } });
const client = new Client({ name: "mcp-client-check", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log("connected; tools:", tools.map((t) => t.name).join(", "));
const show = (r) => console.log(r.content[0].text.slice(0, 600));
show(await client.callTool({ name: "list_pfis", arguments: {} }));
if (pfiNo) {
  show(await client.callTool({ name: "get_pfi", arguments: { pfiNo } }));
}
await client.close();
