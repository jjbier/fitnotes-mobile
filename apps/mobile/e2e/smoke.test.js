describe("Smoke — login y navegación básica", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("muestra la pantalla de bienvenida al arrancar sin sesión", async () => {
    await waitFor(element(by.text("FitNotes App"))).toBeVisible().withTimeout(20000);
    await expect(element(by.text("Iniciar sesión"))).toBeVisible();
  });

  it("inicia sesión con el usuario de test y llega a la tab Hoy", async () => {
    await waitFor(element(by.text("Iniciar sesión"))).toBeVisible().withTimeout(20000);
    await element(by.text("Iniciar sesión")).tap();
    await waitFor(element(by.id("login-email-input"))).toBeVisible().withTimeout(10000);
    await element(by.id("login-email-input")).typeText("e2e-tests@fitnotes.local");
    await element(by.id("login-password-input")).typeText("E2ETestPass!2026");
    await element(by.id("login-submit-button")).tap();
    await waitFor(element(by.text("Hoy")).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);
  });
});
