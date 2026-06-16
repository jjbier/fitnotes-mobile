/**
 * RestTimer — Countdown timer between sets
 *
 * TODO:
 *  - Configurable rest duration (default 90s, stored in user preferences)
 *  - Start automatically when a set is marked complete
 *  - Haptic feedback + sound alert when timer ends
 *  - Skip or add 30s buttons
 *  - Persist timer across navigation (keep running in background via Reanimated)
 */

import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface RestTimerProps {
  durationSeconds?: number;
  onComplete?: () => void;
  autoStart?: boolean;
}

export default function RestTimer({
  durationSeconds = 90,
  onComplete,
  autoStart = false,
}: RestTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [running, setRunning] = useState(autoStart);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [running, onComplete]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = remaining / durationSeconds;

  return (
    <View className="rounded-2xl border border-gray-100 bg-gray-50 p-4 items-center gap-3">
      {/* Timer display */}
      <Text className="text-4xl font-mono font-bold text-foreground">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </Text>

      {/* Progress bar */}
      <View className="w-full h-1.5 rounded-full bg-gray-200">
        <View
          className="h-1.5 rounded-full bg-primary"
          style={{ width: `${progress * 100}%` }}
        />
      </View>

      {/* Controls */}
      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => setRemaining((r) => Math.max(0, r - 30))}
          className="rounded-lg border border-gray-200 px-3 py-1.5"
        >
          <Text className="text-sm font-medium">-30s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setRunning((r) => !r)}
          className="rounded-lg bg-primary px-4 py-1.5 flex-row items-center gap-1"
        >
          <Ionicons
            name={running ? "pause" : "play"}
            size={14}
            color="white"
          />
          <Text className="text-white text-sm font-medium">
            {running ? "Pause" : "Start"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setRemaining((r) => r + 30)}
          className="rounded-lg border border-gray-200 px-3 py-1.5"
        >
          <Text className="text-sm font-medium">+30s</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
