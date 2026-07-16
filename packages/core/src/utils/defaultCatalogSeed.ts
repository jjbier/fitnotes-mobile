/**
 * Planificación pura del botón "Importar catálogo por defecto" de Settings:
 * dado el estado actual de categorías/ejercicios del usuario, calcula qué
 * categorías y ejercicios del catálogo (`../data/defaultExerciseCatalog.js`)
 * faltan por crear, saltando los que ya existen por nombre (case-insensitive,
 * sin espacios en los extremos) — así el botón se puede pulsar varias veces
 * sin crear duplicados. La ejecución real (llamadas a los repos) vive en cada
 * app, porque el repo remoto (web) y el local (mobile) no comparten un tipo
 * exacto pese a espejar los mismos métodos.
 */
import { DEFAULT_EXERCISE_CATALOG, type DefaultCatalogCategory, type DefaultCatalogExercise } from "../data/defaultExerciseCatalog.js";

/** Plan de una categoría del catálogo: si ya existía, y qué ejercicios suyos faltan por crear. */
export interface DefaultCatalogSeedCategoryPlan {
  name: string;
  /** `true` si ya existe una categoría con este nombre (case-insensitive) — no se creará de nuevo. */
  exists: boolean;
  exercisesToCreate: DefaultCatalogExercise[];
  exercisesSkipped: number;
}

/** Resultado completo de la planificación, con totales listos para mostrar en la UI de confirmación. */
export interface DefaultCatalogSeedPlan {
  categories: DefaultCatalogSeedCategoryPlan[];
  categoriesToCreateCount: number;
  categoriesSkippedCount: number;
  exercisesToCreateCount: number;
  exercisesSkippedCount: number;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Calcula el plan de importación comparando `catalog` (por defecto,
 * `DEFAULT_EXERCISE_CATALOG`) contra las categorías/ejercicios ya existentes
 * del usuario. Un ejercicio se considera existente solo si coincide su
 * nombre Y el nombre de su categoría (así "Press Banca" en dos categorías
 * distintas no se pisan entre sí).
 */
export function computeDefaultCatalogSeedPlan(
  existingCategories: { id: string; name: string }[],
  existingExercises: { name: string; category_id: string | null }[],
  catalog: DefaultCatalogCategory[] = DEFAULT_EXERCISE_CATALOG
): DefaultCatalogSeedPlan {
  const categoryIdToNormalizedName = new Map(existingCategories.map((c) => [c.id, normalizeName(c.name)]));
  const existingCategoryNames = new Set(existingCategories.map((c) => normalizeName(c.name)));
  const existingExerciseKeys = new Set(
    existingExercises
      .filter((e): e is { name: string; category_id: string } => e.category_id != null)
      .map((e) => `${categoryIdToNormalizedName.get(e.category_id) ?? ""}::${normalizeName(e.name)}`)
  );

  const categories: DefaultCatalogSeedCategoryPlan[] = [];
  let categoriesToCreateCount = 0;
  let categoriesSkippedCount = 0;
  let exercisesToCreateCount = 0;
  let exercisesSkippedCount = 0;

  for (const category of catalog) {
    const normalizedCategoryName = normalizeName(category.name);
    const exists = existingCategoryNames.has(normalizedCategoryName);
    if (exists) categoriesSkippedCount++;
    else categoriesToCreateCount++;

    const exercisesToCreate: DefaultCatalogExercise[] = [];
    let exercisesSkipped = 0;
    for (const exercise of category.exercises) {
      const key = `${normalizedCategoryName}::${normalizeName(exercise.name)}`;
      if (exists && existingExerciseKeys.has(key)) {
        exercisesSkipped++;
      } else {
        exercisesToCreate.push(exercise);
      }
    }
    exercisesToCreateCount += exercisesToCreate.length;
    exercisesSkippedCount += exercisesSkipped;

    categories.push({ name: category.name, exists, exercisesToCreate, exercisesSkipped });
  }

  return { categories, categoriesToCreateCount, categoriesSkippedCount, exercisesToCreateCount, exercisesSkippedCount };
}
