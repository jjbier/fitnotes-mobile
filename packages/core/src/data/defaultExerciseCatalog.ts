/**
 * Catálogo de categorías y ejercicios por defecto (8 categorías, 96 ejercicios),
 * usado por el botón "Importar catálogo por defecto" de Settings (web y
 * mobile) para poblar una cuenta nueva o vacía. Fuente: `fixtures` en la raíz
 * del repo (lista de referencia de la app FitNotes original).
 *
 * Los nombres NO están hardcodeados aquí — cada categoría/ejercicio solo
 * lleva una `key` estable e independiente del idioma; los nombres reales se
 * resuelven en tiempo de ejecución vía `resolveDefaultExerciseCatalog` contra
 * el namespace `exerciseCatalog` de `../i18n/locales/{es,en}.js` (ver
 * `defaultCatalogSeed.js`, que usa este catálogo).
 */
import { ExerciseType } from "../types/index.js";

/** Un ejercicio del catálogo por defecto, con su `key` de traducción y el tipo que determina qué campos registra (ver `ExerciseType`). */
export interface DefaultCatalogExerciseKey {
  key: string;
  type: ExerciseType;
}

/** Una categoría del catálogo por defecto (por `key` de traducción) y sus ejercicios. */
export interface DefaultCatalogCategoryKey {
  key: string;
  exercises: DefaultCatalogExerciseKey[];
}

/** Un ejercicio del catálogo ya resuelto a un idioma concreto: nombre real + tipo. */
export interface DefaultCatalogExercise {
  name: string;
  type: ExerciseType;
}

/** Una categoría del catálogo ya resuelta a un idioma concreto: nombre real + sus ejercicios. */
export interface DefaultCatalogCategory {
  name: string;
  exercises: DefaultCatalogExercise[];
}

const { WEIGHT_REPS, REPS_ONLY, TIME_ONLY, DISTANCE_TIME } = ExerciseType;

export const DEFAULT_EXERCISE_CATALOG_KEYS: DefaultCatalogCategoryKey[] = [
  {
    key: "abs",
    exercises: [
      { key: "abWheelRollout", type: REPS_ONLY },
      { key: "cableCrunch", type: WEIGHT_REPS },
      { key: "crunch", type: REPS_ONLY },
      { key: "crunchMachine", type: WEIGHT_REPS },
      { key: "declineCrunch", type: REPS_ONLY },
      { key: "dragonFlag", type: REPS_ONLY },
      { key: "hangingKneeRaise", type: REPS_ONLY },
      { key: "hangingLegRaise", type: REPS_ONLY },
      { key: "plank", type: TIME_ONLY },
      { key: "sidePlank", type: TIME_ONLY },
    ],
  },
  {
    key: "back",
    exercises: [
      { key: "barbellRow", type: WEIGHT_REPS },
      { key: "barbellShrug", type: WEIGHT_REPS },
      { key: "chinUp", type: REPS_ONLY },
      { key: "deadlift", type: WEIGHT_REPS },
      { key: "dumbbellRow", type: WEIGHT_REPS },
      { key: "goodMorning", type: WEIGHT_REPS },
      { key: "hammerStrengthRow", type: WEIGHT_REPS },
      { key: "latPulldown", type: WEIGHT_REPS },
      { key: "machineShrug", type: WEIGHT_REPS },
      { key: "neutralChinUp", type: REPS_ONLY },
      { key: "pendlayRow", type: WEIGHT_REPS },
      { key: "pullUp", type: REPS_ONLY },
      { key: "rackPull", type: WEIGHT_REPS },
      { key: "seatedCableRow", type: WEIGHT_REPS },
      { key: "straightArmCablePushdown", type: WEIGHT_REPS },
      { key: "tBarRow", type: WEIGHT_REPS },
    ],
  },
  {
    key: "biceps",
    exercises: [
      { key: "barbellCurl", type: WEIGHT_REPS },
      { key: "cableCurl", type: WEIGHT_REPS },
      { key: "dumbbellConcentrationCurl", type: WEIGHT_REPS },
      { key: "dumbbellCurl", type: WEIGHT_REPS },
      { key: "dumbbellHammerCurl", type: WEIGHT_REPS },
      { key: "dumbbellPreacherCurl", type: WEIGHT_REPS },
      { key: "ezBarCurl", type: WEIGHT_REPS },
      { key: "ezBarPreacherCurl", type: WEIGHT_REPS },
      { key: "seatedInclineDumbbellCurl", type: WEIGHT_REPS },
      { key: "seatedMachineCurl", type: WEIGHT_REPS },
    ],
  },
  {
    key: "cardio",
    exercises: [
      { key: "cycling", type: DISTANCE_TIME },
      { key: "ellipticalTrainer", type: DISTANCE_TIME },
      { key: "rowingMachine", type: DISTANCE_TIME },
      { key: "runningOutdoor", type: DISTANCE_TIME },
      { key: "runningTreadmill", type: DISTANCE_TIME },
      { key: "stationaryBike", type: DISTANCE_TIME },
      { key: "swimming", type: DISTANCE_TIME },
      { key: "walking", type: DISTANCE_TIME },
    ],
  },
  {
    key: "chest",
    exercises: [
      { key: "cableCrossover", type: WEIGHT_REPS },
      { key: "declineBarbellBenchPress", type: WEIGHT_REPS },
      { key: "declineHammerStrengthChestPress", type: WEIGHT_REPS },
      { key: "flatBarbellBenchPress", type: WEIGHT_REPS },
      { key: "flatDumbbellBenchPress", type: WEIGHT_REPS },
      { key: "flatDumbbellFly", type: WEIGHT_REPS },
      { key: "inclineBarbellBenchPress", type: WEIGHT_REPS },
      { key: "inclineDumbbellBenchPress", type: WEIGHT_REPS },
      { key: "inclineDumbbellFly", type: WEIGHT_REPS },
      { key: "inclineHammerStrengthChestPress", type: WEIGHT_REPS },
      { key: "seatedMachineFly", type: WEIGHT_REPS },
    ],
  },
  {
    key: "leg",
    exercises: [
      { key: "barbellCalfRaise", type: WEIGHT_REPS },
      { key: "barbellFrontSquat", type: WEIGHT_REPS },
      { key: "barbellGluteBridge", type: WEIGHT_REPS },
      { key: "barbellSquat", type: WEIGHT_REPS },
      { key: "donkeyCalfRaise", type: WEIGHT_REPS },
      { key: "gluteHamRaise", type: REPS_ONLY },
      { key: "legExtensionMachine", type: WEIGHT_REPS },
      { key: "legPress", type: WEIGHT_REPS },
      { key: "lyingLegCurlMachine", type: WEIGHT_REPS },
      { key: "romanianDeadlift", type: WEIGHT_REPS },
      { key: "seatedCalfRaiseMachine", type: WEIGHT_REPS },
      { key: "seatedLegCurlMachine", type: WEIGHT_REPS },
      { key: "standingCalfRaiseMachine", type: WEIGHT_REPS },
      { key: "stiffLeggedDeadlift", type: WEIGHT_REPS },
      { key: "sumoDeadlift", type: WEIGHT_REPS },
    ],
  },
  {
    key: "shoulders",
    exercises: [
      { key: "arnoldDumbbellPress", type: WEIGHT_REPS },
      { key: "behindTheNeckBarbellPress", type: WEIGHT_REPS },
      { key: "cableFacePull", type: WEIGHT_REPS },
      { key: "frontDumbbellRaise", type: WEIGHT_REPS },
      { key: "hammerStrengthShoulderPress", type: WEIGHT_REPS },
      { key: "lateralDumbbellRaise", type: WEIGHT_REPS },
      { key: "lateralMachineRaise", type: WEIGHT_REPS },
      { key: "logPress", type: WEIGHT_REPS },
      { key: "oneArmStandingDumbbellPress", type: WEIGHT_REPS },
      { key: "overheadPress", type: WEIGHT_REPS },
      { key: "pushPress", type: WEIGHT_REPS },
      { key: "rearDeltDumbbellRaise", type: WEIGHT_REPS },
      { key: "rearDeltMachineFly", type: WEIGHT_REPS },
      { key: "seatedDumbbellLateralRaise", type: WEIGHT_REPS },
      { key: "seatedDumbbellPress", type: WEIGHT_REPS },
      { key: "smithMachineOverheadPress", type: WEIGHT_REPS },
    ],
  },
  {
    key: "triceps",
    exercises: [
      { key: "cableOverheadTricepsExtension", type: WEIGHT_REPS },
      { key: "closeGripBarbellBenchPress", type: WEIGHT_REPS },
      { key: "dumbbellOverheadTricepsExtension", type: WEIGHT_REPS },
      { key: "ezBarSkullcrusher", type: WEIGHT_REPS },
      { key: "lyingTricepsExtension", type: WEIGHT_REPS },
      { key: "parallelBarTricepsDip", type: REPS_ONLY },
      { key: "ringDip", type: REPS_ONLY },
      { key: "ropePushDown", type: WEIGHT_REPS },
      { key: "smithMachineCloseGripBenchPress", type: WEIGHT_REPS },
      { key: "vBarPushDown", type: WEIGHT_REPS },
    ],
  },
];

/**
 * Resuelve `DEFAULT_EXERCISE_CATALOG_KEYS` a nombres reales en un idioma dado. `categoryNames`/
 * `exerciseNames` son los objetos ya traducidos del namespace `exerciseCatalog` (p.ej.
 * `es.exerciseCatalog.categories`/`es.exerciseCatalog.exercises`, o el resultado de
 * `t("exerciseCatalog:categories", { returnObjects: true })` con react-i18next en cada app).
 */
export function resolveDefaultExerciseCatalog(
  categoryNames: Record<string, string>,
  exerciseNames: Record<string, string>
): DefaultCatalogCategory[] {
  return DEFAULT_EXERCISE_CATALOG_KEYS.map((category) => ({
    name: categoryNames[category.key] ?? category.key,
    exercises: category.exercises.map((exercise) => ({
      name: exerciseNames[exercise.key] ?? exercise.key,
      type: exercise.type,
    })),
  }));
}
