/** Waiting out a build. */

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

/** Returns the terminal status text; reaching *a* terminal state is the contract. */
export async function waitForBuildToSettle(page: Page): Promise<string> {
  // Chunked so a fresh token can go in between: one 20-minute assertion outlives the token.
  const CHUNK_MS = 4 * 60_000;

  for (let elapsed = 0; elapsed < BUILD_TIMEOUT_MS; elapsed += CHUNK_MS) {
    const finished = await expect(buildStatus(page))
      .toHaveText(TERMINAL_STATUS, { timeout: CHUNK_MS })
      .then(() => true)
      .catch(() => false);
    if (finished) return (await buildStatus(page).textContent())?.trim() ?? '';

    // Reseeding writes through page.evaluate, so it must run on the console's own origin — once
    // a token lapses the page is the IdP's, and the fresh token would land in its localStorage.
    const here = page.url();
    await page.goto('/config.json', { waitUntil: 'domcontentloaded' });
    await reseedSessionToken(page);
    await page.goto(here, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 60_000 });
  }

  throw new Error(`Build did not reach a terminal state within ${BUILD_TIMEOUT_MS / 60_000} minutes; last status: ${await buildStatus(page).textContent()}`);
}
