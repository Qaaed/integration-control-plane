/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useCallback, useEffect, useState } from 'react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpTool } from '../types/mcp';

/** APIM gateways read the test key from this header; cloud uses the api-key-auth header. */
const DEFAULT_AUTH_HEADER = 'test-key';

interface UseMcpToolsParams {
  /** Deployed endpoint base URL — tools are listed from `${baseUrl}/mcp`. */
  baseUrl: string;
  /**
   * Credential for the server, or `null` when it needs none (an open endpoint).
   * `enabled` — not this field — gates a connection while a key is still pending.
   */
  apiKey: string | null;
  /** Request header the credential is presented in. Defaults to `test-key`. */
  authHeader?: string;
  /** Gate the connection until the endpoint + credential are ready. */
  enabled: boolean;
}

interface UseMcpToolsResult {
  tools: McpTool[];
  isLoading: boolean;
  error: string | null;
  /** 401/403 — a permissions issue, not a transient failure. */
  isForbidden: boolean;
  /** 401 only: the credential was rejected, so a fresh one can help — a 403 cannot. */
  isUnauthorized: boolean;
  refetch: () => void;
}

/**
 * Lists the tools a deployed MCP server exposes, over the MCP SDK's
 * StreamableHTTP transport (`${baseUrl}/mcp?transportType=streamable-http`,
 * credential in `authHeader`) — mirroring devant's `useMCPTools`. The connection
 * is to the deployed data-plane endpoint, not the console API, so this is an
 * external system: the connect/listTools lives in an effect, not in render.
 */
export function useMcpTools({ baseUrl, apiKey, authHeader = DEFAULT_AUTH_HEADER, enabled }: UseMcpToolsParams): UseMcpToolsResult {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    if (!enabled || !baseUrl) return undefined;
    let cancelled = false;
    let client: Client | null = null;

    (async () => {
      setIsLoading(true);
      setError(null);
      setIsForbidden(false);
      setIsUnauthorized(false);
      try {
        const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl.replace(/\/+$/, '')}/mcp?transportType=streamable-http`), {
          requestInit: { headers: apiKey ? { [authHeader]: apiKey } : {} },
        });
        client = new Client({ name: 'wip', version: '1.0.0' }, { capabilities: {} });
        await client.connect(transport);
        if (!client.getServerCapabilities()?.tools) throw new Error('MCP server does not support the tools capability');
        const response = await client.listTools();
        if (!cancelled) setTools(Array.isArray(response.tools) ? (response.tools as McpTool[]) : []);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load tools';
        // Prefer the transport's structured status code; fall back to message
        // matching only when the error isn't a typed StreamableHTTPError.
        const unauthorized = err instanceof StreamableHTTPError ? err.code === 401 : /\b401\b|unauthor/i.test(msg);
        const forbidden = unauthorized || (err instanceof StreamableHTTPError ? err.code === 403 : /\b403\b|forbidden/i.test(msg));
        if (forbidden) setIsForbidden(true);
        if (unauthorized) setIsUnauthorized(true);
        setError(msg);
      } finally {
        if (!cancelled) setIsLoading(false);
        client?.close().catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, apiKey, authHeader, enabled, refetchTrigger]);

  const refetch = useCallback(() => setRefetchTrigger((t) => t + 1), []);
  return { tools, isLoading, error, isForbidden, isUnauthorized, refetch };
}
