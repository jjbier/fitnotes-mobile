/**
 * Exercises tab
 *
 * TODO:
 *  - Load exercises and categories from Supabase into useExerciseStore on mount
 *  - Filter by category chip
 *  - Search input
 *  - Swipe exercise to favorite (useExerciseStore.toggleFavorite)
 *  - Tap exercise to navigate to exercise detail (workout/[exerciseId])
 */

import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useExerciseStore } from "@fitnotes/core";

export default function ExercisesScreen() {
  const categories = useExerciseStore((s) => s.categories);
  const exercises = useExerciseStore((s) => s.exercises);

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Search bar */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-3 gap-2">
          <Ionicons name="search" size={16} color="#64748b" />
          <TextInput
            className="flex-1 py-3 text-sm"
            placeholder="Search exercises..."
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-2 gap-2"
      >
        {["All", ...(categories.length > 0 ? categories.map((c) => c.name) : ["Chest", "Back", "Legs", "Shoulders", "Arms"])].map(
          (cat) => (
            <TouchableOpacity
              key={cat}
              className="rounded-full border border-gray-200 px-4 py-1.5"
            >
              <Text className="text-sm font-medium text-foreground">{cat}</Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>

      <ScrollView contentContainerClassName="px-4 pb-6 gap-2">
        {exercises.length === 0 ? (
          /* Placeholder list when store is empty */
          ["Bench Press", "Squat", "Deadlift", "Overhead Press", "Pull-up", "Barbell Row"].map(
            (name) => (
              <TouchableOpacity
                key={name}
                className="flex-row items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm"
              >
                <View>
                  <Text className="font-medium text-sm">{name}</Text>
                  <Text className="text-xs text-muted-foreground mt-0.5">Weight × Reps</Text>
                </View>
                <Ionicons name="star-outline" size={18} color="#64748b" />
              </TouchableOpacity>
            )
          )
        ) : (
          exercises.map((ex) => (
            <TouchableOpacity
              key={ex.id}
              className="flex-row items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm"
            >
              <View>
                <Text className="font-medium text-sm">{ex.name}</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">{ex.type}</Text>
              </View>
              <Ionicons
                name={ex.is_favorite ? "star" : "star-outline"}
                size={18}
                color={ex.is_favorite ? "#6366f1" : "#64748b"}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* FAB — Add exercise */}
      <TouchableOpacity className="absolute bottom-8 right-6 h-14 w-14 rounded-full bg-primary items-center justify-center shadow-lg">
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
