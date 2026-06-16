/**
 * Routines list screen
 *
 * TODO:
 *  - Load routines from Supabase into useRoutineStore on mount
 *  - Tap routine to navigate to routines/[id]
 *  - Long-press to delete (with confirmation alert)
 *  - FAB to create new routine
 */

import { SafeAreaView, ScrollView, Text, View, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRoutineStore } from "@fitnotes/core";

export default function RoutinesScreen() {
  const router = useRouter();
  const routines = useRoutineStore((s) => s.routines);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-4 py-6 gap-4">
        <Text className="text-2xl font-bold">Routines</Text>

        {routines.length === 0 ? (
          <View className="rounded-2xl border border-dashed border-gray-200 p-10 items-center gap-3">
            <Ionicons name="clipboard-outline" size={36} color="#64748b" />
            <Text className="text-sm font-medium text-foreground">No routines yet</Text>
            <Text className="text-xs text-muted-foreground text-center">
              Create a routine to save your favourite workout templates.
            </Text>
          </View>
        ) : (
          routines.map((routine) => (
            <TouchableOpacity
              key={routine.id}
              onPress={() => router.push(`/routines/${routine.id}`)}
              className="flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm"
            >
              <View className="flex-1">
                <Text className="font-semibold text-sm">{routine.name}</Text>
                {routine.notes ? (
                  <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                    {routine.notes}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#64748b" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity className="absolute bottom-8 right-6 h-14 w-14 rounded-full bg-primary items-center justify-center shadow-lg">
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
