import { useState } from "react";
import type { ReactNode } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../lib/theme";

interface InfoTipProps {
  /** Encabezado de la explicación (p.ej. el nombre del dato). */
  title: string;
  /** Texto que explica qué significa el dato y cómo se calcula. */
  text: string;
  /** Tamaño del icono ⓘ cuando no se pasa `children`. */
  size?: number;
  /** Disparador propio (p.ej. una etiqueta o chip); sin él se muestra un icono ⓘ. */
  children?: ReactNode;
}

/**
 * "Tooltip" táctil para móvil (no existe hover): un icono ⓘ —o el `children` que se
 * pase— que al pulsarlo abre una tarjeta flotante con la explicación del dato. Se
 * cierra tocando fuera o en "Cerrar". La tarjeta se dibuja en un `Modal` propio para
 * quedar por encima de cualquier scroll/clipping del contenedor.
 */
export default function InfoTip({ title, text, size = 14, children }: InfoTipProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`${t("common:info")}: ${title}`}
      >
        {children ?? <Ionicons name="information-circle-outline" size={size} color={theme.textMuted} />}
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: "center", paddingHorizontal: 28 }}
        >
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: theme.background, borderRadius: 16, padding: 18, gap: 8, borderWidth: 1, borderColor: theme.border }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: theme.text }}>{title}</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: theme.textSecondary }}>{text}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} style={{ alignSelf: "flex-end", paddingVertical: 6, paddingHorizontal: 4, marginTop: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.primary }}>{t("common:close")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
