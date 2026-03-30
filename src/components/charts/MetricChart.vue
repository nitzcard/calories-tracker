<script setup lang="ts">
import uPlot from "uplot";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  locale?: "en" | "he";
  points: Array<{ x: number; y: number | null }>;
  label: string;
  yUnit?: string;
  referenceLine?: {
    label: string;
    value: number | null;
    color?: string;
  };
}>();

const chartRef = ref<HTMLDivElement | null>(null);
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
const hasReferenceLine = computed(
  () => props.referenceLine?.value !== null && props.referenceLine?.value !== undefined,
);

function renderChart() {
  if (!chartRef.value || props.points.length === 0) {
    return;
  }

  const xValues = props.points.map((point) => normalizeTimestamp(point.x));
  const yValues = props.points.map((point) => point.y ?? null);
  const xSplits = uniqueSorted(xValues);
  const referenceValues = hasReferenceLine.value
    ? xValues.map(() => props.referenceLine?.value ?? null)
    : [];
  const allYValues = hasReferenceLine.value ? [...yValues, ...(referenceValues as number[])] : yValues;

  chart?.destroy();
  chart = new uPlot(
    {
      width: chartRef.value.clientWidth || 320,
      height: 210,
      series: [
        {
          value: (_u, value) => formatDay(value),
        },
        {
          label: props.label,
          stroke: "#005f73",
          width: 2,
          points: { size: 14, stroke: "#0a88a3", fill: "rgba(0,0,0,0)", width: 2.5 },
        },
        ...(hasReferenceLine.value
          ? [
              {
                label: props.referenceLine?.label ?? "Reference",
                stroke: props.referenceLine?.color ?? "#9a7b24",
                width: 2,
                dash: [8, 4],
                points: { show: false },
              },
            ]
          : []),
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
          splits: () => xSplits,
          values: (_u, splits) => splits.map((value) => formatDay(value)),
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
            const ctx = u.ctx;
            const { left, top, width } = u.bbox;
            const dpr = window.devicePixelRatio || 1;

            ctx.save();

            const fontSize = Math.round(11 * dpr);
            ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
            ctx.textAlign = "center";

            const pad = Math.round(8 * dpr);
            const bgPadX = Math.round(3 * dpr);
            const bgPadY = Math.round(2 * dpr);

            for (let i = 0; i < xValues.length; i++) {
              const yVal = yValues[i];
              if (yVal === null) continue;

              const label = formatYAxisValue(yVal);
              const textW = ctx.measureText(label).width;
              const textH = fontSize;

              const rawPx = u.valToPos(xValues[i], "x", true);
              const py = u.valToPos(yVal, "y", true);

              // Clamp x so label stays inside plot area
              const clampedPx = Math.max(
                left + textW / 2 + bgPadX,
                Math.min(left + width - textW / 2 - bgPadX, rawPx),
              );

              const abovePoint = py - top > pad + textH + bgPadY * 2;
              const textY = abovePoint ? py - pad : py + pad;
              ctx.textBaseline = abovePoint ? "bottom" : "top";

              const bgX = clampedPx - textW / 2 - bgPadX;
              const bgY = abovePoint ? textY - textH - bgPadY : textY - bgPadY;
              const bgW = textW + bgPadX * 2;
              const bgH = textH + bgPadY * 2;

              // Background pill for legibility
              ctx.fillStyle = "rgba(15, 20, 30, 0.72)";
              ctx.beginPath();
              ctx.roundRect(bgX, bgY, bgW, bgH, Math.round(3 * dpr));
              ctx.fill();

              ctx.fillStyle = "#7ecfe0";
              ctx.fillText(label, clampedPx, textY);
            }

            ctx.restore();
          },
        ],
      },
    },
    hasReferenceLine.value ? [xValues, yValues, referenceValues] : [xValues, yValues],
    chartRef.value,
  );
}

function normalizeTimestamp(value: number) {
  return value > 1e12 ? Math.floor(value / 1000) : value;
}

function formatDay(value: number) {
  return dateFormatter.value.format(new Date(value * 1000));
}

function formatYAxisValue(value: number) {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return rounded;
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
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.destroy();
});
</script>

<template>
  <div class="chart-shell" dir="ltr">
    <div class="chart-stage">
      <span v-if="yUnit" class="axis-unit">{{ yUnit }}</span>
      <div ref="chartRef" class="chart"></div>
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
  inset-inline-start: 8px;
  inset-block-start: 6px;
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

.chart :deep(.u-legend) {
  display: none;
}

@media (max-width: 640px) {
  .hover-readout {
    max-inline-size: min(180px, calc(100% - 12px));
  }
}
</style>
