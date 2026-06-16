/**
 * Home tab — Today's workout
 *
 * TODO:
 *  - Call useWorkoutStore.startWorkout() on "Start Workout" tap
 *  - Show active workout with exercises and sets
 *  - Navigate to workout/[exerciseId] on exercise tap
 *  - Load previous workout data for today from Supabase
 */

import { SafeAreaView, ScrollView, Text, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWorkoutStore, formatWorkoutDate, todayISO } from "@fitnotes/core";

export default function HomeScreen() {
  const today = todayISO();
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-4 py-6 gap-6">
        {/* Header */}
        <View>
          <Text className="text-2xl font-bold text-foreground">Today</Text>
          <Text className="text-sm text-muted-foreground mt-0.5">
            {formatWorkoutDate(today)}
          </Text>
        </View>

        {activeWorkout ? (
          /* TODO: render TrainingScreen with active workout exercises */
          <View className="rounded-2xl border border-gray-100 bg-gray-50 p-5 gap-3">
            <Text className="font-semibold text-base">Workout in progress</Text>
            <Text className="text-sm text-muted-foreground">
              Started at {new Date(activeWorkout.start_time ?? "").toLocaleTimeString()}
            </Text>
            <TouchableOpacity className="rounded-xl bg-primary py-3 items-center">
              <Text className="text-white font-semibold text-sm">Continue Workout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 items-center gap-4">
            <Ionicons name="barbell-outline" size={40} color="#64748b" />
            <Text className="text-base font-medium text-foreground">No workout today</Text>
            <Text className="text-sm text-muted-foreground text-center">
              Start a workout to log your sets and track progress.
            </Text>
            <TouchableOpacity
              onPress={() => startWorkout(today)}
              className="rounded-xl bg-primary px-8 py-3"
            >
              <Text className="text-white font-semibold text-sm">Start Workout</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recent workouts */}
        <View className="gap-3">
          <Text className="font-semibold text-base">Recent Activity</Text>
          {/* TODO: load recent workouts from Supabase and render workout cards */}
          <View className="rounded-xl border border-gray-100 p-4 items-center">
            <Text className="text-sm text-muted-foreground">
              Your recent workouts will appear here.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
