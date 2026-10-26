import { test, expect } from '@playwright/test';

test.describe('Step 4: Map Click-to-Pin, Drag, and Swap (PRD Section 22.3)', () => {
  test('Swap button rotates and swaps origin and destination values', async ({
    page,
  }) => {
    await page.goto('/');

    const originInput = page.locator('#origin-input:visible').first();
    const destInput = page.locator('#destination-input:visible').first();

    // Fill initial values
    await originInput.click();
    await originInput.fill('Swargate');
    const swargateOpt = page
      .getByRole('option', { name: /Swargate/i })
      .filter({ visible: true })
      .first();
    await expect(swargateOpt).toBeVisible();
    await swargateOpt.click();

    await destInput.click();
    await destInput.fill('Shivajinagar');
    const shivajiOpt = page
      .getByRole('option', { name: /Shivajinagar/i })
      .filter({ visible: true })
      .first();
    await expect(shivajiOpt).toBeVisible();
    await shivajiOpt.click();

    await expect(originInput).toHaveValue(/Swargate/i);
    await expect(destInput).toHaveValue(/Shivajinagar/i);

    // Click swap button
    const swapBtn = page.getByRole('button', {
      name: /Swap origin and destination/i,
    });
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();

    // After swap, origin should be Shivajinagar and destination should be Swargate
    await expect(originInput).toHaveValue(/Shivajinagar/i);
    await expect(destInput).toHaveValue(/Swargate/i);
  });

  test('Clicking map when both are filled opens "Set as Start or Destination?" prompt', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name.includes('Mobile')) {
      test.skip(
        true,
        'Mobile bottom sheet and top dock cover map during search',
      );
    }
    await page.goto('/');

    const originInput = page.locator('#origin-input:visible').first();
    const destInput = page.locator('#destination-input:visible').first();

    await originInput.click();
    await originInput.fill('Swargate');
    const swargateOpt = page
      .getByRole('option', { name: /Swargate/i })
      .filter({ visible: true })
      .first();
    await expect(swargateOpt).toBeVisible();
    await swargateOpt.click();

    await destInput.click();
    await destInput.fill('Shivajinagar');
    const shivajiOpt = page
      .getByRole('option', { name: /Shivajinagar/i })
      .filter({ visible: true })
      .first();
    await expect(shivajiOpt).toBeVisible();
    await shivajiOpt.click();

    // Blur inputs to close any open autocomplete dropdowns
    await page.keyboard.press('Escape');

    const vp = page.viewportSize();
    // On mobile, collapse bottom sheet to peek so the map canvas between y=400..y=740 is exposed
    if (vp && vp.width < 500) {
      const sheetToggle = page.locator('button:has-text("Results & Timeline")');
      if (await sheetToggle.isVisible()) {
        await sheetToggle.click(); // half -> full
        await sheetToggle.click(); // full -> peek
      }
    }

    // Click in map region clear of the left dock / mobile top card
    const mapRegion = page.locator(
      '[role="region"][aria-label="Pune Interactive Transit Map"]',
    );
    await expect(mapRegion).toBeVisible();
    const clickX = vp && vp.width < 500 ? Math.round(vp.width / 2) : 600;
    const clickY = vp && vp.width < 500 ? 520 : 350;
    await mapRegion.click({ position: { x: clickX, y: clickY }, force: true });

    // Choice prompt should appear
    const prompt = page.getByTestId('pin-choice-prompt');
    await expect(prompt).toBeVisible({ timeout: 5000 });
    await expect(prompt).toContainText(/Set as Start or Destination\?/i);

    // Click "Set Start"
    const setStartBtn = page.getByTestId('set-as-start-btn');
    await expect(setStartBtn).toBeVisible();
    await setStartBtn.click();

    // Prompt should close
    await expect(prompt).not.toBeVisible();
  });
});
