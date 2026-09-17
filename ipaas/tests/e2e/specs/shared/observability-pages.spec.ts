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
 * Logs and Metrics exist at all three scopes, with different segments per level
 * (src/nav.ts: org `logs`/`metrics`, project `observe/runtimelogs`/`observe/metrics`,
 * integration `logs`/`metrics`).
 *
 * These assert the page is *reachable and rendered* — not that it shows telemetry, which
 * needs a deployed integration emitting some. A page that redirects away or renders the
 * app shell with no content is the failure being caught here.
 */

import { expect, test } from '@playwright/test';
import { getAuthContext } from '../../helpers/auth-context.js';
import { expectPageRendered, trackFailedRequests } from '../../helpers/cloud-fixtures.js';

test.describe('observability pages @smoke', () => {
  let orgHandler: string;
  let projectHandler: string;

  test.beforeEach(async () => {
    const ctx = getAuthContext();
    orgHandler = ctx.orgHandler;
    projectHandler = ctx.projectHandler ?? 'default';
  });

  // -------------------------------------------------------------------------
  // Organization scope
  // -------------------------------------------------------------------------

  test('organization logs page exists', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await expectPageRendered(page, `/organizations/${orgHandler}/logs`);
    expect(failures, 'Requests failed while the org logs page loaded').toEqual([]);
  });

  test('organization metrics page exists', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await expectPageRendered(page, `/organizations/${orgHandler}/metrics`);
    expect(failures, 'Requests failed while the org metrics page loaded').toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Project scope
  // -------------------------------------------------------------------------

  test('project logs page exists', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await expectPageRendered(page, `/organizations/${orgHandler}/projects/${projectHandler}/observe/runtimelogs`);
    expect(failures, 'Requests failed while the project logs page loaded').toEqual([]);
  });

  test('project metrics page exists', async ({ page }) => {
    const failures = trackFailedRequests(page);
    await expectPageRendered(page, `/organizations/${orgHandler}/projects/${projectHandler}/observe/metrics`);
    expect(failures, 'Requests failed while the project metrics page loaded').toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Integration scope — the integration is read from the table, not named
  // -------------------------------------------------------------------------



});
