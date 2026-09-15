import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const widths = [1440, 1280, 834, 390];
const states = [
  'complete',
  'partial',
  'insufficient',
  'generation-required',
  'unresolved',
  'empty-section',
  'llm-complete',
  'llm-partial',
  'no-report',
  'loading',
  'error',
];

test('LLM reports show safe briefing and partial state without audit identifiers', async ({ page }) => {
  for (const state of ['llm-complete', 'llm-partial']) {
    await page.goto(`/overview/preview/${state}`);
    await expect(page.getByRole('region', { name: 'Executive briefing' })).toBeVisible();
    await expect(page.getByText('Treat the pattern as a testable signal, not a proven outcome.')).toBeVisible();
    const text = await page.getByRole('main').innerText();
    expect(text).not.toMatch(/generationRunId|providerId|modelId|sha256:|rawOutput/);
  }

  await page.goto('/overview/preview/llm-complete');
  await page.getByRole('button', { name: /Possible shipping-friction strategy/ }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Why RivalLens is telling you this');
  expect(await drawer.innerText()).not.toMatch(/sha256:|00000000-|generationRunId|providerId/);

  await page.goto('/overview/preview/llm-partial');
  await expect(page.getByText('This report is partial. What it does show is still verified.')).toBeVisible();
});

for (const width of widths) {
  test(`states, accessibility and reflow at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // The pre-existing site-wide favicon is outside Overview's QA scope.
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
        errors.push(message.text());
      }
    });
    await page.setViewportSize({ width, height: 1000 });
    for (const state of states) {
      const response = await page.goto(`/overview/preview/${state}`);
      expect(response?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await page.locator('[data-report-row] button, [data-report-row] a').count()).toBe(0);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
      expect(results.violations, `${state}: ${JSON.stringify(results.violations)}`).toEqual([]);
      await page.screenshot({
        caret: 'initial',
        path: testInfo.outputPath(`${state}-${width}.png`),
      });
      expect(errors).toEqual([]);
      if (width >= 1280) {
        const header = page.locator('main > header');
        expect((await header.boundingBox())?.height).toBe(80);
        await page.locator('[data-report-scroll]').evaluate((el) => {
          el.scrollTop = 300;
        });
        expect((await header.boundingBox())?.y).toBe(0);
      }
    }
  });

  test(`drawer provenance, focus and sizing at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/overview/preview/complete');
    const rows = page.locator('[data-report-row]');
    await expect(rows).toHaveCount(7);
    for (let index = 0; index < 7; index++) {
      const row = rows.nth(index);
      await row.focus();
      await page.keyboard.press('Enter');
      const drawer = page.getByRole('dialog');
      const close = drawer.getByRole('button', { name: 'Close evidence' });
      await expect(close).toBeFocused();
      await expect(drawer).toContainText('Why RivalLens is telling you this');
      expect(await drawer.evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
        'Instrument Sans',
      );
      const content = await drawer.innerText();
      expect(content).not.toMatch(/sha256:|00000000-|subscription\.available/);
      if (index === 0) {
        expect(content).toContain('60-day return window');
        expect(content).not.toContain('$75');
      } else if ([2, 4, 6].includes(index)) {
        expect(content).toContain('Subscription page');
        expect(content).toContain('recorded as explicitly absent');
        expect(content).not.toContain('$75');
      }
      if (index >= 5) expect(content).toContain('WHAT IT MIGHT MEAN');
      if (index === 0) {
        const box = await drawer.boundingBox();
        expect(box!.width).toBeCloseTo(width < 834 ? width : 480, 2);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        expect(results.violations).toEqual([]);
        await page.screenshot({
          caret: 'initial',
          path: testInfo.outputPath(`drawer-${width}.png`),
        });
        if (width < 834) {
          expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
          expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        if (width < 1280) {
          await page.keyboard.press('Shift+Tab');
          await expect(drawer.getByRole('link', { name: 'Open in Evidence' })).toBeFocused();
          await page.keyboard.press('Tab');
          await expect(close).toBeFocused();
        }
      }
      if (index % 2 === 0) await page.keyboard.press('Escape');
      else await close.click();
      await expect(drawer).toHaveCount(0);
      await expect(row).toBeFocused();
    }
  });
}

test('desktop row switching updates one open drawer and selected contrast', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/overview/preview/complete');
  const rows = page.locator('[data-report-row]');
  for (const index of [0, 1, 2, 3, 4, 5, 6, 0]) {
    await rows.nth(index).click({ position: { x: 60, y: 20 } });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(rows.nth(index)).toHaveAttribute('aria-expanded', 'true');
    expect(
      await rows
        .nth(index)
        .locator('.text-rl-faint')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe('rgb(92, 98, 112)');
  }
  await page.keyboard.press('Escape');
  await expect(rows.first()).toBeFocused();
});

test('skip navigation, mobile menu, 320px reflow and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/overview/preview/complete');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to report' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const close = page.getByRole('button', { name: 'Close navigation' });
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.locator('[data-report-row]').first().click();
  expect(
    await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).animationDuration),
  ).toBe('1e-05s');
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});

test('generation exposes pending, recoverable network failure and successful retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/overview/preview/complete');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/overview/preview/complete', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await held;
    await route.abort('failed');
  });
  const regenerate = page.getByRole('button', { name: 'Regenerate the whole report' });
  await regenerate.click();
  await expect(regenerate).toBeDisabled();
  await expect(regenerate).toHaveText('Generating…');
  await expect(
    page.getByRole('status').filter({ hasText: 'Generating the whole report' }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Check your connection and try again',
  );
  await expect(regenerate).toBeEnabled();
  await page.unroute('**/overview/preview/complete');
  await regenerate.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Preview report is ready' }),
  ).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('loading announcement is outside the busy skeleton', async ({ page }) => {
  await page.goto('/overview/preview/loading');
  const loading = page.getByRole('status').filter({ hasText: 'Loading the latest' });
  await expect(loading).toHaveCount(1);
  expect(await loading.evaluate((el) => el.closest('[aria-busy="true"]') === null)).toBe(true);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.violations).toEqual([]);
});
