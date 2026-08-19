"use strict";

const DATA_ROOT = "../data/site-data/";
const DATA_VERSION = "20260729-site-data-sync";
const ALLOWED_DATASETS = new Set(["sift1m", "gist1m", "diskann-hard"]);
const ALLOWED_SEARCH_METHODS = new Set(["greedySearch", "Full centroid", "Partial centroid"]);
const BUILD_DETAILS = ["R", "Lbuild", "alpha", "threads"];
const OUTCOMES = [
  ["construction", "Construction time (s)"],
  ["recall", "Recall"],
  ["mean_latency", "Mean latency (us)"],
  ["p999_latency", "P99.9 latency (us)"],
  ["approx_ratio", "Approx. ratio"],
  ["top1_approx", "Top-1 approx. factor"],
  ["qps", "QPS"],
];

const state = { rows: [], filters: {}, outcomes: new Set(), recall: "", showBuildDetails: false };
const controls = document.getElementById("filter-controls");
const tables = document.getElementById("tables");
const rowCount = document.getElementById("row-count");
const status = document.getElementById("status");
const groupTemplate = document.getElementById("filter-group-template");

function cleanMetricName(name) { return name.replace(/^mean_mean_/, "").replace(/^mean_/, ""); }
function displayMetricName(name) {
  const clean = cleanMetricName(name);
  const labels = { recall: "Recall", recall_at_5: "Recall@5", recall_at_10: "Recall@10", mean_latency_us: "Mean latency (us)", p999_latency_us: "P99.9 latency (us)", mean_approximation_ratio: "Approx. ratio", top1_approximation_factor: "Top-1 approx. factor", qps: "QPS" };
  return labels[clean] || clean;
}
function valueKey(value) { return value === null || value === undefined ? "__missing__" : String(value); }
function displayValue(value) { return value === null || value === undefined ? "" : String(value); }
function escapeHtml(value) { return displayValue(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]); }
function sortValues(values) { return [...values].sort((a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) ? Number(a) - Number(b) : String(a).localeCompare(String(b))); }
function metricValue(row, rawName) { return row[rawName]; }

function normalizeRows(source) {
  return source.filter((row) => ALLOWED_DATASETS.has(row.dataset_id)).map((row) => {
    const parameters = row.parameters || {};
    const metrics = row.metrics || {};
    return {
      ...parameters,
      ...metrics,
      dataset_id: row.dataset_id,
      dataset_label: row.dataset_label || row.dataset_id,
      construction_method: row.construction_method,
      search_method: row.search_method,
      search_method_label: row.search_method_label || row.search_method,
      build_time_s: row.build_time_s,
      query_measurement: row.query_measurement || {},
    };
  });
}

function activeRows() { return state.rows; }
function valuesFor(column, rows = activeRows()) { return sortValues(new Set(rows.map((row) => valueKey(row[column])))); }
function searchLabels() {
  return sortValues(new Set(activeRows().filter((row) => ALLOWED_SEARCH_METHODS.has(row.search_method)).map((row) => valueKey(row.search_method_label))));
}
function recallCandidates() {
  const names = new Set();
  activeRows().forEach((row) => Object.keys(row).forEach((key) => { if (cleanMetricName(key) === "recall" || cleanMetricName(key).startsWith("recall_at_")) names.add(key); }));
  return [...names].sort((a, b) => displayMetricName(a).localeCompare(displayMetricName(b)));
}
function recallMetricFor(rows) {
  if (state.recall && rows.some((row) => recordedNumber(row, state.recall))) return state.recall;
  const candidates = new Set();
  rows.forEach((row) => Object.keys(row).forEach((key) => { if (cleanMetricName(key).startsWith("recall_at_")) candidates.add(key); }));
  return [...candidates].sort((a, b) => displayMetricName(a).localeCompare(displayMetricName(b)))[0] || (rows.some((row) => recordedNumber(row, "recall")) ? "recall" : "");
}

function recordedNumber(row, field) { return Number.isFinite(Number(row[field])); }
function availableOutcomes() {
  const has = (field) => state.rows.some((row) => recordedNumber(row, field));
  return OUTCOMES.filter(([key]) => {
    if (key === "construction") return has("build_time_s");
    if (key === "recall") return recallCandidates().length > 0;
    if (key === "mean_latency") return has("mean_latency_us");
    if (key === "p999_latency") return has("p999_latency_us");
    if (key === "approx_ratio") return has("mean_approximation_ratio");
    if (key === "top1_approx") return has("top1_approximation_factor");
    if (key === "qps") return has("qps");
    return false;
  });
}
function latencyColumnLabel(rows) {
  return rows.length && rows.every((row) => row.query_measurement.query_mode === "single_query")
    ? "Query latency (us)" : "Mean latency (us)";
}

function addCheckboxGroup(title, key, values, parent = controls) {
  const group = groupTemplate.content.firstElementChild.cloneNode(true);
  const legend = group.querySelector("legend");
  if (title) legend.textContent = title;
  else legend.remove();
  const options = group.querySelector(".filter-options");
  values.forEach((value) => {
    const option = document.createElement("label");
    option.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = state.filters[key].has(value);
    input.addEventListener("change", () => {
      input.checked ? state.filters[key].add(value) : state.filters[key].delete(value);
      renderResults();
    });
    option.append(input, document.createTextNode(value === "__missing__" ? "(not recorded)" : value));
    options.append(option);
  });
  parent.append(group);
}

function addOutcomeGroup(parent) {
  const group = groupTemplate.content.firstElementChild.cloneNode(true);
  group.querySelector("legend").textContent = "Visible columns";
  const options = group.querySelector(".filter-options");
  availableOutcomes().forEach(([key, title]) => {
    const option = document.createElement("label");
    option.className = "filter-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = key;
    input.checked = state.outcomes.has(key);
    input.addEventListener("change", () => {
      input.checked ? state.outcomes.add(key) : state.outcomes.delete(key);
      renderResults();
    });
    option.append(input, document.createTextNode(title));
    options.append(option);
  });
  parent.append(group);
}

function renderControls() {
  controls.replaceChildren();
  addCheckboxGroup("Dataset", "dataset_id", valuesFor("dataset_id"));
  addCheckboxGroup("Construction method", "construction_method", valuesFor("construction_method"));

  const recallGroup = groupTemplate.content.firstElementChild.cloneNode(true);
  recallGroup.querySelector("legend").textContent = "Recall metric";
  const select = document.createElement("select");
  recallCandidates().forEach((candidate) => {
    const option = new Option(displayMetricName(candidate), candidate, false, candidate === state.recall);
    select.add(option);
  });
  select.addEventListener("change", () => { state.recall = select.value; renderResults(); });
  recallGroup.querySelector(".filter-options").append(select);

  const details = document.createElement("details");
  details.innerHTML = "<summary>Advanced build options</summary>";
  const advanced = document.createElement("div");
  advanced.className = "advanced-filters";
  const show = document.createElement("label");
  show.className = "filter-option";
  show.innerHTML = `<input type="checkbox" ${state.showBuildDetails ? "checked" : ""}> Show build details in tables`;
  show.querySelector("input").addEventListener("change", (event) => { state.showBuildDetails = event.target.checked; renderResults(); });
  advanced.append(show);
  BUILD_DETAILS.forEach((key) => addCheckboxGroup(key, key, valuesFor(key), advanced));
  details.append(advanced);
  controls.append(details);

  addCheckboxGroup("Search method", "search_method_label", searchLabels());
  const queueLength = document.createElement("details");
  queueLength.innerHTML = "<summary>Queue length L</summary>";
  addCheckboxGroup("", "L", valuesFor("L"), queueLength);
  controls.append(queueLength);
  controls.append(recallGroup);

  const metricDetails = document.createElement("details");
  metricDetails.innerHTML = "<summary>Query metrics</summary>";
  addOutcomeGroup(metricDetails);
  controls.append(metricDetails);
}

function resetFilters() {
  const rows = activeRows();
  const outcomeKeys = availableOutcomes().map(([key]) => key);
  state.filters = {
    dataset_id: new Set(valuesFor("dataset_id", rows)), construction_method: new Set(valuesFor("construction_method", rows)),
    search_method_label: new Set(searchLabels()), L: new Set(valuesFor("L", rows)),
    outcomes: new Set(outcomeKeys),
    ...Object.fromEntries(BUILD_DETAILS.map((key) => [key, new Set(valuesFor(key, rows))])),
  };
  state.outcomes = new Set(outcomeKeys);
  state.recall = recallCandidates().find((candidate) => cleanMetricName(candidate).startsWith("recall_at_")) || recallCandidates()[0] || "";
  state.showBuildDetails = false;
  renderControls();
  renderResults();
}

function filteredRows() {
  return activeRows().filter((row) => {
    if (!ALLOWED_SEARCH_METHODS.has(row.search_method)) return false;
    return ["dataset_id", "construction_method", "search_method_label", "L", ...BUILD_DETAILS].every((key) => state.filters[key].has(valueKey(row[key])));
  });
}

function tableData(rows, recallMetric) {
  return rows.map((row) => ({
    row,
    values: {
      construction_method: row.construction_method, search_method_label: row.search_method_label,
      R: row.R, Lbuild: row.Lbuild, alpha: row.alpha, threads: row.threads,
      construction: Number.isFinite(Number(row.build_time_s)) ? Math.round(Number(row.build_time_s) * 100) / 100 : "",
      recall: row[recallMetric], mean_latency: metricValue(row, "mean_latency_us"), p999_latency: metricValue(row, "p999_latency_us"),
      approx_ratio: metricValue(row, "mean_approximation_ratio"), top1_approx: metricValue(row, "top1_approximation_factor"), qps: metricValue(row, "qps"),
    },
  }));
}

function bestValue(rows, key, direction) {
  const values = rows.map((item) => Number(item.values[key])).filter(Number.isFinite);
  return values.length ? (direction === "max" ? Math.max(...values) : Math.min(...values)) : null;
}

function buildTable(rows) {
  const columns = [["construction_method", "Construction method"], ["search_method_label", "Search method"]];
  if (state.showBuildDetails) BUILD_DETAILS.filter((key) => rows.some((row) => row[key] !== null && row[key] !== undefined)).forEach((key) => columns.push([key, key]));
  const selected = new Set(state.outcomes);
  const recallMetric = recallMetricFor(rows);
  const has = (field) => rows.some((row) => recordedNumber(row, field));
  if (selected.has("construction") && has("build_time_s")) columns.push(["construction", "Construction time (s)"]);
  if (selected.has("recall") && recallMetric && has(recallMetric)) columns.push(["recall", displayMetricName(recallMetric)]);
  if (selected.has("mean_latency") && has("mean_latency_us")) columns.push(["mean_latency", latencyColumnLabel(rows)]);
  if (selected.has("p999_latency") && has("p999_latency_us")) columns.push(["p999_latency", "P99.9 latency (us)"]);
  if (selected.has("approx_ratio") && has("mean_approximation_ratio")) columns.push(["approx_ratio", "Approx. ratio"]);
  if (selected.has("top1_approx") && has("top1_approximation_factor")) columns.push(["top1_approx", "Top-1 approx. factor"]);
  if (selected.has("qps") && has("qps")) columns.push(["qps", "QPS"]);

  const data = tableData(rows, recallMetric);
  const directions = { recall: "max", qps: "max", mean_latency: "min", p999_latency: "min", approx_ratio: "min", top1_approx: "min" };
  const best = Object.fromEntries(Object.entries(directions).map(([key, direction]) => [key, bestValue(data, key, direction)]));
  const header = columns.map(([, title]) => `<th>${escapeHtml(title)}</th>`).join("");
  const body = data.map(({ values }) => `<tr>${columns.map(([key]) => {
    const value = values[key]; const isBest = best[key] !== null && Number(value) === best[key];
    return `<td>${isBest ? "<strong>" : ""}${escapeHtml(value)}${isBest ? "</strong>" : ""}</td>`;
  }).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderResults() {
  const rows = filteredRows();
  rowCount.textContent = `${rows.length.toLocaleString()} rows selected`;
  tables.replaceChildren();
  if (!rows.length) { tables.innerHTML = "<p class=\"empty\">No rows match the current filters.</p>"; return; }
  const datasetIds = sortValues(new Set(rows.map((row) => row.dataset_id)));
  datasetIds.forEach((datasetId) => {
    const datasetRows = rows.filter((row) => row.dataset_id === datasetId);
    const heading = document.createElement("h2"); heading.className = "dataset-heading"; heading.textContent = datasetRows[0].dataset_label; tables.append(heading);
    sortValues(new Set(datasetRows.map((row) => row.L))).forEach((lValue) => {
      const lHeading = document.createElement("h3"); lHeading.className = "l-heading"; lHeading.textContent = `L = ${lValue}`; tables.append(lHeading);
      const holder = document.createElement("div"); holder.innerHTML = buildTable(datasetRows.filter((row) => row.L === lValue)); tables.append(holder.firstElementChild);
    });
  });
}

async function loadData() {
  try {
    const response = await fetch(`${DATA_ROOT}measurements.json?v=${DATA_VERSION}`, { cache: "no-store" });
    if (!response.ok) throw new Error("measurements.json could not be loaded");
    state.rows = normalizeRows(await response.json());
    resetFilters();
  } catch (error) {
    status.textContent = "Unable to load site data. Run the sync script, then serve this folder from the repository root.";
    rowCount.textContent = "No data loaded";
    console.error(error);
  }
}

document.getElementById("reset-filters").addEventListener("click", resetFilters);
loadData();
