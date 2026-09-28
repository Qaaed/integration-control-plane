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

import type { GatewayLogKind } from '../types/logs';

/** One proxied request, as the gateway's access log records it. Null fields are ones the line omitted. */
export interface AccessLogFields {
  method: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  authority: string | null;
  responseFlags: string | null;
  userAgent: string | null;
}

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

/** Anything not positively an access log is operational — the safe direction for a panel meant to show traffic. */
export function classifyGatewayLine(line: string): GatewayLogKind {
  const fields = parseJsonObject(line);
  return fields && isAccessLog(fields) ? 'access' : 'operational';
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

/** Returns null for a line that is not an access log, so a caller renders it raw instead. */
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
export function isHealthProbeLine(line: string): boolean {
  const fields = parseAccessLine(line);
  if (!fields) return false;
  return fields.path?.startsWith(HEALTH_PROBE_PATH) === true || fields.userAgent?.includes(HEALTH_PROBE_AGENT) === true;
}

/** The context an access log records is the endpoint's own path, which is where a caller's URL starts. */
export function endpointContextPath(apiContext?: string | null, url?: string | null): string {
  if (apiContext) return apiContext.startsWith('/') ? apiContext : `/${apiContext}`;
  if (!url) return '';
  try {
    return new URL(url).pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
}
