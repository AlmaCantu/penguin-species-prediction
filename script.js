const csvPath = "penguins.csv";

const numericFeatureKeys = [
  "bill_length_mm",
  "bill_depth_mm",
  "flipper_length_mm",
  "body_mass_g"
];
const categoricalFeatureKeys = ["sex"];
const allFeatureKeys = [...numericFeatureKeys, ...categoricalFeatureKeys];

const prettyName = {
  bill_length_mm: "Bill length",
  bill_depth_mm: "Bill depth",
  flipper_length_mm: "Flipper length",
  body_mass_g: "Body mass",
  sex: "Sex"
};

const explorerCases = [
  {
    id: "case-ice",
    name: "Suki",
    role: "Iceberg Listener",
    values: {
      bill_length_mm: 38.7,
      bill_depth_mm: 19,
      flipper_length_mm: 195,
      body_mass_g: 3450,
      sex: "FEMALE"
    }
  },
  {
    id: "case-snow",
    name: "Nika",
    role: "Snow Map Maker",
    values: {
      bill_length_mm: 50,
      bill_depth_mm: 15.3,
      flipper_length_mm: 220,
      body_mass_g: 5550,
      sex: "MALE"
    }
  },
  {
    id: "case-aurora",
    name: "Aurora",
    role: "Northern Lights Scout",
    values: {
      bill_length_mm: 45.3,
      bill_depth_mm: 13.8,
      flipper_length_mm: 208,
      body_mass_g: 4200,
      sex: "FEMALE"
    }
  }
];

const prettyUnit = {
  bill_length_mm: "mm",
  bill_depth_mm: "mm",
  flipper_length_mm: "mm",
  body_mass_g: "g",
  sex: ""
};

const axisNeutralClues = {
  bill_length_mm: { top: "long bill", bottom: "short bill" },
  bill_depth_mm: { top: "large bill", bottom: "thin bill" },
  flipper_length_mm: { top: "long flipper", bottom: "short flipper" },
  body_mass_g: { top: "heavy body", bottom: "light body" }
};

const tableau10 = [
  "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"
];

const speciesColor = d3.scaleOrdinal()
  .range([tableau10[0], tableau10[4], tableau10[2], tableau10[3], tableau10[1], tableau10[5], tableau10[6]]);

const speciesIconPath = {
  adelie: "img/icon-adelie.png",
  chinstrap: "img/icon-chinstrap.png",
  gentoo: "img/icon-gentoo.png"
};
const mysteryIconPath = "img/icon-mystery.png";
const speciesIconSize = { width: 13, height: 15 };
const mysteryIconSize = { width: 25, height: 20 };
const speciesIconRightOffset = 10;
const iconPaddingTop = 1;
const iconPaddingRight = 0;
const speciesIconStackGap = speciesIconSize.width + iconPaddingRight;
const speciesIconRowGap = speciesIconSize.height + iconPaddingTop;
const speciesIconMaxStackWidth = 200;
const sexIconMaxColumns = 15;
const mysteryIconLeftOffset = 0;

function speciesKey(species) {
  return String(species || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
}

function iconForSpecies(species) {
  return speciesIconPath[speciesKey(species)] || mysteryIconPath;
}

const chartEl = document.querySelector("#chart");
const errorEl = document.querySelector("#errorMessage");
const explorerDeckEl = document.querySelector("#penguinCards");
const selectedCaseNameEl = document.querySelector("#selectedCaseName");
const selectedCaseDetailsEl = document.querySelector("#selectedCaseDetails");
const caseReportButtonEl = document.querySelector("#caseReportButton");
const predictionButtonEl = document.querySelector("#predictionButton");
const predictionResultsEl = document.querySelector("#predictionResults");

const width = chartEl.getBoundingClientRect().width;
// const height = chartEl.getBoundingClientRect().height;

// const width = 2140;
const height = 980;
const margin = { top: 100, right: 80, bottom: 58, left: 0 };
const chartWidth = width - margin.left - margin.right;
const chartHeight = height - margin.top - margin.bottom;

const svg = d3.select("#chart")
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .attr("role", "img")
  .attr("aria-label", "Penguin detective chart. Enter or drag values for beak length, beak depth, flipper length, body weight and penguin sex, then use the prediction panel to guess the species.");

const plot = svg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

let datasetLayer;
let userSegmentsLayer;
let userPointsLayer;
let axesLayer;

let penguins = [];
let speciesList = [];
let orderedFeatures = [];
let featureImportance = {};
let x;
let yScales = {};
let inputValues = {};
let activeCaseId = null;
let probabilities = {};
let predictedSpecies = null;
let predictedColor = "#AEB7C2";
let isDraggingUserPoint = false;

const line = d3.line()
  .defined(d => d.y !== null && Number.isFinite(d.y))
  .x(d => x(d.feature))
  .y(d => d.y);

function cleanSpecies(value) {
  return String(value || "").trim();
}

function cleanSex(value) {
  const cleaned = String(value || "").trim().toUpperCase();
  return cleaned === "MALE" || cleaned === "FEMALE" ? cleaned : "UNKNOWN";
}

function parseRows(data) {
  return data.map((row, index) => ({
    __id: index,
    species: cleanSpecies(row.species),
    bill_length_mm: +row.bill_length_mm,
    bill_depth_mm: +row.bill_depth_mm,
    flipper_length_mm: +row.flipper_length_mm,
    body_mass_g: +row.body_mass_g,
    sex: cleanSex(row.sex)
  })).filter(row => row.species && numericFeatureKeys.every(key => Number.isFinite(row[key])));
}

function normalizedEntropy(counts) {
  const total = d3.sum(counts);
  if (!total || counts.length <= 1) return 0;
  const entropy = -d3.sum(counts, count => {
    if (!count) return 0;
    const p = count / total;
    return p * Math.log2(p);
  });
  return entropy / Math.log2(counts.length);
}

function computeFeatureImportance(rows) {
  const groupedBySpecies = d3.group(rows, d => d.species);
  const rawScores = {};

  numericFeatureKeys.forEach(feature => {
    const overallMean = d3.mean(rows, d => d[feature]);
    const totalVariance = d3.variance(rows, d => d[feature]) || 1;
    const between = d3.sum(Array.from(groupedBySpecies.values()), group => {
      const mean = d3.mean(group, d => d[feature]);
      return group.length * Math.pow(mean - overallMean, 2);
    }) / rows.length;
    rawScores[feature] = Math.max(0.0001, between / totalVariance);
  });

  const overallSexCounts = Array.from(d3.rollup(rows, v => v.length, d => d.sex).values());
  const overallEntropy = normalizedEntropy(overallSexCounts) || 1;
  const weightedEntropy = d3.sum(Array.from(groupedBySpecies.values()), group => {
    const counts = Array.from(d3.rollup(group, v => v.length, d => d.sex).values());
    return (group.length / rows.length) * normalizedEntropy(counts);
  });
  rawScores.sex = Math.max(0.0001, (overallEntropy - weightedEntropy) / overallEntropy);

  const total = d3.sum(Object.values(rawScores)) || 1;
  return Object.fromEntries(Object.entries(rawScores).map(([key, score]) => [key, score / total]));
}

function buildScales() {
  yScales = {};
  numericFeatureKeys.forEach(feature => {
    const datasetValues = penguins.map(row => row[feature]);
    const cardValues = explorerCases
      .map(card => card.values[feature])
      .filter(value => Number.isFinite(value));
    const extent = d3.extent([...datasetValues, ...cardValues]);
    const padding = (extent[1] - extent[0]) * 0.01;
    yScales[feature] = d3.scaleLinear()
      .domain([Math.floor(extent[0] - padding), Math.ceil(extent[1] + padding)])
      .range([chartHeight, 0])
      .nice();
  });

  yScales.sex = d3.scalePoint()
    .domain(["FEMALE", "MALE"])
    .range([chartHeight, 0])
    .padding(0.5);
}

function rowToFeaturePath(row) {
  return orderedFeatures.map(feature => ({
    feature,
    y: yScales[feature](row[feature])
  }));
}

function formatDisplayValue(feature, value) {
  if (value === undefined || value === null || value === "") return "Mystery";
  if (feature === "sex") return String(value).charAt(0) + String(value).slice(1).toLowerCase();
  return `${value} ${prettyUnit[feature]}`;
}

function renderExplorerCards() {
  if (!explorerDeckEl) return;

  explorerDeckEl.innerHTML = "";
  explorerCases.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `penguin-card${card.id === activeCaseId ? " is-active" : ""}`;
    button.dataset.caseId = card.id;
    button.setAttribute("aria-pressed", String(card.id === activeCaseId));
    button.setAttribute("aria-label", `Reveal mystery case ${index + 1}: ${card.name}, ${card.role}`);

    button.innerHTML = `
      <span class="folder-tab">CASE ${String(index + 1).padStart(2, "0")}</span>
      <span class="card-face">
        <span class="mystery-shadow" aria-hidden="true"><span>?</span></span>
        <span class="card-title">
          <strong>${card.name}</strong>
          <span>${card.role}</span>
        </span>
      </span>`;

    button.addEventListener("click", () => selectExplorerCase(card.id));
    explorerDeckEl.appendChild(button);
  });

  caseReportButtonEl.addEventListener("click", reportSelectedCaseOnChart);
}

function renderSelectedCaseDetails(card) {
  if (!selectedCaseDetailsEl) return;

  if (!card) {
    selectedCaseDetailsEl.innerHTML = `
      <span class="case-chip"><b>Bill length</b><span>Waiting</span></span>
      <span class="case-chip"><b>Bill depth</b><span>Waiting</span></span>
      <span class="case-chip"><b>Flipper</b><span>Waiting</span></span>
      <span class="case-chip"><b>Body mass</b><span>Waiting</span></span>
      <span class="case-chip"><b>Sex</b><span>Waiting</span></span>`;
    return;
  }

  const values = card.values;
  selectedCaseDetailsEl.innerHTML = `
    <span class="case-chip"><b>Bill length</b><span>${formatDisplayValue("bill_length_mm", values.bill_length_mm)}</span></span>
    <span class="case-chip"><b>Bill depth</b><span>${formatDisplayValue("bill_depth_mm", values.bill_depth_mm)}</span></span>
    <span class="case-chip"><b>Flipper length</b><span>${formatDisplayValue("flipper_length_mm", values.flipper_length_mm)}</span></span>
    <span class="case-chip"><b>Body mass</b><span>${formatDisplayValue("body_mass_g", values.body_mass_g)}</span></span>
    <span class="case-chip"><b>Sex</b><span>${formatDisplayValue("sex", values.sex)}</span></span>`;
}

function updateMissionPanel() {
  const activeCard = explorerCases.find(card => card.id === activeCaseId);

  if (!activeCard) {
    selectedCaseNameEl.textContent = "Pick a case";
    renderSelectedCaseDetails(null);
    return;
  }

  selectedCaseNameEl.textContent = activeCard.name;
  renderSelectedCaseDetails(activeCard);
}

function updateExplorerDeck() {
  renderExplorerCards();
  updateMissionPanel();
}

function syncControlsToInputValues() {
  allFeatureKeys.forEach(feature => {
    const control = document.querySelector(`[data-feature="${feature}"]`);
    if (!control) return;
    control.value = inputValues[feature] ?? "";
    control.setCustomValidity?.("");
  });
}

function loadExplorerValues(values) {
  inputValues = { ...values };
  syncControlsToInputValues();
  resetPredictionOnly();
  errorEl.textContent = "";
  updateUserOverlay();
  updateSpeciesPanel();
}

function selectExplorerCase(caseId) {
  const selected = explorerCases.find(card => card.id === caseId);
  if (!selected) return;

  activeCaseId = selected.id;
  errorEl.textContent = "";
  updateExplorerDeck();
}

function reportSelectedCaseOnChart() {
  const selected = explorerCases.find(card => card.id === activeCaseId);
  if (!selected) {
    errorEl.textContent = "Pick a case first, then report it on the chart.";
    return;
  }

  loadExplorerValues(selected.values);
  updateExplorerDeck();
}

function markCustomInput() {
  activeCaseId = null;
}

function userPoints() {
  return orderedFeatures
    .filter(feature => inputValues[feature] !== undefined)
    .map(feature => ({
      feature,
      value: inputValues[feature],
      y: yScales[feature](inputValues[feature])
    }));
}

function adjacentUserSegments(points) {
  const pointByFeature = new Map(points.map(point => [point.feature, point]));
  const segments = [];

  for (let i = 0; i < orderedFeatures.length - 1; i += 1) {
    const left = pointByFeature.get(orderedFeatures[i]);
    const right = pointByFeature.get(orderedFeatures[i + 1]);
    if (left && right) segments.push([left, right]);
  }

  return segments;
}

function resetPredictionOnly() {
  predictedSpecies = null;
  predictedColor = "#AEB7C2";
  probabilities = Object.fromEntries(speciesList.map(species => [species, 0]));
}


function valueFromAxisY(feature, yPosition) {
  if (feature === "sex") {
    const domain = yScales.sex.domain();
    return domain.reduce((best, candidate) => {
      const distance = Math.abs(yScales.sex(candidate) - yPosition);
      return distance < best.distance ? { candidate, distance } : best;
    }, { candidate: domain[0], distance: Infinity }).candidate;
  }

  const [min, max] = yScales[feature].domain();
  const clampedY = Math.max(0, Math.min(chartHeight, yPosition));
  const value = Math.max(min, Math.min(max, yScales[feature].invert(clampedY)));
  return formatAutoValue(feature, value);
}

function setFeatureValue(feature, value, shouldFocus = false) {
  const control = document.querySelector(`[data-feature="${feature}"]`);
  if (!control) return;

  markCustomInput();
  control.value = value;

  if (feature === "sex") {
    if (value) inputValues[feature] = value;
    else delete inputValues[feature];
  } else {
    const numericValue = Number(value);
    const [min, max] = yScales[feature].domain();
    if (Number.isFinite(numericValue) && numericValue >= min && numericValue <= max) {
      inputValues[feature] = numericValue;
      control.setCustomValidity("");
    } else if (value === "") {
      delete inputValues[feature];
      control.setCustomValidity("");
    } else {
      control.setCustomValidity(`Enter a number from ${min} to ${max}`);
      return;
    }
  }

  if (shouldFocus) control.focus({ preventScroll: true });
  resetPredictionOnly();
  errorEl.textContent = "";
  updateUserOverlay();
  updateSpeciesPanel();
  updateExplorerDeck();
}

function dragPointStarted(event, d) {
  event.sourceEvent?.stopPropagation();
  isDraggingUserPoint = true;
  d3.selectAll(".dimension").classed("is-active", false);
  d3.selectAll(".dimension")
    .filter(feature => feature === d.feature)
    .classed("is-active", true);
  d3.select(event.currentTarget).classed("is-dragging", true);
}

function dragPointMoved(event, d) {
  event.sourceEvent?.preventDefault();
  const my = Math.max(0, Math.min(chartHeight, event.y));
  const value = valueFromAxisY(d.feature, my);
  setFeatureValue(d.feature, value, false);
}

function dragPointEnded(event, d) {
  event.sourceEvent?.stopPropagation();
  isDraggingUserPoint = false;
  d3.select(event.currentTarget).classed("is-dragging", false);
  const control = document.querySelector(`[data-feature="${d.feature}"]`);
  if (control) control.focus({ preventScroll: true });
  updateUserOverlay();
}

const userPointDrag = d3.drag()
  .container(plot.node())
  .subject(d => ({ x: x(d.feature) - mysteryIconLeftOffset - mysteryIconSize.width / 2, y: d.y }))
  .on("start", dragPointStarted)
  .on("drag", dragPointMoved)
  .on("end", dragPointEnded);

function updateUserOverlay() {
  if (userPointsLayer) userPointsLayer.raise();
  const points = userPoints();

  if (userSegmentsLayer) {
    userSegmentsLayer.selectAll("*").remove();
  }

  const iconJoin = userPointsLayer.selectAll("image.user-point-icon")
    .data(points, d => d.feature)
    .join(
      enter => enter.append("image")
        .attr("class", "user-point-icon")
        .attr("href", mysteryIconPath)
        .attr("width", mysteryIconSize.width)
        .attr("height", mysteryIconSize.height)
        .attr("x", d => x(d.feature) - mysteryIconLeftOffset - mysteryIconSize.width)
        .attr("y", d => d.y - mysteryIconSize.height / 2)
        .attr("opacity", 0)
        .call(userPointDrag)
        .call(enter => enter.transition().duration(170).attr("opacity", 1)),
      update => update.call(userPointDrag),
      exit => exit.transition().duration(110).attr("opacity", 0).remove()
    );

  const hitJoin = userPointsLayer.selectAll("circle.user-point-hit")
    .data(points, d => d.feature)
    .join(
      enter => enter.append("circle")
        .attr("class", "user-point-hit")
        .attr("r", 18)
        .attr("cx", d => x(d.feature) - mysteryIconLeftOffset - mysteryIconSize.width / 2)
        .attr("cy", d => d.y)
        .call(userPointDrag),
      update => update.call(userPointDrag),
      exit => exit.remove()
    );

  if (isDraggingUserPoint) {
    iconJoin.interrupt()
      .attr("x", d => x(d.feature) - mysteryIconLeftOffset - mysteryIconSize.width)
      .attr("y", d => d.y - mysteryIconSize.height / 2)
      .attr("opacity", 1);
    hitJoin.interrupt()
      .attr("cx", d => x(d.feature) - mysteryIconLeftOffset - mysteryIconSize.width / 2)
      .attr("cy", d => d.y);
  } else {
    iconJoin.transition()
      .duration(170)
      .attr("x", d => x(d.feature) - mysteryIconLeftOffset - mysteryIconSize.width)
      .attr("y", d => d.y - mysteryIconSize.height / 2)
      .attr("opacity", 1);
    hitJoin.transition()
      .duration(170)
      .attr("cx", d => x(d.feature) - mysteryIconLeftOffset - mysteryIconSize.width / 2)
      .attr("cy", d => d.y);
  }
}

function updateSpeciesPanel() {
  if (predictionResultsEl) {
    const rows = d3.select(predictionResultsEl).selectAll(".prediction-result-row")
      .data(speciesList, d => d);

    rows.classed("predicted", d => d === predictedSpecies)
      .classed("dim", d => predictedSpecies && d !== predictedSpecies);

    rows.select(".prediction-dot")
      .style("background-color", d => speciesColor(d));

    rows.select(".prediction-confidence")
      .text(d => probabilities[d] ? `${Math.round(probabilities[d] * 100)}%` : "—");
  }

  svg.selectAll("image.dataset-icon")
    .classed("highlighted", false)
    .attr("opacity", d => predictedSpecies ? (d.species === predictedSpecies ? 0.72 : 0.13) : 0.28);

  updateExplorerDeck();
}

function handleNumericInput(event, feature) {
  markCustomInput();
  const rawValue = event.target.value.trim();
  delete inputValues[feature];

  if (rawValue !== "") {
    const value = Number(rawValue);
    const [min, max] = yScales[feature].domain();
    if (Number.isFinite(value) && value >= min && value <= max) {
      inputValues[feature] = value;
      event.target.setCustomValidity("");
    } else {
      event.target.setCustomValidity(`Try a number from ${min} to ${max}.`);
    }
  } else {
    event.target.setCustomValidity("");
  }

  resetPredictionOnly();
  updateUserOverlay();
  updateSpeciesPanel();
  updateExplorerDeck();
}

function handleCategoricalInput(event, feature) {
  markCustomInput();
  const value = event.target.value;
  if (value) inputValues[feature] = value;
  else delete inputValues[feature];

  resetPredictionOnly();
  updateUserOverlay();
  updateSpeciesPanel();
  updateExplorerDeck();
}

function numericModelBySpecies(species) {
  const rows = penguins.filter(row => row.species === species);
  const means = Object.fromEntries(numericFeatureKeys.map(feature => [feature, d3.mean(rows, row => row[feature])]));
  const sexCounts = d3.rollup(rows, v => v.length, row => row.sex);
  const sexTotal = d3.sum(Array.from(sexCounts.values()));
  return { rows, means, sexCounts, sexTotal };
}

function predictSpecies() {
  const enteredFeatures = orderedFeatures.filter(feature => inputValues[feature] !== undefined);

  if (!enteredFeatures.length) {
    resetPredictionOnly();
    updateSpeciesPanel();
    updateUserOverlay();
    errorEl.textContent = "Add one penguin clue first — try tapping a line or typing a number.";
    return;
  }

  errorEl.textContent = "";

  const models = Object.fromEntries(speciesList.map(species => [species, numericModelBySpecies(species)]));
  const rawScores = speciesList.map(species => {
    const model = models[species];
    let distance = 0;

    numericFeatureKeys.forEach(feature => {
      if (inputValues[feature] === undefined) return;
      const [min, max] = yScales[feature].domain();
      const range = max - min || 1;
      const diff = (inputValues[feature] - model.means[feature]) / range;
      distance += diff * diff * (1 + featureImportance[feature] * 4);
    });

    if (inputValues.sex !== undefined) {
      const count = model.sexCounts.get(inputValues.sex) || 0;
      const likelihood = (count + 1) / (model.sexTotal + yScales.sex.domain().length);
      distance += (1 - likelihood) * (1 + featureImportance.sex * 4) * 0.22;
    }

    return { species, distance: Math.sqrt(distance) };
  });

  const closeness = rawScores.map(d => ({
    species: d.species,
    score: Math.exp(-7.5 * d.distance)
  }));
  const total = d3.sum(closeness, d => d.score) || 1;
  probabilities = Object.fromEntries(closeness.map(d => [d.species, d.score / total]));
  predictedSpecies = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
  predictedColor = speciesColor(predictedSpecies);

  updateUserOverlay();
  updateSpeciesPanel();
}

function resetDashboard() {
  inputValues = {};
  activeCaseId = null;
  resetPredictionOnly();
  errorEl.textContent = "";

  d3.selectAll(".axis-input input")
    .property("value", "")
    .each(function () { this.setCustomValidity(""); });

  d3.selectAll(".axis-input select")
    .property("value", "");

  updateUserOverlay();
  updateSpeciesPanel();
  updateExplorerDeck();
}

function formatAutoValue(feature, value) {
  if (feature === "body_mass_g") return String(Math.round(value / 10) * 10);
  return String(Math.round(value * 10) / 10);
}

function setControlValue(feature, value) {
  setFeatureValue(feature, value, true);
}

function fillValueFromAxis(event, feature) {
  event.preventDefault();
  const [, my] = d3.pointer(event, plot.node());
  const value = valueFromAxisY(feature, my);

  d3.selectAll(".dimension").classed("is-active", false);
  d3.select(event.currentTarget.parentNode).classed("is-active", true);
  setControlValue(feature, value);
}


function drawInputControls() {
  const inputY = -108;
  const inputWidth = 164;
  const inputHeight = 44;

  const resetGroup = svg.append("g")
    .attr("class", "action-control reset-control")
    .attr("transform", `translate(22,${margin.top + inputY})`);

  resetGroup.append("foreignObject")
    .attr("width", 116)
    .attr("height", inputHeight)
    .attr("x", -142)
    .append("xhtml:button")
    .attr("type", "button")
    .attr("class", "secondary")
    .text("Start over")
    .on("click", resetDashboard);

  // const inputGroups = axesLayer.selectAll("g.dimension")
  //   .append("g")
  //   .attr("class", "axis-input")
  //   .attr("transform", `translate(${-inputWidth / 2},${inputY})`);

  // inputGroups.append("foreignObject")
  //   .attr("width", inputWidth)
  //   .attr("height", inputHeight)
  //   .each(function (feature) {
  //     const host = d3.select(this);

  //     if (feature === "sex") {
  //       const select = host.append("xhtml:select")
  //         .attr("aria-label", "Penguin sex")
  //         .attr("data-feature", feature)
  //         .on("change", event => handleCategoricalInput(event, feature));

  //       select.append("xhtml:option")
  //         .attr("value", "")
  //         .text("Sex");

  //       yScales.sex.domain().forEach(value => {
  //         select.append("xhtml:option")
  //           .attr("value", value)
  //           .text(value);
  //       });
  //     } else {
  //       const [min, max] = yScales[feature].domain();

  //       host.append("xhtml:input")
  //         .attr("type", "number")
  //         .attr("step", "any")
  //         .attr("placeholder", `${min}–${max} ${prettyUnit[feature]}`)
  //         .attr("data-feature", feature)
  //         .on("input", event => handleNumericInput(event, feature));
  //     }
  //   });
}

function drawSpeciesPanel() {
  if (!predictionResultsEl) return;

  if (predictionButtonEl) {
    predictionButtonEl.addEventListener("click", predictSpecies);
  }

  const rows = d3.select(predictionResultsEl).selectAll("article")
    .data(speciesList, d => d)
    .join("article")
    .attr("class", "prediction-result-row");

  rows.append("span")
    .attr("class", "prediction-dot")
    .style("background-color", d => speciesColor(d));

  rows.append("span")
    .attr("class", "prediction-species")
    .text(d => d);

  rows.append("span")
    .attr("class", "prediction-confidence")
    .text("—");
}

function drawAxes() {
  axesLayer = plot.append("g").attr("class", "axes-layer");

  const panelWidth = 190;
  const panelTop = -118;
  const panelBottomPad = 36;

  const axes = axesLayer.selectAll("g.dimension")
    .data(orderedFeatures)
    .join("g")
    .attr("class", "dimension")
    .attr("transform", d => `translate(${x(d)},0)`);

  axes.append("text")
    .attr("class", "axis-title")
    .attr("y", -41)
    .text(d => prettyUnit[d] ? `${prettyName[d]} (${prettyUnit[d]})` : prettyName[d]);

  axes.append("text")
    .attr("class", "importance-label")
    .attr("y", -24)
    .text(d => `clue power ${Math.round(featureImportance[d] * 100)}%`);

  const neutralClueGroups = axes
    .filter(feature => axisNeutralClues[feature])
    .selectAll("g.axis-neutral-clue")
    .data(feature => [
      { label: axisNeutralClues[feature].top, y: chartHeight * 0.32 },
      { label: axisNeutralClues[feature].bottom, y: chartHeight * 0.68 }
    ])
    .join("g")
    .attr("class", "axis-neutral-clue")
    .attr("transform", d => `translate(-58,${d.y}) rotate(-90)`);

  neutralClueGroups.append("rect")
    .attr("x", -53)
    .attr("y", -13)
    .attr("width", 106)
    .attr("height", 26)
    .attr("rx", 13)
    .attr("ry", 13);

  neutralClueGroups.append("text")
    .attr("x", 0)
    .attr("dy", "0.35em")
    .text(d => d.label);

  axes.append("rect")
    .attr("class", "axis-touch-target")
    .attr("x", -42)
    .attr("y", -8)
    .attr("width", 84)
    .attr("height", chartHeight + 16)
    .attr("role", "button")
    .attr("tabindex", 0)
    .on("pointerdown", fillValueFromAxis)
    .on("keydown", function (event, feature) {
      if (event.key === "Enter" || event.key === " ") fillValueFromAxis(event, feature);
    });

  axes.append("line")
    .attr("class", "axis-touch-halo")
    .attr("y1", 0)
    .attr("y2", chartHeight);

  axes.each(function (feature) {
    const axis = feature === "sex"
      ? d3.axisLeft(yScales[feature])
      : d3.axisLeft(yScales[feature]).ticks(7);

    d3.select(this)
      .append("g")
      .attr("class", "axis")
      .call(axis);
  });

  axes.append("text")
    .attr("class", "tap-hint")
    .attr("y", chartHeight + 18)
    .text("tap • drag • type");
}


function availableStackWidthForFeature(feature, featureIndex) {
  const axisX = x(feature);
  const nextFeature = orderedFeatures[featureIndex + 1];
  const nextAxisX = nextFeature ? x(nextFeature) : chartWidth + 120;
  return Math.max(400, Math.min(speciesIconMaxStackWidth, nextAxisX - axisX - speciesIconRightOffset - 28));
}

function stackColumnsForFeature(feature, featureIndex) {
  if (feature === "sex") return sexIconMaxColumns;

  const flipperIndex = orderedFeatures.indexOf("flipper_length_mm");
  const referenceFeature = flipperIndex >= 0 ? "flipper_length_mm" : feature;
  const referenceIndex = flipperIndex >= 0 ? flipperIndex : featureIndex;
  const referenceWidth = availableStackWidthForFeature(referenceFeature, referenceIndex);

  return Math.max(1, Math.floor((referenceWidth + iconPaddingRight) / speciesIconStackGap));
}

function numericHistogramBins(feature) {
  const domain = yScales[feature].domain();
  const tickCount = feature === "bill_depth_mm" || feature === "body_mass_g" ? 32 : 50;
  const thresholds = yScales[feature].ticks(tickCount);
  // const thresholds = yScales[feature].ticks(30);

  return d3.bin()
    .domain(domain)
    .thresholds(thresholds)
    .value(row => row[feature])(penguins)
    .filter(bin => bin.length);
}

function categoricalHistogramBins(feature) {
  return yScales[feature].domain().map(value => {
    const rows = penguins.filter(row => row[feature] === value);
    rows.x0 = value;
    rows.x1 = value;
    rows.displayValue = value;
    return rows;
  }).filter(bin => bin.length);
}

function sortedRowsForIconStack(rows) {
  return speciesList.flatMap(species => rows.filter(row => row.species === species));
}

function packedIconPoints({ rows, feature, baseId, centerY, value }) {
  const featureIndex = orderedFeatures.indexOf(feature);
  const columns = stackColumnsForFeature(feature, featureIndex);
  const sortedRows = sortedRowsForIconStack(rows);
  const rowCount = Math.ceil(sortedRows.length / columns);
  const totalHeight = rowCount * speciesIconSize.height + Math.max(0, rowCount - 1) * iconPaddingTop;
  const startY = Math.max(0, Math.min(chartHeight - totalHeight, centerY - totalHeight / 2));

  return sortedRows.map((row, slot) => {
    const col = slot % columns;
    const gridRow = Math.floor(slot / columns);

    return {
      id: `${baseId}-${row.__id}`,
      feature,
      value,
      species: row.species,
      href: iconForSpecies(row.species),
      x: x(feature) + speciesIconRightOffset + col * speciesIconStackGap,
      y: startY + gridRow * speciesIconRowGap
    };
  });
}

function datasetIconPoints() {
  const points = [];

  orderedFeatures.forEach(feature => {
    if (feature === "sex") return;

    numericHistogramBins(feature).forEach((bin, binIndex) => {
      const centerY = yScales[feature]((bin.x0 + bin.x1) / 2);
      points.push(...packedIconPoints({
        rows: bin,
        feature,
        baseId: `${feature}-${binIndex}`,
        centerY,
        value: (bin.x0 + bin.x1) / 2
      }));
    });
  });

  return points;
}

function sexIconArrayPoints() {
  const feature = "sex";
  if (!orderedFeatures.includes(feature)) return [];

  const points = [];
  categoricalHistogramBins(feature).forEach(bin => {
    points.push(...packedIconPoints({
      rows: bin,
      feature,
      baseId: `sex-${bin.displayValue}`,
      centerY: yScales.sex(bin.displayValue),
      value: bin.displayValue
    }));
  });

  return points;
}

function drawDatasetSymbols() {
  datasetLayer = plot.append("g").attr("class", "dataset dataset-symbols");

  datasetLayer.selectAll("image.dataset-icon")
    .data([...datasetIconPoints(), ...sexIconArrayPoints()], d => d.id)
    .join("image")
    .attr("class", "dataset-icon")
    .attr("href", d => d.href)
    .attr("width", speciesIconSize.width)
    .attr("height", speciesIconSize.height)
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .attr("aria-hidden", "true");
}

function createUserInteractionLayers() {
  userSegmentsLayer = plot.append("g").attr("class", "user-segments-layer");
  userPointsLayer = plot.append("g").attr("class", "user-points-layer");
}


function draw(data) {
  penguins = parseRows(data);
  speciesList = Array.from(new Set(penguins.map(row => row.species))).sort();
  speciesColor.domain(speciesList);
  featureImportance = computeFeatureImportance(penguins);
  orderedFeatures = allFeatureKeys.slice().sort((a, b) => featureImportance[b] - featureImportance[a]);

  buildScales();
  x = d3.scalePoint()
    .domain(orderedFeatures)
    .range([40, chartWidth - 100])
    .padding(0.04);

  resetPredictionOnly();
  drawDatasetSymbols();
  drawAxes();
  createUserInteractionLayers();
  drawInputControls();
  drawSpeciesPanel();
  updateSpeciesPanel();
  updateExplorerDeck();
}

d3.csv(csvPath).then(draw).catch(error => {
  console.error(error);
  errorEl.textContent = "Could not load penguins.csv. Please run the dashboard from a local web server.";
});
