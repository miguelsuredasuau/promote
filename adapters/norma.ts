import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface NormaConnection {
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}
export async function connectNorma(token: string, signal: AbortSignal): Promise<NormaConnection> {
  const client = new Client({ name: 'promote-independent-review', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://api.qualityclouds.ai/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal },
  });
  try { await client.connect(transport); } catch { await client.close().catch(() => {}); throw Error('norma_connection_failed'); }
  return {
    async call(name, args) {
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000, signal });
      if (result.isError) throw Error('norma_tool_failed');
      const structured = result.structuredContent as { result?: unknown } | undefined;
      const blocks = Array.isArray(result.content) ? result.content : [];
      const text = blocks.find((item: {type?: string}) => item.type === 'text') as { text: string } | undefined;
      const value = structured?.result ?? text?.text;
      if (typeof value !== 'string') throw Error('norma_response_invalid');
      return JSON.parse(value);
    },
    close: () => client.close(),
  };
}
