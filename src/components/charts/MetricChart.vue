<script setup lang="ts">
import uPlot from "uplot";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  locale?: "en" | "he";
  points: Array<{ x: number; y: number | null }>;
  label: string;
  yUnit?: string;
  trendline?: {
    label: string;
    color?: string;
  };
  referenceLines?: Array<{
    label: string;
    value: number | null;
    color?: string;
  }>;
  referenceLine?: {
    label: string;
    value: number | null;
    color?: string;
  };
}>();

const chartRef = ref<HTMLDivElement | null>(null);
const hoverIndex = ref<number | null>(null);
const hoverPosition = ref({ x: 0, y: 0 });
const axisUnitInsetStart = ref(8);
const isPanning = ref(false);
const activePointerId = ref<number | null>(null);
const panStartX = ref(0);
const panStartScale = ref<{ min: number; max: number } | null>(null);
const currentXScale = ref<{ min: number; max: number } | null>(null);
let chart: uPlot | undefined;
let resizeObserver: ResizeObserver | undefined;

const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(props.locale === "he" ? "he-IL" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
);
const numberFormatter = computed(
  () =>
    new Intl.NumberFormat(props.locale === "he" ? "he-IL" : "en-US", {
      maximumFractionDigits: 1,
    }),
);
const activeReferenceLines = computed(() => {
  const fromNew = (props.referenceLines ?? []).filter((line) => line.value !== null && line.value !== undefined);
  if (fromNew.length) return fromNew;
  const legacy = props.referenceLine?.value !== null && props.referenceLine?.value !== undefined ? [props.referenceLine] : [];
  return legacy.filter(Boolean) as Array<{ label: string; value: number; color?: string }>;
});
const activeTrendline = computed(() => {
  if (!props.trendline || props.points.length < 2) {
    return null;
  }

  return props.trendline;
});
const hasReferenceLines = computed(() => activeReferenceLines.value.length > 0);
const normalizedPoints = computed(() =>
  props.points.map((point) => ({
    x: normalizeTimestamp(point.x),
    y: point.y,
  })),
);
const trendlineValues = computed(() =>
  activeTrendline.value ? buildTrendlineValues(normalizedPoints.value) : [],
);
const hoveredPoint = computed(() =>
  hoverIndex.value === null ? null : normalizedPoints.value[hoverIndex.value] ?? null,
);

function renderChart() {
  if (!chartRef.value || props.points.length === 0) {
    hoverIndex.value = null;
    chart?.destroy();
    chart = undefined;
    return;
  }

  const xValues = normalizedPoints.value.map((point) => point.x);
  const yValues = normalizedPoints.value.map((point) => point.y ?? null);
  const trendValues = trendlineValues.value;
  const xSplits = uniqueSorted(xValues);
  const weekBoundarySplits = buildWeekBoundarySplits(xSplits);
  const referenceValuesList = activeReferenceLines.value.map((line) => xValues.map(() => line.value ?? null));
  const allYValues = hasReferenceLines.value
    ? [...yValues, ...trendValues, ...referenceValuesList.flatMap((values) => values as Array<number | null>)]
    : [...yValues, ...trendValues];

  const chartWidth = chartRef.value?.clientWidth || 320;
  const domainMin = xSplits[0] ?? 0;
  const domainMax = xSplits[xSplits.length - 1] ?? domainMin;
  const initialWindow = buildInitialXWindow(xSplits, chartWidth);
  currentXScale.value = initialWindow;
  const maxXLabels = Math.max(3, Math.floor(chartWidth / 52));
  const thinFactor = Math.max(1, Math.ceil(xSplits.length / maxXLabels));
  const visibleXSplits = xSplits.filter((_, idx) => idx % thinFactor === 0);

  chart?.destroy();
  chart = new uPlot(
    {
      width: chartWidth,
      height: 210,
      series: [
        {
          value: (_u, value) => formatDay(value),
        },
        {
          label: props.label,
          stroke: "#0a88a3",
          width: 2,
          points: { size: 8, stroke: "#0a88a3", fill: "#0a88a3", width: 2 },
        },
        ...(activeTrendline.value
          ? [
              {
                label: activeTrendline.value.label,
                stroke: activeTrendline.value.color ?? "#5e4aa8",
                width: 3,
                points: { show: false },
              },
            ]
          : []),
        ...activeReferenceLines.value.map((line) => ({
          label: line.label,
          stroke: line.color ?? "#9a7b24",
          width: 2,
          dash: [8, 4],
          points: { show: false },
        })),
      ],
      scales: {
        x: {
          time: true,
          auto: false,
          range: () => [currentXScale.value?.min ?? domainMin, currentXScale.value?.max ?? domainMax],
        },
        y: {
          auto: false,
          range: () => buildYRange(yValues, allYValues),
        },
      },
      axes: [
        {
          stroke: "#5f5a4f",
          grid: { stroke: "rgba(95, 90, 79, 0.18)" },
          splits: () => visibleXSplits,
          values: (_u, splits) => splits.map((value) => formatAxisDay(value)),
        },
        {
          stroke: "#5f5a4f",
          grid: { stroke: "rgba(95, 90, 79, 0.14)" },
          values: (_u, splits) => splits.map((value) => formatYAxisValue(value)),
        },
      ],
      hooks: {
        draw: [
          (u) => {
            axisUnitInsetStart.value = Math.max(8, Math.round(u.bbox.left + 6));

            if (!weekBoundarySplits.length) {
              return;
            }

            const ctx = u.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = "rgba(196, 188, 172, 0.82)";
            ctx.lineWidth = 2;
            ctx.setLineDash([]);

            for (const split of weekBoundarySplits) {
              const x = Math.round(u.valToPos(split, "x", true)) + 0.5;
              ctx.moveTo(x, u.bbox.top);
              ctx.lineTo(x, u.bbox.top + u.bbox.height);
            }

            ctx.stroke();
            ctx.restore();
          },
        ],
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            if (idx === null || idx === undefined) {
              hoverIndex.value = null;
              return;
            }

            const yValue = yValues[idx];
            if (yValue === null) {
              hoverIndex.value = null;
              return;
            }

            const pointX = u.valToPos(xValues[idx], "x", true);
            const pointY = u.valToPos(yValue, "y", true);
            const cursorLeft = u.cursor.left;
            const cursorTop = u.cursor.top;
            if (cursorLeft == null || cursorTop == null) {
              hoverIndex.value = null;
              return;
            }

            const cursorX = cursorLeft + u.bbox.left;
            const cursorY = cursorTop + u.bbox.top;
            const distance = Math.hypot(pointX - cursorX, pointY - cursorY);

            if (distance > 18) {
              hoverIndex.value = null;
              return;
            }

            hoverIndex.value = idx;
            hoverPosition.value = {
              x: Math.min(Math.max(pointX + 10, 8), u.bbox.left + u.bbox.width - 150),
              y: Math.max(pointY - 54, 8),
            };
          },
        ],
        setSelect: [
          () => {
            hoverIndex.value = null;
          },
        ],
      },
    },
    [xValues, yValues, ...(activeTrendline.value ? [trendValues] : []), ...referenceValuesList],
    chartRef.value,
  );
}

function normalizeTimestamp(value: number) {
  return value > 1e12 ? Math.floor(value / 1000) : value;
}

function formatDay(value: number) {
  return dateFormatter.value.format(new Date(value * 1000));
}

function formatAxisDay(value: number) {
  const date = new Date(value * 1000);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function formatYAxisValue(value: number) {
  return Number.isInteger(value)
    ? numberFormatter.value.format(value)
    : numberFormatter.value.format(Number(value.toFixed(1)));
}

function formatHoverValue(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  const formatted = formatYAxisValue(value);
  return props.yUnit ? `${formatted} ${props.yUnit}` : formatted;
}

function uniqueSorted(values: number[]) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function buildWeekBoundarySplits(xValues: number[]) {
  if (xValues.length < 2) {
    return [] as number[];
  }

  const splits: number[] = [];
  const minX = xValues[0];
  const maxX = xValues[xValues.length - 1];
  const firstBoundary = nextWeekBoundaryFromUnix(minX);
  let cursor = firstBoundary;

  while (cursor < maxX) {
    if (cursor > minX) {
      splits.push(cursor);
    }

    cursor += 7 * 24 * 60 * 60;
  }

  return splits;
}

function nextWeekBoundaryFromUnix(value: number) {
  const date = new Date(value * 1000);
  date.setHours(12, 0, 0, 0);
  const dayOfWeek = date.getDay(); // 0 = Sunday
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(date);
  nextMonday.setDate(date.getDate() + daysUntilNextMonday);
  return Math.floor(nextMonday.getTime() / 1000);
}

function buildTrendlineValues(points: Array<{ x: number; y: number | null }>) {
  const numeric = points.filter((point): point is { x: number; y: number } => typeof point.y === "number");
  if (numeric.length < 2) {
    return [];
  }

  const origin = numeric[0].x;
  const offsets = numeric.map((point) => point.x - origin);
  const ys = numeric.map((point) => point.y);
  const meanX = offsets.reduce((sum, value) => sum + value, 0) / offsets.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = offsets.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0);
  const denominator = offsets.reduce((sum, value) => sum + (value - meanX) ** 2, 0);

  if (denominator === 0) {
    return points.map((point) => point.y);
  }

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  return points.map((point) => {
    if (point.y === null || point.y === undefined) {
      return null;
    }

    const offset = point.x - origin;
    return slope * offset + intercept;
  });
}

function buildYRange(primaryValues: Array<number | null>, fallbackValues: Array<number | null> = []): [number, number] {
  const primaryNumeric = primaryValues.filter((value): value is number => typeof value === "number");
  const fallbackNumeric = fallbackValues.filter((value): value is number => typeof value === "number");
  const numeric = primaryNumeric.length ? primaryNumeric : fallbackNumeric;
  if (!numeric.length) {
    return [0, 1];
  }

  const lower = Math.min(...numeric);
  const upper = Math.max(...numeric);

  if (lower === upper) {
    const pad = Math.max(Math.abs(lower) * 0.05, 0.5);
    return [Math.max(0, lower - pad), upper + pad];
  }

  const span = upper - lower;
  const pad = Math.max(span * 0.08, 0.25);
  const minBound = lower >= 0 ? 0 : Number.NEGATIVE_INFINITY;
  return [Math.max(minBound, lower - pad), upper + pad];
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") {
    renderChart();
  }
}

function onPanPointerDown(event: PointerEvent) {
  if (!chartRef.value || !chart || event.button !== 0) {
    return;
  }

  const domain = getXDomain();
  const min = chart.scales.x.min;
  const max = chart.scales.x.max;
  if (min == null || max == null) {
    return;
  }

  activePointerId.value = event.pointerId;
  panStartX.value = event.clientX;
  panStartScale.value = { min, max };
  isPanning.value = true;
  chartRef.value.setPointerCapture(event.pointerId);
  chartRef.value.style.cursor = "grabbing";
  currentXScale.value = clampXWindow(panStartScale.value, domain.min, domain.max);
}

function onPanPointerMove(event: PointerEvent) {
  if (!chartRef.value || !chart || !isPanning.value || activePointerId.value !== event.pointerId || !panStartScale.value) {
    return;
  }

  const domain = getXDomain();
  const visibleSpan = panStartScale.value.max - panStartScale.value.min;
  if (visibleSpan <= 0 || chart.bbox.width <= 0) {
    return;
  }

  const deltaX = event.clientX - panStartX.value;
  const secondsPerPx = visibleSpan / chart.bbox.width;
  const shift = deltaX * secondsPerPx;
  const nextRange = clampXWindow(
    {
      min: panStartScale.value.min - shift,
      max: panStartScale.value.max - shift,
    },
    domain.min,
    domain.max,
  );

  currentXScale.value = nextRange;
  chart.setScale("x", nextRange);
}

function onPanPointerUp(event: PointerEvent) {
  if (!chartRef.value || activePointerId.value !== event.pointerId) {
    return;
  }

  if (chartRef.value.hasPointerCapture(event.pointerId)) {
    chartRef.value.releasePointerCapture(event.pointerId);
  }

  activePointerId.value = null;
  panStartScale.value = null;
  isPanning.value = false;
  chartRef.value.style.cursor = "grab";
}

function getXDomain() {
  const xValues = normalizedPoints.value.map((point) => point.x).sort((a, b) => a - b);
  const min = xValues[0] ?? 0;
  const max = xValues[xValues.length - 1] ?? min;
  return { min, max };
}

function buildInitialXWindow(xValues: number[], chartWidth: number) {
  const min = xValues[0] ?? 0;
  const max = xValues[xValues.length - 1] ?? min;
  const domainSpan = Math.max(1, max - min);
  // On narrow screens, show the full domain first so the chart doesn't feel blank.
  if (chartWidth < 640) {
    return { min, max };
  }

  const desiredWidth = Math.max(chartWidth, xValues.length * 46);
  const visibleSpan = Math.max(domainSpan * (chartWidth / desiredWidth), 24 * 60 * 60);

  if (domainSpan <= visibleSpan) {
    return { min, max };
  }

  return { min: max - visibleSpan, max };
}

function clampXWindow(range: { min: number; max: number }, domainMin: number, domainMax: number) {
  const windowSpan = Math.max(1, range.max - range.min);
  const domainSpan = Math.max(1, domainMax - domainMin);
  if (windowSpan >= domainSpan) {
    return { min: domainMin, max: domainMax };
  }

  if (range.min < domainMin) {
    return { min: domainMin, max: domainMin + windowSpan };
  }

  if (range.max > domainMax) {
    return { min: domainMax - windowSpan, max: domainMax };
  }

  return range;
}

onMounted(renderChart);
onMounted(() => {
  if (!chartRef.value) return;
  chartRef.value.style.cursor = "grab";
  resizeObserver = new ResizeObserver(() => renderChart());
  resizeObserver.observe(chartRef.value);
  document.addEventListener("visibilitychange", onVisibilityChange);
});
watch(() => props.points, renderChart, { deep: true });
watch(() => props.label, renderChart);
watch(() => props.locale, renderChart);
watch(() => props.yUnit, renderChart);
watch(() => props.referenceLine, renderChart, { deep: true });
watch(() => props.referenceLines, renderChart, { deep: true });
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.destroy();
  document.removeEventListener("visibilitychange", onVisibilityChange);
});
</script>

<template>
  <div class="chart-shell">
    <div class="chart-stage" dir="ltr">
      <span
        v-if="yUnit"
        class="axis-unit"
        :style="{ insetInlineStart: `${axisUnitInsetStart}px` }"
      >{{ yUnit }}</span>
      <div
        ref="chartRef"
        class="chart"
        :class="{ 'is-panning': isPanning }"
        @pointerdown="onPanPointerDown"
        @pointermove="onPanPointerMove"
        @pointerup="onPanPointerUp"
        @pointercancel="onPanPointerUp"
      ></div>
      <div
        v-if="hoveredPoint"
        class="hover-readout"
        :style="{
          insetInlineStart: `${hoverPosition.x}px`,
          insetBlockStart: `${hoverPosition.y}px`,
        }"
      >
        <div class="hover-date">{{ formatDay(hoveredPoint.x) }}</div>
        <div class="hover-line">{{ formatHoverValue(hoveredPoint.y) }}</div>
        <div
          v-for="line in activeReferenceLines"
          :key="line.label"
          class="hover-reference"
          :style="{ color: line.color ?? '#9a7b24' }"
        >
          {{ line.label }}: {{ formatHoverValue(line.value ?? null) }}
        </div>
      </div>
    </div>

    <div class="chart-legend" aria-label="chart legend">
      <div class="legend-row">
        <span class="legend-swatch legend-swatch--solid" aria-hidden="true"></span>
        <span class="legend-label">{{ label }}</span>
      </div>
      <div v-if="activeTrendline" class="legend-row">
        <span
          class="legend-swatch legend-swatch--solid"
          :style="{ '--swatch-color': activeTrendline.color ?? '#5e4aa8' }"
          aria-hidden="true"
        ></span>
        <span class="legend-label">{{ activeTrendline.label }}</span>
      </div>
      <div v-for="line in activeReferenceLines" :key="line.label" class="legend-row">
        <span
          class="legend-swatch legend-swatch--dash"
          :style="{ '--swatch-color': line.color ?? '#9a7b24' }"
          aria-hidden="true"
        ></span>
        <span class="legend-label">{{ line.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-shell {
  min-inline-size: 0;
}

.chart-stage {
  position: relative;
  min-inline-size: 0;
}

.axis-unit {
  position: absolute;
  inset-block-start: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  z-index: 2;
  pointer-events: none;
  background: transparent;
  border: 0;
  padding: 0;
  opacity: 0.92;
}

.chart {
  inline-size: 100%;
  min-block-size: 210px;
  cursor: grab;
  touch-action: pan-y;
}

.chart.is-panning {
  cursor: grabbing;
}

.hover-readout {
  position: absolute;
  z-index: 3;
  min-inline-size: 96px;
  max-inline-size: 170px;
  padding: 0.28rem 0.4rem;
  border: 1px solid var(--border-strong);
  background: color-mix(in srgb, var(--panel) 96%, black 4%);
  box-shadow: var(--bevel-raised);
  pointer-events: none;
  display: grid;
  gap: 0.15rem;
}

.hover-date {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.hover-line,
.hover-reference {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chart :deep(.u-legend) {
  display: none;
}

.chart-legend {
  margin-block-start: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  background: color-mix(in srgb, var(--surface-2) 92%, black 8%);
  box-shadow: var(--bevel-sunken);
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.legend-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.legend-swatch {
  inline-size: 18px;
  block-size: 0;
  border-top: 2px solid currentColor;
}

.legend-swatch--solid {
  color: var(--swatch-color, #0a88a3);
}

.legend-swatch--dash {
  color: var(--swatch-color);
  border-top-style: dashed;
}

.legend-label {
  color: var(--text-primary);
  opacity: 0.95;
}

@media (max-width: 640px) {
  .hover-readout {
    max-inline-size: min(160px, calc(100% - 12px));
  }
}
</style>
