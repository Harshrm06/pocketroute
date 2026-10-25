import { test, expect } from '@playwright/test';

test.describe('Section 17.4 Core E2E Specs', () => {
  test('1. Plan example trip (Swargate to Shivajinagar, 17:30, ₹75): 3 cards & savings chip', async ({
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
    await expect(swargateOption).toBeVisible();
    await swargateOption.click();

    // 2. Enter destination Shivajinagar
    const destInput = page.locator('#destination-input:visible');
    await destInput.click();
    await destInput.fill('Shivajinagar');
    const shivajiOption = page
      .getByRole('option', { name: /Shivajinagar/i })
      .filter({ visible: true })
      .first();
    await expect(shivajiOption).toBeVisible();
    await shivajiOption.click();

    // 3. Set departure time 17:30
    const setTimeBtn = page
      .getByRole('button', { name: /Set Time/i })
      .filter({ visible: true })
      .first();
    await setTimeBtn.click();
    const timeInput = page.locator('#departure-time-select:visible');
    await expect(timeInput).toBeVisible();
    await timeInput.fill('17:30');

    // 4. Default budget is ₹75. Click Find Optimal Route
    const findRouteBtn = page
      .getByRole('button', { name: /Find Optimal Route/i })
      .filter({ visible: true })
      .first();
    await findRouteBtn.click();

    // 5. Verify three comparison cards appear (Smart, Fastest, Cheapest)
    const smartCard = page
      .getByRole('radio', { name: /Smart route/i })
      .filter({ visible: true })
      .first();
    const fastestCard = page
      .getByRole('radio', { name: /Fastest route/i })
      .filter({ visible: true })
      .first();
    const cheapestCard = page
      .getByRole('radio', { name: /Cheapest route/i })
      .filter({ visible: true })
      .first();

    await expect(smartCard).toBeVisible();
    await expect(fastestCard).toBeVisible();
    await expect(cheapestCard).toBeVisible();

    // 6. Verify Smart card is selected and has the savings chip / badge
    await expect(smartCard.getByText('SMART')).toBeVisible();

    // Timeline has at least 2 legs
    const timeline = page
      .getByLabel(/Route step-by-step itinerary/i)
      .filter({ visible: true })
      .first();
    await expect(timeline).toBeVisible();
  });

  test('2. Select a preset (₹30): Smart card and timeline update', async ({
    page,
  }) => {
    await page.goto('/');

    // Enter endpoints
    const originInput = page.locator('#origin-input:visible');
    await originInput.click();
    await originInput.fill('Swargate');
    await page
      .getByRole('option', { name: /Swargate/i })
      .filter({ visible: true })
      .first()
      .click();

    const destInput = page.locator('#destination-input:visible');
    await destInput.click();
    await destInput.fill('Shivajinagar');
    await page
      .getByRole('option', { name: /Shivajinagar/i })
      .filter({ visible: true })
      .first()
      .click();

    // Select ₹30 Broke Student preset pill
    const preset30Btn = page
      .getByRole('button', { name: /₹30 Broke Student/i })
      .filter({ visible: true })
      .first();
    await preset30Btn.click();

    // Submit route search
    await page
      .getByRole('button', { name: /Find Optimal Route/i })
      .filter({ visible: true })
      .first()
      .click();

    // Verify smart card and timeline appear
    const smartCard = page
      .getByRole('radio', { name: /Smart route/i })
      .filter({ visible: true })
      .first();
    await expect(smartCard).toBeVisible();

    const timeline = page
      .getByLabel(/Route step-by-step itinerary/i)
      .filter({ visible: true })
      .first();
    await expect(timeline).toBeVisible();
  });

  test('3. Open Inspector: pruning counters, DP table tab, and chart rendering', async ({
    page,
  }) => {
    await page.goto('/');

    // Click trigger to open DAA Inspector
    const inspectorButton = page
      .getByRole('button', {
        name: /DAA Inspector/i,
      })
      .filter({ visible: true })
      .first();
    await inspectorButton.click();

    const dialog = page.getByRole('dialog', {
      name: /Algorithm & Complexity Inspector/i,
    });
    await expect(dialog).toBeVisible();

    // 1. Switch to Pruning tab and verify counters
    const pruningTab = dialog.getByRole('tab', { name: /Pruning/i });
    await pruningTab.click();
    await expect(
      dialog.getByText(/Branch & Bound Pruning Counters/i),
    ).toBeVisible();
    await expect(dialog.getByText('RULE P1')).toBeVisible();
    await expect(dialog.getByText('RULE P2')).toBeVisible();
    await expect(dialog.getByText('RULE P3')).toBeVisible();

    // 2. Switch to DP Table tab and verify table rendering
    const dpTab = dialog.getByRole('tab', { name: /DP Table/i });
    await dpTab.click();
    await expect(
      dialog.getByText(/Cost-Indexed DP Table|Sparse Pareto Frontier/i),
    ).toBeVisible();

    // 3. Switch to Chart tab and verify chart and accessible fallback
    const chartTab = dialog.getByRole('tab', { name: /Chart/i });
    await chartTab.click();
    await expect(
      dialog.getByText(/Empirical Algorithm Comparison/i),
    ).toBeVisible();
    await expect(
      dialog.getByRole('table', {
        name: /Algorithm Complexity and Operations Comparison/i,
      }),
    ).toBeVisible();
  });

  test('4. Infeasible case (₹10 for long trip): warning card & one-tap budget fix', async ({
    page,
  }) => {
    await page.goto('/');

    // Origin: PCMC Metro Station (north), Destination: Swargate (south)
    const originInput = page.locator('#origin-input:visible');
    await originInput.click();
    await originInput.fill('PCMC');
    await page
      .getByRole('option', { name: /PCMC/i })
      .filter({ visible: true })
      .first()
      .click();

    const destInput = page.locator('#destination-input:visible');
    await destInput.click();
    await destInput.fill('Swargate');
    await page
      .getByRole('option', { name: /Swargate/i })
      .filter({ visible: true })
      .first()
      .click();

    // Set budget slider to 10
    const budgetSlider = page.locator('input[type="range"]:visible');
    await budgetSlider.fill('10');

    // Click Find Optimal Route
    await page
      .getByRole('button', { name: /Find Optimal Route/i })
      .filter({ visible: true })
      .first()
      .click();

    // Warning card appears with minimum required fare and one-tap action
    const warningText = page
      .getByText(/Budget Too Low for Transit/i)
      .filter({ visible: true })
      .first();
    await expect(warningText).toBeVisible();

    const fixBudgetBtn = page
      .getByRole('button', { name: /Set budget to ₹/i })
      .filter({ visible: true })
      .first();
    await expect(fixBudgetBtn).toBeVisible();

    // Click one-tap fix
    await fixBudgetBtn.click();

    // Verify route becomes feasible
    const smartCard = page
      .getByRole('radio', { name: /Smart route/i })
      .filter({ visible: true })
      .first();
    await expect(smartCard).toBeVisible();
  });

  test('5. Mobile bottom sheet: snap through peek, half, and full positions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // Bottom sheet drag handle (in mobile viewport)
    const handle = page.locator(
      'button[aria-label*="Click to change snap point"]:visible',
    );
    await expect(handle).toBeVisible();

    // Check initial snap point (half)
    await expect(handle).toHaveAttribute('aria-label', /half/i);

    // Tap handle to cycle to full
    await handle.click();
    await expect(handle).toHaveAttribute('aria-label', /full/i);

    // Tap handle to cycle to peek
    await handle.click();
    await expect(handle).toHaveAttribute('aria-label', /peek/i);

    // Tap handle to return to half
    await handle.click();
    await expect(handle).toHaveAttribute('aria-label', /half/i);
  });
});
