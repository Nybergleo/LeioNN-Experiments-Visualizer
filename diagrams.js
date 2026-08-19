"use strict";

const DIAGRAM_DATA_ROOT = "data/site-data/";
const DIAGRAM_DATA_VERSION = "20260803-reversed-shortcuts-0";
const DIAGRAM_ALLOWED_SEARCH_METHODS = new Set(["greedySearch", "Full centroid", "Partial centroid"]);
const DIAGRAM_DEFAULT_MODE = "ours";
const PLOT_SPECS = [
  ["recall_qps", "Recall/Queries per second (1/s)", "recall", "qps", "Recall", "Queries per second (1/s)", false, true],
  ["recall_build", "Recall/Build time (s)", "recall", "build_time_s", "Recall", "Build time (s)", false, true],
  ["recall_distcomps", "Recall/Distance computations", "recall", "avg_dist_cmps", "Recall", "Distance computations", false, true],
  ["relative_error_qps", "Relative Error/Queries per second (1/s)", "relative_error", "qps", "Relative Error", "Queries per second (1/s)", true, true],
  ["recall_candidates", "Recall/Candidates generated", "recall", "candidates_generated", "Recall", "Candidates generated", false, true],
  ["epsilon_001_qps", "Epsilon 0.01 Recall/Queries per second (1/s)", "epsilon_recall_0_01", "qps", "Epsilon 0.01 Recall", "Queries per second (1/s)", false, true],
  ["epsilon_01_qps", "Epsilon 0.1 Recall/Queries per second (1/s)", "epsilon_recall_0_1", "qps", "Epsilon 0.1 Recall", "Queries per second (1/s)", false, true],
  ["recall_p50", "Recall/Percentile 50 (millis)", "recall", "p50_ms", "Recall", "Percentile 50 (ms)", false, true],
  ["recall_p95", "Recall/Percentile 95 (millis)", "recall", "p95_ms", "Recall", "Percentile 95 (ms)", false, true],
  ["recall_p99", "Recall/Percentile 99 (millis)", "recall", "p99_ms", "Recall", "Percentile 99 (ms)", false, true],
  ["recall_p999", "Recall/Percentile 99.9 (millis)", "recall", "p999_ms", "Recall", "Percentile 99.9 (ms)", false, true],
];
const ANN_PLOT_DESCRIPTIONS = {
  recall_qps: "Recall is the fraction of true nearest neighbors returned; QPS is completed queries per second. Best direction: upper right, meaning higher recall and higher throughput.",
  recall_build: "Recall is the fraction of true nearest neighbors returned; build time is the time needed to construct the index. Best direction: lower right, meaning higher recall with less construction time.",
  recall_distcomps: "Recall is the fraction of true nearest neighbors returned; distance computations count how many vector-distance evaluations the search performs. Best direction: lower right, meaning higher recall with less search work.",
  relative_error_qps: "Relative error compares the returned nearest distance with the exact nearest distance; lower is closer to exact. QPS is completed queries per second. Best direction: upper left, meaning lower error and higher throughput.",
  recall_candidates: "Recall is the fraction of true nearest neighbors returned; candidates generated counts how many candidate nodes the search produces. Best direction: lower right, meaning higher recall with fewer candidates.",
  epsilon_001_qps: "Epsilon 0.01 recall is the share of queries where the nearest returned result is within 1% of the exact nearest distance; QPS is completed queries per second. Best direction: upper right.",
  epsilon_01_qps: "Epsilon 0.1 recall is the share of queries where the nearest returned result is within 10% of the exact nearest distance; QPS is completed queries per second. Best direction: upper right.",
  recall_p50: "Recall is the fraction of true nearest neighbors returned; P50 latency is the median query time. Best direction: lower right, meaning higher recall with lower typical latency.",
  recall_p95: "Recall is the fraction of true nearest neighbors returned; P95 latency is the query time below which 95% of queries finish. Best direction: lower right, meaning higher recall with lower tail latency.",
  recall_p99: "Recall is the fraction of true nearest neighbors returned; P99 latency is the query time below which 99% of queries finish. Best direction: lower right, meaning higher recall with lower rare-slow-query latency.",
  recall_p999: "Recall is the fraction of true nearest neighbors returned; P99.9 latency is the query time below which 99.9% of queries finish. Best direction: lower right, meaning higher recall with lower extreme-tail latency.",
};
const OUR_EXPERIMENT_PLOT_SPECS = [
  ["recall_mean_latency", "Recall/Mean latency", "recall", "mean_latency_ms", "Recall", "Mean latency (ms)", false, true],
  ["recall_mean_extra_expanded_after_top_10", "Recall/Mean extra expanded work after top-10 found", "recall", "mean_extra_expanded_after_returned_top_10_expanded", "Recall", "Mean extra expanded nodes after top-10 found", false, true],
  ["recall_max_expanded_at_1", "Recall/Max preceding expanded count at 1", "recall", "max_preceding_expanded_count_at_1", "Recall", "Max preceding expanded count at 1", false, true],
  ["recall_max_expanded_top_10", "Recall/Max preceding expanded count top 10", "recall", "max_preceding_expanded_count_top_10", "Recall", "Max preceding expanded count top 10", false, true],
];
const OUR_EXPERIMENT_PLOT_DESCRIPTIONS = {
  full_centroid_recall_ratio: "This compares each method against Full centroid at the same graph, K, L, and repetition. Best direction: closest to 1.0; values above 1 mean Full centroid had higher recall, and values below 1 mean the plotted method had higher recall.",
  recall_mean_latency: "Recall is the fraction of true nearest neighbors returned; mean latency is average query time. Best direction: lower right, meaning higher recall with lower average latency.",
  recall_mean_extra_expanded_after_top_10: "This is the mean number of additional expansions after all returned top-10 nodes had already been expanded in the native trace. Best direction: lower right, meaning higher recall with less extra expansion after the returned top-10 is already expanded.",
  recall_max_expanded_at_1: "This is the maximum number of nodes expanded before the returned rank-1 node was expanded. Best direction: lower right, meaning higher recall with less worst-case expansion before the returned first result is expanded.",
  recall_max_expanded_top_10: "This is the maximum, over returned top-10 results, of how many nodes were expanded before that returned result was expanded. Best direction: lower right, meaning higher recall with less worst-case expansion before returned top-10 nodes are expanded.",
};
const DIAGRAM_PLOT_DESCRIPTIONS = {
  ...ANN_PLOT_DESCRIPTIONS,
  ...OUR_EXPERIMENT_PLOT_DESCRIPTIONS,
};

const diagramState = {
  rows: [],
  schema: {},
  recallMetric: "",
  selectedDatasetId: "",
  selectedMode: DIAGRAM_DEFAULT_MODE,
  hideExperimentalSearchMethods: true,
};
const diagramPlots = document.getElementById("diagram-plots");
const diagramCount = document.getElementById("diagram-count");
const diagramStatus = document.getElementById("diagram-status");
const diagramDataset = document.getElementById("diagram-dataset");
const diagramModeButtons = document.querySelectorAll("[data-diagram-mode]");
const diagramHideExperimental = document.getElementById("diagram-hide-experimental");

function diagramCleanMetric(name) { return name.replace(/^mean_mean_/, "").replace(/^mean_/, ""); }
function diagramEscape(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]); }
function diagramSort(values) {
  return [...values].sort((a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) ? Number(a) - Number(b) : String(a).localeCompare(String(b)));
}
function diagramNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function diagramMetricValue(row, field) {
  if (field === "recall") return diagramNumber(row[diagramState.recallMetric] ?? row.recall_at_10 ?? row.recall_at_5 ?? row.recall);
  return diagramNumber(row[field]);
}
function diagramNormalizeRows(source) {
  return source.map((row) => {
    const parameters = row.parameters || {};
    const metrics = row.metrics || {};
    const item = {
      ...parameters,
      ...metrics,
      row_id: row.measurement_id || row.aggregate_id || row.search_run_id,
      dataset_id: row.dataset_id,
      dataset_label: row.dataset_label || row.dataset_id,
      construction_method: row.construction_method,
      search_method: row.search_method,
      search_method_label: row.search_method_label || row.search_method,
      build_time_s: row.build_time_s,
    };
    if (item.mean_mean_latency_us !== undefined && item.mean_latency_us === undefined) item.mean_latency_us = item.mean_mean_latency_us;
    if (item.mean_latency_us !== undefined && item.mean_latency_ms === undefined) item.mean_latency_ms = diagramNumber(item.mean_latency_us) / 1000;
    if (item.mean_avg_dist_cmps !== undefined && item.avg_dist_cmps === undefined) item.avg_dist_cmps = item.mean_avg_dist_cmps;
    if (item.mean_recall_at_10 !== undefined && item.recall_at_10 === undefined) item.recall_at_10 = item.mean_recall_at_10;
    if (item.mean_recall_at_5 !== undefined && item.recall_at_5 === undefined) item.recall_at_5 = item.mean_recall_at_5;
    if (item.mean_recall !== undefined && item.recall === undefined) item.recall = item.mean_recall;
    if (item.p50_latency_us !== undefined && item.p50_ms === undefined) item.p50_ms = diagramNumber(item.p50_latency_us) / 1000;
    if (item.p95_latency_us !== undefined && item.p95_ms === undefined) item.p95_ms = diagramNumber(item.p95_latency_us) / 1000;
    if (item.p99_latency_us !== undefined && item.p99_ms === undefined) item.p99_ms = diagramNumber(item.p99_latency_us) / 1000;
    if (item.p999_latency_us !== undefined && item.p999_ms === undefined) item.p999_ms = diagramNumber(item.p999_latency_us) / 1000;
    return item;
  });
}

function diagramRecallCandidates() {
  const names = new Set();
  diagramState.rows.forEach((row) => Object.keys(row).forEach((key) => {
    const clean = diagramCleanMetric(key);
    if (clean === "recall" || clean.startsWith("recall_at_")) names.add(key);
  }));
  return [...names].sort((a, b) => diagramDisplayMetric(a).localeCompare(diagramDisplayMetric(b)));
}
function diagramDisplayMetric(name) {
  const clean = diagramCleanMetric(name);
  if (clean === "recall") return "Recall";
  if (clean.startsWith("recall_at_")) return `Recall@${clean.replace("recall_at_", "")}`;
  return clean;
}
function diagramAvailableSpecs(rows) {
  return PLOT_SPECS.filter(([, , x, y]) => rows.some((row) => diagramMetricValue(row, x) !== null && diagramMetricValue(row, y) !== null));
}

function diagramDatasetOptions() {
  const labels = new Map();
  diagramState.rows.forEach((row) => labels.set(row.dataset_id, row.dataset_label || row.dataset_id));
  return [...labels.entries()]
    .map(([datasetId, datasetLabel]) => ({ datasetId, datasetLabel }))
    .sort((left, right) => left.datasetLabel.localeCompare(right.datasetLabel));
}
function diagramRenderModeButtons() {
  diagramModeButtons.forEach((button) => {
    const isActive = button.dataset.diagramMode === diagramState.selectedMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}
function diagramRenderDatasetSelector() {
  diagramDataset.replaceChildren();
  diagramDatasetOptions().forEach(({ datasetId, datasetLabel }) => {
    diagramDataset.add(new Option(datasetLabel, datasetId, false, datasetId === diagramState.selectedDatasetId));
  });
}
function diagramEnsureSelectedDataset() {
  const options = diagramDatasetOptions();
  if (!options.some(({ datasetId }) => datasetId === diagramState.selectedDatasetId)) {
    diagramState.selectedDatasetId = options[0]?.datasetId || "";
  }
}
function diagramReset() {
  diagramState.recallMetric = diagramRecallCandidates().find((candidate) => diagramCleanMetric(candidate).startsWith("recall_at_")) || diagramRecallCandidates()[0] || "";
  diagramEnsureSelectedDataset();
  diagramRenderModeButtons();
  diagramRenderDatasetSelector();
  diagramRender();
}

function diagramFilteredRows() {
  return diagramState.rows.filter((row) => {
    if (!DIAGRAM_ALLOWED_SEARCH_METHODS.has(row.search_method)) return false;
    if (diagramState.hideExperimentalSearchMethods && diagramIsExperimentalSearchMethod(row)) return false;
    return row.dataset_id === diagramState.selectedDatasetId;
  });
}

function diagramTrace(row) {
  return `${row.construction_method || "Unknown construction"} / ${row.search_method_label || row.search_method || "Unknown search"}`;
}
function diagramIsExperimentalSearchMethod(row) {
  return String(row.search_method_label || "").toLowerCase().includes("max exp cap");
}
function diagramNormalizedConstruction(value) {
  return String(value || "").toLowerCase();
}
function diagramIsReversedShortcuts0(value) {
  const normalized = diagramNormalizedConstruction(value);
  return normalized.includes("reversed shortcuts 0");
}
function diagramIsDirectShortcut(row) {
  const construction = diagramNormalizedConstruction(row?.construction_method);
  return construction.includes("direct shortcut");
}
function diagramConstructionRank(value) {
  if (diagramIsReversedShortcuts0(value)) return 3;
  return {
    "Paper fast": 0,
    "Paper fast + shortcuts": 1,
    "Paper fast + shortcuts (Parallel)": 2,
  }[value] ?? 99;
}
function diagramSearchRank(value) {
  return {
    greedySearch: 0,
    "Full centroid": 1,
    "Partial centroid": 2,
  }[value] ?? 99;
}
function diagramTraceRank(point) {
  return [
    diagramConstructionRank(point.row.construction_method),
    diagramSearchRank(point.row.search_method),
    String(point.row.search_method_label || ""),
    String(point.trace),
  ];
}
function diagramCompareRank(left, right) {
  const leftRank = diagramTraceRank(left);
  const rightRank = diagramTraceRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] < rightRank[index]) return -1;
    if (leftRank[index] > rightRank[index]) return 1;
  }
  return 0;
}
function diagramPoints(rows, spec) {
  const [, , x, y] = spec;
  return rows.map((row) => ({ row, trace: diagramTrace(row), x: diagramMetricValue(row, x), y: diagramMetricValue(row, y) })).filter((point) => point.x !== null && point.y !== null);
}
function diagramFullCentroidKey(row) {
  return [row.graph_id, row.K, row.L, row.repetition].map((value) => String(value ?? "")).join("|");
}
function diagramRecallRatioPoints(rows) {
  const fullCentroidRecall = new Map();
  rows.forEach((row) => {
    if (row.search_method !== "Full centroid") return;
    const recall = diagramMetricValue(row, "recall");
    if (recall !== null) fullCentroidRecall.set(diagramFullCentroidKey(row), recall);
  });
  return rows
    .filter((row) => row.search_method !== "Full centroid")
    .map((row) => {
      const fullRecall = fullCentroidRecall.get(diagramFullCentroidKey(row));
      const methodRecall = diagramMetricValue(row, "recall");
      const lValue = diagramNumber(row.L);
      if (fullRecall === undefined || methodRecall === null || methodRecall === 0 || lValue === null) return null;
      return {
        fullRecall,
        methodRecall,
        row,
        trace: diagramTrace(row),
        x: lValue,
        y: fullRecall / methodRecall,
      };
    })
    .filter(Boolean);
}
function diagramColor(index) {
  return ["#146c43", "#2563eb", "#b45309", "#9333ea", "#dc2626", "#0f766e", "#475569"][index % 7];
}
function diagramIsShortcutCap42(row) {
  return row.dataset_id === "sift1m"
    && row.construction_method === "Paper fast + shortcuts"
    && String(row.search_method_label || "").includes("max exp cap 42");
}
function diagramSearchColor(searchMethod, row = {}) {
  if (diagramIsShortcutCap42(row)) return "#facc15";
  const colors = {
    greedySearch: "#1f77b4",
    "Full centroid": "#d62728",
    "Partial centroid": "#2ca02c",
  };
  return colors[searchMethod] || diagramColor(String(searchMethod || "").length);
}
function diagramConstructionSymbol(row) {
  const constructionMethod = row?.construction_method;
  if (diagramIsDirectShortcut(row)) return "star";
  if (diagramIsReversedShortcuts0(constructionMethod)) return "diamond";
  if (constructionMethod === "Paper fast + shortcuts (Parallel)") return "square";
  if (constructionMethod === "Paper fast + shortcuts") return "triangle-up";
  return "circle";
}
function diagramPlotlyTraces(rows, spec) {
  const points = diagramPoints(rows, spec);
  const traceSeeds = new Map();
  points.forEach((point) => {
    if (!traceSeeds.has(point.trace)) traceSeeds.set(point.trace, point);
  });
  const traces = [...traceSeeds.entries()].sort(([, left], [, right]) => diagramCompareRank(left, right));
  return traces.map(([trace]) => {
    const tracePoints = points.filter((point) => point.trace === trace).sort((a, b) => a.x - b.x);
    const first = tracePoints[0]?.row || {};
    const color = diagramSearchColor(first.search_method, first);
    const symbol = diagramConstructionSymbol(first);
    return {
      customdata: tracePoints.map((point) => [point.row.dataset_label, point.row.construction_method, point.row.search_method_label, point.row.L, point.row.K]),
      hovertemplate: [
        `<b>${diagramEscape(trace)}</b>`,
        "%{x:.5g}",
        "%{y:.5g}",
        "Dataset: %{customdata[0]}",
        "Construction: %{customdata[1]}",
        "Search: %{customdata[2]}",
        "L: %{customdata[3]}",
        "K: %{customdata[4]}",
        "<extra></extra>",
      ].join("<br>"),
      line: { color, width: 2 },
      marker: { color, size: 8, symbol },
      mode: "lines+markers",
      name: trace,
      type: "scatter",
      x: tracePoints.map((point) => point.x),
      y: tracePoints.map((point) => point.y),
    };
  });
}
function diagramRecallRatioTraces(rows) {
  const points = diagramRecallRatioPoints(rows);
  const traceSeeds = new Map();
  points.forEach((point) => {
    if (!traceSeeds.has(point.trace)) traceSeeds.set(point.trace, point);
  });
  const traces = [...traceSeeds.entries()].sort(([, left], [, right]) => diagramCompareRank(left, right));
  return traces.map(([trace]) => {
    const tracePoints = points.filter((point) => point.trace === trace).sort((a, b) => a.x - b.x);
    const first = tracePoints[0]?.row || {};
    const color = diagramSearchColor(first.search_method, first);
    const symbol = diagramConstructionSymbol(first);
    return {
      customdata: tracePoints.map((point) => [
        point.row.dataset_label,
        point.row.construction_method,
        point.row.search_method_label,
        point.row.L,
        point.row.K,
        point.fullRecall,
        point.methodRecall,
      ]),
      hovertemplate: [
        `<b>${diagramEscape(trace)}</b>`,
        "L: %{x}",
        "Full centroid / method recall: %{y:.5g}",
        "Dataset: %{customdata[0]}",
        "Construction: %{customdata[1]}",
        "Search: %{customdata[2]}",
        "K: %{customdata[4]}",
        "Full centroid recall: %{customdata[5]:.5g}",
        "Method recall: %{customdata[6]:.5g}",
        "<extra></extra>",
      ].join("<br>"),
      line: { color, width: 2 },
      marker: { color, size: 8, symbol },
      mode: "lines+markers",
      name: trace,
      type: "scatter",
      x: tracePoints.map((point) => point.x),
      y: tracePoints.map((point) => point.y),
    };
  });
}
function diagramPlotlyLayout(spec) {
  const [key, title, , , xLabel, yLabel, xLog, yLog] = spec;
  return {
    autosize: true,
    font: { color: "#3d4b43", family: "Inter, ui-sans-serif, system-ui, sans-serif", size: 12 },
    height: 350,
    hovermode: "closest",
    margin: { l: 62, r: 18, t: 18, b: 56 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    showlegend: false,
    title: { text: "" },
    xaxis: { title: xLabel, type: xLog ? "log" : "linear", gridcolor: "#dce3dd", zeroline: false },
    yaxis: { title: yLabel, type: yLog ? "log" : "linear", gridcolor: "#dce3dd", zeroline: false },
  };
}
function diagramRecallRatioLayout() {
  return {
    autosize: true,
    font: { color: "#3d4b43", family: "Inter, ui-sans-serif, system-ui, sans-serif", size: 12 },
    height: 350,
    hovermode: "closest",
    margin: { l: 72, r: 18, t: 18, b: 56 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    showlegend: false,
    shapes: [{
      line: { color: "#9aa7a0", dash: "dot", width: 1 },
      type: "line",
      x0: 0,
      x1: 1,
      xref: "paper",
      y0: 1,
      y1: 1,
      yref: "y",
    }],
    xaxis: { title: "L", type: "log", gridcolor: "#dce3dd", zeroline: false },
    yaxis: { title: "Full centroid recall / method recall", gridcolor: "#dce3dd", zeroline: false },
  };
}
function diagramPlotlyConfig() {
  return {
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: { format: "svg", filename: "diskann-diagram", height: 350, width: 760 },
  };
}
function diagramTraceSelector(plot, traces) {
  const selector = document.createElement("div");
  selector.className = "trace-selector";
  const groups = new Map();
  traces.forEach((trace, index) => {
    const construction = String(trace.customdata?.[0]?.[1] || "Unknown construction");
    const search = String(trace.customdata?.[0]?.[2] || "Unknown search");
    if (!groups.has(construction)) groups.set(construction, []);
    groups.get(construction).push({ trace, index, search });
  });

  groups.forEach((searches, construction) => {
    const group = document.createElement("div");
    group.className = "trace-selector-group";
    const constructionLabel = document.createElement("label");
    constructionLabel.className = "trace-construction";
    const constructionInput = document.createElement("input");
    const constructionText = document.createElement("span");
    constructionInput.type = "checkbox";
    constructionInput.checked = true;
    constructionText.className = "trace-construction-name";
    constructionText.textContent = construction;
    constructionLabel.append(constructionInput, constructionText);
    const searchControls = document.createElement("div");
    searchControls.className = "trace-searches";
    const searchInputs = [];

    function syncConstructionToggle() {
      const selectedCount = searchInputs.filter(({ input }) => input.checked).length;
      constructionInput.checked = selectedCount === searchInputs.length;
      constructionInput.indeterminate = selectedCount > 0 && selectedCount < searchInputs.length;
    }

    constructionInput.addEventListener("change", () => {
      searchInputs.forEach(({ input }) => {
        input.checked = constructionInput.checked;
      });
      Plotly.restyle(plot, { visible: constructionInput.checked ? true : "legendonly" }, searchInputs.map(({ index }) => index));
    });

    searches.forEach(({ trace, index, search }) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const swatch = document.createElement("span");
      input.type = "checkbox";
      input.checked = true;
      swatch.className = "trace-swatch";
      swatch.style.background = trace.marker.color;
      swatch.style.color = trace.marker.color;
      swatch.dataset.symbol = trace.marker.symbol;
      input.addEventListener("change", () => {
        Plotly.restyle(plot, { visible: input.checked ? true : "legendonly" }, [index]);
        syncConstructionToggle();
      });
      label.append(input, swatch, document.createTextNode(search));
      searchControls.append(label);
      searchInputs.push({ input, index });
    });
    group.append(constructionLabel, searchControls);
    selector.append(group);
  });
  return selector;
}
function diagramAddPlot(rows, spec) {
  const [key, title] = spec;
  const card = document.createElement("article");
  card.className = "plot-card";
  card.id = key;
  const heading = document.createElement("h2");
  heading.textContent = title;
  const description = DIAGRAM_PLOT_DESCRIPTIONS[key];
  const descriptionElement = document.createElement("p");
  if (description) {
    descriptionElement.className = "plot-description";
    descriptionElement.textContent = description;
  }
  const traces = diagramPlotlyTraces(rows, spec);
  if (!traces.length) {
    const unavailable = document.createElement("p");
    unavailable.className = "plot-unavailable";
    unavailable.textContent = "Not available in the current synced site-data. Regenerate upstream data with the required metric fields to populate this diagram.";
    card.append(heading);
    if (description) card.append(descriptionElement);
    card.append(unavailable);
    diagramPlots.append(card);
    return;
  }
  const plot = document.createElement("div");
  plot.className = "plotly-plot";
  const selector = diagramTraceSelector(plot, traces);
  card.append(heading);
  if (description) card.append(descriptionElement);
  card.append(selector, plot);
  diagramPlots.append(card);
  Plotly.newPlot(plot, traces, diagramPlotlyLayout(spec), diagramPlotlyConfig());
}
function diagramAddRecallRatioPlot(rows) {
  const card = document.createElement("article");
  card.className = "plot-card";
  card.id = "full_centroid_recall_ratio";
  const heading = document.createElement("h2");
  heading.textContent = "Full centroid recall / method recall by L";
  const description = OUR_EXPERIMENT_PLOT_DESCRIPTIONS.full_centroid_recall_ratio;
  const descriptionElement = document.createElement("p");
  descriptionElement.className = "plot-description";
  descriptionElement.textContent = description;
  const traces = diagramRecallRatioTraces(rows);
  if (!traces.length) {
    const unavailable = document.createElement("p");
    unavailable.className = "plot-unavailable";
    unavailable.textContent = "No matching Full centroid recall rows are available for this dataset.";
    card.append(heading, descriptionElement, unavailable);
    diagramPlots.append(card);
    return;
  }
  const plot = document.createElement("div");
  plot.className = "plotly-plot";
  const selector = diagramTraceSelector(plot, traces);
  card.append(heading, descriptionElement, selector, plot);
  diagramPlots.append(card);
  Plotly.newPlot(plot, traces, diagramRecallRatioLayout(), diagramPlotlyConfig());
}

function diagramRender() {
  const rows = diagramFilteredRows();
  diagramCount.textContent = `${rows.length.toLocaleString()} rows selected`;
  diagramPlots.replaceChildren();
  if (!window.Plotly) {
    diagramPlots.innerHTML = "<p class=\"empty\">Plotly.js could not be loaded. Check your internet connection or serve a local Plotly bundle.</p>";
    return;
  }
  if (!rows.length) {
    diagramPlots.innerHTML = "<p class=\"empty\">No rows are available for this dataset.</p>";
    return;
  }
  if (diagramState.selectedMode === "ours") {
    diagramAddRecallRatioPlot(rows);
    OUR_EXPERIMENT_PLOT_SPECS.forEach((spec) => diagramAddPlot(rows, spec));
    return;
  }
  PLOT_SPECS.forEach((spec) => diagramAddPlot(rows, spec));
}

async function diagramLoad() {
  try {
    const [measurementsResponse, schemaResponse] = await Promise.all([
      fetch(`${DIAGRAM_DATA_ROOT}measurements.json?v=${DIAGRAM_DATA_VERSION}`, { cache: "no-store" }),
      fetch(`${DIAGRAM_DATA_ROOT}schema.json?v=${DIAGRAM_DATA_VERSION}`, { cache: "no-store" }),
    ]);
    if (!measurementsResponse.ok) throw new Error("measurements.json could not be loaded");
    diagramState.rows = diagramNormalizeRows(await measurementsResponse.json());
    diagramState.schema = schemaResponse.ok ? await schemaResponse.json() : {};
    diagramStatus.textContent = "Static site-data loaded";
    diagramReset();
  } catch (error) {
    diagramStatus.textContent = "Unable to load site data. Run the sync script, then serve the docs folder.";
    diagramCount.textContent = "No data loaded";
    console.error(error);
  }
}

diagramDataset.addEventListener("change", () => {
  diagramState.selectedDatasetId = diagramDataset.value;
  diagramRender();
});
diagramModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    diagramState.selectedMode = button.dataset.diagramMode;
    diagramRenderModeButtons();
    diagramRender();
  });
});
diagramHideExperimental?.addEventListener("change", () => {
  diagramState.hideExperimentalSearchMethods = diagramHideExperimental.checked;
  diagramRender();
});
diagramLoad();
