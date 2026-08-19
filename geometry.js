"use strict";

const GEOMETRY_DATA_ROOT = "data/site-data/";
const GEOMETRY_DATA_VERSION = "20260803-path-frequency";

const geometryStatus = document.getElementById("geometry-status");
const geometrySummary = document.getElementById("geometry-summary");
const geometryDatasetPlots = [
  {
    datasetId: "sift1m",
    label: "SIFT1M",
    pathLengthFrequency: document.getElementById("sift-path-length-frequency"),
    degreeFrequency: document.getElementById("sift-degree-frequency"),
  },
  {
    datasetId: "gist1m",
    label: "GIST1M",
    pathLengthFrequency: document.getElementById("gist-path-length-frequency"),
    degreeFrequency: document.getElementById("gist-degree-frequency"),
  },
];
const pathLengthComparison = document.getElementById("path-length-comparison");
const shortcutDirection = document.getElementById("shortcut-direction");

function geometryNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function geometryEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}
function geometryFormatInteger(value) {
  const number = geometryNumber(value);
  return number === null ? "" : Math.round(number).toLocaleString();
}
function geometryFormatDecimal(value, digits = 4) {
  const number = geometryNumber(value);
  return number === null ? "" : number.toFixed(digits);
}
function geometryFormatPct(value) {
  const number = geometryNumber(value);
  return number === null ? "" : `${number.toFixed(2)}%`;
}
function geometryFormatSeconds(value) {
  const number = geometryNumber(value);
  return number === null ? "" : `${number.toFixed(1)} s`;
}
function geometryFormatOptional(value, formatter) {
  const number = geometryNumber(value);
  return number === null ? "not measured" : formatter(number);
}
function geometryFormatChange(before, after, formatter) {
  const beforeText = geometryFormatOptional(before, formatter);
  const afterText = geometryFormatOptional(after, formatter);
  return afterText === "not measured" ? beforeText : `${beforeText} -> ${afterText}`;
}
function geometryHasShortcutDirection(pair) {
  return ["shortcut_inward_pct", "shortcut_outward_pct", "shortcut_lateral_pct"].some(
    (field) => geometryNumber(pair.shortcuts[field]) !== null,
  );
}
function geometryLayout(title, xTitle, yTitle) {
  return {
    autosize: true,
    barmode: "group",
    font: { color: "#3d4b43", family: "Inter, ui-sans-serif, system-ui, sans-serif", size: 12 },
    height: 350,
    hovermode: "closest",
    margin: { l: 64, r: 18, t: 20, b: 58 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    showlegend: true,
    title: { text: title || "" },
    xaxis: { title: xTitle, gridcolor: "#dce3dd", zeroline: false },
    yaxis: { title: yTitle, gridcolor: "#dce3dd", zeroline: false },
  };
}
function geometryConfig(filename) {
  return {
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: { format: "svg", filename, height: 350, width: 760 },
  };
}
function geometryTraceColor(label) {
  const normalized = geometryNormalizedLabel(label);
  if (normalized === "paper fast") return "#2563eb";
  if (normalized.includes("direct shortcut")) return "#ca8a04";
  if (normalized.includes("reversed shortcut")) return "#b45309";
  if (normalized.includes("shortcut")) return "#146c43";
  return "#9333ea";
}

function geometryNormalizedLabel(value) {
  return String(value || "").toLowerCase();
}
function geometryVariantLabel(row) {
  return row.variant_label || row.construction_method || "Unknown variant";
}
function geometryIsBase(row) {
  return geometryVariantLabel(row) === "Paper fast";
}
function geometryIsShortcutVariant(row) {
  return !geometryIsBase(row) && geometryNormalizedLabel(geometryVariantLabel(row)).includes("shortcut");
}

function geometryPairs(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row.dataset_label)) groups.set(row.dataset_label, { variants: [] });
    const group = groups.get(row.dataset_label);
    if (geometryIsBase(row)) group.base = row;
    if (geometryIsShortcutVariant(row)) group.variants.push(row);
  });
  return [...groups.entries()]
    .flatMap(([dataset, group]) => group.variants.map((shortcuts) => ({ dataset, base: group.base, shortcuts })))
    .filter((pair) => pair.base && pair.shortcuts)
    .sort((left, right) => {
      const datasetCompare = left.dataset.localeCompare(right.dataset);
      if (datasetCompare !== 0) return datasetCompare;
      return geometryVariantLabel(left.shortcuts).localeCompare(geometryVariantLabel(right.shortcuts));
    });
}

function geometryTakeaway(pair) {
  const variant = geometryVariantLabel(pair.shortcuts);
  const added = geometryNumber(pair.shortcuts.shortcut_edges_added) || 0;
  const baseAvg = geometryNumber(pair.base.avg_greedy_path_length);
  const shortcutAvg = geometryNumber(pair.shortcuts.avg_greedy_path_length);
  const baseMax = geometryNumber(pair.base.max_greedy_path_length);
  const shortcutMax = geometryNumber(pair.shortcuts.max_greedy_path_length);
  return `${variant}: avg path ${geometryFormatDecimal(baseAvg, 3)} -> ${geometryFormatDecimal(shortcutAvg, 3)}; max path ${geometryFormatInteger(baseMax)} -> ${geometryFormatInteger(shortcutMax)}, after adding ${geometryFormatInteger(added)} shortcuts.`;
}

function geometrySummaryTable(pairs) {
  const rows = pairs.map((pair) => {
    const baseReached = geometryNumber(pair.base.greedy_path_reached_targets);
    const shortcutReached = geometryNumber(pair.shortcuts.greedy_path_reached_targets);
    const total = geometryNumber(pair.shortcuts.greedy_path_num_points || pair.shortcuts.num_nodes);
    const direction = geometryHasShortcutDirection(pair)
      ? `${geometryFormatPct(pair.shortcuts.shortcut_inward_pct)} inward, ${geometryFormatPct(pair.shortcuts.shortcut_outward_pct)} outward`
      : "not measured";
    return `<tr>
      <td>${geometryEscape(pair.dataset)}</td>
      <td>${geometryEscape(geometryVariantLabel(pair.shortcuts))}</td>
      <td>${geometryFormatChange(pair.base.edge_count || pair.base.num_edges, pair.shortcuts.edge_count || pair.shortcuts.num_edges, geometryFormatInteger)}</td>
      <td>${geometryFormatOptional(pair.shortcuts.shortcut_edges_added, geometryFormatInteger)}</td>
      <td>${geometryFormatChange(pair.base.avg_out_degree, pair.shortcuts.avg_out_degree, (value) => geometryFormatDecimal(value, 3))}</td>
      <td>${geometryFormatChange(pair.base.max_out_degree || pair.base.max_out_degree_header, pair.shortcuts.max_out_degree || pair.shortcuts.max_out_degree_header, geometryFormatInteger)}</td>
      <td>${geometryFormatChange(pair.base.start_node_out_degree, pair.shortcuts.start_node_out_degree, geometryFormatInteger)}</td>
      <td>${geometryFormatChange(pair.base.build_time_s, pair.shortcuts.build_time_s, geometryFormatSeconds)}</td>
      <td><strong>${geometryFormatChange(pair.base.avg_greedy_path_length, pair.shortcuts.avg_greedy_path_length, (value) => geometryFormatDecimal(value, 3))}</strong></td>
      <td><strong>${geometryFormatChange(pair.base.max_greedy_path_length, pair.shortcuts.max_greedy_path_length, geometryFormatInteger)}</strong></td>
      <td>${geometryFormatChange(baseReached, shortcutReached, geometryFormatInteger)} / ${geometryFormatOptional(total, geometryFormatInteger)}</td>
      <td>${direction}</td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap geometry-table"><table>
    <thead><tr>
      <th>Dataset</th><th>Variant</th><th>Edges</th><th>Added</th><th>Avg degree</th><th>Max degree</th>
      <th>Centroid degree</th><th>Build time</th><th>Avg path</th><th>Max path</th><th>Reached targets</th><th>Shortcut direction</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderGeometrySummary(pairs) {
  const takeaways = pairs.map((pair) => `<li><strong>${geometryEscape(pair.dataset)}.</strong> ${geometryEscape(geometryTakeaway(pair))}</li>`).join("");
  geometrySummary.innerHTML = `<ul class="geometry-takeaways">${takeaways}</ul>${geometrySummaryTable(pairs)}`;
}

function renderPathLengthComparison(pairs) {
  const labels = pairs.flatMap((pair) => [
    `${pair.dataset}<br>${geometryEscape(geometryVariantLabel(pair.shortcuts))}<br>Avg`,
    `${pair.dataset}<br>${geometryEscape(geometryVariantLabel(pair.shortcuts))}<br>Max`,
  ]);
  const shortcutGroups = new Map();
  pairs.forEach((pair) => {
    const variant = geometryVariantLabel(pair.shortcuts);
    if (!shortcutGroups.has(variant)) shortcutGroups.set(variant, []);
    shortcutGroups.get(variant).push(pair);
  });
  const traces = [{
    name: "Paper fast",
    hovertemplate: [
      "<b>%{x}</b>",
      "Path length: %{y:.3f}",
      "<extra></extra>",
    ].join("<br>"),
    marker: { color: "#2563eb" },
    type: "bar",
    x: labels,
    y: pairs.flatMap((pair) => [pair.base.avg_greedy_path_length, pair.base.max_greedy_path_length]),
  }];
  [...shortcutGroups.entries()].forEach(([variant, variantPairs], index) => {
    const values = new Map(variantPairs.flatMap((pair) => [
      [`${pair.dataset}|${variant}|avg`, pair.shortcuts.avg_greedy_path_length],
      [`${pair.dataset}|${variant}|max`, pair.shortcuts.max_greedy_path_length],
    ]));
    traces.push(
    {
      name: variant,
      hovertemplate: [
        "<b>%{x}</b>",
        "Path length: %{y:.3f}",
        "<extra></extra>",
      ].join("<br>"),
      marker: { color: ["#146c43", "#b45309", "#9333ea", "#0f766e"][index % 4] },
      type: "bar",
      x: labels,
      y: pairs.flatMap((pair) => [
        values.get(`${pair.dataset}|${variant}|avg`) ?? null,
        values.get(`${pair.dataset}|${variant}|max`) ?? null,
      ]),
    });
  });
  const layout = geometryLayout("", "", "Greedy path length");
  Plotly.newPlot(pathLengthComparison, traces, layout, geometryConfig("greedy-path-length-comparison"));
}

function geometryFrequencyRows(measurements) {
  return measurements
    .filter((row) => row.search_method === "Internal point greedy path")
    .map((row) => {
      const frequency = row.metrics?.path_length_frequency || row.path_length_frequency;
      return {
        datasetId: row.dataset_id || "",
        dataset: row.dataset_label || row.dataset_id || "Unknown dataset",
        variant: row.construction_method || "Unknown construction",
        frequency: Array.isArray(frequency) ? frequency : [],
      };
    })
    .filter((row) => row.frequency.length);
}

function renderPathLengthFrequency(measurements, datasetId, datasetLabel, target) {
  const rows = geometryFrequencyRows(measurements).filter((row) => row.datasetId === datasetId);
  if (!rows.length) {
    target.innerHTML = `<p class="empty">No ${geometryEscape(datasetLabel)} path-length frequency measurements are available.</p>`;
    return;
  }
  const traces = rows
    .sort((left, right) => {
      const datasetCompare = left.dataset.localeCompare(right.dataset);
      if (datasetCompare !== 0) return datasetCompare;
      return left.variant.localeCompare(right.variant);
    })
    .map((row) => {
      const points = row.frequency
        .map((point) => ({
          pathLength: geometryNumber(point.path_length),
          count: geometryNumber(point.count),
        }))
        .filter((point) => point.pathLength !== null && point.count !== null)
        .sort((left, right) => left.pathLength - right.pathLength);
      return {
        hovertemplate: [
          `<b>${geometryEscape(row.dataset)} - ${geometryEscape(row.variant)}</b>`,
          "Path length: %{x}",
          "Internal points: %{y:,}",
          "<extra></extra>",
        ].join("<br>"),
        line: { color: geometryTraceColor(row.variant), width: 2 },
        marker: { color: geometryTraceColor(row.variant), size: 5 },
        mode: "lines+markers",
        name: `${row.dataset} - ${row.variant}`,
        type: "scatter",
        x: points.map((point) => point.pathLength),
        y: points.map((point) => point.count),
      };
    });
  const layout = geometryLayout("", "Greedy path length", "Internal points");
  layout.yaxis.type = "log";
  layout.showlegend = true;
  Plotly.newPlot(target, traces, layout, geometryConfig(`${datasetId}-internal-path-length-frequency`));
}

function geometryDegreeRows(graphs) {
  return graphs
    .map((row) => ({
      datasetId: row.dataset_id || "",
      dataset: row.dataset_label || row.dataset_id || "Unknown dataset",
      variant: row.construction_method || "Unknown construction",
      frequency: Array.isArray(row.degree_frequency) ? row.degree_frequency : [],
    }))
    .filter((row) => row.frequency.length);
}

function renderDegreeFrequency(graphs, datasetId, datasetLabel, target) {
  const rows = geometryDegreeRows(graphs).filter((row) => row.datasetId === datasetId);
  if (!rows.length) {
    target.innerHTML = `<p class="empty">No ${geometryEscape(datasetLabel)} node degree-frequency measurements are available.</p>`;
    return;
  }
  const traces = rows
    .sort((left, right) => {
      const datasetCompare = left.dataset.localeCompare(right.dataset);
      if (datasetCompare !== 0) return datasetCompare;
      return left.variant.localeCompare(right.variant);
    })
    .map((row) => {
      const points = row.frequency
        .map((point) => ({
          degree: geometryNumber(point.out_degree),
          count: geometryNumber(point.count),
        }))
        .filter((point) => point.degree !== null && point.degree > 0 && point.count !== null)
        .sort((left, right) => left.degree - right.degree);
      return {
        hovertemplate: [
          `<b>${geometryEscape(row.dataset)} - ${geometryEscape(row.variant)}</b>`,
          "Out-degree: %{x}",
          "Nodes: %{y:,}",
          "<extra></extra>",
        ].join("<br>"),
        line: { color: geometryTraceColor(row.variant), width: 2 },
        marker: { color: geometryTraceColor(row.variant), size: 5 },
        mode: "lines+markers",
        name: `${row.dataset} - ${row.variant}`,
        type: "scatter",
        x: points.map((point) => point.degree),
        y: points.map((point) => point.count),
      };
    });
  const layout = geometryLayout("", "Out-degree", "Nodes");
  layout.xaxis.type = "log";
  layout.yaxis.type = "log";
  layout.showlegend = true;
  Plotly.newPlot(target, traces, layout, geometryConfig(`${datasetId}-node-degree-frequency`));
}

function renderDatasetFrequencyPlots(measurements, graphs) {
  geometryDatasetPlots.forEach((dataset) => {
    renderPathLengthFrequency(measurements, dataset.datasetId, dataset.label, dataset.pathLengthFrequency);
    renderDegreeFrequency(graphs, dataset.datasetId, dataset.label, dataset.degreeFrequency);
  });
}

function renderShortcutDirection(pairs) {
  const measuredPairs = pairs.filter(geometryHasShortcutDirection);
  if (!measuredPairs.length) {
    shortcutDirection.innerHTML = "<p class=\"empty\">Shortcut edge direction was not measured for the selected shortcut variants.</p>";
    return;
  }
  const datasets = measuredPairs.map((pair) => `${pair.dataset} - ${geometryVariantLabel(pair.shortcuts)}`);
  const traces = [
    { name: "Inward", marker: { color: "#2f7d4f" }, x: measuredPairs.map((pair) => pair.shortcuts.shortcut_inward_pct), y: datasets, orientation: "h", type: "bar" },
    { name: "Outward", marker: { color: "#c05239" }, x: measuredPairs.map((pair) => pair.shortcuts.shortcut_outward_pct), y: datasets, orientation: "h", type: "bar" },
    { name: "Lateral", marker: { color: "#6b7280" }, x: measuredPairs.map((pair) => pair.shortcuts.shortcut_lateral_pct), y: datasets, orientation: "h", type: "bar" },
  ];
  const layout = geometryLayout("", "Shortcut-only edges (%)", "");
  layout.barmode = "stack";
  layout.xaxis.range = [0, 100];
  Plotly.newPlot(shortcutDirection, traces, layout, geometryConfig("shortcut-direction"));
}

function renderGeometry(rows, measurements, graphs) {
  const pairs = geometryPairs(rows);
  if (!pairs.length) {
    geometrySummary.innerHTML = "<p class=\"empty\">No base/shortcut geometry pairs are available.</p>";
    return;
  }
  renderGeometrySummary(pairs);
  if (!window.Plotly) {
    document.querySelectorAll(".plotly-plot").forEach((plot) => {
      plot.innerHTML = "<p class=\"empty\">Plotly.js could not be loaded. Check your internet connection or serve a local Plotly bundle.</p>";
    });
    return;
  }
  renderDatasetFrequencyPlots(measurements, graphs);
  renderPathLengthComparison(pairs);
  renderShortcutDirection(pairs);
}

async function loadGeometry() {
  try {
    const [geometryResponse, measurementsResponse, graphsResponse] = await Promise.all([
      fetch(`${GEOMETRY_DATA_ROOT}centroid_geometry.json?v=${GEOMETRY_DATA_VERSION}`, { cache: "no-store" }),
      fetch(`${GEOMETRY_DATA_ROOT}measurements.json?v=${GEOMETRY_DATA_VERSION}`, { cache: "no-store" }),
      fetch(`${GEOMETRY_DATA_ROOT}graphs.json?v=${GEOMETRY_DATA_VERSION}`, { cache: "no-store" }),
    ]);
    if (!geometryResponse.ok) throw new Error("centroid_geometry.json could not be loaded");
    if (!measurementsResponse.ok) throw new Error("measurements.json could not be loaded");
    if (!graphsResponse.ok) throw new Error("graphs.json could not be loaded");
    const rows = await geometryResponse.json();
    const measurements = await measurementsResponse.json();
    const graphs = await graphsResponse.json();
    geometryStatus.textContent = "Static geometry data loaded";
    renderGeometry(rows, measurements, graphs);
  } catch (error) {
    geometryStatus.textContent = "Unable to load geometry data. Run the sync script, then serve the docs folder.";
    geometrySummary.innerHTML = "<p class=\"empty\">No geometry data loaded.</p>";
    console.error(error);
  }
}

loadGeometry();
