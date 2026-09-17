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
import { deploymentPollInterval, deploymentPollIntervalUntil, isDeploymentHealthy } from './deploymentStatus';

describe('isDeploymentHealthy', () => {
  it('is true only for ACTIVE', () => {
    expect(isDeploymentHealthy('ACTIVE')).toBe(true);
    expect(isDeploymentHealthy('IN_PROGRESS')).toBe(false);
  });

  // Callers must not use this to gate informational UI: a stopped deployment is not
  // connectable, but its URLs, contract and API keys should still be shown.
  it('is false for a stopped deployment', () => {
    expect(isDeploymentHealthy('SUSPENDED')).toBe(false);
  });

  // The regression this guards: a degraded deployment reports ERROR, and the gates
  // used to read "not IN_PROGRESS" — which ERROR satisfies — so chat/tools/endpoint
  // panels would render against a crash-looping workload.
  it('is false for a degraded deployment', () => {
    expect(isDeploymentHealthy('ERROR')).toBe(false);
  });

  it('is false when the status is absent', () => {
    expect(isDeploymentHealthy(null)).toBe(false);
    expect(isDeploymentHealthy(undefined)).toBe(false);
    expect(isDeploymentHealthy('')).toBe(false);
  });
});

describe('deploymentPollInterval', () => {
  it('polls at the caller cadence while progressing', () => {
    expect(deploymentPollInterval('IN_PROGRESS', 8000)).toBe(8000);
    expect(deploymentPollInterval('IN_PROGRESS', 3000)).toBe(3000);
  });

  // ERROR must stay pollable: a degraded deployment recovers once its cause is fixed,
  // and only the poll notices. Stopping here would freeze the card on Error.
  it('keeps polling a failed deployment, but backed off', () => {
    const interval = deploymentPollInterval('ERROR', 8000);
    expect(interval).not.toBe(false);
    expect(interval).toBeGreaterThan(8000);
  });

  it('stops on settled states', () => {
    expect(deploymentPollInterval('ACTIVE', 8000)).toBe(false);
    expect(deploymentPollInterval('SUSPENDED', 8000)).toBe(false);
    expect(deploymentPollInterval(null, 8000)).toBe(false);
    expect(deploymentPollInterval(undefined, 8000)).toBe(false);
  });
});

describe('deploymentPollIntervalUntil', () => {
  const NOW = 1_000_000;

  it('keeps polling a settled deployment while the requested window is open', () => {
    expect(deploymentPollIntervalUntil('ACTIVE', 8000, NOW + 30_000, NOW)).toBe(8000);
  });

  it('stops once the window has expired', () => {
    expect(deploymentPollIntervalUntil('ACTIVE', 8000, NOW - 1, NOW)).toBe(false);
    expect(deploymentPollIntervalUntil('ACTIVE', 8000, 0, NOW)).toBe(false);
  });

  it('lets the status drive once the deployment is unsettled', () => {
    expect(deploymentPollIntervalUntil('IN_PROGRESS', 8000, 0, NOW)).toBe(8000);
    expect(deploymentPollIntervalUntil('ERROR', 8000, 0, NOW)).toBeGreaterThan(8000);
  });

  it('keeps polling an unsettled deployment after the window closes', () => {
    expect(deploymentPollIntervalUntil('IN_PROGRESS', 8000, NOW - 60_000, NOW)).toBe(8000);
  });

  it('treats a never-deployed environment like any other settled state', () => {
    expect(deploymentPollIntervalUntil(null, 8000, NOW - 1, NOW)).toBe(false);
    expect(deploymentPollIntervalUntil(undefined, 8000, NOW + 30_000, NOW)).toBe(8000);
  });
});
