/**
 * Moving around the console the way a user does — through the top navbar's scope chips and
 * the sidebar — rather than by URL.
 *
 * Every selector here came from a `playwright codegen` recording against the cloud console,
 * so the accessible names are the ones the product actually ships.
 */

import { expect, type Page } from '@playwright/test';
import { reseedSessionToken } from './cloud-fixtures.js';

/**
 * The sidebar can be collapsed, and collapsing it hides the page labels. Nothing asserts a
 * nav item until this has run, otherwise a healthy page fails on a collapsed rail.
 */
export async function expandSidebar(page: Page): Promise<void> {
  const expander = page.getByRole('button', { name: 'Expand sidebar' });
  if (await expander.isVisible().catch(() => false)) await expander.click();
}

/**
 * The organization's project list — "All Projects".
 *
 * Reached by URL rather than by clicking the chrome, because the chrome cannot get here: the
 * `Organization: <handle>` chip opens the org switcher, and `Clear project` and the logo both
 * lead to OrgHome.
 *
 * OrgHome renders this list only for a session it considers onboarded; otherwise it redirects
 * to the most recently updated project (OrgHome.tsx:131). The token setup now seeds the
 * `persona:` key that marks it onboarded, so this lands on the list instead of in whichever
 * project happens to be newest — diagnosed from aria snapshots of three failing runs.
 */
export async function gotoOrgHome(page: Page, orgHandler: string): Promise<void> {
  // Every group enters through here, so it is where the session gets topped up. Token mode
  // cannot refresh itself — buildStorageState writes an empty refresh_token — and a journey
  // this long can outlive a token that was already part-spent when the run began. No-op
  // outside token mode. Requires the page to be on the console's origin, which it is: callers
  // navigate before calling this.
  if (!page.url().startsWith('about:')) await reseedSessionToken(page);

  const landed = page.getByRole('heading', { name: 'All Projects' });
  if (await landed.isVisible({ timeout: 5_000 }).catch(() => false)) return;

  await page.goto(`/organizations/${orgHandler}/home`, { waitUntil: 'domcontentloaded' });
  if (await landed.isVisible({ timeout: 30_000 }).catch(() => false)) return;

  // OrgHome sends a session it considers un-onboarded to the most recently updated project
  // (OrgHome.tsx:131), which would drop the journey into another suite's project. Mark it
  // onboarded exactly as OrgHome does for itself (OrgHome.tsx:130) and try again.
  //
  // Seeded here rather than in the token setup on purpose: the setup reads the project handle
  // out of that very redirect, and other cloud specs depend on the handle it records.
  await page.evaluate((org) => {
    const userId = (JSON.parse(localStorage.getItem('user') ?? '{}') as { userId?: string }).userId;
    if (userId) localStorage.setItem(`persona:${userId}:${org}`, 'developer');
  }, orgHandler);

  await page.goto(`/organizations/${orgHandler}/home`, { waitUntil: 'domcontentloaded' });
  await expect(landed, `the org project list did not render for ${orgHandler}`).toBeVisible({ timeout: 60_000 });
}

/**
 * Descends into a project through the navbar's project switcher.
 *
 * The opener changes shape with the scope, confirmed from aria snapshots of both states:
 *   - no project in scope: a plain `button "Select project"`;
 *   - inside a project: a `combobox "Select project"` beside a `button "Change project"`.
 * All three are accepted so the helper works from either page.
 */
export async function openProject(page: Page, displayName: string): Promise<void> {
  const opener = page
    .getByRole('button', { name: 'Select project' })
    .or(page.getByRole('button', { name: 'Change project' }))
    .or(page.getByRole('combobox', { name: 'Select project' }));
  await opener.first().click();
  await page.getByRole('menuitem', { name: displayName }).click();
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible({ timeout: 60_000 });
}

/** Descends into an integration through the navbar's integration switcher. */
export async function openIntegration(page: Page, displayName: string): Promise<void> {
  await page.getByRole('button', { name: 'Select integration' }).click();
  await page.getByRole('menuitem', { name: displayName }).click();
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible({ timeout: 60_000 });
}

/**
 * Opens a collapsible sidebar group (Observe, Operate, Infrastructure) and waits for one of
 * its children, so the caller can assert the rest without racing the expand animation.
 *
 * Idempotent: a group that is already open is left alone.
 */
export async function openNavGroup(page: Page, group: string, firstChild: string): Promise<void> {
  const child = page.getByRole('button', { name: firstChild, exact: true });
  if (await child.isVisible().catch(() => false)) return;

  await page.getByRole('button', { name: group, exact: true }).click();
  await expect(child, `the ${group} group did not reveal ${firstChild}`).toBeVisible({ timeout: 30_000 });
}

/** Asserts each sidebar page is present, in the order given. */
export async function expectNavItems(page: Page, labels: readonly string[]): Promise<void> {
  for (const label of labels) {
    await expect(page.getByRole('button', { name: label, exact: true }), `sidebar is missing ${label}`).toBeVisible({ timeout: 30_000 });
  }
}

/**
 * The card for a sample or an integration, found by its title.
 *
 * `Deploy` is ambiguous on the project overview — the sidebar carries a Deploy page and each
 * sample card carries a Deploy button — so the button is always scoped to its own card. The
 * ancestor hop finds the nearest container that holds both the title and the button, which
 * survives DOM changes that an `.nth()` index would not.
 */
export function cardFor(page: Page, title: string, buttonName: string) {
  return page
    .getByText(title, { exact: true })
    .locator(`xpath=ancestor::*[.//button[normalize-space()="${buttonName}"]][1]`)
    .getByRole('button', { name: buttonName, exact: true });
}
