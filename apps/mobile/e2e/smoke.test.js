describe("Smoke — modo invitado y login opcional", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("arranca directamente en la tab Hoy, sin pedir cuenta", async () => {
    await waitFor(element(by.text("Hoy")).atIndex(0)).toBeVisible().withTimeout(20000);
  });

  it("inicia sesión desde Configuración con el usuario de test y sincroniza", async () => {
    await element(by.text("Configuración")).atIndex(0).tap();
    await waitFor(element(by.text("Iniciar sesión para sincronizar"))).toBeVisible().withTimeout(10000);
    await element(by.text("Iniciar sesión para sincronizar")).tap();
    await waitFor(element(by.id("login-email-input"))).toBeVisible().withTimeout(10000);
    await element(by.id("login-email-input")).typeText("e2e-tests@fitnotes.local");
    await element(by.id("login-password-input")).typeText("E2ETestPass!2026");
    await element(by.id("login-submit-button")).tap();
    await waitFor(element(by.text("Hoy")).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);
  });
});
