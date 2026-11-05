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

// The SRE agent tags entities so its own UI can link them: `<comp:name>`, `<proj:name>`, `<env:name>`, `<ns:name>`.
const ENTITY_TAG = /`?<(?:comp|proj|env|ns):([^<>]+)>`?/g;

/** The summary with each entity tag replaced by the entity's name. */
export function plainSummary(text: string): string {
  return text.replace(ENTITY_TAG, '$1');
}

const ANALYSIS_STEPS = ['Running root cause analysis…', 'Tracing the failing flow…', 'Drafting a fix summary…'];
const STEP_MS = 20_000;

/**
 * What a pending run is doing, for the progress line. The backend reports no stages: it is reading
 * the logs until it opens a report, and after that the steps only advance on time, stopping on the last.
 */
export function remediationStep(hasReport: boolean, elapsedMs: number): string {
  if (!hasReport) return 'Analyzing recent error logs…';
  return ANALYSIS_STEPS[Math.min(Math.floor(Math.max(elapsedMs, 0) / STEP_MS), ANALYSIS_STEPS.length - 1)];
}
