/**
 * Calendar tab
 *
 * TODO:
 *  - Render a month calendar grid with workout day dots
 *  - Tap a date to navigate to workout/[date]
 *  - Load workouts for visible month range from Supabase
 *  - Use groupWorkoutsByMonth from @fitnotes/core for the list section
 */

import { SafeAreaView, ScrollView, Text, View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { groupWorkoutsByMonth } from "@fitnotes/core";

const EMPTY_WORKOUTS = groupWorkoutsByMonth([]);

export default function CalendarScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-4 py-6 gap-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold">Calendar</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity className="rounded-lg border border-gray-200 p-2">
              <Ionicons name="chevron-back" size={18} color="#0f172a" />
            </TouchableOpacity>
            <TouchableOpacity className="rounded-lg border border-gray-200 p-2">
              <Ionicons name="chevron-forward" size={18} color="#0f172a" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Month grid */}
        <View className="rounded-2xl border border-gray-100 p-4 gap-3">
          <Text className="font-semibold text-center">June 2026</Text>
          {/* Weekday headers */}
          <View className="flex-row">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <View key={i} className="flex-1 items-center">
                <Text className="text-xs text-muted-foreground font-medium">{d}</Text>
              </View>
            ))}
          </View>
          {/* TODO: generate real calendar grid from current month */}
          <View className="flex-row flex-wrap">
            {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
              <TouchableOpacity key={day} className="w-[14.28%] aspect-square items-center justify-center">
                <View className="h-9 w-9 items-center justify-center rounded-full">
                  <Text className="text-sm">{day}</Text>
                </View>
                {/* TODO: show dot if workout exists on this day */}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Workout list */}
        <View className="gap-2">
          <Text className="font-semibold">This Month</Text>
          {Object.keys(EMPTY_WORKOUTS).length === 0 ? (
            <View className="rounded-xl border border-dashed border-gray-200 p-6 items-center">
              <Text className="text-sm text-muted-foreground">No workouts this month.</Text>
            </View>
          ) : null}
          {/* TODO: render workout list items from groupWorkoutsByMonth */}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
