/**
 * Mobile TrainingScreen
 *
 * TODO:
 *  - Full exercise header with category badge
 *  - SetRow list
 *  - Quick-add set row (inline inputs at the bottom)
 *  - Swipe horizontal between exercises in the current workout
 *  - RestTimer component between completed sets
 *  - Previous session ghost data row
 */

import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WorkoutExercise, Exercise, Set } from "@fitnotes/core";
import SetRow from "./SetRow";

interface TrainingScreenProps {
  workoutExercise: WorkoutExercise;
  exercise: Exercise;
  sets: Set[];
  onAddSet: () => void;
  onToggleComplete: (setId: string, complete: boolean) => void;
  onDeleteSet: (setId: string) => void;
  onFinish: () => void;
}

export default function TrainingScreen({
  exercise,
  sets,
  onAddSet,
  onToggleComplete,
  onDeleteSet,
  onFinish,
}: TrainingScreenProps) {
  const completed = sets.filter((s) => s.is_complete).length;

  return (
    <View className="flex-1">
      {/* Exercise header */}
      <View className="px-4 py-3 border-b border-gray-100">
        <Text className="text-xl font-bold">{exercise.name}</Text>
        <Text className="text-xs text-muted-foreground mt-0.5">
          {completed}/{sets.length} sets completed
        </Text>
      </View>

      {/* Set list */}
      <ScrollView contentContainerClassName="px-4 py-4 gap-2" keyboardShouldPersistTaps="handled">
        {sets.length === 0 ? (
          <View className="items-center py-8 gap-2">
            <Ionicons name="barbell-outline" size={28} color="#64748b" />
            <Text className="text-sm text-muted-foreground text-center">
              No sets yet. Tap the button below to log your first set.
            </Text>
          </View>
        ) : (
          sets.map((set, idx) => (
            <SetRow
              key={set.id}
              set={set}
              index={idx}
              onToggleComplete={(complete) => onToggleComplete(set.id, complete)}
              onDelete={() => onDeleteSet(set.id)}
            />
          ))
        )}

        {/* TODO: RestTimer — auto-start after marking set complete */}
      </ScrollView>

      {/* Bottom actions */}
      <View className="px-4 pb-4 gap-3 border-t border-gray-100 pt-3">
        <TouchableOpacity
          onPress={onAddSet}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3.5"
        >
          <Ionicons name="add-circle-outline" size={18} color="#6366f1" />
          <Text className="text-sm font-medium text-primary">Add Set</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onFinish}
          className="rounded-xl bg-primary py-3.5 items-center"
        >
          <Text className="text-white font-bold text-sm">Finish Workout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
