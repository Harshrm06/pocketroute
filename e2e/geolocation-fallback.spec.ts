import { test, expect } from '@playwright/test';

test.describe('Step 3: Geolocation and Demo Fallback (PRD Section 22.2)', () => {
  test('permission denied shows inline error and demo simulation fallback button', async ({
    context,
    page,
  }) => {
    // Deny geolocation permissions
    await context.clearPermissions();

    await page.goto('/');

    // Verify "Use Current Location" chip is visible in the start input label
    const chipBtn = page
      .getByTestId('use-current-location-chip')
      .filter({ visible: true })
      .first();
    await expect(chipBtn).toBeVisible();

    // Click "Use Current Location"
    await chipBtn.click();

    // Expect inline error banner with demo fallback
    const banner = page
      .getByTestId('location-message-banner')
      .filter({ visible: true })
      .first();
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText(/permission denied|unable to retrieve/i);

    // Expect "Simulate GPS in Pune (VIT Bibwewadi / Swargate)" button
    const demoBtn = page
      .getByTestId('simulate-gps-button')
      .filter({ visible: true })
      .first();
    await expect(demoBtn).toBeVisible();

    // Click demo fallback button
    await demoBtn.click();

    // Start input should now contain Current Location (Swargate)
    const originInput = page.locator('#origin-input:visible').first();
    await expect(originInput).toHaveValue(/Current Location \(Swargate\)/i);

    // Banner should be dismissed
    await expect(banner).not.toBeVisible();
  });

  test('floating My Location button is present on the map', async ({
    page,
  }) => {
    await page.goto('/');
    const myLocationBtn = page.getByTestId('my-location-button');
    await expect(myLocationBtn).toBeVisible();
  });
});
