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

/**
 * Predicates over the raw `deploymentStatusV2` string a deployment carries
 * (`ACTIVE` | `IN_PROGRESS` | `ERROR` | `SUSPENDED`, or absent when never deployed).
 *
 * These read the wire value, NOT the `DeploymentStatus` union in `types/deployment.ts` —
 * that one is the display vocabulary (`'Active'`, `'InProgress'`, …) which
 * `DeployEnvironmentCard` maps into for rendering.
 */

/**
 * The workload is running, so a live request to it can succeed. For gating an actual
 * connection — the agent chat, the MCP tools list — not for gating informational UI.
 *
 * Deliberately `=== 'ACTIVE'` rather than "not in progress": a degraded deployment reports
 * `ERROR`, and treating that as ready would point those connections at a workload that is
 * crash-looping or was never rendered.
 *
 * Do NOT use this to gate endpoint URLs, API contracts or consumer management. Those stay on
 * `!== 'IN_PROGRESS'`, because this predicate also excludes `SUSPENDED` — the ordinary
 * "user stopped it" state — and hiding a stopped deployment's URLs, spec and API keys is a
 * regression, in devant as much as in cloud.
 */
export const isDeploymentHealthy = (status?: string | null): boolean => status === 'ACTIVE';

/** Cadence for re-checking a failed deployment. It can recover, but rarely within seconds. */
const ERROR_POLL_MS = 30_000;

/**
 * How often to re-fetch a deployment in this state, or `false` once it has settled.
 *
 * A failed deployment stays pollable: it recovers on its own when the cause is fixed (config
 * supplied, image becomes pullable), and it is the console's poll that notices — stopping on
 * `ERROR` would freeze the card in a failed state until a manual reload. It is polled well
 * below `progressingMs` though, since a rollout resolves in seconds whereas a failure is
 * usually waiting on a human.
 */
export function deploymentPollInterval(status: string | null | undefined, progressingMs: number): number | false {
  if (status === 'IN_PROGRESS') return progressingMs;
  if (status === 'ERROR') return ERROR_POLL_MS;
  return false;
}

/** Long enough for the control plane to report a redeploy, short enough that an idle card stops asking. */
export const REQUESTED_POLL_WINDOW_MS = 60_000;

/**
 * Poll cadence that also honours a requested window: the first fetch after an action can
 * still report the old settled status, so stopping on it would end the poll before the
 * redeploy shows up.
 */
export function deploymentPollIntervalUntil(status: string | null | undefined, progressingMs: number, pollUntilMs: number, now: number = Date.now()): number | false {
  return deploymentPollInterval(status, progressingMs) || (now < pollUntilMs ? progressingMs : false);
}
