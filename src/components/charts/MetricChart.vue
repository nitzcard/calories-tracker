<script setup lang="ts">
import uPlot from "uplot";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  locale?: "en" | "he";
  points: Array<{ x: number; y: number | null }>;
  label: string;
  yUnit?: string;
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
const hasReferenceLines = computed(() => activeReferenceLines.value.length > 0);
const normalizedPoints = computed(() =>
  props.points.map((point) => ({
    x: normalizeTimestamp(point.x),
    y: point.y,
  })),
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
  const xSplits = uniqueSorted(xValues);
  const referenceValuesList = activeReferenceLines.value.map((line) => xValues.map(() => line.value ?? null));
  const allYValues = hasReferenceLines.value
    ? [...yValues, ...referenceValuesList.flatMap((values) => values as Array<number | null>)]
    : yValues;

  const chartWidth = chartRef.value?.clientWidth || 320;
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
        },
        y: {
          auto: false,
          range: () => buildYRange(allYValues),
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
    [xValues, yValues, ...referenceValuesList],
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

function buildYRange(values: Array<number | null>): [number, number] {
  const numeric = values.filter((value): value is number => typeof value === "number");
  if (!numeric.length) {
    return [0, 1];
  }

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);

  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.08, 10);
    return [Math.max(0, min - pad), max + pad];
  }

  const span = max - min;
  const pad = Math.max(span * 0.12, 2);
  return [Math.max(0, min - pad), max + pad];
}

onMounted(renderChart);
onMounted(() => {
  if (!chartRef.value) return;
  resizeObserver = new ResizeObserver(() => renderChart());
  resizeObserver.observe(chartRef.value);
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
});
</script>

<template>
  <div class="chart-shell">
    <div class="chart-stage" dir="ltr">
      <span v-if="yUnit" class="axis-unit">{{ yUnit }}</span>
      <div ref="chartRef" class="chart"></div>
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
  inset-inline-start: 4px;
  inset-block-start: 34px;
  color: var(--text-muted);
  white-space: nowrap;
  z-index: 2;
  pointer-events: none;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  padding: 0 2px;
}

.chart {
  inline-size: 100%;
  min-block-size: 210px;
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
  color: #0a88a3;
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
