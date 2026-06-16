/**
 * Progress tab — PRs and stats
 *
 * TODO:
 *  - Load personal records from Supabase into useProgressStore
 *  - Render PR list grouped by exercise
 *  - Show estimated 1RM using useProgressStore.calculateEstimated1RM
 *  - Volume chart (react-native-chart-kit or Victory Native)
 *  - Streak and total workout stats
 */

import { SafeAreaView, ScrollView, Text, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProgressStore, useExerciseStore, calculate1RM } from "@fitnotes/core";

export default function ProgressScreen() {
  const personalRecords = useProgressStore((s) => s.personalRecords);
  const exercises = useExerciseStore((s) => s.exercises);

  const allRecords = Object.values(personalRecords).flat();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-4 py-6 gap-6">
        <Text className="text-2xl font-bold">Progress</Text>

        {/* Stats row */}
        <View className="flex-row gap-3">
          {[
            { label: "Workouts", value: "—", icon: "barbell-outline" as const },
            { label: "This Week", value: "—", icon: "calendar-outline" as const },
            { label: "Streak", value: "—", icon: "flame-outline" as const },
          ].map(({ label, value, icon }) => (
            <View
              key={label}
              className="flex-1 rounded-2xl border border-gray-100 bg-gray-50 p-4 items-center gap-1"
            >
              <Ionicons name={icon} size={20} color="#6366f1" />
              <Text className="text-xl font-bold">{value}</Text>
              <Text className="text-xs text-muted-foreground">{label}</Text>
            </View>
          ))}
        </View>

        {/* Volume chart placeholder */}
        <View className="rounded-2xl border border-gray-100 p-4 gap-2">
          <Text className="font-semibold text-base">Weekly Volume</Text>
          <View className="h-40 items-center justify-center bg-gray-50 rounded-xl">
            {/* TODO: implement with react-native-chart-kit or Victory Native */}
            <Ionicons name="bar-chart-outline" size={32} color="#64748b" />
            <Text className="text-xs text-muted-foreground mt-2">Chart coming soon</Text>
          </View>
        </View>

        {/* Personal Records */}
        <View className="gap-3">
          <Text className="font-semibold text-base">Personal Records</Text>

          {allRecords.length === 0 ? (
            <View className="rounded-xl border border-dashed border-gray-200 p-6 items-center gap-2">
              <Ionicons name="trophy-outline" size={28} color="#64748b" />
              <Text className="text-sm text-muted-foreground">No records yet</Text>
              <Text className="text-xs text-muted-foreground text-center">
                Complete sets to automatically track your bests.
              </Text>
            </View>
          ) : (
            allRecords.map((pr) => {
              const exercise = exercises.find((e) => e.id === pr.exercise_id);
              return (
                <View
                  key={pr.id}
                  className="flex-row items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                >
                  <View>
                    <Text className="font-medium text-sm">
                      {exercise?.name ?? "Unknown"}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {pr.reps} reps
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-bold text-primary">
                      {pr.weight} {exercise?.weight_unit ?? "kg"}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      1RM ≈ {calculate1RM(pr.weight, pr.reps).toFixed(1)} kg
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Navigate to routines */}
        <TouchableOpacity className="flex-row items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
          <View className="flex-row items-center gap-3">
            <Ionicons name="list-outline" size={20} color="#6366f1" />
            <Text className="font-medium text-sm">My Routines</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#64748b" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
