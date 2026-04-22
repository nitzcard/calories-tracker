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
const hoverPointPosition = ref({ x: 0, y: 0 });
const isPanning = ref(false);
const isZooming = ref(false);
const activePointerId = ref<number | null>(null);
const isTouchInteraction = ref(false);
const plottedXValues = ref<number[]>([]);
const plottedYValues = ref<Array<number | null>>([]);
const panStartX = ref(0);
const panStartScale = ref<{ min: number; max: number } | null>(null);
const zoomStartScale = ref<{ min: number; max: number } | null>(null);
const zoomStartCenter = ref<number | null>(null);
const zoomStartDistance = ref<number | null>(null);
const currentXScale = ref<{ min: number; max: number } | null>(null);
let chart: uPlot | undefined;
let resizeObserver: ResizeObserver | undefined;
let touchHideTimer: number | undefined;

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
  props.points
    .map((point) => ({
      x: normalizeTimestamp(point.x),
      y: point.y,
    }))
    .sort((left, right) => left.x - right.x),
);
const trendlineValues = computed(() =>
  activeTrendline.value ? buildTrendlineValues(normalizedPoints.value) : [],
);
const hoveredPoint = computed(() =>
  hoverIndex.value === null ? null : normalizedPoints.value[hoverIndex.value] ?? null,
);
const weekBoundaryLegendLabel = computed(() => (props.locale === "he" ? "גבול שבוע" : "Week boundary"));
const hasWeekBoundaries = computed(() =>
  buildWeekBoundarySplits(uniqueSorted(normalizedPoints.value.map((point) => point.x))).length > 0,
);
const primarySeriesColor = "#0a88a3";
const chartAxisFont = "600 13px system-ui, sans-serif";

function renderChart() {
  if (!chartRef.value || props.points.length === 0) {
    hoverIndex.value = null;
    chart?.destroy();
    chart = undefined;
    currentXScale.value = null;
    return;
  }

  const xValues = normalizedPoints.value.map((point) => point.x);
  const yValues = normalizedPoints.value.map((point) => point.y ?? null);
  const renderableXValues = uniqueSorted(
    normalizedPoints.value
      .filter((point): point is { x: number; y: number } => typeof point.y === "number")
      .map((point) => point.x),
  );
  plottedXValues.value = xValues;
  plottedYValues.value = yValues;
  const trendValues = trendlineValues.value;
  const xSplits = uniqueSorted(xValues);
  const weekBoundarySplits = buildWeekBoundarySplits(xSplits);
  const referenceValuesList = activeReferenceLines.value.map((line) => xValues.map(() => line.value ?? null));
  const allYValues = hasReferenceLines.value
    ? [...yValues, ...trendValues, ...referenceValuesList.flatMap((values) => values as Array<number | null>)]
    : [...yValues, ...trendValues];
  const allSeriesValues = [yValues, ...(trendValues.length ? [trendValues] : []), ...referenceValuesList];

  const chartWidth = chartRef.value?.clientWidth || 320;
  const domainMin = xSplits[0] ?? 0;
  const domainMax = xSplits[xSplits.length - 1] ?? domainMin;
  const initialWindow = buildInitialXWindow(xSplits, chartWidth);
  const minimumXWindowSpan = getMinimumXWindowSpan(renderableXValues);
  currentXScale.value = currentXScale.value
    ? normalizeXWindow(currentXScale.value, renderableXValues, domainMin, domainMax, minimumXWindowSpan)
    : normalizeXWindow(initialWindow, renderableXValues, domainMin, domainMax, minimumXWindowSpan);

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
          stroke: primarySeriesColor,
          width: 2,
          spanGaps: true,
          points: { size: 8, stroke: primarySeriesColor, fill: primarySeriesColor, width: 2 },
        },
        ...(activeTrendline.value
          ? [
              {
                label: activeTrendline.value.label,
                stroke: activeTrendline.value.color ?? "#5e4aa8",
                width: 3,
                spanGaps: true,
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
          range: () => buildVisibleYRange(xValues, allSeriesValues, yValues, allYValues),
        },
      },
      axes: [
        {
          font: chartAxisFont,
          stroke: "#5f5a4f",
          grid: { stroke: "rgba(95, 90, 79, 0.18)" },
          splits: (u) => buildVisibleXAxisSplits(u, xSplits, chartWidth),
          values: (_u, splits) => splits.map((value) => formatAxisDay(value)),
        },
        {
          font: chartAxisFont,
          stroke: "#5f5a4f",
          grid: { stroke: "rgba(95, 90, 79, 0.14)" },
          values: (_u, splits) => splits.map((value) => formatYAxisValue(value)),
        },
      ],
      hooks: {
        draw: [
          (u) => {
            if (!weekBoundarySplits.length) {
              drawPointValueLabels(u, xValues, yValues);
              return;
            }

            const ctx = u.ctx;
            ctx.save();

            for (const split of weekBoundarySplits) {
              const x = Math.round(u.valToPos(split, "x", true)) + 0.5;
              ctx.beginPath();
              ctx.strokeStyle = "rgba(196, 188, 172, 0.82)";
              ctx.lineWidth = 2;
              ctx.setLineDash([]);
              ctx.moveTo(x, u.bbox.top);
              ctx.lineTo(x, u.bbox.top + u.bbox.height);
              ctx.stroke();
            }
            ctx.restore();

            drawPointValueLabels(u, xValues, yValues);
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
            const distanceThreshold = isTouchInteraction.value ? 28 : 18;

            if (distance > distanceThreshold) {
              hoverIndex.value = null;
              return;
            }

            hoverIndex.value = idx;
            hoverPointPosition.value = { x: pointX, y: pointY };
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

function formatPointValue(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  return formatYAxisValue(value);
}

function updateHoverFromTouch(event: PointerEvent) {
  if (!chartRef.value || !chart || !plottedXValues.value.length) {
    hoverIndex.value = null;
    return;
  }

  const rect = chartRef.value.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let idx = 0; idx < plottedXValues.value.length; idx += 1) {
    const yValue = plottedYValues.value[idx];
    if (yValue === null || yValue === undefined) {
      continue;
    }

    const pointX = chart.valToPos(plottedXValues.value[idx], "x", true);
    const pointY = chart.valToPos(yValue, "y", true);
    const distance = Math.hypot(pointX - cursorX, pointY - cursorY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = idx;
    }
  }

  if (bestIndex === null || bestDistance > 28) {
    hoverIndex.value = null;
    return;
  }

  const yValue = plottedYValues.value[bestIndex];
  if (yValue === null || yValue === undefined) {
    hoverIndex.value = null;
    return;
  }

  const pointX = chart.valToPos(plottedXValues.value[bestIndex], "x", true);
  const pointY = chart.valToPos(yValue, "y", true);
  hoverIndex.value = bestIndex;
  hoverPointPosition.value = {
    x: Math.min(Math.max(pointX, chart.bbox.left + 22), chart.bbox.left + chart.bbox.width - 22),
    y: Math.max(pointY - 26, 8),
  };
  hoverPosition.value = {
    x: Math.min(Math.max(pointX + 10, 8), chart.bbox.left + chart.bbox.width - 150),
    y: Math.max(pointY - 54, 8),
  };
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

function buildVisibleYRange(
  xValues: number[],
  seriesValues: Array<Array<number | null>>,
  primaryValues: Array<number | null>,
  fallbackValues: Array<number | null>,
): [number, number] {
  const currentWindow = currentXScale.value ?? getXDomain();
  const visibleValues: number[] = [];

  for (let index = 0; index < xValues.length; index += 1) {
    const x = xValues[index];
    if (x < currentWindow.min || x > currentWindow.max) {
      continue;
    }

    for (const values of seriesValues) {
      const value = values[index];
      if (typeof value === "number") {
        visibleValues.push(value);
      }
    }
  }

  if (visibleValues.length) {
    return buildYRange(visibleValues);
  }

  return buildYRange(primaryValues, fallbackValues);
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

  if (event.pointerType === "touch") {
    if (touchHideTimer) {
      window.clearTimeout(touchHideTimer);
      touchHideTimer = undefined;
    }
    isTouchInteraction.value = true;
    trackTouchPointer(event);
    if (activeTouchPointers.size >= 2) {
      startTouchZoom();
    } else {
      updateHoverFromTouch(event);
    }
    return;
  }

  isTouchInteraction.value = false;
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
  currentXScale.value = normalizeXWindow(
    panStartScale.value,
    getRenderableXValues(),
    domain.min,
    domain.max,
    getMinimumXWindowSpan(),
  );
}

function onPanPointerMove(event: PointerEvent) {
  if (event.pointerType === "touch") {
    trackTouchPointer(event);
    if (zoomStartScale.value && activeTouchPointers.size >= 2) {
      updateTouchZoom();
    } else {
      updateHoverFromTouch(event);
    }
    return;
  }

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
  const nextRange = normalizeXWindow(
    {
      min: panStartScale.value.min - shift,
      max: panStartScale.value.max - shift,
    },
    getRenderableXValues(),
    domain.min,
    domain.max,
    getMinimumXWindowSpan(),
  );

  currentXScale.value = nextRange;
  chart.setScale("x", nextRange);
}

function onPanPointerUp(event: PointerEvent) {
  if (event.pointerType === "touch") {
    releaseTouchPointer(event);
    isTouchInteraction.value = false;
    if (activeTouchPointers.size < 2) {
      zoomStartScale.value = null;
      zoomStartCenter.value = null;
      zoomStartDistance.value = null;
      isZooming.value = false;
    }
    if (touchHideTimer) {
      window.clearTimeout(touchHideTimer);
    }

    touchHideTimer = window.setTimeout(() => {
      hoverIndex.value = null;
      touchHideTimer = undefined;
    }, 1200);
    return;
  }

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

function onWheel(event: WheelEvent) {
  if (!chartRef.value || !chart || props.points.length < 2) {
    return;
  }

  event.preventDefault();
  const plotX = event.clientX - chartRef.value.getBoundingClientRect().left - chart.bbox.left;
  const center = chart.posToVal(Math.min(Math.max(plotX, 0), chart.bbox.width), "x");
  const horizontalDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : 0;

  if (horizontalDelta !== 0) {
    panXWindow(horizontalDelta);
    return;
  }

  const delta = Math.max(-120, Math.min(120, event.deltaY));
  const factor = delta > 0 ? 1.15 : 0.87;
  zoomXWindow(factor, center);
}

function panXWindow(deltaPx: number) {
  if (!chartRef.value || !chart || props.points.length < 2) {
    return;
  }

  const current = currentXScale.value ?? getXDomain();
  const visibleSpan = Math.max(1, current.max - current.min);
  if (chart.bbox.width <= 0) {
    return;
  }

  const secondsPerPx = visibleSpan / chart.bbox.width;
  const shift = deltaPx * secondsPerPx;
  applyXWindow({
    min: current.min - shift,
    max: current.max - shift,
  });
}

function zoomXWindow(factor: number, centerValue?: number) {
  if (!chartRef.value || !chart || props.points.length < 2) {
    return;
  }

  const domain = getXDomain();
  const current = currentXScale.value ?? buildInitialXWindow(normalizedPoints.value.map((point) => point.x), chartRef.value.clientWidth || 320);
  const center = centerValue ?? (current.min + current.max) / 2;
  const currentSpan = Math.max(1, current.max - current.min);
  const nextSpan = Math.max(getMinimumXWindowSpan(), currentSpan * factor);
  const nextRange = clampXWindow(
    {
      min: center - nextSpan / 2,
      max: center + nextSpan / 2,
    },
    domain.min,
    domain.max,
    getMinimumXWindowSpan(),
  );

  applyXWindow(nextRange);
}

function applyXWindow(range: { min: number; max: number }) {
  if (!chart) {
    return;
  }

  const domain = getXDomain();
  const next = normalizeXWindow(
    range,
    getRenderableXValues(),
    domain.min,
    domain.max,
    getMinimumXWindowSpan(),
  );
  currentXScale.value = next;
  chart.setScale("x", next);
}

const activeTouchPointers = new Map<number, { x: number; y: number }>();

function trackTouchPointer(event: PointerEvent) {
  activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
}

function releaseTouchPointer(event: PointerEvent) {
  activeTouchPointers.delete(event.pointerId);
}

function startTouchZoom() {
  if (!chartRef.value || !chart || activeTouchPointers.size < 2) {
    return;
  }

  const [first, second] = Array.from(activeTouchPointers.values());
  const current = currentXScale.value ?? getXDomain();
  zoomStartScale.value = { min: current.min, max: current.max };
  zoomStartDistance.value = Math.max(8, Math.abs(first.x - second.x));
  zoomStartCenter.value = touchCenterValue(first.x, second.x);
  isZooming.value = true;
}

function updateTouchZoom() {
  if (
    !chartRef.value ||
    !chart ||
    !zoomStartScale.value ||
    zoomStartCenter.value == null ||
    zoomStartDistance.value == null ||
    activeTouchPointers.size < 2
  ) {
    return;
  }

  const [first, second] = Array.from(activeTouchPointers.values());
  const distance = Math.max(8, Math.abs(first.x - second.x));
  const domain = getXDomain();
  const startSpan = Math.max(1, zoomStartScale.value.max - zoomStartScale.value.min);
  const currentSpan = Math.max(getMinimumXWindowSpan(), startSpan * (zoomStartDistance.value / distance));
  const nextRange = clampXWindow(
    {
      min: zoomStartCenter.value - currentSpan / 2,
      max: zoomStartCenter.value + currentSpan / 2,
    },
    domain.min,
    domain.max,
    getMinimumXWindowSpan(),
  );

  applyXWindow(nextRange);
}

function touchCenterValue(clientX1: number, clientX2: number) {
  if (!chartRef.value || !chart) {
    return (getXDomain().min + getXDomain().max) / 2;
  }

  const rect = chartRef.value.getBoundingClientRect();
  const midpoint = (clientX1 + clientX2) / 2 - rect.left - chart.bbox.left;
  return chart.posToVal(midpoint, "x");
}

function drawPointValueLabels(u: uPlot, xValues: number[], yValues: Array<number | null>) {
  const points = xValues
    .map((x, index) => ({ x, y: yValues[index] }))
    .filter((point): point is { x: number; y: number } => typeof point.y === "number");

  if (!points.length) {
    return;
  }

  const visiblePoints = points
    .map((point) => ({
      x: u.valToPos(point.x, "x", true),
      y: u.valToPos(point.y, "y", true),
      value: point.y,
    }))
    .filter((point) => point.x >= u.bbox.left && point.x <= u.bbox.left + u.bbox.width)
    .sort((left, right) => left.x - right.x);

  const zoomLevel = getZoomLevel(u);
  const fontSize = getPointLabelFontSize(visiblePoints, zoomLevel);
  const selectedPoints = selectPointLabels(visiblePoints, zoomLevel);

  const ctx = u.ctx;
  ctx.save();
  ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = "#0891b2";
  ctx.strokeStyle = "rgba(11, 18, 32, 0.35)";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  for (const point of selectedPoints) {
    const label = formatYAxisValue(point.value);
    const labelWidth = ctx.measureText(label).width;
    const gap = Math.max(4, Math.round(fontSize * 0.45));
    const placeRight = point.x + gap + labelWidth + 4 <= u.bbox.left + u.bbox.width - 4;
    const x = placeRight ? point.x + gap : Math.max(u.bbox.left + 4, point.x - gap - labelWidth - 4);
    const placeAbove = point.y - gap >= u.bbox.top + 8;
    const y = placeAbove ? point.y - gap : point.y + gap;

    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  }

  ctx.restore();
}

function getPointLabelFontSize(points: Array<{ x: number; y: number }>, zoomLevel: number) {
  if (points.length === 1) {
    return clampNumber(Math.round(20 * Math.min(1.45, zoomLevel)), 18, 28);
  }

  const minimumGap = points.slice(1).reduce((smallest, point, index) => {
    const previous = points[index];
    return Math.min(smallest, Math.abs(point.x - previous.x));
  }, Number.POSITIVE_INFINITY);

  const zoomBoost = Math.max(0, zoomLevel - 1) * 4;
  return clampNumber(Math.round(16 + minimumGap / 20 + zoomBoost), 16, 28);
}

function selectPointLabels(points: Array<{ x: number; y: number; value: number }>, zoomLevel: number) {
  if (points.length <= 1) {
    return points;
  }

  if (zoomLevel >= 2.5) {
    return points;
  }

  const maxLabels = zoomLevel < 1.2 ? 6 : zoomLevel < 1.8 ? 9 : 12;
  const selected: Array<{ x: number; y: number; value: number }> = [];
  const slot = Math.max(1, Math.ceil(points.length / maxLabels));

  for (let index = 0; index < points.length; index += 1) {
    if (index === 0 || index === points.length - 1 || index % slot === 0) {
      selected.push(points[index]);
    }
  }

  return selected;
}

function getZoomLevel(u: uPlot) {
  const domain = getXDomain();
  const domainSpan = Math.max(1, domain.max - domain.min);
  const visibleSpan = Math.max(1, (u.scales.x.max ?? domain.max) - (u.scales.x.min ?? domain.min));
  return clampNumber(domainSpan / visibleSpan, 1, 4);
}

function getXDomain() {
  const xValues = normalizedPoints.value.map((point) => point.x).sort((a, b) => a - b);
  const min = xValues[0] ?? 0;
  const max = xValues[xValues.length - 1] ?? min;
  return { min, max };
}

function getRenderableXValues() {
  return uniqueSorted(
    normalizedPoints.value
      .filter((point): point is { x: number; y: number } => typeof point.y === "number")
      .map((point) => point.x),
  );
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

function buildVisibleXAxisSplits(u: uPlot, xValues: number[], chartWidth: number) {
  const scaleMin = u.scales.x.min ?? xValues[0] ?? 0;
  const scaleMax = u.scales.x.max ?? xValues[xValues.length - 1] ?? scaleMin;
  const visible = xValues.filter((value) => value >= scaleMin && value <= scaleMax);
  if (visible.length <= 1) {
    return visible;
  }

  const maxXLabels = Math.max(3, Math.floor(chartWidth / 52));
  const thinFactor = Math.max(1, Math.ceil(visible.length / maxXLabels));
  const splits = visible.filter((_, idx) => idx % thinFactor === 0);
  const lastVisible = visible[visible.length - 1];
  if (splits[splits.length - 1] !== lastVisible) {
    splits.push(lastVisible);
  }
  return splits;
}

function clampXWindow(range: { min: number; max: number }, domainMin: number, domainMax: number, minSpan = 1) {
  const requestedSpan = Math.max(1, range.max - range.min);
  const domainSpan = Math.max(1, domainMax - domainMin);
  const windowSpan = Math.min(domainSpan, Math.max(minSpan, requestedSpan));
  if (windowSpan >= domainSpan) {
    return { min: domainMin, max: domainMax };
  }

  const center = (range.min + range.max) / 2;
  let min = center - windowSpan / 2;
  let max = center + windowSpan / 2;

  if (min < domainMin) {
    min = domainMin;
    max = domainMin + windowSpan;
  }

  if (max > domainMax) {
    max = domainMax;
    min = domainMax - windowSpan;
  }

  return { min, max };
}

function normalizeXWindow(
  range: { min: number; max: number },
  xValues: number[],
  domainMin: number,
  domainMax: number,
  minSpan = 1,
) {
  const clamped = clampXWindow(range, domainMin, domainMax, minSpan);
  return ensureRenderableXWindow(clamped, xValues, domainMin, domainMax, minSpan);
}

function ensureRenderableXWindow(
  range: { min: number; max: number },
  xValues: number[],
  domainMin: number,
  domainMax: number,
  minSpan = 1,
) {
  const sorted = uniqueSorted(xValues);
  if (sorted.length < 2) {
    return range;
  }

  if (sorted.length === 2) {
    const left = sorted[0];
    const right = sorted[1];
    const pad = Math.max(Math.round((right - left) * 0.2), 12 * 60 * 60);

    return clampXWindow(
      {
        min: left - pad,
        max: right + pad,
      },
      domainMin,
      domainMax,
      Math.max(minSpan, right - left),
    );
  }

  const visible = sorted.filter((value) => value >= range.min && value <= range.max);
  if (visible.length >= Math.min(3, sorted.length)) {
    return range;
  }

  const center = (range.min + range.max) / 2;
  let anchorIndex = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    if (Math.abs(sorted[index] - center) < Math.abs(sorted[anchorIndex] - center)) {
      anchorIndex = index;
    }
  }

  const startIndex = Math.max(0, Math.min(anchorIndex - 1, sorted.length - 3));
  const endIndex = Math.min(sorted.length - 1, startIndex + 2);
  const left = sorted[startIndex];
  const right = sorted[endIndex];
  const pad = Math.max(Math.round((right - left) * 0.2), 12 * 60 * 60);

  return clampXWindow(
    {
      min: left - pad,
      max: right + pad,
    },
    domainMin,
    domainMax,
    Math.max(minSpan, right - left),
  );
}

function getMinimumXWindowSpan(xValues = getRenderableXValues()) {
  const sorted = uniqueSorted(xValues);
  if (sorted.length < 2) {
    return 24 * 60 * 60;
  }

  let smallestGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index] - sorted[index - 1];
    if (gap > 0 && gap < smallestGap) {
      smallestGap = gap;
    }
  }

  if (!Number.isFinite(smallestGap)) {
    return 24 * 60 * 60;
  }

  // Keep enough horizontal room for at least neighboring points so the series
  // still renders as a line instead of collapsing to a single visible point.
  return Math.max(24 * 60 * 60, Math.round(smallestGap * 2.1));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  if (touchHideTimer) {
    window.clearTimeout(touchHideTimer);
    touchHideTimer = undefined;
  }
  activeTouchPointers.clear();
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
      >{{ yUnit }}</span>
      <div
        ref="chartRef"
        class="chart"
        :class="{ 'is-panning': isPanning, 'is-zooming': isZooming }"
        @pointerdown="onPanPointerDown"
        @pointermove="onPanPointerMove"
        @pointerup="onPanPointerUp"
        @pointercancel="onPanPointerUp"
        @wheel.prevent="onWheel"
      ></div>
      <div
        v-if="hoveredPoint"
        class="hover-point-value"
        :style="{
          insetInlineStart: `${hoverPointPosition.x}px`,
          insetBlockStart: `${hoverPointPosition.y}px`,
        }"
      >
        {{ formatPointValue(hoveredPoint.y) }}
      </div>
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
      <div v-if="hasWeekBoundaries" class="legend-row">
        <span class="legend-swatch legend-swatch--week" aria-hidden="true"></span>
        <span class="legend-label">{{ weekBoundaryLegendLabel }}</span>
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
  inset-inline-start: 10px;
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

.hover-point-value {
  position: absolute;
  z-index: 4;
  transform: translateX(-50%);
  padding: 2px 7px;
  border: 1px solid var(--border-strong);
  background: color-mix(in srgb, var(--surface-2) 88%, black 12%);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  border-radius: 999px;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 2px 6px color-mix(in srgb, black 25%, transparent);
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

.legend-swatch--week {
  inline-size: 18px;
  block-size: 0;
  border-top: 2px solid currentColor;
  color: rgba(196, 188, 172, 0.95);
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
