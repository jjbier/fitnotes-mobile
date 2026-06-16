/**
 * SetRow — Individual set row with complete checkbox
 *
 * TODO:
 *  - Inline edit mode on tap (show input fields inline)
 *  - Swipe-left gesture to reveal delete action (react-native-gesture-handler)
 *  - Display correct fields based on exercise type (weight, reps, distance, time)
 *  - Previous-session ghost values as placeholders
 */

import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Set } from "@fitnotes/core";

interface SetRowProps {
  set: Set;
  index: number;
  onToggleComplete: (complete: boolean) => void;
  onDelete: () => void;
}

export default function SetRow({ set, index, onToggleComplete, onDelete }: SetRowProps) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      {/* Set number */}
      <View className="w-6 h-6 rounded-full bg-gray-100 items-center justify-center">
        <Text className="text-xs font-medium text-muted-foreground">{index + 1}</Text>
      </View>

      {/* Values */}
      <View className="flex-1 flex-row gap-4">
        {set.weight !== undefined && (
          <Text className="text-sm">
            <Text className="font-semibold">{set.weight}</Text>
            <Text className="text-muted-foreground"> kg</Text>
          </Text>
        )}
        {set.reps !== undefined && (
          <Text className="text-sm">
            <Text className="font-semibold">{set.reps}</Text>
            <Text className="text-muted-foreground"> reps</Text>
          </Text>
        )}
        {set.distance !== undefined && (
          <Text className="text-sm">
            <Text className="font-semibold">{set.distance}</Text>
            <Text className="text-muted-foreground"> km</Text>
          </Text>
        )}
        {set.time_seconds !== undefined && (
          <Text className="text-sm">
            <Text className="font-semibold">{set.time_seconds}</Text>
            <Text className="text-muted-foreground"> s</Text>
          </Text>
        )}
        {set.weight === undefined && set.reps === undefined &&
         set.distance === undefined && set.time_seconds === undefined && (
          <Text className="text-sm text-muted-foreground">Tap to fill in values</Text>
        )}
      </View>

      {/* Delete */}
      <TouchableOpacity onPress={onDelete} className="p-1">
        <Ionicons name="trash-outline" size={16} color="#ef4444" />
      </TouchableOpacity>

      {/* Complete toggle */}
      <TouchableOpacity
        onPress={() => onToggleComplete(!set.is_complete)}
        className={`h-7 w-7 rounded-full border-2 items-center justify-center ${
          set.is_complete ? "border-green-500 bg-green-500" : "border-gray-300"
        }`}
      >
        {set.is_complete && (
          <Ionicons name="checkmark" size={14} color="white" />
        )}
      </TouchableOpacity>
    </View>
  );
}
