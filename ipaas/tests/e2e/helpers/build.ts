/**
 * Waiting out a build.
 *
 * Extracted from deploy-sample and import-integration, which carried identical copies:
 * the same card is reached by both routes, so the wait belongs in one place.
 */

import { expect, type Page } from '@playwright/test';
import { reseedSessionToken } from './cloud-fixtures.js';

// BuildCard.tsx:118-140. 'Failed' also reads 'Failed while <phrase>', hence the prefix match.
export const TERMINAL_STATUS = /^(Completed|Failed|Cancelled|Timed Out)/;
export const STARTING_STATUS = /^(Queued|In Progress)$/;

/** A dev build can sit in the queue for a long while before it starts moving. */
export const BUILD_TIMEOUT_MS = 20 * 60_000;

/** The status has no role or accessible name (BuildCard.tsx:194-198), so it is matched by its text. */
export function buildStatus(page: Page) {
  return page.getByText(/^(Queued|In Progress|Completed|Failed|Cancelled|Timed Out)/).first();
}

/**
 * Polls in chunks, putting a fresh token in place between them. One 20-minute assertion would
 * outlive the token's hour in token mode, and the session cannot refresh itself there.
 *
 * Returns the terminal status text. Reaching *a* terminal state is the contract — a build that
 * fails for environmental reasons is reported by the caller rather than failing the run.
 */
export async function waitForBuildToSettle(page: Page): Promise<string> {
  const CHUNK_MS = 4 * 60_000;

  for (let elapsed = 0; elapsed < BUILD_TIMEOUT_MS; elapsed += CHUNK_MS) {
    const finished = await expect(buildStatus(page))
      .toHaveText(TERMINAL_STATUS, { timeout: CHUNK_MS })
      .then(() => true)
      .catch(() => false);
    if (finished) return (await buildStatus(page).textContent())?.trim() ?? '';

    // Reseed from the console's own origin, then come back. A bare reseed here writes through
    // page.evaluate to whatever origin the page is on — and if the token already lapsed, that is
    // the IdP's sign-in page, so the fresh token would land in the wrong localStorage and the
    // session would stay dead. config.json is static, so it does not redirect.
    const here = page.url();
    await page.goto('/config.json', { waitUntil: 'domcontentloaded' });
    await reseedSessionToken(page);
    await page.goto(here, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 60_000 });
  }

  throw new Error(`Build did not reach a terminal state within ${BUILD_TIMEOUT_MS / 60_000} minutes; last status: ${await buildStatus(page).textContent()}`);
}
