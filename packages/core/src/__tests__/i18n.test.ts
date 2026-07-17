import { describe, it, expect } from "vitest";
import { es } from "../i18n/locales/es.js";
import { en } from "../i18n/locales/en.js";

/** Recorre un objeto de traducciones y devuelve, para cada hoja, su ruta de claves (p.ej. "settings.profile.saveButton") y su valor. */
function leaves(obj: unknown, prefix = ""): { path: string; value: unknown }[] {
  if (typeof obj !== "object" || obj === null) return [{ path: prefix, value: obj }];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key)
  );
}

describe("i18n locale parity", () => {
  it("es and en expose exactly the same set of translation keys", () => {
    const esKeys = leaves(es).map((l) => l.path).sort();
    const enKeys = leaves(en).map((l) => l.path).sort();
    expect(enKeys).toEqual(esKeys);
  });

  it("has no empty string values in either locale", () => {
    const empties = [...leaves(es), ...leaves(en)].filter((l) => l.value === "").map((l) => l.path);
    expect(empties).toEqual([]);
  });
});
