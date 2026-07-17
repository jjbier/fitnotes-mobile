/**
 * Modal para elegir a cuál de varios entrenamientos de un mismo día aplicar
 * una acción (ver o añadir algo), cuando hay más de uno — ver
 * docs/implementation-plan-multi-workout-per-day.md, Fase 4. Con 0 o 1
 * entrenamiento ese día, quien use `useWorkoutForDate` nunca llega a
 * mostrar este modal (resuelve directo).
 */
import { Modal, View, Text, TouchableOpacity, FlatList } from "react-native";

export interface PickableWorkout {
  id: string;
  start_time?: string | null;
  comment?: string | null;
}

interface Props {
  visible: boolean;
  workouts: PickableWorkout[];
  creating: boolean;
  onChoose: (workoutId: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

/** "18:32" a partir de un ISO datetime, o "Sin hora" si no hay `start_time` o no es parseable. */
function formatTime(startTime?: string | null): string {
  if (!startTime) return "Sin hora";
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return "Sin hora";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export default function WorkoutPickerModal({ visible, workouts, creating, onChoose, onCreateNew, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#00000060", justifyContent: "center", paddingHorizontal: 32 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 14, maxHeight: "70%" }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#0f172a" }}>Varios entrenamientos hoy</Text>
          <Text style={{ fontSize: 12, color: "#64748b" }}>¿A cuál quieres añadirlo?</Text>

          <FlatList
            data={workouts}
            keyExtractor={(w) => w.id}
            style={{ flexGrow: 0 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onChoose(item.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f172a" }}>{formatTime(item.start_time)}</Text>
                {item.comment && (
                  <Text style={{ fontSize: 12, color: "#64748b", maxWidth: "60%" }} numberOfLines={1}>
                    {item.comment}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, color: "#64748b" }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onCreateNew}
              disabled={creating}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: creating ? "#e2e8f0" : "#6366f1", alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: creating ? "#94a3b8" : "#fff" }}>
                {creating ? "Creando…" : "+ Nuevo entrenamiento"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
