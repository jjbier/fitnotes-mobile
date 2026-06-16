/**
 * NativeWind-styled TextInput component
 *
 * TODO:
 *  - Floating label animation (Reanimated)
 *  - Error state with red border + error message
 *  - Password visibility toggle
 *  - Clear button for single-line inputs
 */

import { View, Text, TextInput, type TextInputProps } from "react-native";
import type { InputBaseProps } from "@fitnotes/ui";

interface InputProps extends TextInputProps, InputBaseProps {
  label?: string;
}

export default function Input({
  label,
  error,
  disabled,
  className,
  ...rest
}: InputProps) {
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="text-sm font-medium text-foreground">{label}</Text>
      ) : null}

      <TextInput
        {...rest}
        editable={!disabled}
        className={`rounded-xl border bg-gray-50 px-4 py-3 text-sm text-foreground ${
          error
            ? "border-destructive bg-red-50"
            : "border-gray-200 focus:border-primary"
        } ${disabled ? "opacity-50" : ""} ${className ?? ""}`}
        placeholderTextColor="#94a3b8"
      />

      {error ? (
        <Text className="text-xs text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}
