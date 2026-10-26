import { test, expect } from '@playwright/test';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function doBoxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

test.describe('PocketRoute v1.2.0 Verification Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for initial dock to load
    await expect(page.locator('#origin-input:visible')).toBeVisible();
  });

  test('1. Plan Bibwewadi -> Pune Station at 17:30, ₹75: Bus 140/23, 0 transfers, schedule pill', async ({
    page,
  }) => {
    // 1. Enter starting location Bibwewadi
    const originInput = page.locator('#origin-input:visible');
    await originInput.click();
    await originInput.fill('Bibwewadi');
    const bibwewadiOption = page
      .getByRole('option', { name: /Bibwewadi|Bibvewadi/i })
      .filter({ visible: true })
      .first();
    await expect(bibwewadiOption).toBeVisible({ timeout: 10000 });
    await bibwewadiOption.click();

    // 2. Enter destination Pune Railway Station
    const destInput = page.locator('#destination-input:visible');
    await destInput.click();
    await destInput.fill('Pune Station');
    const puneStationOption = page
      .getByRole('option', { name: /Pune (Railway )?Station/i })
      .filter({ visible: true })
      .first();
    await expect(puneStationOption).toBeVisible({ timeout: 10000 });
    await puneStationOption.click();

    // 3. Find Optimal Route (budget defaults to ₹75)
    const findRouteBtn = page
      .getByRole('button', { name: /Find Optimal Route/i })
      .filter({ visible: true })
      .first();
    await findRouteBtn.click();

    // 4. Verify Route Cards render
    const smartCard = page
      .getByRole('radio', { name: /Smart route/i })
      .filter({ visible: true })
      .first();
    await expect(smartCard).toBeVisible({ timeout: 10000 });

    // 5. Verify Timeline renders Bus 140 or Bus 23
    const primaryBusPill = page
      .locator('[data-testid="bus-pill-primary"]')
      .filter({ visible: true })
      .first();
    await expect(primaryBusPill).toBeVisible();
    const primaryPillText = await primaryBusPill.textContent();
    expect(
      primaryPillText?.includes('Bus 140') ||
        primaryPillText?.includes('Bus 23'),
    ).toBe(true);

    // 6. Verify zero bus transfers (no transfer divider between bus legs)
    const transferDividers = page
      .locator('[data-testid="bus-transfer-divider"]')
      .filter({ visible: true });
    await expect(transferDividers).toHaveCount(0);

    // 7. Verify schedule pill is visible and contains estimate label
    const schedulePill = page
      .locator('[data-testid="schedule-pill"]')
      .filter({ visible: true })
      .first();
    await expect(schedulePill).toBeVisible();
    const schedulePillText = await schedulePill.textContent();
    expect(schedulePillText).toContain('Scheduled estimate, not live');
  });

  test('2. Search "VIT" returns local result and labeled live result with mock, handles error gracefully', async ({
    page,
  }) => {
    // Intercept /api/v1/geo/search to mock Nominatim upstream hybrid result
    await page.route('**/api/v1/geo/search?*q=VIT*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 'pl_vit',
              name: 'Vishwakarma Institute of Technology',
              lat: 18.4636,
              lng: 73.8682,
              source: 'local',
            },
            {
              id: 'osm_vit_hostel_live',
              name: 'VIT Student Hostel Live',
              lat: 18.4645,
              lng: 73.869,
              source: 'osm',
            },
          ],
          liveSearch: 'available',
        }),
      });
    });

    const originInput = page.locator('#origin-input:visible');
    await originInput.click();
    await originInput.fill('VIT');

    // Both local and OSM results should render with appropriate source label
    const localOption = page
      .getByRole('option', { name: /Vishwakarma Institute of Technology/i })
      .first();
    const liveOption = page
      .getByRole('option', { name: /VIT Student Hostel Live/i })
      .first();

    await expect(localOption).toBeVisible({ timeout: 10000 });
    await expect(liveOption).toBeVisible({ timeout: 10000 });

    const osmSourceBadge = liveOption.locator(
      '[data-testid="search-result-source"]',
    );
    await expect(osmSourceBadge).toBeVisible();
    await expect(osmSourceBadge).toHaveText('osm');

    // Now test error handling: route returns 500 error
    await page.route('**/api/v1/geo/search?*q=ErrorTest*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await originInput.click();
    await originInput.fill('ErrorTest');

    // The dock does not crash and remains usable
    await expect(originInput).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Find Optimal Route/i }),
    ).toBeVisible();
  });

  test('3. Selecting a non-stop search result routes from its coordinates', async ({
    page,
  }) => {
    // Intercept search for custom landmark
    await page.route('**/api/v1/geo/search?*q=VITCustom*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 'pl_vit_gate',
              name: 'VIT Gate Custom Landmark',
              lat: 18.4636,
              lng: 73.8682,
              source: 'local',
            },
          ],
          liveSearch: 'available',
        }),
      });
    });

    let requestedPlanPayload: {
      origin?: { lat: number; lng: number };
      destination?: { lat: number; lng: number };
    } | null = null;
    await page.route('**/api/v1/route/plan*', async (route) => {
      if (route.request().method() === 'POST') {
        requestedPlanPayload = route.request().postDataJSON() as {
          origin?: { lat: number; lng: number };
          destination?: { lat: number; lng: number };
        };
      }
      await route.continue();
    });

    // 1. Select the custom landmark
    const originInput = page.locator('#origin-input:visible');
    await originInput.click();
    await originInput.fill('VITCustom');

    const landmarkOption = page
      .getByRole('option', { name: /VIT Gate Custom Landmark/i })
      .first();
    await expect(landmarkOption).toBeVisible({ timeout: 10000 });
    await landmarkOption.click();

    // 2. Select destination Pune Station
    const destInput = page.locator('#destination-input:visible');
    await destInput.click();
    await destInput.fill('Pune Station');
    const puneStationOption = page
      .getByRole('option', { name: /Pune (Railway )?Station/i })
      .filter({ visible: true })
      .first();
    await expect(puneStationOption).toBeVisible({ timeout: 10000 });
    await puneStationOption.click();

    // 3. Plan route
    const findRouteBtn = page
      .getByRole('button', { name: /Find Optimal Route/i })
      .filter({ visible: true })
      .first();
    await findRouteBtn.click();

    // 4. Verify request used custom coordinates
    await expect
      .poll(() => requestedPlanPayload, { timeout: 10000 })
      .not.toBeNull();
    expect(requestedPlanPayload.origin.lat).toBeCloseTo(18.4636, 3);
    expect(requestedPlanPayload.origin.lng).toBeCloseTo(73.8682, 3);
  });

  test('4. Overlap bounding-box checks from v1.1.0 still pass', async ({
    page,
  }) => {
    // 1. Enter starting location Swargate
    const originInput = page.locator('#origin-input:visible');
    await originInput.click();
    await originInput.fill('Swargate');
    const swargateOption = page
      .getByRole('option', { name: /Swargate/i })
      .filter({ visible: true })
      .first();
    await expect(swargateOption).toBeVisible({ timeout: 10000 });
    await swargateOption.click();

    // 2. Enter destination Shivajinagar
    const destInput = page.locator('#destination-input:visible');
    await destInput.click();
    await destInput.fill('Shivajinagar');
    const shivajiOption = page
      .getByRole('option', { name: /Shivajinagar/i })
      .filter({ visible: true })
      .first();
    await expect(shivajiOption).toBeVisible({ timeout: 10000 });
    await shivajiOption.click();

    // 3. Plan route
    const findRouteBtn = page
      .getByRole('button', { name: /Find Optimal Route/i })
      .filter({ visible: true })
      .first();
    await findRouteBtn.click();

    const smartCard = page
      .getByRole('radio', { name: /Smart route/i })
      .filter({ visible: true })
      .first();
    await expect(smartCard).toBeVisible({ timeout: 10000 });

    const startMarker = page.locator('[data-testid="start-marker"]').first();
    const destMarker = page.locator('[data-testid="dest-marker"]').first();

    // On Desktop 1440x900, verify map markers and callouts render with zero collisions
    if (page.viewportSize() && page.viewportSize()!.width >= 1200) {
      await expect(startMarker).toBeVisible({ timeout: 10000 });
      await expect(destMarker).toBeVisible({ timeout: 10000 });

      // Allow flyToBounds animation to settle
      await page.waitForTimeout(1500);

      const startBox = await startMarker.boundingBox();
      const destBox = await destMarker.boundingBox();

      if (startBox && destBox) {
        expect(doBoxesOverlap(startBox, destBox)).toBe(false);
      }

      const callouts = page.locator('[data-testid^="route-callout"]');
      const count = await callouts.count();
      const calloutBoxes: BoundingBox[] = [];

      for (let i = 0; i < count; i++) {
        const callout = callouts.nth(i);
        if (await callout.isVisible()) {
          const box = await callout.boundingBox();
          if (box) {
            calloutBoxes.push(box);
            if (startBox) expect(doBoxesOverlap(box, startBox)).toBe(false);
            if (destBox) expect(doBoxesOverlap(box, destBox)).toBe(false);
          }
        }
      }

      for (let i = 0; i < calloutBoxes.length; i++) {
        for (let j = i + 1; j < calloutBoxes.length; j++) {
          expect(doBoxesOverlap(calloutBoxes[i]!, calloutBoxes[j]!)).toBe(
            false,
          );
        }
      }

      // Invariant from PRD §22.1: No floating pill may sit at left 0 or top 0
      if (startBox) {
        expect(startBox.x === 0 && startBox.y === 0).toBe(false);
        expect(startBox.y).toBeGreaterThan(0);
      }
      if (destBox) {
        expect(destBox.x === 0 && destBox.y === 0).toBe(false);
        expect(destBox.y).toBeGreaterThan(0);
      }
      for (const box of calloutBoxes) {
        expect(box.x === 0 && box.y === 0).toBe(false);
      }
    } else {
      // On tablet/mobile viewports, markers and cards are attached
      await expect(startMarker).toBeAttached();
      await expect(destMarker).toBeAttached();
    }
  });
});
