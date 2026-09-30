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

/** Which project this run owns. Runs overlap, so each takes its own and never touches another's. */

import type { Page } from '@playwright/test';

export const PROJECT_PREFIX = 'IPAAS-E2E';

/** Above the in-cluster Job's two-hour cap, so a sweep cannot take a slow run's project from under it. */
export const STALE_AGE_MS = 2 * 60 * 60_000;

/** `IPAAS-E2E-260928-1003`: the creation time is in the name, so no field has to be trusted for it. */
export function projectNameFor(startedAt: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${p(startedAt.getUTCFullYear() % 100)}${p(startedAt.getUTCMonth() + 1)}${p(startedAt.getUTCDate())}-${p(startedAt.getUTCHours())}${p(startedAt.getUTCMinutes())}`;
  return `${PROJECT_PREFIX}-${stamp}`;
}

/** Null for a name this run cannot date — a hand-made project, or the bare prefix from an older suite. */
export function projectStartedAt(name: string): Date | null {
  const match = new RegExp(`^${PROJECT_PREFIX}-(\\d{2})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})$`).exec(name.trim());
  if (!match) return null;
  const [, yy, mm, dd, hh, min] = match;
  const at = new Date(Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min)));
  return isNaN(at.getTime()) ? null : at;
}

export function isFixtureProject(name: string): boolean {
  return name.trim().startsWith(PROJECT_PREFIX);
}

/** An undated project is left alone — nothing here knows whose it is. */
export function staleProjects(existing: string[], now: Date, own: string, maxAgeMs = STALE_AGE_MS): string[] {
  return existing
    .map((name) => name.trim())
    .filter((name) => name !== own)
    .filter((name) => {
      const startedAt = projectStartedAt(name);
      return startedAt !== null && now.getTime() - startedAt.getTime() >= maxAgeMs;
    });
}

// Fixed at module load so every group agrees on it; E2E_PROJECT points the run at an existing project.
let active = process.env.E2E_PROJECT?.trim() || projectNameFor(new Date());

export function activeProject(): string {
  return active;
}

export function setActiveProject(name: string): void {
  active = name;
}

/** Read from the project cards: one being deleted still counts, since the name is not free until it is gone. */
export async function listFixtureProjects(page: Page): Promise<string[]> {
  const search = page.getByPlaceholder('Search projects');
  if (await search.isVisible({ timeout: 15_000 }).catch(() => false)) await search.fill(PROJECT_PREFIX);

  const names = await page
    .locator('.MuiCard-root')
    .getByText(new RegExp(`^${PROJECT_PREFIX}`))
    .allTextContents();
  return names.map((name) => name.trim()).filter(isFixtureProject);
}
