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

// logsApiUrl is a full URL passed by callers; split into origin + path for createHttpClient.
// A static named client is deferred until callers are refactored (same pattern as alertingClient).
import { createHttpClient } from './httpClients';
import type { LogsRequest, ComponentLogsRequest, GatewayLogsPage, GatewayLogsRequest, LogRow } from '../../types/logs';

interface Column {
  name: string;
  type: string;
}

const COLUMN_MAP: Record<string, keyof LogRow> = {
  TimeGenerated: 'timestamp',
  LogLevel: 'level',
  LogEntry: 'logLine',
  Class: 'class',
  LogFilePath: 'logFilePath',
  AppName: 'appName',
  Module: 'module',
  ServiceType: 'serviceType',
  App: 'app',
  Deployment: 'deployment',
  ArtifactContainer: 'artifactContainer',
  Product: 'product',
  IcpRuntimeId: 'icpRuntimeId',
  LogContext: 'logContext',
  ComponentVersion: 'componentVersion',
  ComponentVersionId: 'componentVersionId',
  GatewayCode: 'gatewayCode',
  StatusCode: 'statusCode',
};

async function postLogs(url: string, body: unknown): Promise<LogRow[]> {
  const parsed = new URL(url);
  const json = await createHttpClient(() => parsed.origin).post<{ columns: Column[]; rows: (string | null)[][] }>(`${parsed.pathname}${parsed.search}`, body);
  const indexMap: Record<number, keyof LogRow> = {};
  (json.columns ?? []).forEach((col, i) => {
    const key = COLUMN_MAP[col.name];
    if (key) indexMap[i] = key;
  });
  return (json.rows ?? []).map((row) => {
    const entry = {} as Record<string, unknown>;
    row.forEach((val, i) => {
      const key = indexMap[i];
      if (key) entry[key] = val;
    });
    return entry as unknown as LogRow;
  });
}

export async function fetchLogs(req: LogsRequest, logsApiUrl: string): Promise<LogRow[]> {
  return postLogs(logsApiUrl, req);
}

export async function fetchComponentLogs(req: ComponentLogsRequest, logsApiUrl: string): Promise<LogRow[]> {
  return postLogs(logsApiUrl, req);
}

// Gateway logs come from the wso2cloud observability proxy, which the Choreo logging API has no equivalent for.
export function fetchGatewayLogs(_req: GatewayLogsRequest): Promise<GatewayLogsPage> {
  throw new Error('[wip] logs.fetchGatewayLogs: not implemented');
}
