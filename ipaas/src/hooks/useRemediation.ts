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

import { useState } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideRemediation } from '../api/remediation';
import type { RemediationDecision, RemediationTarget } from '../types/remediation';
import { remediationStep } from '../utils/remediation';

const REMEDIATION_POLL_MS = 8000;
/** A run still pending after this long is given up on, so it ends in a Retry rather than polling forever. */
const REMEDIATION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * A remediation run, started on demand. While the answer is pending it asks again
 * every 8 seconds, sending back the reportId the last answer carried. Each start
 * is a new run, so it begins without one. A run started on another integration is
 * not this one's, so moving between integrations shows none.
 */
export function useRemediation(componentId: string | undefined) {
  const queryClient = useQueryClient();
  const [latest, setRun] = useState<{ target: RemediationTarget; attempt: number; startedAt: number } | null>(null);
  const run = latest?.target.componentId === componentId ? latest : null;
  const queryKey = ['remediation', run?.target.projectId, run?.target.componentId, run?.target.environmentId, run?.attempt];

  const ask = async (current: NonNullable<typeof run>): Promise<RemediationDecision> => {
    const decision = await decideRemediation(current.target, queryClient.getQueryData<RemediationDecision>(queryKey)?.reportId);
    if (decision.status !== 'pending' || Date.now() - current.startedAt < REMEDIATION_TIMEOUT_MS) return decision;
    return { status: 'unavailable', rcaNeeded: decision.rcaNeeded, reason: 'The analysis is taking longer than expected. Try again in a few minutes.', reportId: decision.reportId };
  };

  const query = useQuery({
    queryKey,
    queryFn: run ? () => ask(run) : skipToken,
    refetchInterval: (q) => (q.state.status === 'success' && q.state.data?.status === 'pending' ? REMEDIATION_POLL_MS : false),
    // Only the poll asks again; a window focus must not re-send a finished decision.
    staleTime: Infinity,
  });

  const start = (target: RemediationTarget): void => setRun((prev) => ({ target, attempt: (prev?.attempt ?? 0) + 1, startedAt: Date.now() }));
  const working = query.isFetching || (!query.isError && query.data?.status === 'pending');
  // Measured at each answer rather than on a timer: every poll lands a new dataUpdatedAt, so the step moves with the polls.
  const step = remediationStep(query.data?.reportId !== undefined, run ? query.dataUpdatedAt - run.startedAt : 0);

  // What the run looked at, which the selection may since have moved away from.
  return { query, started: run !== null, start, working, step, runTarget: run?.target };
}

export type Remediation = ReturnType<typeof useRemediation>;
