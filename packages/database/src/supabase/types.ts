export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      body_measurement_entries: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          measurement_id: string
          recorded_at: string
          user_id: string
          value: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          measurement_id: string
          recorded_at?: string
          user_id: string
          value: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          measurement_id?: string
          recorded_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_measurement_entries_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "body_measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      body_measurements: {
        Row: {
          created_at: string
          goal_type: Database["public"]["Enums"]["goal_type"]
          goal_value: number | null
          id: string
          is_default: boolean
          is_enabled: boolean
          name: string
          unit: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_type?: Database["public"]["Enums"]["goal_type"]
          goal_value?: number | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          name: string
          unit: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_type?: Database["public"]["Enums"]["goal_type"]
          goal_value?: number | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          name?: string
          unit?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          order_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          order_index?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_favorite: boolean
          name: string
          notes: string | null
          type: Database["public"]["Enums"]["exercise_type"]
          updated_at: string
          user_id: string
          weight_unit: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean
          name: string
          notes?: string | null
          type?: Database["public"]["Enums"]["exercise_type"]
          updated_at?: string
          user_id: string
          weight_unit?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean
          name?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["exercise_type"]
          updated_at?: string
          user_id?: string
          weight_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_records: {
        Row: {
          achieved_at: string
          created_at: string
          exercise_id: string
          id: string
          reps: number
          user_id: string
          weight: number
        }
        Insert: {
          achieved_at?: string
          created_at?: string
          exercise_id: string
          id?: string
          reps: number
          user_id: string
          weight: number
        }
        Update: {
          achieved_at?: string
          created_at?: string
          exercise_id?: string
          id?: string
          reps?: number
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "personal_records_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      predefined_sets: {
        Row: {
          distance: number | null
          id: string
          order_index: number
          reps: number | null
          routine_day_exercise_id: string
          time_seconds: number | null
          user_id: string
          weight: number | null
        }
        Insert: {
          distance?: number | null
          id?: string
          order_index?: number
          reps?: number | null
          routine_day_exercise_id: string
          time_seconds?: number | null
          user_id: string
          weight?: number | null
        }
        Update: {
          distance?: number | null
          id?: string
          order_index?: number
          reps?: number | null
          routine_day_exercise_id?: string
          time_seconds?: number | null
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "predefined_sets_routine_day_exercise_id_fkey"
            columns: ["routine_day_exercise_id"]
            isOneToOne: false
            referencedRelation: "routine_day_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_day_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          group_id: string | null
          id: string
          order_index: number
          routine_day_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          group_id?: string | null
          id?: string
          order_index?: number
          routine_day_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          group_id?: string | null
          id?: string
          order_index?: number
          routine_day_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_day_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_day_exercises_routine_day_id_fkey"
            columns: ["routine_day_id"]
            isOneToOne: false
            referencedRelation: "routine_days"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_days: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          routine_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          routine_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          routine_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_days_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sets: {
        Row: {
          comment: string | null
          created_at: string
          distance: number | null
          id: string
          is_complete: boolean
          order_index: number
          reps: number | null
          time_seconds: number | null
          updated_at: string
          user_id: string
          weight: number | null
          workout_exercise_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          distance?: number | null
          id?: string
          is_complete?: boolean
          order_index?: number
          reps?: number | null
          time_seconds?: number | null
          updated_at?: string
          user_id: string
          weight?: number | null
          workout_exercise_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          distance?: number | null
          id?: string
          is_complete?: boolean
          order_index?: number
          reps?: number | null
          time_seconds?: number | null
          updated_at?: string
          user_id?: string
          weight?: number | null
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          group_id: string | null
          id: string
          order_index: number
          updated_at: string
          user_id: string
          workout_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          group_id?: string | null
          id?: string
          order_index?: number
          updated_at?: string
          user_id: string
          workout_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          group_id?: string | null
          id?: string
          order_index?: number
          updated_at?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          comment: string | null
          created_at: string
          date: string
          duration_minutes: number | null
          end_time: string | null
          id: string
          start_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          date: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          start_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          date?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          start_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      exercise_type:
        | "WEIGHT_REPS"
        | "DISTANCE_TIME"
        | "REPS_ONLY"
        | "WEIGHT_ONLY"
        | "TIME_ONLY"
      goal_type: "INCREASE" | "DECREASE" | "SPECIFIC"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      exercise_type: [
        "WEIGHT_REPS",
        "DISTANCE_TIME",
        "REPS_ONLY",
        "WEIGHT_ONLY",
        "TIME_ONLY",
      ],
      goal_type: ["INCREASE", "DECREASE", "SPECIFIC"],
    },
  },
} as const

