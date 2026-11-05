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

import { bff, BffError } from './_client';
import type { RemediationDecision, RemediationTarget } from '../types/remediation';

interface BffRemediationDecision {
  status: 'pending' | 'ready' | 'unavailable';
  rcaNeeded: boolean | null;
  reason: string;
  reportId?: string;
  summary?: string;
}

/** A pending answer may omit the id it issued earlier, so the known one is kept. */
export function toRemediationDecision(wire: BffRemediationDecision, knownReportId?: string): RemediationDecision {
  const base = { rcaNeeded: wire.rcaNeeded, reason: wire.reason, reportId: wire.reportId ?? knownReportId };
  // The backend answers "ready" with no summary when it decided not to analyze (no recent errors, or triage
  // judged them not worth it); that is not a result to act on.
  if (wire.status === 'ready') return wire.summary ? { ...base, status: 'ready', summary: wire.summary } : { ...base, status: 'unneeded' };
  return { ...base, status: wire.status };
}

/**
 * POST /remediation/decide. The first call sends no reportId; once the backend
 * issues one, every poll sends it back. A 504 means the backend is still working.
 */
export async function decideRemediation(target: RemediationTarget, reportId?: string): Promise<RemediationDecision> {
  const body = {
    project: target.projectId,
    component: target.componentId,
    environment: target.environmentId,
    ...(reportId ? { reportId } : {}),
  };
  try {
    return toRemediationDecision(await bff.post<BffRemediationDecision>('/remediation/decide', body), reportId);
  } catch (err) {
    if (err instanceof BffError && err.status === 504) return { status: 'pending', rcaNeeded: false, reason: '', reportId };
    throw err;
  }
}
