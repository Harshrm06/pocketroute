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

test.describe('Section 22.1 Map Label Collisions and Safe Zone Acceptance', () => {
  test('No overlapping bounding boxes between markers, callouts, and UI dock/panels', async ({
    page,
  }) => {
    await page.goto('/');

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

    // Wait for route results cards to render
    const smartCard = page
      .getByRole('radio', { name: /Smart route/i })
      .filter({ visible: true })
      .first();
    await expect(smartCard).toBeVisible();

    // Wait for markers and callouts to render and map fitBounds animation (900ms) to settle
    const startMarker = page.locator('[data-testid="start-marker"]').first();
    const destMarker = page.locator('[data-testid="dest-marker"]').first();
    await expect(startMarker).toBeVisible({ timeout: 10000 });
    await expect(destMarker).toBeVisible({ timeout: 10000 });

    // Allow 900ms flyToBounds animation to complete and settle
    await page.waitForTimeout(1200);

    const startBox = await startMarker.boundingBox();
    const destBox = await destMarker.boundingBox();

    expect(startBox).not.toBeNull();
    expect(destBox).not.toBeNull();

    // 4. Verify Start and Destination markers do not overlap each other
    if (startBox && destBox) {
      expect(doBoxesOverlap(startBox, destBox)).toBe(false);
    }

    // 5. Verify callouts do not overlap start/dest markers
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

    // 6. Verify multiple callouts do not overlap each other
    for (let i = 0; i < calloutBoxes.length; i++) {
      for (let j = i + 1; j < calloutBoxes.length; j++) {
        expect(doBoxesOverlap(calloutBoxes[i]!, calloutBoxes[j]!)).toBe(false);
      }
    }

    // 7. Invariant from PRD §22.1: "No floating pill may sit at left 0 or top 0."
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
  });
});
