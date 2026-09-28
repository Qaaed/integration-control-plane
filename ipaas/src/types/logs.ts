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

export interface LogsRequest {
  projectId: string;
  componentIdList: string[];
  environmentId: string;
  environmentList: string;
  logLevels: string[];
  startTime: string;
  endTime: string;
  limit: number;
  sort: 'asc' | 'desc';
  region: string;
  searchPhrase: string;
}

export interface ComponentLogsRequest {
  componentId: string;
  environmentId: string;
  versionIdList: string[];
  logLevels: string[];
  startTime: string;
  endTime: string;
  limit: number;
  sort: 'asc' | 'desc';
  region: string;
  searchPhrase: string;
  regexPhrase: string;
  logType?: string;
}

/** What produced a gateway log line: one proxied request, or the gateway talking about itself. */
export type GatewayLogKind = 'access' | 'operational';

/** The kind a panel is filtering to. `all` is a query value only; it is never the kind OF a line. */
export type GatewayLogKindFilter = GatewayLogKind | 'all';

/** A gateway log query. Gateway logs carry no project or component, so the only narrowing is the path. */
export interface GatewayLogsRequest {
  /** Omitted for an organization-wide read; set to narrow to one environment. */
  environmentId?: string;
  /** Matched against the whole line, so an integration is narrowed by its endpoint's context path. */
  searchPhrase: string;
  logLevels: string[];
  startTime: string;
  endTime: string;
  limit: number;
  sort: 'asc' | 'desc';
}

export interface LogRow {
  timestamp: string;
  level: string;
  logLine: string;
  class: string | null;
  logFilePath: string | null;
  appName: string | null;
  module: string | null;
  serviceType: string | null;
  app: string | null;
  deployment: string | null;
  artifactContainer: string | null;
  product: string | null;
  icpRuntimeId: string | null;
  logContext: unknown;
  componentVersion: string;
  componentVersionId: string;
  gatewayCode: string | null;
  statusCode: string | null;
  componentName: string | null;
  containerName: string | null;
  podName: string | null;
  /** Which stream a row came from. Absent on products that read component logs alone. */
  source?: 'component' | 'gateway';
  /** Only meaningful on a gateway row: whether the line is one proxied request or the gateway's own output. */
  kind?: GatewayLogKind;
}
