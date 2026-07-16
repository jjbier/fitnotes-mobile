/**
 * Selector de fecha para mobile: un campo tipo botón que, al tocarlo, abre el
 * `DateTimePicker` nativo del sistema en modo "date" y formatea la fecha
 * elegida en español.
 */
import { useState } from "react";
import { TouchableOpacity, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

/**
 * Props de `DateInput`.
 * - `value`: fecha en formato `YYYY-MM-DD`, o `""` si no hay fecha seleccionada.
 * - `onChange`: recibe la nueva fecha en el mismo formato `YYYY-MM-DD`.
 * - `placeholder`: texto mostrado cuando `value` está vacío.
 * - `clearable`: si es `true` y hay valor, muestra un botón para vaciarlo (llama a `onChange("")`).
 */
interface Props {
  value: string; // YYYY-MM-DD o ""
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
}

/**
 * Campo de fecha con selector nativo. Internamente parsea `value` fijando la
 * hora a mediodía (`T12:00:00`) para evitar que la conversión UTC del
 * `Date` empuje la fecha al día anterior/siguiente por zona horaria al
 * mostrarla o al abrir el picker.
 */
export default function DateInput({ value, onChange, placeholder = "Seleccionar fecha", clearable = false }: Props) {
  const [show, setShow] = useState(false);

  const parsedDate = value ? new Date(value + "T12:00:00") : new Date();

  /** Cierra el picker y, si el usuario no canceló (`selected` presente), propaga la fecha en formato `YYYY-MM-DD`. */
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
