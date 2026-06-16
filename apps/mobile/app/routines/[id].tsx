/**
 * Routine detail screen
 *
 * TODO:
 *  - Load routine days from useRoutineStore.routineDays[routineId]
 *  - Load day exercises from useRoutineStore.routineDayExercises[dayId]
 *  - Add/remove days and exercises
 *  - "Start Workout" button calls useRoutineStore.logRoutineWorkout
 */

import { SafeAreaView, ScrollView, Text, View, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRoutineStore } from "@fitnotes/core";

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const routines = useRoutineStore((s) => s.routines);
  const routineDays = useRoutineStore((s) => s.routineDays);

  const routine = routines.find((r) => r.id === id);
  const days = routineDays[id ?? ""] ?? [];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-4 py-6 gap-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold">{routine?.name ?? "Routine"}</Text>
          <TouchableOpacity className="rounded-lg border border-gray-200 px-3 py-1.5">
            <Text className="text-sm font-medium">Edit</Text>
          </TouchableOpacity>
        </View>

        {routine?.notes ? (
          <Text className="text-sm text-muted-foreground">{routine.notes}</Text>
        ) : null}

        {/* Days list */}
        {days.length === 0 ? (
          <View className="rounded-2xl border border-dashed border-gray-200 p-8 items-center gap-3">
            <Ionicons name="calendar-outline" size={28} color="#64748b" />
            <Text className="text-sm text-muted-foreground">No days added yet</Text>
          </View>
        ) : (
          days.map((day) => (
            <View key={day.id} className="rounded-2xl border border-gray-100 p-4 gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold">{day.name}</Text>
                <TouchableOpacity>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
              {/* TODO: render exercises for this day from routineDayExercises[day.id] */}
              <Text className="text-xs text-muted-foreground">No exercises — tap to add</Text>
              <TouchableOpacity className="flex-row items-center gap-1">
                <Ionicons name="add" size={14} color="#6366f1" />
                <Text className="text-sm text-primary font-medium">Add exercise</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity className="flex-row items-center gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-3">
          <Ionicons name="add-circle-outline" size={18} color="#6366f1" />
          <Text className="text-sm font-medium text-primary">Add Day</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Start workout FAB */}
      <View className="absolute bottom-8 left-0 right-0 px-4">
        <TouchableOpacity
          className="w-full rounded-2xl bg-primary py-4 items-center shadow-lg"
          onPress={() => router.push("/(tabs)")}
        >
          <Text className="text-white font-bold text-base">Start Workout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
