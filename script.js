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
const reportedIconPath = "img/reported.png";
const speciesIconSize = { width: 10, height: 14 };
const mysteryIconSize = { width: 20, height: 28 };
const speciesIconRightOffset = 10;
const iconPaddingTop = 1;
const iconPaddingRight = -2;
const speciesIconStackGap = speciesIconSize.width + iconPaddingRight;
const speciesIconRowGap = speciesIconSize.height + iconPaddingTop;
const speciesIconMaxStackWidth = 200;
const sexIconMaxColumns = 15;
const mysteryIconLeftOffset = -10;

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
// const caseReportButtonEl = document.querySelector("#caseReportButton");
const predictionButtonEl = document.querySelector("#predictionButton");
const predictionSummaryEl = document.querySelector("#predictionSummary");
const predictionResultsEl = document.querySelector("#predictionResults");

const width = Math.max(820, chartEl.getBoundingClientRect().width);
// Fixed 1920 x 1080 layout: keep the SVG viewBox tied to the rendered chart width
// while using a compact chart height that fits the 1080p dashboard.
const height = 640;
const margin = { top: 120, right: 0, bottom: 10, left: 0 };
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
let reportedFeaturesByCase = {};
let addedNeutralCluesBySpecies = {};
let selectedNeutralClues = new Set();
let probabilities = {};
let predictedSpecies = null;
let displayedUserIconSpecies = null;
let predictedColor = "#AEB7C2";
let isDraggingUserPoint = false;
let animatedCaseId = null;
const predictionFlightDuration = 1350;
const predictionPanelDelay = 1500;
const userIconSwapDelay = 2150;
const closeIconAnimationLimit = 320;
const nearbyNumericThreshold = 1;

function currentUserIconHref() {
  return displayedUserIconSpecies ? iconForSpecies(displayedUserIconSpecies) : mysteryIconPath;
}

function restartCssAnimation(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 900);
}

function animateElementOnce(element, className, duration = 900) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}

function animateCaseDetail(feature = null) {
  const board = document.querySelector(".case-board");
  animateElementOnce(board, "is-detail-reporting", 760);

  if (!feature || !selectedCaseDetailsEl) return;

  window.requestAnimationFrame(() => {
    const chip = selectedCaseDetailsEl.querySelector(`.case-chip[data-feature="${feature}"]`);
    animateElementOnce(chip, "is-detail-chip-reporting", 760);
  });
}

function animateSelectedCase(caseId) {
  animatedCaseId = caseId;
  window.setTimeout(() => {
    if (animatedCaseId === caseId) {
      animatedCaseId = null;
      updateExplorerDeck();
    }
  }, 360);
}

function setupExplorerToolAnimations() {
  [
    { selector: ".explorer-tool.post-it", className: "is-bumped-post-it", label: "Animate the Post-It" },
    { selector: ".explorer-tool.compass", className: "is-bumped-compass", label: "Animate the compass" }
  ].forEach(({ selector, className, label }) => {
    const tool = document.querySelector(selector);
    if (!tool) return;
    tool.setAttribute("role", "button");
    tool.setAttribute("tabindex", "0");
    tool.setAttribute("aria-label", label);
    tool.addEventListener("click", event => {
      event.stopPropagation();
      animateElementOnce(tool, className, 700);
    });
    tool.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        animateElementOnce(tool, className, 700);
      }
    });
  });
}

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
    button.className = `penguin-card${card.id === activeCaseId ? " is-active" : ""}${card.id === animatedCaseId ? " is-selecting" : ""}`;
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

  // caseReportButtonEl.addEventListener("click", reportSelectedCaseOnChart);
}

function isFeatureReported(caseId, feature) {
  return Boolean(reportedFeaturesByCase[caseId]?.has(feature));
}

function markFeatureReported(caseId, feature) {
  if (!reportedFeaturesByCase[caseId]) {
    reportedFeaturesByCase[caseId] = new Set();
  }

  reportedFeaturesByCase[caseId].add(feature);
}

function caseChipMarkup(card, feature, label, value) {
  const reportedClass = card && isFeatureReported(card.id, feature) ? " is-reported" : "";
  const reportedIcon = card && isFeatureReported(card.id, feature)
    ? `<img class="reported-icon" src="${reportedIconPath}" alt="Reported" />`
    : "";

  return `
    <span class="case-chip${reportedClass}" data-feature="${feature}">
      ${reportedIcon}
      <b>${label}</b>
      <span>${formatDisplayValue(feature, value)}</span>
    </span>`;
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
    ${caseChipMarkup(card, "bill_length_mm", "Bill length", values.bill_length_mm)}
    ${caseChipMarkup(card, "bill_depth_mm", "Bill depth", values.bill_depth_mm)}
    ${caseChipMarkup(card, "flipper_length_mm", "Flipper length", values.flipper_length_mm)}
    ${caseChipMarkup(card, "body_mass_g", "Body mass", values.body_mass_g)}
    ${caseChipMarkup(card, "sex", "Sex", values.sex)}`;
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


function getFeatureControl(feature) {
  return document.querySelector(`.axis-input input[data-feature="${feature}"], .axis-input select[data-feature="${feature}"]`);
}

function safeSetCustomValidity(control, message = "") {
  if (control && typeof control.setCustomValidity === "function") {
    control.setCustomValidity(message);
  }
}

function safeFocusControl(control) {
  if (control && typeof control.focus === "function") {
    control.focus({ preventScroll: true });
  }
}

function syncControlsToInputValues() {
  allFeatureKeys.forEach(feature => {
    const control = getFeatureControl(feature);
    if (!control) return;
    control.value = inputValues[feature] ?? "";
    safeSetCustomValidity(control, "");
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

function clearChartValues() {
  inputValues = {};
  resetPredictionOnly();
  errorEl.textContent = "";

  d3.selectAll(".axis-input input")
    .property("value", "")
    .each(function () { safeSetCustomValidity(this, ""); });

  d3.selectAll(".axis-input select")
    .property("value", "");

  updateUserOverlay();
  updateSpeciesPanel();
}

function selectExplorerCase(caseId) {
  const selected = explorerCases.find(card => card.id === caseId);
  if (!selected) return;

  const isNewCase = activeCaseId !== selected.id;
  activeCaseId = selected.id;

  if (isNewCase) {
    clearChartValues();
  }

  errorEl.textContent = "";
  animateSelectedCase(selected.id);
  updateExplorerDeck();
}

function reportSelectedCaseOnChart() {
  const selected = explorerCases.find(card => card.id === activeCaseId);
  if (!selected) {
    errorEl.textContent = "Pick a case first, then report it on the chart.";
    return;
  }

  allFeatureKeys.forEach(feature => markFeatureReported(selected.id, feature));
  loadExplorerValues(selected.values);
  updateExplorerDeck();
  animateCaseDetail();
}

function reportSelectedCaseFeatureOnChart(feature) {
  const selected = explorerCases.find(card => card.id === activeCaseId);
  if (!selected) {
    errorEl.textContent = "Pick a case first, then click a folder button to report that clue.";
    return;
  }

  const value = selected.values[feature];
  if (value === undefined || value === null || value === "") {
    errorEl.textContent = `${selected.name} does not have a ${prettyName[feature].toLowerCase()} clue.`;
    return;
  }

  errorEl.textContent = "";
  markFeatureReported(selected.id, feature);
  setFeatureValue(feature, value, false, { keepSelectedCase: true });
  animateCaseDetail(feature);
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
  displayedUserIconSpecies = null;
  predictedColor = "#AEB7C2";
  probabilities = Object.fromEntries(speciesList.map(species => [species, 0]));
  addedNeutralCluesBySpecies = {};
  selectedNeutralClues = new Set();
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

function setFeatureValue(feature, value, shouldFocus = false, options = {}) {
  const control = getFeatureControl(feature);

  if (!options.keepSelectedCase) {
    markCustomInput();
  }

  if (control) {
    control.value = value;
  }

  if (feature === "sex") {
    if (value) inputValues[feature] = value;
    else delete inputValues[feature];
  } else {
    const numericValue = Number(value);
    const [min, max] = yScales[feature].domain();

    if (Number.isFinite(numericValue) && numericValue >= min && numericValue <= max) {
      inputValues[feature] = numericValue;

      if (control) {
        safeSetCustomValidity(control, "");
      }
    } else if (value === "") {
      delete inputValues[feature];

      if (control) {
        safeSetCustomValidity(control, "");
      }
    } else {
      if (control) {
        safeSetCustomValidity(control, `Enter a number from ${min} to ${max}`);
      }
      return;
    }
  }

  if (shouldFocus && control) {
    safeFocusControl(control);
  }

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

  const control = getFeatureControl(d.feature);
  if (control) {
    safeFocusControl(control);
  }

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
        .attr("href", currentUserIconHref())
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

  iconJoin.attr("href", currentUserIconHref())
    .classed("is-predicted", Boolean(predictedSpecies));

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

function speciesCardFor(species) {
  return document.querySelector(`.${speciesKey(species)}-card`);
}

function neutralClueKey(species, clue) {
  return `${species}::${clue.feature}::${clue.label}`;
}

function renderAddedNeutralClues() {
  speciesList.forEach(species => {
    const card = speciesCardFor(species);
    const ruler = card?.querySelector(".schema-ruler");
    if (!ruler) return;

    ruler.querySelectorAll(".dynamic-neutral-clue").forEach(clue => clue.remove());
    const clues = Array.from(addedNeutralCluesBySpecies[species] || []);

    clues.forEach(label => {
      const clue = document.createElement("span");
      clue.className = "dynamic-neutral-clue";
      clue.style.setProperty("--neutral-clue-colour", speciesColor(species));
      clue.textContent = label;
      ruler.appendChild(clue);
    });
  });
}

function addNeutralClueToPredictedSpecies(clue) {
  if (!predictedSpecies) {
    errorEl.textContent = "Guess the species first, then tap a neutral clue to add it to the predicted species card.";
    return;
  }

  if (!addedNeutralCluesBySpecies[predictedSpecies]) {
    addedNeutralCluesBySpecies[predictedSpecies] = new Set();
  }

  addedNeutralCluesBySpecies[predictedSpecies].add(clue.label);
  selectedNeutralClues.add(neutralClueKey(predictedSpecies, clue));
  errorEl.textContent = "";
  updateNeutralClueButtons();
  renderAddedNeutralClues();
}

function updateNeutralClueButtons() {
  svg.selectAll(".axis-neutral-clue")
    .classed("is-enabled", Boolean(predictedSpecies))
    .classed("is-selected", clue => Boolean(predictedSpecies) && selectedNeutralClues.has(neutralClueKey(predictedSpecies, clue)))
    .attr("aria-disabled", predictedSpecies ? "false" : "true")
    .style("--selected-clue-colour", predictedSpecies ? speciesColor(predictedSpecies) : null);
}

function updateSpeciesPanel() {
  if (predictionResultsEl) {
    const rows = d3.select(predictionResultsEl).selectAll(".prediction-result-row")
      .data(speciesList, d => d);

    rows.classed("predicted", d => d === predictedSpecies)
      .classed("dim", d => predictedSpecies && d !== predictedSpecies);

    rows.select(".prediction-circle")
      .style("--prediction-colour", d => speciesColor(d));

    rows.select(".prediction-confidence")
      .text(d => probabilities[d] ? `${Math.round(probabilities[d] * 100)}%` : "—");
  }

  if (predictionSummaryEl) {
    if (predictedSpecies) {
      predictionSummaryEl.innerHTML = `The selected penguin is most likely <mark style="--summary-colour: ${speciesColor(predictedSpecies)}">${predictedSpecies}</mark>.`;
    } else {
      predictionSummaryEl.textContent = "The selected penguin is most likely…";
    }
  }

  svg.selectAll("image.dataset-icon")
    .classed("highlighted", false)
    .attr("opacity", d => predictedSpecies ? (d.species === predictedSpecies ? 0.72 : 0.13) : 0.28);

  updateNeutralClueButtons();

  renderAddedNeutralClues();
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

function iconDistanceToMystery(iconDatum) {
  if (!iconDatum || inputValues[iconDatum.feature] === undefined) return Infinity;

  if (iconDatum.feature === "sex") {
    return iconDatum.value === inputValues.sex ? 0 : Infinity;
  }

  const [min, max] = yScales[iconDatum.feature].domain();
  const range = max - min || 1;
  return Math.abs(iconDatum.value - inputValues[iconDatum.feature]) / range;
}

function nearbyDatasetIcons() {
  const enteredFeatureSet = new Set(orderedFeatures.filter(feature => inputValues[feature] !== undefined));

  const icons = svg.selectAll("image.dataset-icon")
    .nodes()
    .map(node => {
      const datum = d3.select(node).datum();
      return { node, datum, distance: iconDistanceToMystery(datum) };
    })
    .filter(item => enteredFeatureSet.has(item.datum.feature) && Number.isFinite(item.distance))
    .sort((a, b) => {
      const predictedBoostA = a.datum.species === predictedSpecies ? -0.22 : 0;
      const predictedBoostB = b.datum.species === predictedSpecies ? -0.22 : 0;
      return (a.distance + predictedBoostA) - (b.distance + predictedBoostB);
    });

  // Keep the original "data from every axis flies in" feeling by sampling across
  // all reported axes, then filling the rest with the closest records.
  const chosen = [];
  const seen = new Set();
  const perAxisTarget = Math.max(18, Math.floor(closeIconAnimationLimit / Math.max(1, enteredFeatureSet.size)));

  enteredFeatureSet.forEach(feature => {
    icons
      .filter(item => item.datum.feature === feature)
      .slice(0, perAxisTarget)
      .forEach(item => {
        const key = item.datum.id;
        if (!seen.has(key)) {
          seen.add(key);
          chosen.push(item);
        }
      });
  });

  icons.forEach(item => {
    if (chosen.length >= closeIconAnimationLimit) return;
    const key = item.datum.id;
    if (!seen.has(key)) {
      seen.add(key);
      chosen.push(item);
    }
  });

  return chosen;
}

function predictionCircleForSpecies(species) {
  return document.querySelector(`.prediction-result-row[data-species-key="${speciesKey(species)}"] .prediction-circle`);
}

function animateNearbyIconsToPrediction() {
  if (!predictionResultsEl || !predictedSpecies) return;

  const icons = nearbyDatasetIcons();
  const fallbackTarget = predictionCircleForSpecies(predictedSpecies);
  const panelRect = document.body.getBoundingClientRect();

  icons.forEach((item, index) => {
    const sourceRect = item.node.getBoundingClientRect();
    const targetEl = fallbackTarget || predictionResultsEl;
    if (!targetEl || sourceRect.width === 0 || sourceRect.height === 0) return;

    const targetRect = targetEl.getBoundingClientRect();
    const clone = document.createElement("img");
    clone.className = "flying-penguin-icon";
    clone.src = item.datum.href;
    clone.alt = "";
    clone.setAttribute("aria-hidden", "true");
    clone.style.left = `${sourceRect.left - panelRect.left}px`;
    clone.style.top = `${sourceRect.top - panelRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.height = `${sourceRect.height}px`;
    document.body.appendChild(clone);

    const targetX = targetRect.left + targetRect.width / 2 - sourceRect.width / 2 - panelRect.left;
    const targetY = targetRect.top + targetRect.height / 2 - sourceRect.height / 2 - panelRect.top;
    const delay = Math.min(index * 6, 620);

    clone.animate([
      { transform: "translate3d(0,0,0) scale(1) rotate(0deg)", opacity: 0.95 },
      { transform: `translate3d(${(targetX - (sourceRect.left - panelRect.left)) * 0.45}px, ${Math.min(-70, targetY - (sourceRect.top - panelRect.top) - 90)}px, 0) scale(1.35) rotate(-10deg)`, opacity: 1, offset: 0.48 },
      { transform: `translate3d(${targetX - (sourceRect.left - panelRect.left)}px, ${targetY - (sourceRect.top - panelRect.top)}px, 0) scale(0.55) rotate(18deg)`, opacity: 0 }
    ], {
      duration: predictionFlightDuration,
      delay,
      easing: "cubic-bezier(.16,.85,.24,1)",
      fill: "forwards"
    }).onfinish = () => clone.remove();
  });

  predictionResultsEl.classList.add("is-clustering");
  window.setTimeout(() => predictionResultsEl.classList.remove("is-clustering"), 1450);
}

function predictSpecies() {
  const enteredFeatures = orderedFeatures.filter(feature => inputValues[feature] !== undefined);

  if (!enteredFeatures.length) {
    resetPredictionOnly();
    updateSpeciesPanel();
    updateUserOverlay();
    errorEl.textContent = "Add one penguin clue first — try tapping a line or select a case.";
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
  const nextProbabilities = Object.fromEntries(closeness.map(d => [d.species, d.score / total]));
  const nextPredictedSpecies = Object.entries(nextProbabilities).sort((a, b) => b[1] - a[1])[0][0];
  const nextPredictedColor = speciesColor(nextPredictedSpecies);

  // Keep the mystery icon visible while the nearby data icons fly first.
  probabilities = Object.fromEntries(speciesList.map(species => [species, 0]));
  predictedSpecies = null;
  displayedUserIconSpecies = null;
  predictedColor = "#AEB7C2";
  addedNeutralCluesBySpecies = {};
  selectedNeutralClues = new Set();
  updateSpeciesPanel();
  updateUserOverlay();

  const animationSpecies = nextPredictedSpecies;
  predictedSpecies = animationSpecies;
  restartCssAnimation(predictionButtonEl, "is-thinking");
  animateNearbyIconsToPrediction();

  window.setTimeout(() => {
    probabilities = nextProbabilities;
    predictedSpecies = nextPredictedSpecies;
    predictedColor = nextPredictedColor;
    updateSpeciesPanel();
  }, predictionPanelDelay);

  window.setTimeout(() => {
    probabilities = nextProbabilities;
    predictedSpecies = nextPredictedSpecies;
    displayedUserIconSpecies = nextPredictedSpecies;
    predictedColor = nextPredictedColor;
    updateUserOverlay();
  }, userIconSwapDelay);
}

function resetDashboard() {
  inputValues = {};
  activeCaseId = null;
  resetPredictionOnly();
  errorEl.textContent = "";

  d3.selectAll(".axis-input input")
    .property("value", "")
    .each(function () { safeSetCustomValidity(this, ""); });

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
  setFeatureValue(feature, value, true);
}


function drawInputControls() {
  const inputY = -108;
  const inputWidth = 164;
  const inputHeight = 44;

  // const resetGroup = svg.append("g")
  //   .attr("class", "action-control reset-control")
  //   .attr("transform", `translate(22,${margin.top + inputY})`);

  // resetGroup.append("foreignObject")
  //   .attr("width", 116)
  //   .attr("height", inputHeight)
  //   .attr("x", -142)
  //   .append("xhtml:button")
  //   .attr("type", "button")
  //   .attr("class", "secondary")
  //   .text("Start over")
  //   .on("click", resetDashboard);

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
    .attr("class", "prediction-result-row")
    .attr("data-species-key", d => speciesKey(d));

  const circles = rows.append("span")
    .attr("class", "prediction-circle")
    .style("--prediction-colour", d => speciesColor(d));

  circles.append("span")
    .attr("class", "prediction-confidence")
    .text("—");

  rows.append("span")
    .attr("class", "prediction-species")
    .text(d => d);
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
    .attr("y", -90)
    .text(d => prettyUnit[d] ? `${prettyName[d]} (${prettyUnit[d]})` : prettyName[d]);

  const reportButtons = axes.append("g")
    .attr("class", "feature-report-button")
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-label", feature => `Click to report the ${prettyName[feature]} value for the selected case`)
    .attr("transform", "translate(-25,-78)")
    .style("cursor", "pointer")
    .on("click", function (event, feature) {
      event.stopPropagation();
      reportSelectedCaseFeatureOnChart(feature);
    })
    .on("keydown", function (event, feature) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        reportSelectedCaseFeatureOnChart(feature);
      }
    });

  reportButtons.append("rect")
    .attr("class", "feature-report-hitbox")
    .attr("x", 0)
    .attr("y", -4)
    .attr("width", 52)
    .attr("height", 58)
    .attr("fill", "transparent");

  reportButtons.append("image")
    .attr("class", "feature-report-folder-icon")
    .attr("href", "img/folder.png")
    .attr("width", 26)
    .attr("height", 26)
    .attr("x", 11)
    .attr("y", 0)
    .attr("aria-hidden", "true");

  reportButtons.append("text")
    .attr("class", "feature-report-button-text")
    .attr("x", 2)
    .attr("y", 38)
    .attr("text-anchor", "middle")
    .selectAll("tspan")
    .data(["click to report", "case value"])
    .join("tspan")
    .attr("x", 24)
    .attr("dy", (d, i) => i === 0 ? 0 : 11)
    .text(d => d);

  const neutralClueGroups = axes
    .filter(feature => axisNeutralClues[feature])
    .selectAll("g.axis-neutral-clue")
    .data(feature => [
      { feature, label: axisNeutralClues[feature].top, y: chartHeight * 0.32 },
      { feature, label: axisNeutralClues[feature].bottom, y: chartHeight * 0.68 }
    ])
    .join("g")
    .attr("class", "axis-neutral-clue")
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-label", d => `Add ${d.label} as a clue to the predicted species card`)
    .attr("aria-disabled", "true")
    .attr("transform", d => `translate(-58,${d.y}) rotate(-90)`)
    .on("click", function (event, clue) {
      event.stopPropagation();
      addNeutralClueToPredictedSpecies(clue);
    })
    .on("keydown", function (event, clue) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        addNeutralClueToPredictedSpecies(clue);
      }
    });

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
    .range([0, chartWidth - 20])
    .padding(0.02);

  resetPredictionOnly();
  drawDatasetSymbols();
  drawAxes();
  createUserInteractionLayers();
  drawInputControls();
  drawSpeciesPanel();
  setupExplorerToolAnimations();
  updateSpeciesPanel();
  updateExplorerDeck();
}

d3.csv(csvPath).then(draw).catch(error => {
  console.error(error);
  errorEl.textContent = "Could not load penguins.csv. Please run the dashboard from a local web server.";
});