const DATA_SOURCES = Object.freeze({
  coinbase: "https://api.exchange.coinbase.com/products",
  baseRpc: "https://mainnet.base.org",
  optimismRpc: "https://mainnet.optimism.io",
  aeroContract: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  veloContract: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db",
  aeroLogo: "https://aerodrome.finance/brand-kit/AERO/symbol.svg",
  veloLogo: "https://velodrome.finance/brand-kit/VELO/symbol.svg",
});

const market = {
  aeroSupply: null,
  veloSupply: null,
  aeroPrice: null,
  veloPrice: null,
  aeroChange: null,
  veloChange: null,
  aeroShare: 0.945,
  veloShare: 0.055,
  aeroUpdatedAt: null,
  veloUpdatedAt: null,
  updatedAt: null,
};

const sourceHealth = {
  aeroPrice: "loading",
  veloPrice: "loading",
  aeroSupply: "loading",
  veloSupply: "loading",
};

const sourceLabels = {
  aeroPrice: "Coinbase AERO",
  veloPrice: "Coinbase VELO",
  aeroSupply: "Base RPC",
  veloSupply: "Optimism RPC",
};

const defaults = { aero: 10_000, velo: 200_000 };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ui = {
  aero: $("#aeroAmount"),
  velo: $("#veloAmount"),
  aeroValue: $("#aeroValue"),
  veloValue: $("#veloValue"),
  total: $("#totalOutput"),
  aeroOutput: $("#aeroOutput"),
  veloOutput: $("#veloOutput"),
  aeroAllocationBar: $("#aeroAllocationBar"),
  veloAllocationBar: $("#veloAllocationBar"),
  aeroAllocationLabel: $("#aeroAllocationLabel"),
  veloAllocationLabel: $("#veloAllocationLabel"),
  derivedSupply: $("#derivedSupply"),
  veloRatio: $("#veloRatio"),
  aeroRequired: $("#aeroRequired"),
  veloRequired: $("#veloRequired"),
  aeroRoutePrice: $("#aeroRoutePrice"),
  veloRoutePrice: $("#veloRoutePrice"),
  spreadDollar: $("#spreadDollar"),
  heroPremium: $("#heroPremium"),
  heroSaving: $("#heroSaving"),
  heroPremiumLabel: $("#heroPremiumLabel"),
  heroSavingCopy: $("#heroSavingCopy"),
  heroSavingSuffix: $("#heroSavingSuffix"),
  heroRouteName: $("#heroRouteName"),
  heroRouteStamp: $("#heroRouteStamp"),
  heroRouteLogo: $("#heroRouteLogo"),
  aeroRouteEntry: $("#aeroRouteEntry"),
  veloRouteEntry: $("#veloRouteEntry"),
  aeroSignal: $("#aeroSignal"),
  veloSignal: $("#veloSignal"),
  routeVerdictCopy: $("#routeVerdictCopy"),
  aeroHeaderPrice: $("#aeroHeaderPrice"),
  veloHeaderPrice: $("#veloHeaderPrice"),
  aeroHeaderChange: $("#aeroHeaderChange"),
  veloHeaderChange: $("#veloHeaderChange"),
  dataStatus: $("#dataStatus"),
  mobileDataStatus: $("#mobileDataStatus"),
  snapshotDate: $("#snapshotDate"),
  chartLatestTime: $("#chartLatestTime"),
  historyResolution: $("#historyResolution"),
};

const periods = {
  "24H": { data: null, labels: [], timestamps: [], state: "idle", error: null },
  "7D": { data: null, labels: [], timestamps: [], state: "idle", error: null },
  "30D": { data: null, labels: [], timestamps: [], state: "idle", error: null },
  "1Y": { data: null, labels: [], timestamps: [], state: "idle", error: null },
};

const periodResolution = {
  "24H": "24H · 1-HOUR CANDLES",
  "7D": "7D · 6-HOUR CANDLES",
  "30D": "30D · 6-HOUR CANDLES",
  "1Y": "1Y · DAILY CANDLES",
};

let activePeriod = "30D";
const historyLoaded = new Set();
let chartState = null;

const number = (value) => {
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const format = (value, digits = 2) => new Intl.NumberFormat("en-US", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(Number.isFinite(value) ? value : 0);

const money = (value, digits = 2) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(Number.isFinite(value) ? value : 0);

const compact = (value) => value >= 1e9
  ? `${(value / 1e9).toFixed(2)}B`
  : `${(value / 1e6).toFixed(2)}M`;

const signedPercent = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const isPositive = (value) => Number.isFinite(value) && value > 0;

function hasSupplyRatio() {
  return isPositive(market.aeroSupply) && isPositive(market.veloSupply);
}

function setText(element, value, formatter = String) {
  element.textContent = Number.isFinite(value) ? formatter(value) : "—";
}

function setRouteSignal(element, isWinner) {
  if (isWinner === null) {
    element.className = "route-signal unavailable";
    element.innerHTML = "<i></i>DATA UNAVAILABLE";
    return;
  }
  element.className = `route-signal ${isWinner ? "efficient" : "premium"}`;
  element.innerHTML = `<i></i>${isWinner ? "BEST ROUTE" : "PREMIUM"}`;
}

function updateChange(element, value) {
  element.classList.remove("up", "down");
  if (!Number.isFinite(value)) {
    element.textContent = "—";
    return;
  }
  element.classList.add(value >= 0 ? "up" : "down");
  element.textContent = `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function updateMarketMeta() {
  ui.aeroHeaderPrice.textContent = isPositive(market.aeroPrice) ? money(market.aeroPrice, 4) : "—";
  ui.veloHeaderPrice.textContent = isPositive(market.veloPrice) ? money(market.veloPrice, 4) : "—";
  updateChange(ui.aeroHeaderChange, market.aeroChange);
  updateChange(ui.veloHeaderChange, market.veloChange);

  const livePrices = [sourceHealth.aeroPrice, sourceHealth.veloPrice].filter((state) => state === "live").length;
  const loadingPrices = [sourceHealth.aeroPrice, sourceHealth.veloPrice].some((state) => state === "loading");
  if (livePrices === 2 && market.updatedAt) {
    const timestamp = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(market.updatedAt).replace(",", " ·").toUpperCase();
    ui.snapshotDate.textContent = `PRICES AS OF ${timestamp} IST`;
  } else if (livePrices > 0) {
    ui.snapshotDate.textContent = "PARTIAL COINBASE DATA";
  } else {
    ui.snapshotDate.textContent = loadingPrices ? "AWAITING COINBASE DATA" : "COINBASE DATA UNAVAILABLE";
  }
}

function setDataStatus(state, text) {
  [ui.dataStatus, ui.mobileDataStatus].filter(Boolean).forEach((element) => {
    const wrapper = element.closest(".live-mark");
    wrapper.classList.remove("loading", "partial", "unavailable");
    if (state !== "live") wrapper.classList.add(state);
    element.textContent = text;
  });
}

function updateDataStatus() {
  const entries = Object.entries(sourceHealth);
  const liveCount = entries.filter(([, state]) => state === "live").length;
  const loadingCount = entries.filter(([, state]) => state === "loading").length;
  if (liveCount === entries.length) {
    setDataStatus("live", "DIRECT DATA LIVE");
  } else if (liveCount === 0 && loadingCount > 0) {
    setDataStatus("loading", "LOADING DIRECT DATA");
  } else if (liveCount === 0) {
    setDataStatus("unavailable", "DIRECT DATA UNAVAILABLE");
  } else {
    const failed = entries.filter(([, state]) => state === "error");
    const partialText = failed.length === 1
      ? `${sourceLabels[failed[0][0]].toUpperCase()} UNAVAILABLE`
      : `${liveCount}/${entries.length} DATA FEEDS LIVE`;
    setDataStatus("partial", partialText);
  }
  const sourceSummary = entries
    .map(([source, state]) => `${sourceLabels[source]}: ${state.toUpperCase()}`)
    .join(" · ");
  [ui.dataStatus, ui.mobileDataStatus].filter(Boolean).forEach((element) => {
    element.closest(".live-mark").title = sourceSummary;
  });
}

function calculate() {
  const aeroAmount = number(ui.aero.value);
  const veloAmount = number(ui.velo.value);
  const supply = isPositive(market.aeroSupply) ? market.aeroSupply / market.aeroShare : null;
  const aeroRatio = 1;
  const veloRatio = hasSupplyRatio() ? market.veloSupply / (supply * market.veloShare) : null;
  const aeroOutput = aeroAmount;
  const veloOutput = isPositive(veloRatio) ? veloAmount / veloRatio : null;
  const totalOutput = Number.isFinite(veloOutput) ? aeroOutput + veloOutput : null;
  const aeroRoutePrice = isPositive(market.aeroPrice) ? market.aeroPrice : null;
  const veloRoutePrice = isPositive(veloRatio) && isPositive(market.veloPrice) ? veloRatio * market.veloPrice : null;
  const comparisonAvailable = isPositive(aeroRoutePrice) && isPositive(veloRoutePrice);

  setText(ui.aeroValue, isPositive(market.aeroPrice) ? aeroAmount * market.aeroPrice : null, (value) => money(value));
  setText(ui.veloValue, isPositive(market.veloPrice) ? veloAmount * market.veloPrice : null, (value) => money(value));
  setText(ui.total, totalOutput, (value) => format(value));
  ui.aeroOutput.textContent = format(aeroOutput);
  setText(ui.veloOutput, veloOutput, (value) => format(value));
  const aeroOutputShare = isPositive(totalOutput) ? (aeroOutput / totalOutput) * 100 : null;
  const veloOutputShare = isPositive(totalOutput) ? (veloOutput / totalOutput) * 100 : null;
  ui.aeroAllocationBar.style.width = Number.isFinite(aeroOutputShare) ? `${aeroOutputShare}%` : "0%";
  ui.veloAllocationBar.style.width = Number.isFinite(veloOutputShare) ? `${veloOutputShare}%` : "0%";
  ui.aeroAllocationLabel.textContent = Number.isFinite(aeroOutputShare)
    ? `${format(aeroOutputShare, 1)}% FROM AERO`
    : "AERO OUTPUT SHARE —";
  ui.veloAllocationLabel.textContent = Number.isFinite(veloOutputShare)
    ? `${format(veloOutputShare, 1)}% FROM VELO`
    : "VELO OUTPUT SHARE —";
  setText(ui.derivedSupply, supply, (value) => compact(value));
  setText(ui.veloRatio, veloRatio, (value) => format(value, 4));
  ui.aeroRequired.textContent = format(aeroRatio, 4);
  setText(ui.veloRequired, veloRatio, (value) => format(value, 4));
  setText(ui.aeroRoutePrice, aeroRoutePrice, (value) => money(value, 4));
  setText(ui.veloRoutePrice, veloRoutePrice, (value) => money(value, 4));

  if (!comparisonAvailable) {
    ui.spreadDollar.textContent = "—";
    ui.heroPremium.textContent = "—";
    ui.heroSaving.textContent = "—";
    ui.heroPremiumLabel.textContent = "ROUTE COST DIFFERENCE";
    ui.heroSavingCopy.textContent = "EFFECTIVE DISCOUNT UNAVAILABLE";
    ui.heroSavingSuffix.textContent = "Live prices and both supply feeds are required.";
    ui.heroRouteName.textContent = "UNAVAILABLE";
    ui.heroRouteStamp.hidden = true;
    ui.aeroRouteEntry.classList.remove("winner-entry");
    ui.veloRouteEntry.classList.remove("winner-entry");
    setRouteSignal(ui.aeroSignal, null);
    setRouteSignal(ui.veloSignal, null);
    ui.routeVerdictCopy.textContent = "Route comparison requires live AERO and VELO prices plus both on-chain supplies.";
    return;
  }

  const spread = Math.abs(aeroRoutePrice - veloRoutePrice);
  const aeroIsCheaper = aeroRoutePrice <= veloRoutePrice;
  const cheaperName = aeroIsCheaper ? "AERO" : "VELO";
  const premiumName = aeroIsCheaper ? "VELO" : "AERO";
  const expensive = Math.max(aeroRoutePrice, veloRoutePrice);
  const cheap = Math.min(aeroRoutePrice, veloRoutePrice);
  const relativeSpread = ((expensive / cheap) - 1) * 100;
  const discountRate = (1 - (cheap / expensive)) * 100;
  const saving = 10_000 * (discountRate / 100);

  ui.spreadDollar.textContent = money(spread, 4);
  ui.heroPremium.textContent = `${format(relativeSpread, 2)}%`;
  ui.heroSaving.textContent = money(saving, 0);
  ui.heroPremiumLabel.textContent = `${premiumName} COSTS MORE`;
  ui.heroSavingCopy.textContent = `${cheaperName} EFFECTIVE DISCOUNT · ${format(discountRate, 2)}%`;
  ui.heroSavingSuffix.textContent = `SAVED ON EQUIVALENT OUTPUT VS A $10K ${premiumName} PURCHASE`;
  ui.heroRouteName.textContent = cheaperName;
  ui.heroRouteStamp.hidden = false;
  ui.heroRouteStamp.className = `asset-stamp ${aeroIsCheaper ? "aero-stamp" : "velo-stamp"}`;
  ui.heroRouteLogo.src = aeroIsCheaper ? DATA_SOURCES.aeroLogo : DATA_SOURCES.veloLogo;
  ui.aeroRouteEntry.classList.toggle("winner-entry", aeroIsCheaper);
  ui.veloRouteEntry.classList.toggle("winner-entry", !aeroIsCheaper);
  setRouteSignal(ui.aeroSignal, aeroIsCheaper);
  setRouteSignal(ui.veloSignal, !aeroIsCheaper);
  ui.routeVerdictCopy.innerHTML = `<b>${cheaperName}</b> is the cheaper conversion route. <span>${premiumName}</span> currently costs <strong>${format(relativeSpread, 2)}%</strong> more; the equivalent <span>${cheaperName}</span> discount is <strong>${format(discountRate, 2)}%</strong>.`;
}

function niceStep(range, targetIntervals = 5) {
  const rough = Math.max(range / targetIntervals, Number.EPSILON);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function formatAxisTick(value, step) {
  if (Math.abs(value) < Number.EPSILON) return "0%";
  const digits = step < 1 ? 1 : 0;
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatTooltipDate(timestamp, fallback) {
  if (!timestamp) return fallback || "NOW";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(timestamp * 1000)).replace(",", " ·").toUpperCase()} IST`;
}

function updateChartPoint(index) {
  if (!chartState) return;
  const safeIndex = Math.max(0, Math.min(chartState.data.length - 1, index));
  const value = chartState.data[safeIndex];
  const pointX = chartState.x(safeIndex);
  const pointY = chartState.y(value);
  const horizontal = pointX / chartState.width;
  const aeroIsPremium = value >= 0;
  const cheaperRoute = aeroIsPremium ? "VELO" : "AERO";

  $("#endGuide").setAttribute("x1", pointX);
  $("#endGuide").setAttribute("x2", pointX);
  $("#endHalo").setAttribute("cx", pointX);
  $("#endHalo").setAttribute("cy", pointY);
  $("#endPoint").setAttribute("cx", pointX);
  $("#endPoint").setAttribute("cy", pointY);
  $("#chartTooltipRoute").textContent = `${cheaperRoute} CHEAPER`;
  $("#chartTooltipValue").textContent = `AERO PRICE GAP ${signedPercent(value)}`;
  $("#chartTooltipMetric").textContent = `AERO COSTS ${Math.abs(value).toFixed(2)}% ${aeroIsPremium ? "MORE" : "LESS"}`;
  $("#chartTooltipDate").textContent = formatTooltipDate(
    chartState.timestamps?.[safeIndex],
    chartState.labels?.[safeIndex],
  );

  const tooltip = $("#chartCallout");
  const renderedHeight = $("#historyChart").getBoundingClientRect().height || chartState.height;
  tooltip.style.left = `${horizontal * 100}%`;
  tooltip.style.right = "auto";
  tooltip.style.top = `${(pointY / chartState.height) * renderedHeight}px`;
  tooltip.classList.toggle("from-left", horizontal < 0.16);
}

function renderChartUnavailable(message) {
  chartState = null;
  $("#chartGrid").innerHTML = "";
  $("#chartYAxis").innerHTML = "";
  $("#chartLabels").innerHTML = "";
  $("#chartLine").setAttribute("points", "");
  $("#chartArea").setAttribute("d", "");
  ["#endGuide", "#endHalo", "#endPoint"].forEach((selector) => {
    $(selector).style.visibility = "hidden";
  });
  $("#chartCallout").hidden = true;
  $("#chartEmpty").hidden = false;
  $("#chartEmpty").textContent = message;
  $("#chartLatest").textContent = "—";
  ui.chartLatestTime.textContent = "—";
  $("#chartHigh").textContent = "—";
  $("#chartAverage").textContent = "—";
  ui.historyResolution.textContent = periodResolution[activePeriod];
}

function drawChart(period) {
  const series = periods[period];
  const { data, labels } = series;
  if (!Array.isArray(data) || data.length < 2) {
    const message = series.state === "loading"
      ? "LOADING COINBASE CANDLES"
      : series.error || "LIVE HISTORY UNAVAILABLE";
    renderChartUnavailable(message);
    return;
  }

  $("#chartEmpty").hidden = true;
  $("#chartCallout").hidden = false;
  ["#endGuide", "#endHalo", "#endPoint"].forEach((selector) => {
    $(selector).style.visibility = "visible";
  });
  const width = 1000;
  const height = 340;
  const top = 22;
  const bottom = 33;
  const observedMin = Math.min(0, ...data);
  const observedMax = Math.max(0, ...data);
  const observedRange = Math.max(observedMax - observedMin, 1);
  const padding = observedRange * 0.08;
  const step = niceStep(observedRange + (padding * 2));
  const min = Math.floor((observedMin - padding) / step) * step;
  const max = Math.ceil((observedMax + padding) / step) * step;
  const ticks = [];
  for (let tick = max; tick >= min - (step / 1000); tick -= step) {
    ticks.push(Math.abs(tick) < step / 1000 ? 0 : tick);
  }
  const x = (index) => index * (width / (data.length - 1));
  const y = (value) => top + ((max - value) / (max - min)) * (height - top - bottom);
  const points = data.map((value, index) => `${x(index)},${y(value)}`);
  const latest = data.at(-1);
  $("#chartGrid").innerHTML = ticks.map((tick) => {
    const position = y(tick);
    const className = tick === 0 ? ' class="zero"' : "";
    return `<line${className} x1="0" y1="${position}" x2="${width}" y2="${position}" />`;
  }).join("");
  $("#chartYAxis").innerHTML = ticks.map((tick) => `<span>${formatAxisTick(tick, step)}</span>`).join("");
  $("#chartLine").setAttribute("points", points.join(" "));
  $("#chartArea").setAttribute("d", `M${points[0]} L${points.slice(1).join(" L")} L${width},${height - bottom} L0,${height - bottom} Z`);
  $("#chartLatest").textContent = signedPercent(latest);
  ui.chartLatestTime.textContent = formatTooltipDate(series.timestamps.at(-1), labels.at(-1));
  $("#chartHigh").textContent = signedPercent(Math.max(...data));
  const average = data.reduce((sum, value) => sum + value, 0) / data.length;
  $("#chartAverage").textContent = signedPercent(average);
  $("#chartLabels").innerHTML = labels.map((label) => `<span>${label}</span>`).join("");
  ui.historyResolution.textContent = periodResolution[period];
  chartState = { data, labels, timestamps: series.timestamps, x, y, width, height };
  updateChartPoint(data.length - 1);
}

async function fetchJson(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoinbaseMarket(product) {
  const [ticker, stats] = await Promise.all([
    fetchJson(`${DATA_SOURCES.coinbase}/${product}/ticker`),
    fetchJson(`${DATA_SOURCES.coinbase}/${product}/stats`),
  ]);
  const price = Number(ticker.price);
  const open = Number(stats.open);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid ${product} ticker`);
  return {
    price,
    change: Number.isFinite(open) && open > 0 ? ((price / open) - 1) * 100 : null,
    time: new Date(ticker.time),
  };
}

function unitsFromHex(hexValue, decimals = 18) {
  const value = BigInt(hexValue);
  const unit = 10n ** BigInt(decimals);
  return Number(value / unit) + Number(value % unit) / Number(unit);
}

async function fetchTotalSupply(rpcUrl, contract) {
  const response = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: contract, data: "0x18160ddd" }, "latest"],
    }),
  });
  if (response.error || !response.result) throw new Error(response.error?.message || "RPC returned no supply");
  const supply = unitsFromHex(response.result);
  if (!isPositive(supply)) throw new Error("RPC returned an invalid supply");
  return supply;
}

async function refreshPrices() {
  if (sourceHealth.aeroPrice !== "live") sourceHealth.aeroPrice = "loading";
  if (sourceHealth.veloPrice !== "live") sourceHealth.veloPrice = "loading";
  updateDataStatus();
  const [aero, velo] = await Promise.allSettled([
    fetchCoinbaseMarket("AERO-USD"),
    fetchCoinbaseMarket("VELO-USD"),
  ]);
  let successes = 0;
  if (aero.status === "fulfilled") {
    market.aeroPrice = aero.value.price;
    market.aeroChange = aero.value.change;
    market.aeroUpdatedAt = aero.value.time;
    sourceHealth.aeroPrice = "live";
    successes += 1;
  } else {
    market.aeroPrice = null;
    market.aeroChange = null;
    market.aeroUpdatedAt = null;
    sourceHealth.aeroPrice = "error";
    console.warn("AERO price refresh failed", aero.reason);
  }
  if (velo.status === "fulfilled") {
    market.veloPrice = velo.value.price;
    market.veloChange = velo.value.change;
    market.veloUpdatedAt = velo.value.time;
    sourceHealth.veloPrice = "live";
    successes += 1;
  } else {
    market.veloPrice = null;
    market.veloChange = null;
    market.veloUpdatedAt = null;
    sourceHealth.veloPrice = "error";
    console.warn("VELO price refresh failed", velo.reason);
  }
  const timestamps = [market.aeroUpdatedAt, market.veloUpdatedAt].filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
  market.updatedAt = timestamps.length ? new Date(Math.max(...timestamps.map((value) => value.getTime()))) : null;
  updateMarketMeta();
  calculate();
  updateDataStatus();
  return successes;
}

async function refreshSupplies() {
  if (sourceHealth.aeroSupply !== "live") sourceHealth.aeroSupply = "loading";
  if (sourceHealth.veloSupply !== "live") sourceHealth.veloSupply = "loading";
  updateDataStatus();
  const [aero, velo] = await Promise.allSettled([
    fetchTotalSupply(DATA_SOURCES.baseRpc, DATA_SOURCES.aeroContract),
    fetchTotalSupply(DATA_SOURCES.optimismRpc, DATA_SOURCES.veloContract),
  ]);
  let successes = 0;
  if (aero.status === "fulfilled") {
    market.aeroSupply = aero.value;
    sourceHealth.aeroSupply = "live";
    successes += 1;
  } else {
    market.aeroSupply = null;
    sourceHealth.aeroSupply = "error";
    console.warn("AERO supply RPC failed", aero.reason);
  }
  if (velo.status === "fulfilled") {
    market.veloSupply = velo.value;
    sourceHealth.veloSupply = "live";
    successes += 1;
  } else {
    market.veloSupply = null;
    sourceHealth.veloSupply = "error";
    console.warn("VELO supply RPC failed", velo.reason);
  }
  resetHistory(successes === 2 ? null : "ON-CHAIN RATIO UNAVAILABLE");
  calculate();
  updateDataStatus();
  return successes;
}

function resetHistory(error = null) {
  historyLoaded.clear();
  Object.values(periods).forEach((series) => {
    series.data = null;
    series.labels = [];
    series.timestamps = [];
    series.state = error ? "error" : "idle";
    series.error = error;
  });
  drawChart(activePeriod);
}

function historyWindow(period) {
  const now = new Date();
  const end = now.toISOString();
  const hours = { "24H": 24, "7D": 24 * 7, "30D": 24 * 30 }[period];
  if (period === "1Y") {
    const midpoint = new Date(now.getTime() - 182 * 86400_000);
    const start = new Date(now.getTime() - 365 * 86400_000);
    return [
      { start: start.toISOString(), end: midpoint.toISOString(), granularity: 86400 },
      { start: midpoint.toISOString(), end, granularity: 86400 },
    ];
  }
  return [{
    start: new Date(now.getTime() - hours * 3600_000).toISOString(),
    end,
    granularity: period === "24H" ? 3600 : 21600,
  }];
}

async function fetchCandles(product, period) {
  const chunks = await Promise.all(historyWindow(period).map(({ start, end, granularity }) => {
    const params = new URLSearchParams({ start, end, granularity: String(granularity) });
    return fetchJson(`${DATA_SOURCES.coinbase}/${product}/candles?${params}`);
  }));
  return chunks.flat().sort((a, b) => a[0] - b[0]);
}

function chartLabels(timestamps, period) {
  const positions = [0, 0.25, 0.5, 0.75, 1].map((part) => Math.round((timestamps.length - 1) * part));
  return positions.map((index, labelIndex) => {
    if (labelIndex === positions.length - 1) return "NOW";
    const date = new Date(timestamps[index] * 1000);
    if (period === "24H") return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    if (period === "1Y") return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(date).toUpperCase();
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date).toUpperCase();
  });
}

async function loadHistory(period) {
  if (historyLoaded.has(period)) {
    drawChart(period);
    return;
  }
  const series = periods[period];
  if (series.state === "loading") return;
  if (!hasSupplyRatio()) {
    series.state = "error";
    series.error = "ON-CHAIN RATIO UNAVAILABLE";
    if (period === activePeriod) drawChart(period);
    return;
  }

  const activeButton = $(`.period-switcher button[data-period="${period}"]`);
  series.state = "loading";
  series.error = null;
  activeButton.classList.add("loading");
  if (period === activePeriod) drawChart(period);
  try {
    const [aeroCandles, veloCandles] = await Promise.all([
      fetchCandles("AERO-USD", period),
      fetchCandles("VELO-USD", period),
    ]);
    const veloByTime = new Map(veloCandles.map((candle) => [candle[0], Number(candle[4])]));
    const migrationSupply = market.aeroSupply / market.aeroShare;
    const veloRatio = market.veloSupply / (migrationSupply * market.veloShare);
    const common = aeroCandles
      .filter((candle) => veloByTime.has(candle[0]) && isPositive(Number(candle[4])) && isPositive(veloByTime.get(candle[0])))
      .map((candle) => ({
        time: candle[0],
        premium: ((Number(candle[4]) / (veloByTime.get(candle[0]) * veloRatio)) - 1) * 100,
      }))
      .filter((point) => Number.isFinite(point.premium));
    if (common.length < 3) throw new Error("Not enough matching Coinbase candles");
    series.data = common.map((point) => point.premium);
    series.labels = chartLabels(common.map((point) => point.time), period);
    series.timestamps = common.map((point) => point.time);
    series.state = "live";
    series.error = null;
    historyLoaded.add(period);
    if (period === activePeriod) drawChart(period);
  } catch (error) {
    console.warn(`${period} history refresh failed`, error);
    series.data = null;
    series.labels = [];
    series.timestamps = [];
    series.state = "error";
    series.error = "COINBASE HISTORY UNAVAILABLE";
    historyLoaded.delete(period);
    if (period === activePeriod) drawChart(period);
  } finally {
    activeButton.classList.remove("loading");
  }
}

[ui.aero, ui.velo].forEach((input) => input.addEventListener("input", calculate));

$("#resetButton").addEventListener("click", () => {
  ui.aero.value = defaults.aero;
  ui.velo.value = defaults.velo;
  calculate();
});

$$(".period-switcher button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".period-switcher button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activePeriod = button.dataset.period;
    ui.historyResolution.textContent = periodResolution[activePeriod];
    loadHistory(activePeriod);
  });
});

$("#historyChart").addEventListener("pointermove", (event) => {
  if (!chartState) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const horizontal = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  const index = Math.round(horizontal * (chartState.data.length - 1));
  updateChartPoint(index);
});

$("#historyChart").addEventListener("pointerleave", () => {
  if (chartState) updateChartPoint(chartState.data.length - 1);
});

function tick() {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  $("#localClock").textContent = `${time} IST`;
}

const menuButton = $("#menuButton");
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  menuButton.setAttribute("aria-label", open ? "Open navigation" : "Close navigation");
  $("#mobileNav").classList.toggle("open", !open);
});

$$('#mobileNav a').forEach((link) => link.addEventListener("click", () => {
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open navigation");
  $("#mobileNav").classList.remove("open");
}));

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

$$('.entrance, .reveal').forEach((element) => observer.observe(element));

calculate();
updateMarketMeta();
updateDataStatus();
renderChartUnavailable("LOADING LIVE HISTORY");
tick();
setInterval(tick, 1000);

Promise.allSettled([refreshPrices(), refreshSupplies()]).then(() => loadHistory(activePeriod));
setInterval(refreshPrices, 30_000);
setInterval(async () => {
  await refreshSupplies();
  await loadHistory(activePeriod);
}, 300_000);
