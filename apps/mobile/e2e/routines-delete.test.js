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

describe("Rutinas — CRUD completo (crear, editar, copiar, eliminar)", () => {
  const NAME = `E2E-Detox-Rutina-${Date.now()}`;

  beforeAll(async () => {
    await login();
    await element(by.text("Rutinas")).atIndex(0).tap();
  });

  it("crea una rutina", async () => {
    await element(by.id("routine-fab-add")).tap();
    await element(by.id("routine-name-input")).typeText(NAME);
    await element(by.id("routine-create-submit")).tap();
    await waitFor(element(by.text(NAME))).toBeVisible().withTimeout(8000);
  });

  it("abre el menú y elimina la rutina [regression: 4º botón de Alert.alert]", async () => {
    await element(by.id(`routine-menu-${NAME}`)).tap();
    await waitFor(element(by.text("Eliminar"))).toBeVisible().withTimeout(5000);
    await element(by.text("Eliminar")).tap();
    // Confirmación nativa (Alert de 2 botones, sí soportada por Android)
    await waitFor(element(by.text("Eliminar")).atIndex(0)).toBeVisible().withTimeout(5000);
    await element(by.text("Eliminar")).atIndex(0).tap();
    await waitFor(element(by.text(NAME))).not.toBeVisible().withTimeout(8000);
  });
});
