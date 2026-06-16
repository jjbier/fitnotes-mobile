/**
 * NativeWind-styled Button component
 *
 * TODO:
 *  - Add loading state with ActivityIndicator
 *  - Haptic feedback on press (expo-haptics)
 *  - Disabled state with reduced opacity
 */

import { TouchableOpacity, Text, ActivityIndicator, type TouchableOpacityProps } from "react-native";
import type { ButtonVariantProps } from "@fitnotes/ui";

interface ButtonProps extends TouchableOpacityProps, ButtonVariantProps {
  label: string;
  loading?: boolean;
}

const variantClasses: Record<NonNullable<ButtonVariantProps["variant"]>, string> = {
  default: "bg-primary",
  secondary: "bg-secondary border border-gray-200",
  destructive: "bg-destructive",
  outline: "bg-transparent border border-gray-300",
  ghost: "bg-transparent",
  link: "bg-transparent",
};

const textClasses: Record<NonNullable<ButtonVariantProps["variant"]>, string> = {
  default: "text-white",
  secondary: "text-foreground",
  destructive: "text-white",
  outline: "text-foreground",
  ghost: "text-foreground",
  link: "text-primary underline",
};

const sizeClasses: Record<NonNullable<ButtonVariantProps["size"]>, string> = {
  default: "px-5 py-3",
  sm: "px-3 py-2",
  lg: "px-7 py-4",
  icon: "p-2.5",
};

const textSizeClasses: Record<NonNullable<ButtonVariantProps["size"]>, string> = {
  default: "text-sm",
  sm: "text-xs",
  lg: "text-base",
  icon: "text-sm",
};

export default function Button({
  label,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <TouchableOpacity
      {...rest}
      disabled={disabled || loading}
      className={`flex-row items-center justify-center rounded-xl ${variantClasses[variant]} ${sizeClasses[size]} ${disabled || loading ? "opacity-50" : "active:opacity-80"}`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "default" || variant === "destructive" ? "white" : "#6366f1"}
        />
      ) : (
        <Text
          className={`font-semibold ${textClasses[variant]} ${textSizeClasses[size]}`}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
