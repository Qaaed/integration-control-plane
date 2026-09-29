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

import { Box, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { statusDotSx, visuallyHiddenSx } from './LogsStatus.styles';

export interface LogsStatusProps {
  /** Rows on screen, after every filter. */
  count: number;
  live: boolean;
  /** Set when a query fails: turns the dot red and becomes its tooltip. */
  failure?: string;
}

export default function LogsStatus({ count, live, failure }: LogsStatusProps): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" gap={1} role="status" aria-live="polite" sx={{ mb: 1, mt: 1.5 }}>
      <Tooltip title={failure ?? (live ? 'Refreshing automatically' : 'Auto fetch is off')}>
        <Box component="span" aria-hidden sx={statusDotSx(failure ? 'error.main' : 'success.main')} />
      </Tooltip>
      <Typography variant="body2" color="text.secondary">
        {live ? 'Live Logs' : 'Logs'} | {count} {count === 1 ? 'line' : 'lines'}
        {failure ? (
          <Box component="span" sx={visuallyHiddenSx}>
            {` — ${failure}`}
          </Box>
        ) : null}
      </Typography>
    </Stack>
  );
}
