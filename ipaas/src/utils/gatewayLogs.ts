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

/** Telling a proxied request apart from the gateway talking about itself, and reading the request out of it. */

import type { AccessLogFields, LogRow } from '../types/logs';
import { GATEWAY_LOG_RETENTION_DAYS } from '../constants/gatewayLogs';
import type { EnvEndpoint } from '../types/component';

// Two spellings per marker: this gateway logs abbreviated keys, Envoy's shipped json_fields the long ones.
const ACCESS_MARKERS: readonly (readonly string[])[] = [
  ['method', 'meth'],
  ['path', 'upPath'],
  ['response_code', 'respCd'],
  ['start_time', 't'],
];

// Three of four: json_fields is operator-overridable, and demanding all four would hide real traffic.
const MIN_ACCESS_MARKERS = 3;

// The tag is on operational lines too, so it says which container spoke, not what the line is.
const STREAM_TAG = /^\[[a-zA-Z]+\]\s*/;

function parseJsonObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim().replace(STREAM_TAG, '');
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isAccessLog(fields: Record<string, unknown>): boolean {
  const found = ACCESS_MARKERS.filter((spellings) => spellings.some((name) => name in fields)).length;
  return found >= MIN_ACCESS_MARKERS;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pick<T>(fields: Record<string, unknown>, read: (value: unknown) => T | null, ...names: string[]): T | null {
  for (const name of names) {
    const value = read(fields[name]);
    if (value !== null) return value;
  }
  return null;
}

/** Null for anything not positively an access log — the safe direction for a panel meant to show traffic. */
export function parseAccessLine(line: string): AccessLogFields | null {
  const fields = parseJsonObject(line);
  if (!fields || !isAccessLog(fields)) return null;
  return {
    method: pick(fields, asString, 'method', 'meth'),
    path: pick(fields, asString, 'path', 'upPath'),
    status: pick(fields, asNumber, 'response_code', 'respCd'),
    durationMs: pick(fields, asNumber, 'duration', 'dur'),
    authority: pick(fields, asString, 'authority', 'host'),
    responseFlags: pick(fields, asString, 'response_flags', 'respFlg'),
    userAgent: pick(fields, asString, 'user_agent', 'ua'),
  };
}

// Kubernetes probes every few seconds and each probe is logged, so probes dominate a quiet org.
const HEALTH_PROBE_PATH = '/_gateway-health/';
const HEALTH_PROBE_AGENT = 'kube-probe';

/** A liveness or readiness probe rather than a caller's request. Operational lines are never probes. */
export function isHealthProbe(request: AccessLogFields | null | undefined): boolean {
  if (!request) return false;
  return request.path?.startsWith(HEALTH_PROBE_PATH) === true || request.userAgent?.includes(HEALTH_PROBE_AGENT) === true;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The query's searchPhrase is a bare substring, so /greeting would also take /greeting-v2 and /internal/greeting.
export function mentionsContextPath(line: string, contextPath: string): boolean {
  if (!contextPath) return true;
  return new RegExp(`(^|[\\s"'=:])${escapeRegExp(contextPath)}(?=$|[/?#\\s"'])`).test(line);
}

// Only Public endpoints are exposed through the gateway; Project and Organization traffic stays in-cluster.
export function gatewayFrontedEndpoint(endpoints: EnvEndpoint[]): EnvEndpoint | undefined {
  return endpoints.find((e) => e.networkVisibilities?.includes('Public'));
}

/** The range reaches past what the gateway keeps, so its older part returns nothing. */
export function startsBeyondGatewayRetention(startTime: string, now = Date.now()): boolean {
  return now - new Date(startTime).getTime() > GATEWAY_LOG_RETENTION_DAYS * 24 * 3600_000;
}

/** The context an access log records is the endpoint's own path, which is where a caller's URL starts. */
export function endpointContextPath(apiContext?: string | null, url?: string | null): string {
  // A root context stays empty: '/' cannot narrow a gateway the whole organization shares.
  if (apiContext) return `/${apiContext.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  if (!url) return '';
  try {
    return new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export interface GatewayRowFilter {
  hideHealthChecks: boolean;
  /** Narrows the loaded rows, because the query's own searchPhrase already carries the endpoint's path. */
  searchPhrase?: string;
  /** Re-checks the query's substring match at a path boundary. */
  contextPath?: string;
}

// A request line is matched on its own path, so an upstream path or header that happens to carry the context cannot pass.
function isUnderContextPath(row: LogRow, contextPath: string): boolean {
  if (!contextPath) return true;
  const path = row.request?.path;
  if (path == null) return mentionsContextPath(row.logLine, contextPath);
  return path === contextPath || path.startsWith(`${contextPath}/`) || path.startsWith(`${contextPath}?`);
}

/** Runs after the fetch: the log backend can neither classify a line nor exclude a path. */
export function filterGatewayRows(rows: LogRow[], { hideHealthChecks, searchPhrase = '', contextPath = '' }: GatewayRowFilter): LogRow[] {
  const phrase = searchPhrase.trim().toLowerCase();
  if (!hideHealthChecks && !phrase && !contextPath) return rows;
  return rows.filter((row) => {
    if (hideHealthChecks && isHealthProbe(row.request)) return false;
    if (!isUnderContextPath(row, contextPath)) return false;
    return !phrase || row.logLine.toLowerCase().includes(phrase);
  });
}
