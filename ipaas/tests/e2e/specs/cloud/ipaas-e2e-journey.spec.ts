/**
 * The cloud journey: one fixture project, created, exercised and deleted across seven groups.
 *
 * One shared context, so the journey moves as a user does rather than reopening a window per
 * test. Groups run in declaration order and are independent — a failed deploy still leaves
 * import, page availability and cleanup to report. Only the fixture project is a hard
 * dependency; without it every later group skips.
 *
 * Tracing must not be started by hand: Playwright already instruments contexts made from the
 * `browser` fixture, and a second start throws.
 */

import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { getAuthContext } from '../../helpers/auth-context.js';
import { authStatePath } from '../../helpers/product.js';
import { expectPageRendered, reseedSessionToken, waitForApiConfig } from '../../helpers/cloud-fixtures.js';
import { BUILD_TIMEOUT_MS, waitForBuildToSettle } from '../../helpers/build.js';
import { cardFor, expandSidebar, expectNavItems, gotoOrgHome, openIntegration, openNavGroup, openProject } from '../../helpers/console-nav.js';

// No retries: a retry would replay a stateful journey against state the first pass mutated.
test.describe.configure({ retries: 0 });

const PROJECT = 'IPAAS-E2E';
const SAMPLE = 'Hello World Service';
const IMPORTED = 'IPaaS Greeter';

const REPO_URL = 'https://github.com/dokimibot/sample-integrations';
const REPO_SUBDIR = 'greeting-service';
const INTEGRATION_TYPE = 'Integration as API';

/** Order matters: this is the order AppLayout renders them in. Hrefs from paths.ts. */
const FOOTER_LINKS = [
  ['Documentation', 'https://wso2.com/integration-platform/docs/'],
  ['Terms of Use', 'https://wso2.com/integration-platform/terms-of-use'],
  ['Privacy Policy', 'https://wso2.com/privacy-policy'],
  ['Support', 'https://discord.com/invite/wso2'],
] as const;

/** Deleting an integration is asynchronous: the row greys out, then goes. */
const REMOVAL_TIMEOUT_MS = 5 * 60_000;

const CLOUD_SECTIONS = ['Org Details', 'Package Registries'] as const;
const WIP_ONLY_SECTIONS = ['Access Control', 'Egress Control', 'Workflows', 'Credentials', 'On-Prem Keys', 'Application Security'] as const;

// Read in beforeAll, not at module scope: module scope is evaluated when Playwright collects
// the file, which is before the setup project has written the context it reads.
let orgHandler = '';

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  orgHandler = getAuthContext(testInfo.project.name).orgHandler;
  context = await browser.newContext({
    storageState: authStatePath(testInfo.project.name),
    baseURL: testInfo.project.use.baseURL,
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

// Shared moves

/** The organization's project list, with the session topped up on the way in. */
/**
 * Reseeding writes through page.evaluate, so it must run on the console's origin; once a token
 * lapses the page is the IdP's and the fresh token lands there instead. config.json is static,
 * so it parks the page on the right origin without the SPA's auth redirect.
 */
async function refreshSession(): Promise<void> {
  if (!process.env.E2E_TOKEN_MODE) return;
  await page.goto('/config.json', { waitUntil: 'domcontentloaded' });
  await reseedSessionToken(page);
}

/** A dead session should say so, not time out on content that will never render. */
function assertSignedIn(): void {
  const url = page.url();
  if (/\/gate\/signin|platform-idp/.test(url)) {
    throw new Error(`the console redirected to the IdP sign-in page (${url}) — the session was rejected. In token mode this means the token expired and the reseed did not take.`);
  }
}

async function enterOrgHome(): Promise<void> {
  await refreshSession();
  await page.goto(`/organizations/${orgHandler}/home`, { waitUntil: 'domcontentloaded' });
  assertSignedIn();
  await waitForApiConfig(page);
  await gotoOrgHome(page, orgHandler);
}

/** The fixture project's overview, entered the way a user gets there. */
async function enterProject(): Promise<void> {
  await enterOrgHome();
  await openProject(page, PROJECT);
}

/**
 * Enters the fixture project, skipping the group when it does not exist.
 *
 * Asked of the environment rather than remembered in a variable: Playwright starts a fresh worker
 * after a failed test, so a module-level flag is back to false for every later group and would
 * skip them all on the strength of one unrelated failure.
 */
async function enterProjectOrSkip(): Promise<void> {
  await enterOrgHome();
  const exists = await page.getByText(PROJECT, { exact: true }).first().isVisible({ timeout: 15_000 }).catch(() => false);
  test.skip(!exists, `${PROJECT} does not exist — group 01 did not create it`);
  await openProject(page, PROJECT);
}

/** The Start quickly tabs are real `role="tab"` elements — verified against a run. */
function samplesTab(): Locator {
  return page.getByRole('tab', { name: 'Samples', exact: true });
}

/**
 * An empty project offers these inline; a populated one moves them behind 'Create an
 * Integration'. Keyed off the target control, since an empty project has no such button.
 */
async function reachCreateControl(target: Locator): Promise<void> {
  if (await target.isVisible({ timeout: 15_000 }).catch(() => false)) return;

  const createButton = page.getByRole('button', { name: 'Create an Integration', exact: true });
  await expect(createButton, 'neither the inline control nor Create an Integration was available').toBeVisible({ timeout: 30_000 });
  await createButton.click();
  await expect(page.getByRole('heading', { name: 'How would you like to create your integration?' })).toBeVisible({ timeout: 30_000 });
  await expect(target, 'the create surface did not offer the expected control').toBeVisible({ timeout: 30_000 });
}

/** Whether the project currently lists an integration under this display name. */
async function isPresent(name: string): Promise<boolean> {
  return page.getByRole('button', { name: `Delete ${name}` }).first().isVisible({ timeout: 5_000 }).catch(() => false);
}

/** The row for an integration in the project's Integrations table. */
function integrationRow(name: string): Locator {
  return page.getByRole('row').filter({ hasText: name });
}

/** Both dialogs are type-to-confirm: Delete stays disabled until the name matches exactly. */
async function confirmRemoval(placeholder: string, name: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByPlaceholder(placeholder).fill(name);

  const confirm = dialog.getByRole('button', { name: 'Delete', exact: true });
  await expect(confirm, 'Delete stayed disabled after the name was typed').toBeEnabled({ timeout: 15_000 });
  await confirm.click();
  await expect(dialog).not.toBeVisible({ timeout: 60_000 });
}

/**
 * The row greys out and stays counted (Project.tsx:470, :518) until deletion completes, which is
 * what keeps Delete Project disabled — so the row disappearing is the success signal, not the
 * dialog closing.
 */
async function deleteIntegration(name: string): Promise<void> {
  // An interrupted run leaves duplicates: the BFF suffixes the handle on a conflict while the
  // display name stays put, so a bare click would fail strict mode rather than clean up.
  for (let attempt = 0; attempt < 5; attempt++) {
    const trash = page.getByRole('button', { name: `Delete ${name}` }).first();
    if (!(await trash.isVisible({ timeout: 5_000 }).catch(() => false))) break;

    await trash.click();
    await confirmRemoval('Enter integration name to confirm', name);
    // This row must go before looking for the next; it greys out first and still counts.
    await expect(page.getByRole('button', { name: `Delete ${name}` })).toHaveCount(0, { timeout: REMOVAL_TIMEOUT_MS });
  }

  await expect(integrationRow(name), `${name} is still listed — deletion has not completed`).toHaveCount(0, { timeout: REMOVAL_TIMEOUT_MS });
}

/** Waits for the integrations list to resolve, so an unloaded table is not read as empty. */
async function waitForIntegrationsToLoad(): Promise<void> {
  // One state or the other must render. Returning on neither is what let an unloaded table read
  // as empty, which is the bug this helper exists to prevent.
  const settled = integrationRow(SAMPLE).or(integrationRow(IMPORTED)).or(page.getByText('Start quickly', { exact: true }));
  await expect(settled.first(), 'the project showed neither its integrations nor the empty state').toBeVisible({ timeout: 60_000 });
}

// 01 — the fixture project. Everything else depends on this one.

test.describe('01 fixture project @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterOrgHome();
  });

  test('the organization home lists its projects', async () => {
    await expect(page.getByRole('heading', { name: 'All Projects' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
  });

  test('the organization home links to tutorials and Discord support', async () => {
    // EXPLORE_GROUPS is rendered by Projects.tsx, the org project list, not a project overview.
    await expect(page.getByRole('link', { name: 'Build an Automation' })).toHaveAttribute('href', /get-started\/build-automation$/);
    await expect(page.getByRole('link', { name: 'Get Support on Discord' })).toHaveAttribute('href', 'https://discord.com/invite/wso2');
  });

  test('IPAAS-E2E exists, created fresh or reused and emptied', async () => {
    test.setTimeout(12 * 60_000);

    const existing = page.getByText(PROJECT, { exact: true }).first();
    if (await existing.isVisible({ timeout: 10_000 }).catch(() => false)) {
      // Emptied on reuse: 02 asserts the empty state, and a run whose cleanup failed leaves rows.
      await openProject(page, PROJECT);
      await waitForIntegrationsToLoad();
      for (const name of [SAMPLE, IMPORTED]) {
        if (await page.getByRole('button', { name: `Delete ${name}` }).first().isVisible({ timeout: 5_000 }).catch(() => false)) {
          await deleteIntegration(name);
        }
      }
      test.info().annotations.push({ type: 'fixture', description: `${PROJECT} already existed; reused after clearing its integrations` });
      return;
    }

    // exact — 'Create' also prefixes 'Create an Integration' and 'Create Project'.
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('textbox', { name: 'Display Name' }).fill(PROJECT);
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();

    const landed = await page
      .getByRole('heading', { name: PROJECT })
      .waitFor({ state: 'visible', timeout: 90_000 })
      .then(() => true)
      .catch(() => false);

    if (!landed) {
      const reason = (await page.getByRole('alert').first().textContent().catch(() => null))?.trim() ?? '';
      // Project quota is a 402 from platform-api surfaced as a 500, so the console shows a
      // generic failure. Skipped rather than failed: the suite cannot create quota it lacks.
      test.skip(/quota|already exists|internal server error|failed to create/i.test(reason), `Project could not be created: ${reason || 'no error shown'}`);
      throw new Error(`Create Project did not land on the project. Alert: ${reason || 'none'}`);
    }

    test.info().annotations.push({ type: 'fixture', description: `${PROJECT} created` });
  });

  test('the project opens on an overview headed by its name', async () => {
    await enterProjectOrSkip();
    await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible({ timeout: 60_000 });
  });
});

// 02 — the empty state, before anything populates it

test.describe('02 empty project overview @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip();
  });

  test('offers to create an integration on Cloud', async () => {
    await expect(page.getByText('Create an Integration on Cloud', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Open Cloud Editor' })).toBeVisible();
  });

  test('offers to import your own integration', async () => {
    await expect(page.getByText('Import your own Integration', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Import from a Public Repository' })).toBeVisible();
  });

  test('offers the Start quickly panel with both tabs', async () => {
    await expect(page.getByText('Start quickly', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Prebuilt Integrations' })).toBeVisible();
    await expect(samplesTab()).toBeVisible();
  });

  test('offers no import provider beyond the five supported ones', async () => {
    // A sixth provider appearing here means one shipped without a decision about it.
    await expect(page.getByRole('button', { name: /^Import from/ })).toHaveCount(5);
  });

  test('the Prebuilt Integrations tab is selected by default and lists cards', async () => {
    await expect(page.getByRole('tab', { name: 'Prebuilt Integrations' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Explore more prebuilt integrations' })).toBeVisible();
  });

  test('prebuilt cards name the integrations they connect', async () => {
    // One card, not the catalogue: the backend owns its contents and can reorder them.
    await expect(page.getByText('Export Salesforce Opportunities to a Google Sheet')).toBeVisible();
    await expect(page.getByText('Salesforce • Google Sheets')).toBeVisible();
  });

  test('shows no integrations table while the project is empty', async () => {
    // Positive assertion first: absence passes trivially against a page that has not rendered.
    await expect(page.getByText('Start quickly', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});

// 03 — browse samples

test.describe('03 browse samples @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  let browseSamplesUrl = '';

  test.beforeAll(async () => {
    await enterProjectOrSkip();
    const match = page.url().match(/\/projects\/([^/?#]+)/);
    if (!match) {
      test.skip(true, 'Could not determine project handler from the URL after entering the project');
      return;
    }
    browseSamplesUrl = `/organizations/${orgHandler}/projects/${match[1]}/components/new/samples`;

    await page.goto(browseSamplesUrl, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      page
        .getByRole('heading', { name: 'Browse Samples' })
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {}),
      page
        .getByText('Failed to load samples. Please try again later.')
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {}),
    ]);
    await expect(
      page.getByText('Failed to load samples. Please try again later.'),
      'The samples service is down — this is a backend failure, not a UI regression',
    ).not.toBeVisible();
  });

  test('shows the Browse Samples heading and subtitle', async () => {
    await expect(page.getByRole('heading', { name: 'Browse Samples' })).toBeVisible();
    await expect(page.getByText('Deploy a sample to get started quickly.')).toBeVisible();
  });

  test('shows a Back button to the integration creation options', async () => {
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  });

  test('shows the sample search input', async () => {
    await expect(page.getByPlaceholder('Search samples…')).toBeVisible();
  });

  test('shows the Type, Technology and Tags filter sections', async () => {
    await expect(page.getByRole('button', { name: 'Type', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Technology', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tags', exact: true })).toBeVisible();
  });

  test('a search with no matches shows the empty-result message', async () => {
    // Every SampleGridCard renders a "Quick Deploy" button — asserting on it first confirms
    // real results are showing before we search them away.
    await expect(page.getByRole('button', { name: 'Quick Deploy' }).first()).toBeVisible();
    await page.getByPlaceholder('Search samples…').fill(`no-such-sample-${Date.now()}`);
    await expect(page.getByText('No samples match your search.')).toBeVisible();
  });

  test('clearing the search brings the results back', async () => {
    const search = page.getByPlaceholder('Search samples…');
    await search.fill(`no-such-sample-${Date.now()}`);
    await expect(page.getByText('No samples match your search.')).toBeVisible();
    await search.clear();
    await expect(page.getByText('No samples match your search.')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Quick Deploy' }).first()).toBeVisible();
  });

});

// 04 — deploying a sample

test.describe('04 deploy a sample @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip();
  });

  test('the Samples tab lists Hello World Service', async () => {
    await reachCreateControl(samplesTab());
    await samplesTab().click();
    await expect(page.getByText(SAMPLE, { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test('Deploy provisions the integration and lands on its overview', async () => {
    test.setTimeout(4 * 60_000);
    // Scoped to the card: the sidebar's Deploy page and each sample's Deploy button share a name.
    await cardFor(page, SAMPLE, 'Deploy').click();

    // The deploy runs through a progress page before settling on the integration's overview.
    await expect(page.getByRole('heading', { name: SAMPLE })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('the integration overview reports a build', async () => {
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('the sample appears in the project with the table columns', async () => {
    await enterProject();
    const table = page.getByRole('table').first();
    await expect(table).toBeVisible({ timeout: 30_000 });
    for (const column of ['Name', 'Description', 'Type', 'Last Updated']) {
      await expect(table.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
    }
    await expect(integrationRow(SAMPLE)).toHaveCount(1);
  });

  test('the sample build completes', async () => {
    test.setTimeout(BUILD_TIMEOUT_MS + 2 * 60_000);
    await openIntegration(page, SAMPLE);
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 60_000 });

    const status = await waitForBuildToSettle(page);
    test.info().annotations.push({ type: 'build', description: `${SAMPLE}: ${status}` });
    // A build that never settles already fails the run, so one that settles on Failed must too.
    expect(status, `${SAMPLE} build ended as ${status}`).toMatch(/^Completed/);
  });
});

// 05 — importing a public repository

test.describe('05 import an integration @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip();
  });

  test('the import form opens from the project', async () => {
    const importButton = page.getByRole('button', { name: 'Import from a Public Repository' });
    await reachCreateControl(importButton);
    await importButton.click();
    await expect(page.getByRole('heading', { name: 'Import an Integration' })).toBeVisible({ timeout: 30_000 });
  });

  test('a repository URL resolves into a branch and a derived name', async () => {
    test.setTimeout(3 * 60_000);
    await page.getByRole('textbox', { name: 'Repository URL' }).fill(REPO_URL);

    // These appear only once the repository resolves through GitHub; an empty branch list means
    // the public API's hourly rate limit is spent, which a real user hits too.
    await expect(page.getByRole('combobox', { name: /^Branch/ }), 'the repository did not resolve into a branch — GitHub public API rate limit is the usual cause').toContainText('main', { timeout: 60_000 });
    await expect(page.getByRole('textbox', { name: 'Repository Sub Path' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Display Name' }), 'the display name was not derived from the repository').not.toHaveValue('');
  });

  test('the sub-path picker lists the repository tree', async () => {
    test.setTimeout(3 * 60_000);
    await page.getByRole('button', { name: 'Edit path' }).click();
    const dialog = page.getByRole('dialog', { name: 'Repository Sub Path' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('tree'), 'the picker did not list the repository tree').toBeVisible();
    await dialog.getByRole('treeitem', { name: REPO_SUBDIR }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog).not.toBeVisible();
  });

  // Provisioning is where this group ends: the build itself is covered once, by the sample in 03,
  // and building a second integration only repeats it at the cost of another wait.
  test('importing provisions the integration under its given name', async () => {
    test.setTimeout(4 * 60_000);
    // Overwrites the derived name, so a stranded integration is identifiable.
    await page.getByRole('textbox', { name: 'Display Name' }).fill(IMPORTED);
    await page.getByRole('button', { name: new RegExp(`^${INTEGRATION_TYPE}`) }).click();

    const submit = page.getByRole('button', { name: 'Import Integration' });
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    await submit.click();

    await expect(page.getByRole('heading', { name: IMPORTED })).toBeVisible({ timeout: 2 * 60_000 });
    await expect(page.getByRole('heading', { name: 'Latest Build' })).toBeVisible({ timeout: 2 * 60_000 });
  });

  test('the imported integration reports its source and type', async () => {
    await expect(page.getByText(INTEGRATION_TYPE, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: new RegExp(REPO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  });

  test('the build section collapses and expands', async () => {
    // One control under two tooltips, so each label appearing proves the section moved. Scoped
    // to main because the sidebar has its own 'Expand sidebar', and driven from whichever state
    // the section is in, which is not reliably expanded.
    const collapse = page.getByRole('button', { name: 'Collapse build details', exact: true });
    const expand = page.getByRole('button', { name: 'Expand build details', exact: true });

    // The toggle trails the heading on a just-imported integration, so wait for either state
    // before deciding which way it has to move.
    await expect(collapse.or(expand), 'the build card offered no collapse control').toBeVisible({ timeout: 60_000 });
    const [first, second] = (await collapse.isVisible().catch(() => false)) ? [collapse, expand] : [expand, collapse];

    await first.click();
    await expect(second, 'the build section did not move on the first toggle').toBeVisible({ timeout: 30_000 });
    await second.click();
    await expect(first, 'the build section did not move back').toBeVisible({ timeout: 30_000 });
  });

  test('View Logs opens the build logs and Hide Logs closes them', async () => {
    const viewLogs = page.getByRole('button', { name: 'View Logs' }).first();
    await expect(viewLogs).toBeVisible({ timeout: 5 * 60_000 });
    await viewLogs.click();

    // One button carries both labels (BuildCard.tsx:208), so the flip is the evidence.
    const hideLogs = page.getByRole('button', { name: 'Hide Logs' }).first();
    await expect(hideLogs).toBeVisible({ timeout: 30_000 });
    await hideLogs.click();
    await expect(page.getByRole('button', { name: 'View Logs' }).first()).toBeVisible({ timeout: 30_000 });
  });

});

// 06 — the populated overview, which only exists once 04 and 05 have run

test.describe('06 populated project overview @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip();
    await waitForIntegrationsToLoad();
    const populated = (await isPresent(SAMPLE)) || (await isPresent(IMPORTED));
    test.skip(!populated, 'The project holds no integrations, so the populated branch cannot be exercised');
  });

  test('every integration row carries cells and a delete action', async () => {
    const rows = page.getByRole('row', { name: /^View details for / });
    const count = await rows.count();
    expect(count, 'the populated branch needs at least one integration').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      // The type cell is derived from componentType; a row without one fell through to 'unsupported'.
      await expect(row.getByRole('cell')).not.toHaveCount(0);
      await expect(row.getByRole('button', { name: /^Delete / })).toBeVisible();
    }
  });

  test('the empty-state entry points are replaced, not merely hidden', async () => {
    // The table proves the populated branch rendered; only then does absence mean anything.
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 30_000 });

    // Current strings: the removed spec asserted text that no longer exists, so it could only pass.
    await expect(page.getByText('Import your own Integration', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Start quickly', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Cloud Editor', exact: true })).toHaveCount(0);
  });

  test('the architecture panel is offered', async () => {
    await expect(page.getByRole('heading', { name: 'Architecture Diagram' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /architecture diagram$/ })).toBeVisible();
  });

  test('the integration count panel totals the rows in the table', async () => {
    await expect(page.getByRole('heading', { name: 'Integration Count by Type' })).toBeVisible({ timeout: 30_000 });

    const rowCount = await page.getByRole('row', { name: /^View details for / }).count();
    const total = page.getByText('Total', { exact: true }).locator('xpath=following-sibling::*[1]');
    await expect(total).toHaveText(String(rowCount));
  });

  test('the contributors panel names contributors when the project has any', async () => {
    // ContributorsCard returns null until commit history yields contributors.
    const heading = page.getByRole('heading', { name: 'Contributors' });
    const present = await heading.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!present, 'No contributors resolved for this project');

    await expect(page.getByRole('img', { name: /\d+ contributions?/ })).not.toHaveCount(0);
  });

  test('search narrows the table to the matching integration', async () => {
    const rows = page.getByRole('row', { name: /^View details for / });
    const before = await rows.count();
    expect(before, 'need at least one integration to search for').toBeGreaterThan(0);

    // Derived at runtime: integration names belong to the backend.
    const name = ((await rows.first().getAttribute('aria-label')) ?? '').replace(/^View details for /, '').trim();
    await page.getByRole('textbox', { name: 'Search integrations' }).fill(name);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(name);
  });

  test('a search with no matches empties the table', async () => {
    await page.getByRole('textbox', { name: 'Search integrations' }).fill(`no-such-integration-${Date.now()}`);
    await expect(page.getByRole('row', { name: /^View details for / })).toHaveCount(0);
  });
});

// 07 — the pages each scope offers

test.describe('07 page availability @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('the organization scope offers its pages', async () => {
    await enterOrgHome();
    await expandSidebar(page);

    await expectNavItems(page, ['Build', 'Deploy', 'Test']);
    await openNavGroup(page, 'Observe', 'Runtime Logs');
    await expectNavItems(page, ['Runtime Logs', 'Metrics']);
    await openNavGroup(page, 'Infrastructure', 'Environments');
    await expectNavItems(page, ['Environments', 'Pipelines', 'Settings']);
  });

  test('the project scope offers its pages', async () => {
    await enterProjectOrSkip();
    await expandSidebar(page);

    await expectNavItems(page, ['Build', 'Deploy', 'Test']);
    await openNavGroup(page, 'Observe', 'Runtime Logs');
    await expectNavItems(page, ['Runtime Logs', 'Metrics']);
    await openNavGroup(page, 'Infrastructure', 'Environments');
    await expectNavItems(page, ['Environments', 'Pipelines', 'Settings']);

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible({ timeout: 30_000 });
  });

  test('the integration scope offers its pages, including Operate', async () => {
    await enterProjectOrSkip();
    await waitForIntegrationsToLoad();
    test.skip(!(await isPresent(SAMPLE)), `${SAMPLE} is not in the project`);
    await openIntegration(page, SAMPLE);
    await expandSidebar(page);

    await expectNavItems(page, ['Build', 'Deploy', 'Test']);
    await openNavGroup(page, 'Observe', 'Runtime Logs');
    await expectNavItems(page, ['Runtime Logs', 'Metrics']);
    await openNavGroup(page, 'Operate', 'Runtime');
    await expectNavItems(page, ['Runtime', 'Containers', 'Configs & Secrets']);
    await openNavGroup(page, 'Infrastructure', 'Environments');
    await expectNavItems(page, ['Environments', 'Pipelines']);

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('heading', { name: SAMPLE })).toBeVisible({ timeout: 30_000 });
  });

  test('the footer offers Documentation, Terms of Use, Privacy Policy and Support in order', async () => {
    await enterOrgHome();
    for (const [name, href] of FOOTER_LINKS) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }

    const links = page.getByRole('link', { name: /^(Documentation|Terms of Use|Privacy Policy|Support)$/ });
    for (const [index, [name]] of FOOTER_LINKS.entries()) {
      await expect(links.nth(index)).toHaveText(name);
    }
  });

  test('every footer link opens in a new tab', async () => {
    for (const [name] of FOOTER_LINKS) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('target', '_blank');
    }
  });

  test('the footer shows the WSO2 copyright notice', async () => {
    await expect(page.getByText(`© ${new Date().getFullYear()}, WSO2 LLC.`)).toBeVisible();
  });

  test('organization settings page exists', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
  });

  for (const section of CLOUD_SECTIONS) {
    test(`organization settings offers "${section}"`, async () => {
      await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    });
  }

  test('organization settings offers no WIP-only section', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
    await expect(page.getByText('Org Details', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    for (const section of WIP_ONLY_SECTIONS) {
      await expect(page.getByText(section, { exact: true })).not.toBeVisible();
    }
  });

  test('package registries page exists', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings/package-registries`);
  });

  test('org details page exists', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings/org-details`);
  });
});

// 08 — cleanup, which is also the deletion coverage

test.describe('08 clean up @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip();
    await waitForIntegrationsToLoad();
  });

  test('the deployed sample is removed and its row disappears', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    // Gated on what the project actually holds, not on a flag: a group that created something
    // and then failed before setting its flag would otherwise strand it on a shared org.
    test.skip(!(await isPresent(SAMPLE)), `${SAMPLE} is not in the project`);
    await deleteIntegration(SAMPLE);
  });

  test('the imported integration is removed and its row disappears', async () => {
    test.setTimeout(REMOVAL_TIMEOUT_MS + 60_000);
    test.skip(!(await isPresent(IMPORTED)), `${IMPORTED} is not in the project`);
    await deleteIntegration(IMPORTED);
  });

  test('the project reports no integrations left', async () => {
    for (const name of [SAMPLE, IMPORTED]) {
      await expect(integrationRow(name), `${name} is still listed`).toHaveCount(0, { timeout: 60_000 });
    }
  });

  test('Delete Project becomes available once the project is empty', async () => {
    test.setTimeout(6 * 60_000);
    await expandSidebar(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 30_000 });

    // Disabled while integrations remain (ProjectOverview.tsx:120), so this also proves the
    // deletions landed. Reloaded each attempt because the components query does not refetch.
    const deleteProject = page.getByRole('button', { name: 'Delete Project', exact: true });
    let enabled = false;
    for (let attempt = 0; attempt < 12 && !enabled; attempt++) {
      enabled = await expect(deleteProject).toBeEnabled({ timeout: 15_000 }).then(() => true).catch(() => false);
      if (!enabled) await page.reload({ waitUntil: 'domcontentloaded' });
    }
    expect(enabled, 'Delete Project stayed disabled — an integration is still being removed').toBe(true);
  });

  test('deleting the project returns to the organization home without its card', async () => {
    test.setTimeout(4 * 60_000);
    await page.getByRole('button', { name: 'Delete Project', exact: true }).click();
    await confirmRemoval('Enter project name to confirm', PROJECT);

    // No success alert exists (ProjectOverview.tsx:72 navigates with state Projects.tsx:93
    // clears), so the redirect is the signal. Raced against the failure branch (:76) so a
    // rejected delete reports its reason instead of timing out on a heading.
    const landed = page.getByRole('heading', { name: 'All Projects' });
    const rejected = page.getByRole('alert').filter({ hasText: /Failed to delete the project/i });
    await Promise.race([
      landed.waitFor({ state: 'visible', timeout: 2 * 60_000 }).catch(() => {}),
      rejected.waitFor({ state: 'visible', timeout: 2 * 60_000 }).catch(() => {}),
    ]);
    if (await rejected.isVisible().catch(() => false)) {
      throw new Error(`the console rejected the delete: ${(await rejected.textContent())?.trim()}`);
    }
    await expect(landed, 'the delete neither completed nor reported an error').toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(PROJECT, { exact: true }), `the ${PROJECT} card is still on the org home`).toHaveCount(0, { timeout: REMOVAL_TIMEOUT_MS });
  });
});

// 09 — signing out, the journey's last act
test.describe('09 sign out @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('signing out asks for confirmation and returns to the sign-in page', async () => {
    test.setTimeout(2 * 60_000);
    await enterOrgHome();

    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog, 'signing out did not ask for confirmation').toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Sign Out' }).click();

    // Cloud has no in-app login page — /login hands off to Thunder's hosted Gate.
    await expect(page).toHaveURL(/\/gate\/signin/, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible({ timeout: 30_000 });
  });
});
