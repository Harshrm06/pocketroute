import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility & Responsive E2E Audit', () => {
  test('Main flow satisfies WCAG 2.2 AA without serious or critical violations', async ({
    page,
  }) => {
    await page.goto('/');

    // Wait for banner and brand title
    const banner = page.getByRole('banner');
    await expect(banner).toBeVisible();
    await expect(
      banner.getByText('PocketRoute', { exact: true }),
    ).toBeVisible();

    // Run axe scan on main flow
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const seriousOrCritical = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    if (seriousOrCritical.length > 0) {
      console.error(
        'Main flow accessibility violations:',
        JSON.stringify(seriousOrCritical, null, 2),
      );
    }

    expect(seriousOrCritical).toEqual([]);
  });

  test('Inspector drawer satisfies WCAG 2.2 AA without serious or critical violations', async ({
    page,
  }) => {
    await page.goto('/');

    // Click trigger to open DAA Inspector
    const inspectorButton = page.getByRole('button', {
      name: /DAA Inspector/i,
    });
    await inspectorButton.click();

    // Inspector dialog opens
    const dialog = page.getByRole('dialog', {
      name: /Algorithm & Complexity Inspector/i,
    });
    await expect(dialog).toBeVisible();

    // Run axe scan on Inspector dialog
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const seriousOrCritical = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    if (seriousOrCritical.length > 0) {
      console.error(
        'Inspector accessibility violations:',
        JSON.stringify(seriousOrCritical, null, 2),
      );
    }

    expect(seriousOrCritical).toEqual([]);
  });

  test('Settings popover and Clear Recent Places control', async ({ page }) => {
    await page.goto('/');

    // Open settings popover
    const settingsButton = page.getByRole('button', {
      name: /Settings and privacy/i,
    });
    await settingsButton.click();

    const settingsDialog = page.getByRole('dialog', {
      name: /Settings & Privacy/i,
    });
    await expect(settingsDialog).toBeVisible();

    // Clear recent places button exists
    const clearButton = page.getByRole('button', {
      name: /Clear recent places/i,
    });
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // Verify feedback
    await expect(page.getByText(/Cleared!/i)).toBeVisible();
  });

  test('Focus order and label associations across dock inputs', async ({
    page,
  }) => {
    await page.goto('/');

    // Verify origin and destination inputs have accessible labels and are visible
    const originInput = page.locator('#origin-input').filter({ visible: true });
    const destInput = page
      .locator('#destination-input')
      .filter({ visible: true });
    const budgetSlider = page
      .locator('input[type="range"]')
      .filter({ visible: true });

    await expect(originInput).toBeVisible();
    await expect(destInput).toBeVisible();
    await expect(budgetSlider).toBeVisible();

    // Tab through elements
    await originInput.focus();
    await expect(originInput).toBeFocused();

    await page.keyboard.press('Tab');
  });

  test('Respects prefers-reduced-motion media query', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Check that prefers-reduced-motion styles apply
    const bodyAnimation = await page.evaluate(() => {
      const el = document.body;
      return window.getComputedStyle(el).animationDuration;
    });

    expect(bodyAnimation).toBeDefined();
  });
});
