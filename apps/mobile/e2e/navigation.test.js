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

describe("Navegación por las 6 tabs", () => {
  beforeAll(async () => {
    await login();
  });

  it("Hoy — muestra el entrenamiento del día", async () => {
    await expect(element(by.text("Hoy")).atIndex(0)).toBeVisible();
  });

  it("Calendario — carga el grid del mes", async () => {
    await element(by.text("Calendario")).atIndex(0).tap();
    await waitFor(element(by.text("Calendario")).atIndex(1)).toBeVisible().withTimeout(10000);
  });

  it("Ejercicios — muestra el buscador", async () => {
    await element(by.text("Ejercicios")).atIndex(0).tap();
    await waitFor(element(by.text("Ejercicios")).atIndex(0)).toBeVisible().withTimeout(10000);
  });

  it("Progreso — muestra la sección de récords", async () => {
    await element(by.text("Progreso")).atIndex(0).tap();
    await waitFor(element(by.text("Progreso")).atIndex(1)).toBeVisible().withTimeout(10000);
  });

  it("Rutinas — muestra la lista de rutinas", async () => {
    await element(by.text("Rutinas")).atIndex(0).tap();
    await waitFor(element(by.text("Rutinas")).atIndex(1)).toBeVisible().withTimeout(10000);
  });

  it("Configuración — muestra el perfil", async () => {
    await element(by.text("Configuración")).atIndex(0).tap();
    await waitFor(element(by.text("Configuración")).atIndex(1)).toBeVisible().withTimeout(10000);
    await expect(element(by.text("Perfil"))).toBeVisible();
  });
});
