import { useState } from "react";
import { TouchableOpacity, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  value: string; // YYYY-MM-DD o ""
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
}

export default function DateInput({ value, onChange, placeholder = "Seleccionar fecha", clearable = false }: Props) {
  const [show, setShow] = useState(false);

  const parsedDate = value ? new Date(value + "T12:00:00") : new Date();

  function handleChange(_e: DateTimePickerEvent, selected?: Date) {
    setShow(false);
    if (selected) onChange(selected.toISOString().split("T")[0]!);
  }

  const displayText = value
    ? new Date(value + "T12:00:00").toLocaleDateString("es-ES", {
        day: "numeric", month: "long", year: "numeric",
      })
    : placeholder;

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <TouchableOpacity
          onPress={() => setShow(true)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}
        >
          <Ionicons name="calendar-outline" size={18} color={value ? "#0f172a" : "#94a3b8"} />
          <Text style={{ flex: 1, fontSize: 15, color: value ? "#0f172a" : "#94a3b8" }}>{displayText}</Text>
        </TouchableOpacity>
        {clearable && value ? (
          <TouchableOpacity
            onPress={() => onChange("")}
            style={{ paddingHorizontal: 12, paddingVertical: 12 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>
      {show && (
        <DateTimePicker
          value={parsedDate}
          mode="date"
          display="default"
          onChange={handleChange}
          locale="es-ES"
        />
      )}
    </>
  );
}
