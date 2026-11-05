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

/** The integration deployment a remediation run looks at. */
export interface RemediationTarget {
  projectId: string;
  componentId: string;
  environmentId: string;
}

interface RemediationBase {
  /** Null when the backend could not decide, e.g. it could not reach the logs. */
  rcaNeeded: boolean | null;
  reason: string;
  /** Issued once the backend has started a report; later polls send it back. */
  reportId?: string;
}

/** `unneeded`: the backend decided there was nothing to analyze, e.g. no recent errors; `reason` says why. */
export type RemediationDecision = (RemediationBase & { status: 'pending' }) | (RemediationBase & { status: 'ready'; summary: string }) | (RemediationBase & { status: 'unneeded' }) | (RemediationBase & { status: 'unavailable' });
