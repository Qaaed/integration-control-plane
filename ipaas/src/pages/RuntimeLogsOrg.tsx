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

import { Stack } from '@wso2/oxygen-ui';
import { useMemo, type JSX } from 'react';
import LogEntry from '../components/Logs/LogEntry';
import LogsFilters from '../components/Logs/LogsFilters';
import LogsPageLayout from '../components/Logs/LogsPageLayout';
import LogsNotices from '../components/Logs/LogsNotices';
import LogsStatus from '../components/Logs/LogsStatus';
import LogsPanel from '../components/Logs/LogsPanel';
import { GATEWAY_LOGS_FAILED } from '../constants/gatewayLogs';
import { useInfiniteGatewayLogs, useVisibleLogs } from '../hooks/useLogs';
import { useLogsFilters } from '../hooks/useLogsFilters';
import type { GatewayLogsRequest } from '../types/logs';
import { filterGatewayRows, startsBeyondGatewayRetention } from '../utils/gatewayLogs';
import { AUTO_FETCH_INTERVAL, PAGE_SIZE } from '../utils/logs';

/** The organization's API gateway logs. The data has no project or component dimension, so this reads all of it. */
export default function RuntimeLogsOrg(): JSX.Element {
  const filters = useLogsFilters();
  const { levelFilter, sortDir, searchPhrase, autoFetch, startTime, endTime, hideHealthChecks } = filters;

  const logsRequest: GatewayLogsRequest = useMemo(() => ({ searchPhrase, startTime, endTime, limit: PAGE_SIZE, sort: sortDir }), [searchPhrase, startTime, endTime, sortDir]);

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useInfiniteGatewayLogs(logsRequest, autoFetch ? AUTO_FETCH_INTERVAL : false);
  const rows = useVisibleLogs(data, { levels: levelFilter });

  const logs = useMemo(() => filterGatewayRows(rows, { hideHealthChecks }), [rows, hideHealthChecks]);

  const beyondRetention = startsBeyondGatewayRetention(startTime);

  return (
    <LogsPageLayout
      title="Runtime Logs"
      filtersElement={<LogsFilters filters={filters} environments={[]} logs={logs} logsRequest={logsRequest} onRefetch={refetch} gatewayControls />}
      logPanelElement={
        <Stack sx={{ minHeight: 0, flex: 1 }}>
          <LogsNotices beyondRetention={beyondRetention} />
          <LogsStatus count={logs.length} live={autoFetch} failure={error ? GATEWAY_LOGS_FAILED : undefined} />
          <LogsPanel
            items={logs}
            getKey={(l, i) => `${i}-${l.timestamp}-${l.logLine.slice(0, 50)}`}
            renderRow={(l, ex, tg) => <LogEntry log={l} expanded={ex} onToggle={tg} />}
            isLoading={isLoading}
            error={error}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onRefetch={refetch}
            onFetchNextPage={fetchNextPage}
            onClearFilters={filters.clearFilters}
          />
        </Stack>
      }
    />
  );
}
