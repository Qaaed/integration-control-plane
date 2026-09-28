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

import { describe, expect, it } from 'vitest';
import type { LogRow } from '../types/logs';
import { classifyGatewayLine, endpointContextPath, filterGatewayRows, isHealthProbeLine, parseAccessLine } from './gatewayLogs';

// Taken from a DEV gateway: the apip gateway tags every line `[rtr]` and logs abbreviated keys.
const RTR_ACCESS_LINE =
  '[rtr] ' +
  JSON.stringify({
    bytesRx: 0,
    bytesTx: 18,
    dur: 4,
    host: 'api.example.com',
    meth: 'GET',
    path: '/hello-world-service-endpoint-90-37b21ad5/greeting',
    proto: 'HTTP/2',
    reqId: 'fba61c85',
    respCd: 200,
    respFlg: '-',
    t: '2026-09-28T04:43:03.709Z',
    ua: 'curl/8.7.1',
    upPath: '/greeting',
  });

// The same gateway's operational output carries the same tag, so the tag cannot be the test.
const RTR_OPERATIONAL_LINE = '[rtr] [2026-09-27 12:45:50.065][59][warning][misc] [source/common/protobuf/message_validator_impl.cc:23] Deprecated field: envoy.config.cluster.v3.Cluster';

// Envoy's own json_fields spelling, which other gateways ship.
const ENVOY_ACCESS_LINE = JSON.stringify({
  authority: 'api.example.com',
  duration: 12,
  method: 'GET',
  path: '/orders',
  response_code: 201,
  response_flags: '-',
  start_time: '2026-09-12T06:00:00.000Z',
  user_agent: 'curl/8.7.1',
});

describe('classifyGatewayLine', () => {
  it.each([
    ['a tagged access line', RTR_ACCESS_LINE, 'access'],
    ['an untagged envoy access line', ENVOY_ACCESS_LINE, 'access'],
    ['a tagged operational line', RTR_OPERATIONAL_LINE, 'operational'],
    ['an access line missing one marker', '{"meth":"POST","path":"/orders","respCd":201,"dur":8}', 'access'],
    ['a policy-engine error', '{"time":"2026-09-12T06:00:00Z","level":"ERROR","msg":"policy evaluation failed","policy":"ratelimit_v1"}', 'operational'],
    ['a controller reconcile line', '{"level":"info","ts":"2026-09-12T06:00:00Z","msg":"reconciled API","api":"pizzashack"}', 'operational'],
    ['envoy plain text', '[2026-09-12 06:00:00.123][1][info][main] initializing epoch 0', 'operational'],
    ['two markers only', '{"meth":"internal","path":"/healthz"}', 'operational'],
    ['truncated json', '{"meth":"GET","path":"/a","respCd":', 'operational'],
    ['a json array', '[{"meth":"GET","path":"/a","respCd":200}]', 'operational'],
    ['an empty line', '', 'operational'],
    ['whitespace', '   \n', 'operational'],
  ])('classifies %s', (_label, line, expected) => {
    expect(classifyGatewayLine(line)).toBe(expected);
  });

  it('reads the line, not the whitespace a collector wrapped it in', () => {
    expect(classifyGatewayLine(`  \n${RTR_ACCESS_LINE}\t`)).toBe('access');
  });
});

describe('parseAccessLine', () => {
  it('reads the request out of a tagged access line', () => {
    expect(parseAccessLine(RTR_ACCESS_LINE)).toEqual({
      method: 'GET',
      path: '/hello-world-service-endpoint-90-37b21ad5/greeting',
      status: 200,
      durationMs: 4,
      authority: 'api.example.com',
      responseFlags: '-',
      userAgent: 'curl/8.7.1',
    });
  });

  it('reads the envoy spelling just the same', () => {
    expect(parseAccessLine(ENVOY_ACCESS_LINE)).toEqual({
      method: 'GET',
      path: '/orders',
      status: 201,
      durationMs: 12,
      authority: 'api.example.com',
      responseFlags: '-',
      userAgent: 'curl/8.7.1',
    });
  });

  it('leaves out fields the gateway did not log', () => {
    expect(parseAccessLine('{"meth":"POST","path":"/orders","respCd":201,"dur":8}')).toEqual({
      method: 'POST',
      path: '/orders',
      status: 201,
      durationMs: 8,
      authority: null,
      responseFlags: null,
      userAgent: null,
    });
  });

  // A status the gateway wrote as a string is not a status this can report as a number.
  it('ignores a field of the wrong type', () => {
    expect(parseAccessLine('{"meth":"GET","path":"/a","respCd":"200","t":"x"}')?.status).toBeNull();
  });

  it('returns null for an operational line, so the caller renders it raw', () => {
    expect(parseAccessLine(RTR_OPERATIONAL_LINE)).toBeNull();
  });
});

describe('isHealthProbeLine', () => {
  const probe = '[rtr] ' + JSON.stringify({ meth: 'GET', path: '/_gateway-health/ready', respCd: 200, t: 'x', ua: 'kube-probe/1.33' });

  it.each([
    ['a probe by path and agent', probe, true],
    ['a probe the gateway logged without a user agent', '[rtr] {"meth":"GET","path":"/_gateway-health/live","respCd":200,"t":"x"}', true],
    ['a caller whose agent is kube-probe', '[rtr] {"meth":"GET","path":"/orders","respCd":200,"t":"x","ua":"kube-probe/1.33"}', true],
    ['a real request', RTR_ACCESS_LINE, false],
    ['an operational line', RTR_OPERATIONAL_LINE, false],
  ])('reports %s', (_label, line, expected) => {
    expect(isHealthProbeLine(line)).toBe(expected);
  });
});

describe('endpointContextPath', () => {
  it.each([
    ['the declared context, leading slash added', '/greeting-service', null, '/greeting-service'],
    ['a context declared without one', 'greeting-service', null, '/greeting-service'],
    ['the path of the invoke URL when no context is declared', null, 'https://gw.example.com/hello-world-endpoint-90-37b21ad5', '/hello-world-endpoint-90-37b21ad5'],
    ['a trailing slash removed, so the value matches what a log line carries', null, 'https://gw.example.com/hello/', '/hello'],
    ['nothing to go on', null, null, ''],
    ['a URL that will not parse', null, 'not a url', ''],
  ])('reads %s', (_label, apiContext, url, expected) => {
    expect(endpointContextPath(apiContext, url)).toBe(expected);
  });
});

describe('filterGatewayRows', () => {
  const row = (logLine: string, kind: 'access' | 'operational'): LogRow => ({ logLine, kind, source: 'gateway' }) as LogRow;
  const rows = [row(RTR_ACCESS_LINE, 'access'), row('[rtr] ' + JSON.stringify({ meth: 'GET', path: '/_gateway-health/ready', respCd: 200, t: 'x', ua: 'kube-probe/1.33' }), 'access'), row(RTR_OPERATIONAL_LINE, 'operational')];

  // Returning the same array keeps a caller's memoized identity stable.
  it('returns the rows untouched when nothing narrows them', () => {
    expect(filterGatewayRows(rows, { kind: 'all', hideHealthChecks: false })).toBe(rows);
  });

  it('keeps only the requested kind', () => {
    expect(filterGatewayRows(rows, { kind: 'operational', hideHealthChecks: false })).toHaveLength(1);
    expect(filterGatewayRows(rows, { kind: 'access', hideHealthChecks: false })).toHaveLength(2);
  });

  it('drops health probes without dropping real requests', () => {
    const kept = filterGatewayRows(rows, { kind: 'access', hideHealthChecks: true });
    expect(kept).toHaveLength(1);
    expect(kept[0].logLine).toBe(RTR_ACCESS_LINE);
  });

  it('narrows by a phrase, case-insensitively', () => {
    expect(filterGatewayRows(rows, { kind: 'all', hideHealthChecks: false, searchPhrase: 'GREETING' })).toHaveLength(1);
    expect(filterGatewayRows(rows, { kind: 'all', hideHealthChecks: false, searchPhrase: '   ' })).toBe(rows);
  });
});
