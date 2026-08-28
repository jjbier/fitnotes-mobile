import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { SafeAreaView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, FlatList, ScrollView, Vibration, useWindowDimensions } from "react-native";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import DraggableFlatList, { ScaleDecorator, NestableScrollContainer, NestableDraggableFlatList, type RenderItemParams } from "react-native-draggable-flatlist";
import { useWorkoutStore, useExerciseStore, usePreferencesStore, ExerciseType, calculate1RM, formatMinutesSeconds } from "@fitnotes/core";
import { createProgressRepository, createExerciseRepository } from "@fitnotes/database";
import type { WorkoutExercise } from "@fitnotes/core";
import { supabase } from "../../lib/supabase";
import { useRepositories } from "../../contexts/RepositoryContext";
import type { Set as FitSet } from "@fitnotes/core";
import LineChart from "../../components/LineChart";

interface LastSet {
  weight: number | null;
  reps: number | null;
  distance: number | null;
  time_seconds: number | null;
  order_index: number;
}

type HistorySession = {
  workout_id: string;
  date: string;
  sets: {
    weight?: number;
    reps?: number;
    distance?: number;
    time_seconds?: number;
    is_warmup: boolean;
    order_index: number;
  }[];
};

/** Formatea una serie de una sesión pasada como texto compacto ("100×5", "5km", "30s"...) para las vistas de última sesión/historial. */
function formatLastSet(s: LastSet): string {
  const parts: string[] = [];
  if (s.weight != null) parts.push(`${s.weight}`);
  if (s.reps != null) parts.push(`×${s.reps}`);
  if (s.distance != null) parts.push(`${s.distance}km`);
  if (s.time_seconds != null) parts.push(`${s.time_seconds}s`);
  return parts.join("") || "—";
}

const GROUP_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981"];

/**
 * Pantalla de CRUD de series de un ejercicio dentro del entrenamiento activo: alta,
 * edición inline (con botones +/− por campo), reordenado por drag&drop, marcado de
 * calentamiento/completada, comentarios por serie y navegación entre los ejercicios
 * del entrenamiento (incluida gestión de supersets: agrupar, renombrar, avance
 * automático al siguiente ejercicio del grupo al completar una serie). Incluye
 * temporizador de descanso manual con persistencia de la última duración usada,
 * vibración + sonido + haptics al terminar, y pestañas de Historial/Gráfico del
 * ejercicio. CRUD de series vía `useRepositories()` (local); historial y datos del
 * gráfico usan repos remotos ad-hoc (`createExerciseRepository`/`createProgressRepository`
 * sobre `supabase`), fuera del alcance offline por ser lecturas analíticas pesadas.
 */
export default function TrainingScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const exercises = useExerciseStore((s) => s.exercises);
  const exercise = exercises.find((e) => e.id === exerciseId);

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const workoutExercises = useWorkoutStore((s) => s.exercises);
  const sets = useWorkoutStore((s) => s.sets);
  const createSet = useWorkoutStore((s) => s.createSet);
  const updateSet = useWorkoutStore((s) => s.updateSet);
  const deleteSet = useWorkoutStore((s) => s.deleteSet);
  const markSetComplete = useWorkoutStore((s) => s.markSetComplete);
  const addExerciseToWorkout = useWorkoutStore((s) => s.addExerciseToWorkout);
  const removeExerciseFromWorkout = useWorkoutStore((s) => s.removeExerciseFromWorkout);
  const reorderExercises = useWorkoutStore((s) => s.reorderExercises);
  const reorderSets = useWorkoutStore((s) => s.reorderSets);
  const ungroupExercise = useWorkoutStore((s) => s.ungroupExercise);
  const updateWorkoutExerciseGroup = useWorkoutStore((s) => s.updateWorkoutExerciseGroup);
  const renameGroup = useWorkoutStore((s) => s.renameGroup);

  useKeepAwake();

  const [saving, setSaving] = useState(false);
  const weightUnit = usePreferencesStore((s) => s.preferences.weight_unit);
  const globalWeightIncrement = usePreferencesStore((s) => s.preferences.default_weight_increment);
  const autoSelectNextSet = usePreferencesStore((s) => s.preferences.auto_select_next_set);
  const trackPersonalRecords = usePreferencesStore((s) => s.preferences.track_personal_records);
  const markSetsComplete = usePreferencesStore((s) => s.preferences.mark_sets_complete);
  const timerSoundEnabled = usePreferencesStore((s) => s.preferences.rest_timer_sound_enabled);
  const timerVolume = usePreferencesStore((s) => s.preferences.rest_timer_volume);
  const defaultRestSeconds = usePreferencesStore((s) => s.preferences.default_rest_seconds);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [lastSessionSets, setLastSessionSets] = useState<LastSet[]>([]);
  const [showLastSession, setShowLastSession] = useState(false);
  const [exercisePR, setExercisePR] = useState<{ weight: number; reps: number } | null>(null);
  const [prByReps, setPrByReps] = useState<Record<number, number>>({});
  const [showNotes, setShowNotes] = useState(false);
  const [commentingSetId, setCommentingSetId] = useState<string | null>(null);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [showRenameGroup, setShowRenameGroup] = useState(false);
  const [renameGroupText, setRenameGroupText] = useState("");

  const [workoutTab, setWorkoutTab] = useState<"sets" | "history" | "chart">("sets");
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chartPoints, setChartPoints] = useState<{ date: string; maxWeight: number; totalVolume: number; maxReps: number; est1RM: number; maxDistance: number; maxTime: number }[]>([]);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [chartLoading2, setChartLoading2] = useState(false);
  const [chartMetric, setChartMetric] = useState<"weight" | "volume" | "reps">("weight");
  const { width } = useWindowDimensions();

  // Rest timer
  const [timerDuration, setTimerDuration] = useState(90);
  const [timerRemaining, setTimerRemaining] = useState(90);
  const [timerRunning, setTimerRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerSoundRef = useRef<Audio.Sound | null>(null);

  const { workoutRepo: repo, progressRepo, userId } = useRepositories();
  const remoteProgressRepo = useMemo(() => createProgressRepository(supabase), []);
  const exerciseRepo = useMemo(() => createExerciseRepository(supabase), []);

  const workoutExercise = workoutExercises.find((we) => we.exercise_id === exerciseId);
  const exerciseSets = (workoutExercise ? sets[workoutExercise.id] ?? [] : []).slice().sort((a, b) => a.order_index - b.order_index);

  const sorted = workoutExercises.slice().sort((a, b) => a.order_index - b.order_index);
  const groupIds = [...new Set(workoutExercises.filter((we) => we.group_id).map((we) => we.group_id!))];
  const groupColorMap: Record<string, string> = Object.fromEntries(
    groupIds.map((id, i) => [id, GROUP_COLORS[i % GROUP_COLORS.length]!])
  );

  /** Cambia de pestaña y, la primera vez que se visita Historial o Gráfico, dispara la carga perezosa de sus datos remotos (memoizados tras la primera carga). */
  function handleWorkoutTabChange(tab: "sets" | "history" | "chart") {
    setWorkoutTab(tab);
    if (tab === "history" && !historyLoaded && !historyLoading) {
      setHistoryLoading(true);
      exerciseRepo.getExerciseHistory(exerciseId ?? "").then(({ data }) => {
        setHistorySessions((data ?? []).slice(0, 5) as unknown as HistorySession[]);
        setHistoryLoaded(true);
        setHistoryLoading(false);
      });
    }
    if (tab === "chart" && !chartLoaded && !chartLoading2) {
      setChartLoading2(true);
      remoteProgressRepo.getChartData(exerciseId ?? "").then((points) => {
        setChartPoints(points);
        setChartLoaded(true);
        setChartLoading2(false);
      });
    }
  }

  // Al montar, restaura la última duración de descanso usada (persistida en un archivo
  // JSON vía expo-file-system, no en preferencias) o cae al valor por defecto del usuario.
  useEffect(() => {
    const timerFile = (FileSystem.documentDirectory ?? "") + "last-timer-duration.json";
    FileSystem.readAsStringAsync(timerFile)
      .then((s) => JSON.parse(s) as { seconds: number })
      .catch(() => null)
      .then((savedTimer) => {
        const restoredDuration = savedTimer?.seconds ?? defaultRestSeconds;
        setTimerDuration(restoredDuration);
        setTimerRemaining(restoredDuration);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Precarga el sonido de fin de descanso una vez y lo descarga al desmontar la pantalla.
  useEffect(() => {
    Audio.Sound.createAsync(require("../../assets/sounds/timer-end.mp3"), { shouldPlay: false })
      .then(({ sound }) => { timerSoundRef.current = sound; })
      .catch(() => {});
    return () => { void timerSoundRef.current?.unloadAsync(); };
  }, []);

  // Si se navega a un ejercicio que aún no forma parte del entrenamiento activo, lo añade
  // automáticamente al abrir la pantalla (evita un paso manual de "añadir ejercicio").
  useEffect(() => {
    if (exercise && userId) {
      if (activeWorkout && activeWorkout.id && !activeWorkout.end_time && !workoutExercise) {
        async function addToWorkout() {
          if (!activeWorkout?.id) return;
          const { data, error } = await repo.addExercise({
            workout_id: activeWorkout.id,
            exercise_id: exerciseId ?? "",
            order_index: workoutExercises.length,
          }, userId);
          if (!error && data) {
            addExerciseToWorkout(exerciseId ?? "", data.id);
          }
        }
        addToWorkout();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, activeWorkout?.id, userId]);

  useEffect(() => {
    if (exercise?.default_rest_seconds) {
      setTimerDuration(exercise.default_rest_seconds);
      if (!timerRunning) setTimerRemaining(exercise.default_rest_seconds);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id]);

  useEffect(() => {
    if (!workoutExercise || !activeWorkout?.id) return;
    repo.getLastSessionSets(exerciseId ?? "", activeWorkout.id).then((s) => {
      setLastSessionSets(s as LastSet[]);
    });
    progressRepo.getPersonalRecords(exerciseId ?? "").then(({ data }) => {
      if (data && data.length > 0) {
        const best = data.reduce((b, pr) => pr.weight > b.weight ? pr : b, data[0]!);
        setExercisePR({ weight: best.weight, reps: best.reps });
        const map: Record<number, number> = {};
        for (const pr of data) {
          if (pr.weight > (map[pr.reps] ?? 0)) map[pr.reps] = pr.weight;
        }
        setPrByReps(map);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutExercise?.id, activeWorkout?.id]);

  /**
   * Cuenta atrás del temporizador de descanso: mientras `timerRunning` esté activo,
   * decrementa cada segundo vía `setInterval`. Al llegar a 0 para el intervalo, detiene
   * el temporizador y dispara la notificación de fin: vibración de patrón largo,
   * feedback háptico de éxito y, si el sonido está habilitado en preferencias, reproduce
   * el sonido precargado al volumen configurado por el usuario. El intervalo se limpia
   * tanto en la rama de parada como en el cleanup del efecto para evitar fugas.
   */
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setTimerRunning(false);
            Vibration.vibrate([0, 400, 150, 400, 150, 400]);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (timerSoundEnabled && timerSoundRef.current) {
              void timerSoundRef.current.setVolumeAsync(Math.min(1, Math.max(0, timerVolume / 100)));
              void timerSoundRef.current.replayAsync();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  /** Inicia/pausa el temporizador; si ya llegó a 0, reinicia desde `timerDuration` y arranca. */
  function handleTimerToggle() {
    if (timerRemaining === 0) {
      setTimerRemaining(timerDuration);
      setTimerRunning(true);
    } else if (timerRunning) {
      setTimerRunning(false);
    } else {
      setTimerRunning(true);
    }
  }

  function handleTimerReset() {
    setTimerRunning(false);
    setTimerRemaining(timerDuration);
  }

  /** Ajusta la duración objetivo del temporizador (mínimo 15s) y persiste el nuevo valor en disco para futuras sesiones. */
  function handleChangeDuration(delta: number) {
    const next = Math.max(15, timerDuration + delta);
    setTimerDuration(next);
    if (!timerRunning) setTimerRemaining(next);
    const timerFile = (FileSystem.documentDirectory ?? "") + "last-timer-duration.json";
    FileSystem.writeAsStringAsync(timerFile, JSON.stringify({ seconds: next })).catch(() => {});
  }

  async function handleRemoveExercise() {
    if (!workoutExercise) return;
    Alert.alert(`¿Eliminar "${exercise?.name ?? "ejercicio"}"?`, "Se eliminarán todas sus series.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        removeExerciseFromWorkout(workoutExercise.id);
        await repo.removeExercise(workoutExercise.id);
        router.back();
      }},
    ]);
  }

  /**
   * Añade una serie nueva al final, precargando sus valores desde la última serie ya
   * creada en esta sesión, o si aún no hay ninguna, desde la última serie de la sesión
   * anterior (`lastSessionSets`) — para que el usuario solo tenga que ajustar, no rellenar desde cero.
   */
  async function handleAddSet() {
    if (!workoutExercise || activeWorkout?.end_time) return;
    setSaving(true);
    const lastCurrentSet = exerciseSets[exerciseSets.length - 1];
    const prefillSource = lastCurrentSet ?? lastSessionSets.at(-1);
    const prefill = prefillSource ? {
      weight: prefillSource.weight ?? undefined,
      reps: prefillSource.reps ?? undefined,
      distance: prefillSource.distance ?? undefined,
      time_seconds: prefillSource.time_seconds ?? undefined,
    } : {};
    const { data, error } = await repo.createSet({
      workout_exercise_id: workoutExercise.id,
      order_index: exerciseSets.length,
      ...prefill,
    }, userId);
    if (!error && data) {
      createSet(workoutExercise.id, {
        id: data.id, workout_exercise_id: data.workout_exercise_id,
        is_complete: data.is_complete, is_warmup: data.is_warmup ?? false, order_index: data.order_index,
        ...prefill,
      });
    }
    setSaving(false);
  }

  async function handleIncrementField(s: FitSet, field: "weight" | "reps" | "distance" | "time_seconds", delta: number) {
    if (!workoutExercise) return;
    const current = s[field] ?? 0;
    const next = Math.max(0, parseFloat((current + delta).toFixed(2)));
    const patch = { [field]: next } as Partial<FitSet>;
    updateSet(workoutExercise.id, s.id, patch);
    await repo.updateSet(s.id, patch);
  }

  async function handleUpdateField(setId: string, field: keyof FitSet, rawValue: string) {
    if (!workoutExercise) return;
    const numericFields = ["weight", "reps", "distance", "time_seconds"] as const;
    const isNumeric = numericFields.includes(field as typeof numericFields[number]);
    const value = isNumeric ? (rawValue ? parseFloat(rawValue) : undefined) : rawValue;
    const patch = { [field]: value } as Partial<FitSet>;
    updateSet(workoutExercise.id, setId, patch);
    await repo.updateSet(setId, patch);
  }

  /**
   * Marca/desmarca una serie como completada. Al completarla: si el ejercicio pertenece
   * a un superset, navega automáticamente al siguiente ejercicio del grupo (rotando al
   * primero si ya estaba en el último); si no, y `autoSelectNextSet` está activo,
   * selecciona la siguiente serie incompleta; y si con esto se completan todas las
   * series del ejercicio (fuera de un superset), ofrece pasar al ejercicio siguiente
   * del entrenamiento.
   */
  async function handleToggleComplete(setId: string, current: boolean) {
    if (!workoutExercise) return;
    const nowComplete = !current;
    await repo.updateSet(setId, { is_complete: nowComplete });
    markSetComplete(workoutExercise.id, setId, nowComplete);

    if (nowComplete && workoutExercise.group_id) {
      // Superset auto-jump forward, wrap around to first
      const currentIdx = sorted.findIndex((we) => we.id === workoutExercise.id);
      const nextInGroup = sorted.slice(currentIdx + 1).find((we) => we.group_id === workoutExercise.group_id);
      if (nextInGroup) {
        router.replace(`/workout/${nextInGroup.exercise_id}` as never);
      } else {
        const firstInGroup = sorted.find((we) => we.group_id === workoutExercise.group_id);
        if (firstInGroup && firstInGroup.id !== workoutExercise.id) {
          router.replace(`/workout/${firstInGroup.exercise_id}` as never);
        }
      }
      return;
    }

    // Auto-select next incomplete set
    if (nowComplete && autoSelectNextSet) {
      const updatedSets = exerciseSets.map((s) => s.id === setId ? { ...s, is_complete: true } : s);
      const nextIncomplete = updatedSets.find((s) => !s.is_complete);
      setSelectedSetId(nextIncomplete?.id ?? null);
    }

    // Auto-prompt to next exercise when all sets complete (non-superset)
    if (nowComplete) {
      const updatedSets = exerciseSets.map((s) => s.id === setId ? { ...s, is_complete: true } : s);
      const allComplete = updatedSets.length > 0 && updatedSets.every((s) => s.is_complete);
      if (allComplete) {
        const currentIdx = sorted.findIndex((we) => we.id === workoutExercise.id);
        const nextWe = sorted[currentIdx + 1];
        if (nextWe) {
          const nextEx = exercises.find((e) => e.id === nextWe.exercise_id);
          Alert.alert(
            "¡Series completadas!",
            `¿Pasar a "${nextEx?.name ?? "siguiente ejercicio"}"?`,
            [
              { text: "Quedarse", style: "cancel" },
              { text: "Siguiente", onPress: () => router.replace(`/workout/${nextWe.exercise_id}` as never) },
            ]
          );
        }
      }
    }
  }

  async function handleDeleteSet(setId: string) {
    if (!workoutExercise) return;
    Alert.alert("¿Eliminar serie?", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        await repo.deleteSet(setId);
        deleteSet(workoutExercise.id, setId);
      }},
    ]);
  }

  async function handleToggleWarmup(s: FitSet) {
    if (!workoutExercise) return;
    const next = !s.is_warmup;
    updateSet(workoutExercise.id, s.id, { is_warmup: next });
    await repo.updateSet(s.id, { is_warmup: next });
  }

  async function handleReorderSets(data: FitSet[]) {
    if (!workoutExercise) return;
    const orderedIds = data.map((s) => s.id);
    reorderSets(workoutExercise.id, orderedIds);
    void repo.reorderSets(data.map((s, i) => ({ id: s.id, order_index: i })));
  }

  const handlePickExercise = useCallback((exId: string) => {
    setShowAddExercise(false);
    router.replace(`/workout/${exId}` as never);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Menú de superset para el ejercicio actual: si ya está agrupado, ofrece renombrar el
   * grupo o salir de él; si no, ofrece agruparlo con el ejercicio anterior y/o siguiente
   * en el orden del entrenamiento (según cuáles existan).
   */
  function handleGroupMenu() {
    if (!workoutExercise) return;
    const currentIdx = sorted.findIndex((we) => we.id === workoutExercise.id);
    const hasNext = currentIdx < sorted.length - 1;
    const hasPrev = currentIdx > 0;

    if (workoutExercise.group_id) {
      Alert.alert("Superset", workoutExercise.group_name ?? "Superset", [
        {
          text: "Renombrar grupo",
          onPress: () => {
            setRenameGroupText(workoutExercise.group_name ?? "");
            setShowRenameGroup(true);
          },
        },
        {
          text: "Quitar del grupo",
          style: "destructive",
          onPress: () => {
            ungroupExercise(workoutExercise.id);
            void repo.updateWorkoutExercise(workoutExercise.id, { group_id: null });
          },
        },
        { text: "Cancelar", style: "cancel" },
      ]);
    } else {
      const options: { text: string; onPress?: () => void; style?: "cancel" | "destructive" }[] = [];
      if (hasNext) {
        options.push({
          text: "Agrupar con siguiente",
          onPress: () => handleJoinGroup(workoutExercise.id, sorted[currentIdx + 1]!.id),
        });
      }
      if (hasPrev) {
        options.push({
          text: "Agrupar con anterior",
          onPress: () => handleJoinGroup(workoutExercise.id, sorted[currentIdx - 1]!.id),
        });
      }
      options.push({ text: "Cancelar", style: "cancel" });
      Alert.alert("Superset", "Agrupar este ejercicio", options);
    }
  }

  /** Une dos ejercicios del entrenamiento al mismo grupo de superset, reutilizando el `group_id` del socio si ya pertenece a uno, o creando uno nuevo. */
  async function handleJoinGroup(weId: string, partnerId: string) {
    const partner = workoutExercises.find((we) => we.id === partnerId);
    if (!partner) return;
    const groupId = partner.group_id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    updateWorkoutExerciseGroup(weId, groupId);
    await repo.updateWorkoutExercise(weId, { group_id: groupId });
    if (!partner.group_id) {
      updateWorkoutExerciseGroup(partnerId, groupId);
      await repo.updateWorkoutExercise(partnerId, { group_id: groupId });
    }
  }

  const exerciseType = (exercise?.type ?? ExerciseType.WEIGHT_REPS) as ExerciseType;
  const showWeight = [ExerciseType.WEIGHT_REPS, ExerciseType.WEIGHT_ONLY, ExerciseType.WEIGHT_DISTANCE, ExerciseType.WEIGHT_TIME].includes(exerciseType);
  const showReps = [ExerciseType.WEIGHT_REPS, ExerciseType.REPS_ONLY, ExerciseType.REPS_DISTANCE, ExerciseType.REPS_TIME].includes(exerciseType);
  const showDistance = [ExerciseType.DISTANCE_TIME, ExerciseType.WEIGHT_DISTANCE, ExerciseType.REPS_DISTANCE, ExerciseType.DISTANCE_ONLY].includes(exerciseType);
  const showTime = [ExerciseType.DISTANCE_TIME, ExerciseType.TIME_ONLY, ExerciseType.WEIGHT_TIME, ExerciseType.REPS_TIME].includes(exerciseType);

  const timerFinished = timerRemaining === 0;
  const timerActive = timerRunning;
  const weightIncrement = exercise?.weight_increment ?? globalWeightIncrement;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#f1f5f9" }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>{exercise?.name ?? "Ejercicio"}</Text>
          <Text style={{ fontSize: 11, color: "#94a3b8" }}>{t(`exercises:types.${exerciseType}`)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <TouchableOpacity onPress={handleGroupMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Superset">
            <Ionicons name="link-outline" size={20} color={workoutExercise?.group_id ? "#6366f1" : "#64748b"} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/calculators" as never)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Calculadoras">
            <Ionicons name="calculator-outline" size={20} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRemoveExercise} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Eliminar ejercicio">
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Exercise navigation strip — draggable */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
        <DraggableFlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={sorted}
          keyExtractor={(we) => we.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, alignItems: "center" }}
          onDragEnd={({ data }) => {
            const orderedIds = data.map((we) => we.id);
            reorderExercises(orderedIds);
            void repo.reorderExercises(data.map((we, i) => ({ id: we.id, order_index: i })));
          }}
          renderItem={({ item: we, drag, isActive }: RenderItemParams<WorkoutExercise>) => {
            const ex = exercises.find((e) => e.id === we.exercise_id);
            const isCurrent = we.exercise_id === exerciseId;
            const groupColor = we.group_id ? groupColorMap[we.group_id] : null;
            const isFirstInGroup = groupColor && sorted.find((w) => w.group_id === we.group_id)?.id === we.id;
            const weSets = sets[we.id] ?? [];
            const completedCount = weSets.filter((s) => s.is_complete).length;
            const totalCount = weSets.length;
            return (
              <ScaleDecorator activeScale={0.95}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {isFirstInGroup && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: groupColor + "20", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: groupColor }} />
                      <Text style={{ fontSize: 10, fontWeight: "600", color: groupColor }}>{we.group_name ?? "Superset"}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      if (isActive) return;
                      if (isCurrent) {
                        handleGroupMenu();
                      } else {
                        router.replace(`/workout/${we.exercise_id}` as never);
                      }
                    }}
                    onLongPress={drag}
                    delayLongPress={200}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                      backgroundColor: isActive ? "#818cf8" : isCurrent ? "#6366f1" : "#f1f5f9",
                      borderWidth: groupColor && !isCurrent ? 2 : 0,
                      borderColor: groupColor ?? "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: isCurrent || isActive ? "#fff" : "#64748b" }} numberOfLines={1}>
                      {ex?.name ?? "—"}
                    </Text>
                    {totalCount > 0 && (
                      <Text style={{ fontSize: 9, fontWeight: "600", textAlign: "center", color: isCurrent ? "#ffffffb0" : completedCount === totalCount ? "#22c55e" : "#94a3b8", marginTop: 1 }}>
                        {completedCount}/{totalCount}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScaleDecorator>
            );
          }}
          ListFooterComponent={
            <TouchableOpacity
              onPress={() => { setAddSearch(""); setShowAddExercise(true); }}
              style={{ marginLeft: 4, width: 30, height: 30, borderRadius: 15, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="add" size={18} color="#6366f1" />
            </TouchableOpacity>
          }
        />
      </View>

      {/* Workout tabs */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", backgroundColor: "#fff" }}>
        {([["sets", "barbell-outline", "Series"], ["history", "time-outline", "Historial"], ["chart", "trending-up-outline", "Gráfico"]] as const).map(([key, icon, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => handleWorkoutTabChange(key)}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderBottomWidth: 2, borderColor: workoutTab === key ? "#6366f1" : "transparent" }}
          >
            <Ionicons name={icon} size={14} color={workoutTab === key ? "#6366f1" : "#94a3b8"} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: workoutTab === key ? "#6366f1" : "#94a3b8" }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {workoutTab === "sets" && <>
      {/* Rest Timer */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f8fafc", gap: 8, backgroundColor: timerActive ? "#f0f0ff" : timerFinished ? "#f0fff4" : "#fafafa" }}>
        <Ionicons name="timer-outline" size={16} color={timerActive ? "#6366f1" : timerFinished ? "#22c55e" : "#94a3b8"} />
        <TouchableOpacity onPress={() => handleChangeDuration(-15)} disabled={timerRunning} style={{ padding: 4, opacity: timerRunning ? 0.4 : 1 }} accessibilityLabel="Restar 15 segundos">
          <Ionicons name="remove-circle-outline" size={20} color="#64748b" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: timerActive ? "#6366f1" : timerFinished ? "#22c55e" : "#0f172a", minWidth: 52, textAlign: "center" }}>
          {formatMinutesSeconds(timerRemaining)}
        </Text>
        <TouchableOpacity onPress={() => handleChangeDuration(15)} disabled={timerRunning} style={{ padding: 4, opacity: timerRunning ? 0.4 : 1 }} accessibilityLabel="Añadir 15 segundos">
          <Ionicons name="add-circle-outline" size={20} color="#64748b" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleTimerToggle}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#6366f1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Ionicons name={timerActive ? "pause" : timerFinished ? "refresh" : "play"} size={14} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>
            {timerActive ? "Pausar" : timerFinished ? "Reiniciar" : "Iniciar"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleTimerReset} style={{ padding: 4 }} accessibilityLabel="Reiniciar timer">
          <Ionicons name="refresh-outline" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* PR + última sesión */}
      {((trackPersonalRecords && exercisePR) || lastSessionSets.length > 0) && (
        <>
          <TouchableOpacity
            onPress={() => setShowLastSession((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", gap: 8, backgroundColor: "#fafafa" }}
          >
            {trackPersonalRecords && exercisePR && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#fef3c7", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Ionicons name="trophy-outline" size={11} color="#d97706" />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#d97706" }}>
                  {exercisePR.weight}{weightUnit} ×{exercisePR.reps}
                </Text>
              </View>
            )}
            {(() => {
              const lastMax = lastSessionSets.reduce((m, s) => s.weight != null && s.weight > m ? s.weight : m, 0);
              if (lastMax > 0 && showWeight) {
                const suggested = parseFloat((lastMax + weightIncrement).toFixed(2));
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#f0fdf4", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Ionicons name="trending-up-outline" size={11} color="#16a34a" />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#16a34a" }}>
                      →{suggested}{weightUnit}
                    </Text>
                  </View>
                );
              }
              return null;
            })()}
            {lastSessionSets.length > 0 && (
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="time-outline" size={11} color="#94a3b8" />
                <Text style={{ fontSize: 11, color: "#64748b", flex: 1 }} numberOfLines={1}>
                  {lastSessionSets.map(formatLastSet).join("  ")}
                </Text>
              </View>
            )}
            <Ionicons name={showLastSession ? "chevron-up" : "chevron-down"} size={13} color="#94a3b8" />
          </TouchableOpacity>
          {showLastSession && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#f8fafc", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.5, marginBottom: 6 }}>ÚLTIMA SESIÓN</Text>
              {lastSessionSets.map((s, i) => (
                <Text key={i} style={{ fontSize: 13, color: "#475569", paddingVertical: 1 }}>
                  {i + 1}.  {formatLastSet(s)}
                </Text>
              ))}
            </View>
          )}
        </>
      )}

      {/* Exercise notes */}
      {exercise?.notes && (
        <TouchableOpacity
          onPress={() => setShowNotes((v) => !v)}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", gap: 8, backgroundColor: "#fffbeb" }}
        >
          <Ionicons name="document-text-outline" size={13} color="#d97706" />
          <Text style={{ fontSize: 11, color: "#92400e", flex: 1 }} numberOfLines={showNotes ? undefined : 1}>
            {exercise.notes}
          </Text>
          <Ionicons name={showNotes ? "chevron-up" : "chevron-down"} size={13} color="#d97706" />
        </TouchableOpacity>
      )}

      {/* Sets — nestable scroll for drag support */}
      <NestableScrollContainer contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 60, gap: 8 }}>
        {/* Column headers */}
        {exerciseSets.length > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, marginBottom: 4 }}>
            <Text style={{ width: 24, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>#</Text>
            {showWeight && <Text style={{ width: 80, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>{weightUnit}</Text>}
            {showReps && <Text style={{ width: 72, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>reps</Text>}
            {showDistance && <Text style={{ width: 80, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>km</Text>}
            {showTime && <Text style={{ width: 72, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>sec</Text>}
            <View style={{ flex: 1 }} />
            {markSetsComplete && exerciseSets.some((s) => !s.is_complete) && (
              <TouchableOpacity
                onPress={async () => {
                  if (!workoutExercise) return;
                  for (const s of exerciseSets.filter((s) => !s.is_complete)) {
                    markSetComplete(workoutExercise.id, s.id, true);
                    await repo.updateSet(s.id, { is_complete: true });
                  }
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#6366f1" }}>Todo ✓</Text>
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 11, color: "#cbd5e1", width: 16 }}>≡</Text>
          </View>
        )}

        {/* Sets list — draggable */}
        {exerciseSets.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
            <Ionicons name="barbell-outline" size={32} color="#94a3b8" />
            <Text style={{ fontSize: 13, color: "#94a3b8" }}>Sin series aún. Toca abajo para añadir tu primera serie.</Text>
          </View>
        ) : (
          <NestableDraggableFlatList
            data={exerciseSets}
            keyExtractor={(s) => s.id}
            onDragEnd={({ data }) => handleReorderSets(data)}
            scrollEnabled={false}
            renderItem={({ item: s, drag, isActive }: RenderItemParams<FitSet>) => {
              const idx = exerciseSets.findIndex((es) => es.id === s.id);
              return (
                <ScaleDecorator activeScale={0.97}>
                  <View style={{ gap: 2, marginBottom: 8 }}>
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: s.id === selectedSetId ? 1.5 : 1, borderColor: s.id === selectedSetId ? "#6366f1" : s.is_complete ? "#6366f120" : "#f1f5f9", borderRadius: 12, backgroundColor: isActive ? "#f8fafc" : s.is_complete ? "#6366f108" : "#fff", paddingHorizontal: 10, paddingVertical: 8 }}
                    >
                      {/* Set number — long press to toggle warmup */}
                      <TouchableOpacity
                        onLongPress={() => handleToggleWarmup(s)}
                        delayLongPress={400}
                        style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: s.is_warmup ? "#fef3c7" : "#f1f5f9", alignItems: "center", justifyContent: "center" }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "600", color: s.is_warmup ? "#d97706" : "#64748b" }}>
                          {s.is_warmup ? "W" : idx + 1}
                        </Text>
                      </TouchableOpacity>

                      {/* Weight */}
                      {showWeight && (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <TouchableOpacity onPress={() => handleIncrementField(s, "weight", -weightIncrement)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                            <Text style={{ fontSize: 18, fontWeight: "500", color: "#64748b", paddingHorizontal: 4 }}>−</Text>
                          </TouchableOpacity>
                          <TextInput
                            style={{ width: 52, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, fontSize: 14, fontWeight: "500", textAlign: "center" }}
                            keyboardType="decimal-pad"
                            value={s.weight !== undefined ? String(s.weight) : ""}
                            onChangeText={(v) => handleUpdateField(s.id, "weight", v)}
                            placeholder="—"
                            placeholderTextColor="#cbd5e1"
                          />
                          <TouchableOpacity onPress={() => handleIncrementField(s, "weight", weightIncrement)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                            <Text style={{ fontSize: 18, fontWeight: "500", color: "#64748b", paddingHorizontal: 4 }}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Reps */}
                      {showReps && (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <TouchableOpacity onPress={() => handleIncrementField(s, "reps", -1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                            <Text style={{ fontSize: 18, fontWeight: "500", color: "#64748b", paddingHorizontal: 4 }}>−</Text>
                          </TouchableOpacity>
                          <TextInput
                            style={{ width: 44, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, fontSize: 14, fontWeight: "500", textAlign: "center" }}
                            keyboardType="number-pad"
                            value={s.reps !== undefined ? String(s.reps) : ""}
                            onChangeText={(v) => handleUpdateField(s.id, "reps", v)}
                            placeholder="—"
                            placeholderTextColor="#cbd5e1"
                          />
                          <TouchableOpacity onPress={() => handleIncrementField(s, "reps", 1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                            <Text style={{ fontSize: 18, fontWeight: "500", color: "#64748b", paddingHorizontal: 4 }}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Distance */}
                      {showDistance && (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <TouchableOpacity onPress={() => handleIncrementField(s, "distance", -0.1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                            <Text style={{ fontSize: 18, fontWeight: "500", color: "#64748b", paddingHorizontal: 4 }}>−</Text>
                          </TouchableOpacity>
                          <TextInput
                            style={{ width: 52, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, fontSize: 14, fontWeight: "500", textAlign: "center" }}
                            keyboardType="decimal-pad"
                            value={s.distance !== undefined ? String(s.distance) : ""}
                            onChangeText={(v) => handleUpdateField(s.id, "distance", v)}
                            placeholder="—"
                            placeholderTextColor="#cbd5e1"
                          />
                          <TouchableOpacity onPress={() => handleIncrementField(s, "distance", 0.1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                            <Text style={{ fontSize: 18, fontWeight: "500", color: "#64748b", paddingHorizontal: 4 }}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Time */}
                      {showTime && (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <TouchableOpacity onPress={() => handleIncrementField(s, "time_seconds", -5)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                            <Text style={{ fontSize: 18, fontWeight: "500", color: "#64748b", paddingHorizontal: 4 }}>−</Text>
                          </TouchableOpacity>
                          <TextInput
                            style={{ width: 44, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, fontSize: 14, fontWeight: "500", textAlign: "center" }}
                            keyboardType="number-pad"
                            value={s.time_seconds !== undefined ? String(s.time_seconds) : ""}
                            onChangeText={(v) => handleUpdateField(s.id, "time_seconds", v)}
                            placeholder="—"
                            placeholderTextColor="#cbd5e1"
                          />
                          <TouchableOpacity onPress={() => handleIncrementField(s, "time_seconds", 5)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                            <Text style={{ fontSize: 18, fontWeight: "500", color: "#64748b", paddingHorizontal: 4 }}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <View style={{ flex: 1 }} />

                      {/* Per-set PR trophy */}
                      {trackPersonalRecords && s.weight != null && s.reps != null && prByReps[s.reps] != null && s.weight >= prByReps[s.reps]! && (
                        <Ionicons name="trophy" size={13} color="#d97706" />
                      )}

                      {/* Comment */}
                      <TouchableOpacity
                        onPress={() => setCommentingSetId(commentingSetId === s.id ? null : s.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={s.comment ? "Editar comentario" : "Añadir comentario"}
                      >
                        <Ionicons name={s.comment ? "chatbubble" : "chatbubble-outline"} size={14} color={s.comment ? "#6366f1" : "#cbd5e1"} />
                      </TouchableOpacity>

                      {/* Delete */}
                      <TouchableOpacity onPress={() => handleDeleteSet(s.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Eliminar serie">
                        <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      </TouchableOpacity>

                      {/* Complete */}
                      {markSetsComplete && (
                        <TouchableOpacity
                          onPress={() => handleToggleComplete(s.id, s.is_complete)}
                          style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: s.is_complete ? "#6366f1" : "#cbd5e1", backgroundColor: s.is_complete ? "#6366f1" : "transparent", alignItems: "center", justifyContent: "center" }}
                          accessibilityLabel={s.is_complete ? "Desmarcar serie" : "Marcar serie completa"}
                        >
                          {s.is_complete && <Ionicons name="checkmark" size={14} color="white" />}
                        </TouchableOpacity>
                      )}

                      {/* Drag handle */}
                      <TouchableOpacity onLongPress={drag} delayLongPress={150} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Reordenar serie">
                        <Ionicons name="reorder-two-outline" size={18} color="#cbd5e1" />
                      </TouchableOpacity>
                    </View>
                    {(() => {
                      if (!showWeight || !showReps || !s.weight || !s.reps || s.reps >= 37) return null;
                      const orm = calculate1RM(s.weight, s.reps);
                      return (
                        <Text style={{ fontSize: 10, color: "#94a3b8", paddingLeft: 36, marginTop: -2 }}>
                          ~1RM {orm % 1 === 0 ? orm : orm.toFixed(1)} {weightUnit}
                        </Text>
                      );
                    })()}
                    {commentingSetId === s.id && (
                      <TextInput
                        style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fafafa" }}
                        placeholder="Nota sobre esta serie…"
                        placeholderTextColor="#94a3b8"
                        value={s.comment ?? ""}
                        onChangeText={(v) => handleUpdateField(s.id, "comment", v)}
                        multiline
                        autoFocus
                      />
                    )}
                  </View>
                </ScaleDecorator>
              );
            }}
          />
        )}

        {/* Add set */}
        {!activeWorkout?.end_time && (
          <TouchableOpacity
            onPress={handleAddSet}
            disabled={saving}
            style={{ borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "dashed", borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
          >
            {saving ? <ActivityIndicator size="small" color="#6366f1" /> : <Ionicons name="add-circle-outline" size={18} color="#6366f1" />}
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#6366f1" }}>{saving ? "Añadiendo…" : "Añadir serie"}</Text>
          </TouchableOpacity>
        )}
      </NestableScrollContainer>
      </>}

      {/* History tab */}
      {workoutTab === "history" && (
        historyLoading ? (
          <ActivityIndicator style={{ flex: 1, marginTop: 48 }} color="#6366f1" />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {historySessions.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 48 }}>
                <Ionicons name="time-outline" size={40} color="#cbd5e1" />
                <Text style={{ fontSize: 14, color: "#94a3b8", marginTop: 12 }}>Sin historial previo</Text>
              </View>
            ) : (
              historySessions.map((session) => {
                const visible = session.sets.filter((s) => !s.is_warmup).sort((a, b) => a.order_index - b.order_index);
                return (
                  <View key={session.workout_id} style={{ backgroundColor: "#f8fafc", borderRadius: 14, borderWidth: 1, borderColor: "#f1f5f9", padding: 14, gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b", marginBottom: 4, textTransform: "capitalize" }}>
                      {new Date(session.date + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                    </Text>
                    {visible.length === 0 ? (
                      <Text style={{ fontSize: 12, color: "#cbd5e1" }}>Sin series</Text>
                    ) : (
                      visible.map((s, i) => (
                        <Text key={i} style={{ fontSize: 13, color: "#0f172a" }}>
                          {i + 1}.{"  "}{formatLastSet(s as LastSet)}
                        </Text>
                      ))
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )
      )}

      {/* Chart tab */}
      {workoutTab === "chart" && (
        chartLoading2 ? (
          <ActivityIndicator style={{ flex: 1, marginTop: 48 }} color="#6366f1" />
        ) : chartPoints.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Ionicons name="trending-up-outline" size={40} color="#cbd5e1" />
            <Text style={{ fontSize: 14, color: "#94a3b8", marginTop: 12, textAlign: "center" }}>
              Completa series para ver tu progreso
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([["weight", "Peso"], ["volume", "Volumen"], ["reps", "Reps"]] as const)
                .filter(([key]) => key === "volume" ? showWeight && showReps : key === "weight" ? showWeight : showReps)
                .map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setChartMetric(key)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: chartMetric === key ? "#6366f1" : "#e2e8f0", backgroundColor: chartMetric === key ? "#6366f1" : "transparent" }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: chartMetric === key ? "#fff" : "#64748b" }}>{label}</Text>
                  </TouchableOpacity>
                ))}
            </View>
            <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#f1f5f9", padding: 16 }}>
              <LineChart
                data={chartPoints.map((p) => ({
                  label: new Date(p.date + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
                  value: chartMetric === "weight" ? p.maxWeight : chartMetric === "volume" ? p.totalVolume : p.maxReps,
                }))}
                width={width - 64}
                height={200}
              />
            </View>
            {(() => {
              const vals = chartPoints.map((p) => chartMetric === "weight" ? p.maxWeight : chartMetric === "volume" ? p.totalVolume : p.maxReps);
              const best = Math.max(...vals);
              const latest = vals[vals.length - 1] ?? 0;
              const first = vals[0] ?? 0;
              const trend = first > 0 ? ((latest - first) / first * 100) : 0;
              return (
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {[
                    { label: "Mejor", value: `${best % 1 === 0 ? best : best.toFixed(1)}` },
                    { label: "Último", value: `${latest % 1 === 0 ? latest : latest.toFixed(1)}` },
                    { label: "Progresión", value: `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}%` },
                  ].map((stat) => (
                    <View key={stat.label} style={{ flex: 1, backgroundColor: "#f8fafc", borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9", padding: 12, alignItems: "center", gap: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: "#94a3b8", textTransform: "uppercase" }}>{stat.label}</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#0f172a" }}>{stat.value}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        )
      )}

      {/* Rename group modal */}
      <Modal visible={showRenameGroup} animationType="fade" transparent onRequestClose={() => setShowRenameGroup(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000060", justifyContent: "center", paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Nombre del superset</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 }}
              value={renameGroupText}
              onChangeText={setRenameGroupText}
              placeholder="Ej. Pecho + Tríceps"
              placeholderTextColor="#cbd5e1"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (workoutExercise?.group_id) {
                  renameGroup(workoutExercise.group_id, renameGroupText);
                  void repo.updateGroupName(workoutExercise.group_id, renameGroupText);
                }
                setShowRenameGroup(false);
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setShowRenameGroup(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: "#64748b" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (workoutExercise?.group_id) {
                    renameGroup(workoutExercise.group_id, renameGroupText);
                    void repo.updateGroupName(workoutExercise.group_id, renameGroupText);
                  }
                  setShowRenameGroup(false);
                }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#6366f1", alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add exercise modal */}
      <Modal visible={showAddExercise} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddExercise(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#f1f5f9", gap: 12 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 12, gap: 8, backgroundColor: "#f8fafc" }}>
              <Ionicons name="search" size={16} color="#94a3b8" />
              <TextInput
                style={{ flex: 1, paddingVertical: 10, fontSize: 14 }}
                placeholder="Buscar ejercicio…"
                value={addSearch}
                onChangeText={setAddSearch}
                autoFocus
                clearButtonMode="while-editing"
              />
            </View>
            <TouchableOpacity onPress={() => setShowAddExercise(false)}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={exercises.filter((e) => {
              const inWorkout = workoutExercises.some((we) => we.exercise_id === e.id);
              const matchesSearch = e.name.toLowerCase().includes(addSearch.toLowerCase());
              return !inWorkout && matchesSearch;
            })}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
                <Ionicons name="barbell-outline" size={32} color="#cbd5e1" />
                <Text style={{ fontSize: 14, color: "#94a3b8" }}>
                  {addSearch ? "Sin resultados" : "Todos los ejercicios ya están en el workout"}
                </Text>
              </View>
            }
            renderItem={({ item: ex }) => (
              <ExercisePickerItem id={ex.id} name={ex.name} type={ex.type} onPress={handlePickExercise} />
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/** Fila memoizada del selector de "añadir ejercicio al entrenamiento", para evitar re-renders al filtrar la lista completa por búsqueda. */
const ExercisePickerItem = memo(function ExercisePickerItem({
  id, name, type, onPress,
}: {
  id: string;
  name: string;
  type: string;
  onPress: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9", backgroundColor: "#fff", gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: "#0f172a" }}>{name}</Text>
        <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{t(`exercises:types.${type}`)}</Text>
      </View>
      <Ionicons name="add-circle-outline" size={20} color="#6366f1" />
    </TouchableOpacity>
  );
});
