/**
 * Training screen — full screen modal for logging sets for an exercise
 *
 * TODO:
 *  - Load exercise data from useExerciseStore by exerciseId param
 *  - Show existing sets from useWorkoutStore.sets[workoutExerciseId]
 *  - SetRow for each set with complete toggle
 *  - Input row to add new sets
 *  - RestTimer component between sets
 *  - Previous session comparison row
 *  - Swipe left/right to navigate to prev/next exercise (NavigationPanel)
 */

import { SafeAreaView, ScrollView, Text, View, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useWorkoutStore, useExerciseStore } from "@fitnotes/core";
import SetRow from "@/components/workout/SetRow";

export default function TrainingScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();

  const exercises = useExerciseStore((s) => s.exercises);
  const exercise = exercises.find((e) => e.id === exerciseId);

  const workoutExercises = useWorkoutStore((s) => s.exercises);
  const sets = useWorkoutStore((s) => s.sets);
  const createSet = useWorkoutStore((s) => s.createSet);
  const markSetComplete = useWorkoutStore((s) => s.markSetComplete);

  const workoutExercise = workoutExercises.find(
    (we) => we.exercise_id === exerciseId
  );
  const exerciseSets = workoutExercise ? (sets[workoutExercise.id] ?? []) : [];

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="font-semibold text-base">
          {exercise?.name ?? "Exercise"}
        </Text>
        {/* TODO: NavigationPanel trigger */}
        <TouchableOpacity>
          <Ionicons name="list" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerClassName="px-4 py-4 gap-4">
        {/* Set list */}
        {exerciseSets.length === 0 ? (
          <View className="items-center py-8 gap-2">
            <Ionicons name="barbell-outline" size={32} color="#64748b" />
            <Text className="text-sm text-muted-foreground">
              No sets yet. Tap below to add your first set.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {exerciseSets.map((set, idx) => (
              <SetRow
                key={set.id}
                set={set}
                index={idx}
                onToggleComplete={(complete) =>
                  workoutExercise &&
                  markSetComplete(workoutExercise.id, set.id, complete)
                }
                onDelete={() => {}}
              />
            ))}
          </View>
        )}

        {/* TODO: RestTimer component */}

        {/* Add set button */}
        <TouchableOpacity
          onPress={() =>
            workoutExercise && createSet(workoutExercise.id)
          }
          className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-4"
        >
          <Ionicons name="add-circle-outline" size={20} color="#6366f1" />
          <Text className="text-sm font-medium text-primary">Add Set</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
