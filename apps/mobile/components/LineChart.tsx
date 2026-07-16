/**
 * Gráfica de línea en SVG (`react-native-svg`) para series temporales
 * (progreso de peso corporal, historial de un ejercicio, etc.), con relleno
 * en degradado, línea de tendencia opcional, línea de objetivo opcional y
 * soporte de tap sobre un punto para ver su valor exacto.
 */
import { useState } from "react";
import { View } from "react-native";
import { Svg, Path, Circle, Text as SvgText, Line, Rect, Defs, LinearGradient, Stop } from "react-native-svg";

/** Un punto de la serie: etiqueta de eje X (ya formateada) y valor numérico de eje Y. */
export interface ChartDataPoint {
  label: string;
  value: number;
}

/**
 * Props de `LineChart`.
 * - `data`: serie completa; internamente solo se dibujan los últimos 20 puntos (`data.slice(-20)`).
 * - `width`/`height`: dimensiones en px del `Svg` (height por defecto 180).
 * - `color`: color de la línea/área/degradado principal.
 * - `mini`: modo miniatura (sparkline) — sin ejes, etiquetas, tooltip ni puntos tocables, con padding mínimo.
 * - `goalValue`: si se indica (y no es `mini`), dibuja una línea discontinua de objetivo.
 * - `trendData`: serie paralela opcional (misma longitud que `data`) dibujada como línea de tendencia discontinua naranja.
 * - `onPointPress`: se invoca al tocar un punto con el índice dentro del array `data` original (no del recorte de 20).
 */
interface LineChartProps {
  data: ChartDataPoint[];
  width: number;
  height?: number;
  color?: string;
  mini?: boolean;
  goalValue?: number;
  trendData?: number[];
  onPointPress?: (dataIndex: number) => void;
}

const PAD_TOP = 20;
const PAD_BOTTOM = 28;
const PAD_LEFT = 42;
const PAD_RIGHT = 12;

/** Redondea `v` hacia arriba al siguiente "número bonito" de su orden de magnitud, para el máximo del eje Y (p.ej. 47 → 50, 145 → 200). */
function niceMax(v: number): number {
  if (v === 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / magnitude) * magnitude;
}

/** Redondea `v` hacia abajo a un "número bonito" para el mínimo del eje Y, acotado por el rango respecto a `max` (evita mínimos negativos o pegados al valor real). */
function niceMin(v: number, max: number): number {
  const range = max - v;
  if (range === 0 || v === 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
  return Math.floor(v / magnitude) * magnitude;
}

/**
 * Renderiza la gráfica. Calcula el rango del eje Y (`niceMin`/`niceMax`) a
 * partir de los valores visibles (incluyendo objetivo y tendencia si los
 * hay), construye los `Path` de línea/área/tendencia con coordenadas
 * absolutas de SVG, y superpone rectángulos invisibles por punto para
 * capturar el tap.
 *
 * Cálculo del punto tocado: cada punto visible ocupa un "segmento" horizontal
 * de ancho `chartW / (points.length - 1)` centrado en `xPos(i)` (mitad hacia
 * cada punto vecino), así que tocar en cualquier parte de ese ancho —no solo
 * exactamente sobre el círculo— selecciona el punto `i` más cercano. El
 * índice que reciben `setSelectedIdx` y `onPointPress` se traduce de vuelta
 * al array `data` original con `data.length - points.length + i`, ya que
 * `points` es el recorte `data.slice(-20)` y ambos índices solo coinciden
 * cuando la serie completa tiene 20 elementos o menos.
 */
export default function LineChart({ data, width, height = 180, color = "#6366f1", mini = false, goalValue, trendData, onPointPress }: LineChartProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const points = data.slice(-20);
  const trendPoints = !mini && trendData && trendData.length === data.length ? trendData.slice(-20) : null;

  const padTop = mini ? 4 : PAD_TOP;
  const padBottom = mini ? 4 : PAD_BOTTOM;
  const padLeft = mini ? 4 : PAD_LEFT;
  const padRight = mini ? 4 : PAD_RIGHT;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const hasGoal = !mini && typeof goalValue === "number" && Number.isFinite(goalValue);
  const values = points.map((p) => p.value)
    .concat(hasGoal ? [goalValue!] : [])
    .concat(trendPoints ?? []);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const yMax = niceMax(rawMax);
  const yMin = niceMin(rawMin, yMax);
  const range = yMax - yMin || 1;

  function xPos(i: number) {
    return padLeft + (i / Math.max(points.length - 1, 1)) * chartW;
  }

  function yPos(v: number) {
    return padTop + (1 - (v - yMin) / range) * chartH;
  }

  const lineParts = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(p.value).toFixed(1)}`);
  const linePath = lineParts.join(" ");

  const trendPath = trendPoints
    ? trendPoints.map((v, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`).join(" ")
    : null;

  const areaPath = [
    linePath,
    `L ${xPos(points.length - 1).toFixed(1)} ${(padTop + chartH).toFixed(1)}`,
    `L ${xPos(0).toFixed(1)} ${(padTop + chartH).toFixed(1)}`,
    "Z",
  ].join(" ");

  const yTicks = [yMin, yMin + range / 2, yMax];

  const maxXLabels = Math.min(5, points.length);
  const xStep = Math.ceil(points.length / maxXLabels);
  const xLabelIndices = points.map((_, i) => i).filter((i) => {
    if (points.length <= 5) return true;
    return i === 0 || i === points.length - 1 || i % xStep === 0;
  });

  const gradId = `grad-${color.replace("#", "")}`;
  const sel = selectedIdx !== null && points[selectedIdx] ? points[selectedIdx]! : null;

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={mini ? 0.15 : 0.2} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Y grid lines */}
        {!mini && yTicks.map((v, i) => (
          <Line key={i} x1={padLeft} y1={yPos(v)} x2={padLeft + chartW} y2={yPos(v)} stroke="#f1f5f9" strokeWidth={1} />
        ))}

        {/* Goal line */}
        {hasGoal && (
          <>
            <Line
              x1={padLeft} y1={yPos(goalValue!)}
              x2={padLeft + chartW} y2={yPos(goalValue!)}
              stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3"
            />
            <SvgText x={padLeft + chartW} y={yPos(goalValue!) - 4} fontSize={9} fill="#f59e0b" textAnchor="end" fontWeight="600">
              Objetivo {goalValue! % 1 === 0 ? goalValue : goalValue!.toFixed(1)}
            </SvgText>
          </>
        )}

        {/* Area fill */}
        <Path d={areaPath} fill={`url(#${gradId})`} />

        {/* Trend line */}
        {trendPath && (
          <Path d={trendPath} stroke="#f97316" strokeWidth={1.5} strokeDasharray="5,3" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* Line */}
        <Path d={linePath} stroke={color} strokeWidth={mini ? 1.5 : 2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {/* Selected point vertical line */}
        {!mini && sel !== null && selectedIdx !== null && (
          <Line
            x1={xPos(selectedIdx)} y1={padTop}
            x2={xPos(selectedIdx)} y2={padTop + chartH}
            stroke={color} strokeWidth={1} strokeDasharray="3,3"
          />
        )}

        {/* Data points */}
        {!mini && points.map((p, i) => (
          <Circle
            key={i}
            cx={xPos(i)} cy={yPos(p.value)} r={i === selectedIdx ? 5 : 3}
            fill={i === selectedIdx ? "#fff" : color}
            stroke={color} strokeWidth={i === selectedIdx ? 2 : 0}
          />
        ))}

        {/* Selected value tooltip */}
        {!mini && sel !== null && selectedIdx !== null && (() => {
          const tx = xPos(selectedIdx);
          const ty = yPos(sel.value) - 14;
          const valStr = sel.value % 1 === 0 ? String(sel.value) : sel.value.toFixed(1);
          const textW = valStr.length * 6 + 10;
          const bx = Math.min(Math.max(tx - textW / 2, padLeft), padLeft + chartW - textW);
          return (
            <>
              <Rect x={bx} y={ty - 11} width={textW} height={14} rx={4} fill={color} />
              <SvgText x={bx + textW / 2} y={ty} fontSize={9} fill="#fff" textAnchor="middle" fontWeight="600">{valStr}</SvgText>
            </>
          );
        })()}

        {/* Y axis labels */}
        {!mini && yTicks.map((v, i) => (
          <SvgText key={i} x={padLeft - 6} y={yPos(v) + 4} fontSize={9} fill="#94a3b8" textAnchor="end">
            {v % 1 === 0 ? v : v.toFixed(1)}
          </SvgText>
        ))}

        {/* X axis labels */}
        {!mini && xLabelIndices.map((i) => (
          <SvgText key={i} x={xPos(i)} y={padTop + chartH + 16} fontSize={9} fill="#94a3b8" textAnchor="middle">
            {points[i]!.label}
          </SvgText>
        ))}

        {/* Invisible tap targets per data point */}
        {!mini && points.map((_, i) => {
          const segW = chartW / Math.max(points.length - 1, 1);
          const bx = xPos(i) - segW / 2;
          return (
            <Rect
              key={`tap-${i}`}
              x={Math.max(padLeft, bx)} y={padTop}
              width={segW} height={chartH}
              fill="transparent"
              onPress={() => {
                setSelectedIdx(selectedIdx === i ? null : i);
                onPointPress?.(data.length - points.length + i);
              }}
            />
          );
        })}
      </Svg>
    </View>
  );
}
