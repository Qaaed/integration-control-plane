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

import { Alert } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { GATEWAY_LOG_RETENTION_DAYS } from '../../constants/gatewayLogs';
import { noticeSx } from './LogsNotices.styles';

export interface LogsNoticesProps {
  /** The selected range starts before the gateway's retention horizon. */
  beyondRetention?: boolean;
  /** Rows loaded per source — before any client-side filter — with whether more sit behind them. */
  loaded?: { label: string; count: number; hasMore: boolean }[];
  /** A filter the log backend cannot apply is narrowing the loaded rows, so matches may sit further back. */
  clientFiltered?: boolean;
}

/** What the panel cannot show: each source stops at its own page boundary, so a merged list can look complete. */
export default function LogsNotices({ beyondRetention = false, loaded = [], clientFiltered = false }: LogsNoticesProps): JSX.Element | null {
  const cut = loaded.filter((source) => source.hasMore);
  if (!beyondRetention && cut.length === 0) return null;

  return (
    <>
      {beyondRetention && (
        <Alert severity="info" sx={noticeSx}>
          Gateway logs are kept for {GATEWAY_LOG_RETENTION_DAYS} days. Anything older than that in the selected range is no longer available.
        </Alert>
      )}
      {cut.length > 0 && (
        <Alert severity="info" sx={noticeSx}>
          Loaded the most recent {loaded.map((source) => `${source.count} ${source.label}`).join(' and ')} lines; older lines exist — use Load more to reach them.
          {clientFiltered ? ' Filters apply to the lines already loaded, so further matches may sit further back.' : ''}
        </Alert>
      )}
    </>
  );
}
