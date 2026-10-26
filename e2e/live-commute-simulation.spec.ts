import { test, expect } from '@playwright/test';

test.describe('Step 5: Timeline-to-Map Sync and Live Simulation (PRD Section 22.4)', () => {
  test('Simulate live commute controls: start, pause, play, restart', async ({
    page,
  }) => {
    await page.goto('/');

    // Wait for route cards to be visible
    const simulateBtn = page.getByTestId('simulate-commute-btn');
    await expect(simulateBtn).toBeVisible({ timeout: 10000 });

    // Click Simulate Live Commute
    await simulateBtn.click();

    // Commute Simulator HUD should appear
    const hud = page.getByTestId('commute-simulator-hud');
    await expect(hud).toBeVisible();

    // Check Live Clock and Money Spent displays
    const clock = page.getByTestId('sim-clock');
    await expect(clock).toBeVisible();
    const money = page.getByTestId('sim-money-spent');
    await expect(money).toBeVisible();
    await expect(money).toContainText(/₹/);

    // Play/Pause button should exist
    const playPauseBtn = page.getByTestId('sim-play-pause-btn');
    await expect(playPauseBtn).toBeVisible();

    // Pause simulation
    await playPauseBtn.click();
    await expect(playPauseBtn).toContainText(/Play/i);

    // Resume simulation
    await playPauseBtn.click();
    await expect(playPauseBtn).toContainText(/Pause/i);

    // Restart simulation
    const restartBtn = page.getByTestId('sim-restart-btn');
    await expect(restartBtn).toBeVisible();
    await restartBtn.click();

    // Close simulation
    const closeBtn = page.getByTestId('sim-close-btn');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(hud).not.toBeVisible();
  });

  test('Clicking a timeline leg displays floating leg details and highlights on map', async ({
    page,
  }) => {
    await page.goto('/');

    // Locate the first leg in timeline list
    const firstLegBtn = page
      .locator('ol[aria-label="Route step-by-step itinerary"] button')
      .first();
    await expect(firstLegBtn).toBeVisible({ timeout: 10000 });
    await firstLegBtn.click();

    // Floating leg detail card should be visible
    const detailCard = page.getByTestId('leg-detail-floating-card');
    await expect(detailCard).toBeVisible();
    await expect(detailCard).toContainText(/Leg 1 of/i);

    // Close leg detail card
    const closeLegBtn = page.getByTestId('close-leg-detail-btn');
    await expect(closeLegBtn).toBeVisible();
    await closeLegBtn.click();
    await expect(detailCard).not.toBeVisible();
  });
});
