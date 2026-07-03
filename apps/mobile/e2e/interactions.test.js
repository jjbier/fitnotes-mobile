async function login() {
  await device.launchApp({ newInstance: true });
  await waitFor(element(by.text("Hoy")).atIndex(0)).toBeVisible().withTimeout(20000);
  await element(by.text("Configuración")).atIndex(0).tap();
  await waitFor(element(by.text("Iniciar sesión para sincronizar"))).toBeVisible().withTimeout(10000);
  await element(by.text("Iniciar sesión para sincronizar")).tap();
  await waitFor(element(by.id("login-email-input"))).toBeVisible().withTimeout(10000);
  await element(by.id("login-email-input")).typeText("e2e-tests@fitnotes.local");
  await element(by.id("login-password-input")).typeText("E2ETestPass!2026");
  await element(by.id("login-submit-button")).tap();
  await waitFor(element(by.text("Hoy")).atIndex(0)).toBeVisible().withTimeout(20000);
}

describe("Interacciones por pantalla", () => {
  beforeAll(async () => {
    await login();
  });

  it("Ejercicios — busca por nombre y filtra la lista", async () => {
    await element(by.text("Ejercicios")).atIndex(0).tap();
    await waitFor(element(by.id("exercises-search-input"))).toBeVisible().withTimeout(10000);
    await element(by.id("exercises-search-input")).typeText("Press banca");
    await waitFor(element(by.text("Press banca")).atIndex(0)).toBeVisible().withTimeout(5000);
    await element(by.id("exercises-search-input")).clearText();
  });

  it("Configuración — alterna y restaura 'Registrar récords personales'", async () => {
    await element(by.text("Configuración")).atIndex(0).tap();
    const toggle = element(by.label("Registrar récords personales")).atIndex(1);
    await waitFor(toggle).toBeVisible().withTimeout(10000);
    await toggle.tap();
    await toggle.tap(); // restaurar
  });
});
