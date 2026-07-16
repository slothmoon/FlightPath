const DATA_SOURCES = Object.freeze({
  coinbase: "https://api.exchange.coinbase.com/products",
  baseRpc: "https://mainnet.base.org",
  optimismRpc: "https://mainnet.optimism.io",
  aeroContract: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  veloContract: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db",
  aeroLogo: "https://aerodrome.finance/brand-kit/AERO/symbol.svg",
  veloLogo: "https://velodrome.finance/brand-kit/VELO/symbol.svg",
});

// Initial values keep the calculator usable while the visitor's browser loads fresh data.
const market = {
  aeroSupply: 1_940_444_000.428,
  veloSupply: 2_543_682_868.231,
  aeroPrice: 0.4923,
  veloPrice: 0.02096,
  aeroChange: null,
  veloChange: null,
  aeroShare: 0.945,
  veloShare: 0.055,
  updatedAt: null,
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
  derivedSupply: $("#derivedSupply"),
  veloRatio: $("#veloRatio"),
  aeroRequired: $("#aeroRequired"),
  veloRequired: $("#veloRequired"),
  aeroRoutePrice: $("#aeroRoutePrice"),
  veloRoutePrice: $("#veloRoutePrice"),
  spreadDollar: $("#spreadDollar"),
  spreadPercent: $("#spreadPercent"),
  heroPremium: $("#heroPremium"),
  heroSaving: $("#heroSaving"),
  heroPremiumLabel: $("#heroPremiumLabel"),
  heroSavingCopy: $("#heroSavingCopy"),
  heroRouteName: $("#heroRouteName"),
  heroRouteStamp: $("#heroRouteStamp"),
  heroRouteLogo: $("#heroRouteLogo"),
  aeroRouteEntry: $("#aeroRouteEntry"),
  veloRouteEntry: $("#veloRouteEntry"),
  aeroSignal: $("#aeroSignal"),
  veloSignal: $("#veloSignal"),
  cheaperRouteName: $("#cheaperRouteName"),
  premiumRouteName: $("#premiumRouteName"),
  comparisonRouteName: $("#comparisonRouteName"),
  aeroHeaderPrice: $("#aeroHeaderPrice"),
  veloHeaderPrice: $("#veloHeaderPrice"),
  aeroHeaderChange: $("#aeroHeaderChange"),
  veloHeaderChange: $("#veloHeaderChange"),
  dataStatus: $("#dataStatus"),
  snapshotDate: $("#snapshotDate"),
};

const periods = {
  "24H": { data: [3.2, 3.55, 3.1, 3.9, 4.44, 4.05, 4.61, 4.18, 4.31], labels: ["00:00", "06:00", "12:00", "18:00", "NOW"] },
  "7D": { data: [1.55, 2.08, 1.18, 2.75, 3.5, 2.88, 4.12, 3.81, 4.31], labels: ["10 JUL", "12 JUL", "14 JUL", "15 JUL", "NOW"] },
  "30D": { data: [2.2, 2.8, 1.6, 0.8, 2.4, 3.9, 3.2, 4.7, 5.6, 3.8, 4.2, 6.1, 5.2, 4.31], labels: ["17 JUN", "24 JUN", "01 JUL", "08 JUL", "NOW"] },
  "1Y": { data: [-2.8, -1.2, 1.1, 4.8, 3.2, 6.6, 8.4, 5.2, 2.8, 1.6, 3.7, 4.31], labels: ["JUL '25", "OCT '25", "JAN '26", "APR '26", "NOW"] },
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

function setRouteSignal(element, isWinner) {
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
  ui.aeroHeaderPrice.textContent = money(market.aeroPrice, 4);
  ui.veloHeaderPrice.textContent = money(market.veloPrice, 4);
  updateChange(ui.aeroHeaderChange, market.aeroChange);
  updateChange(ui.veloHeaderChange, market.veloChange);

  if (market.updatedAt) {
    const timestamp = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(market.updatedAt).replace(",", " ·").toUpperCase();
    ui.snapshotDate.textContent = timestamp;
  }
}

function setDataStatus(state, text) {
  const wrapper = ui.dataStatus.closest(".live-mark");
  wrapper.classList.remove("loading", "partial");
  if (state !== "live") wrapper.classList.add(state);
  ui.dataStatus.textContent = text;
}

function calculate() {
  const aeroAmount = number(ui.aero.value);
  const veloAmount = number(ui.velo.value);
  const supply = market.aeroSupply / market.aeroShare;
  const aeroRatio = 1;
  const veloRatio = market.veloSupply / (supply * market.veloShare);
  const aeroOutput = aeroAmount;
  const veloOutput = veloAmount / veloRatio;
  const totalOutput = aeroOutput + veloOutput;
  const aeroRoutePrice = market.aeroPrice;
  const veloRoutePrice = veloRatio * market.veloPrice;
  const spread = Math.abs(aeroRoutePrice - veloRoutePrice);
  const signedAeroPremium = ((aeroRoutePrice / veloRoutePrice) - 1) * 100;
  const aeroIsCheaper = aeroRoutePrice <= veloRoutePrice;
  const cheaperName = aeroIsCheaper ? "AERO" : "VELO";
  const premiumName = aeroIsCheaper ? "VELO" : "AERO";
  const expensive = Math.max(aeroRoutePrice, veloRoutePrice);
  const cheap = Math.min(aeroRoutePrice, veloRoutePrice);
  const relativeSpread = ((expensive / cheap) - 1) * 100;
  const saving = 10_000 - (10_000 / expensive) * cheap;

  ui.aeroValue.textContent = money(aeroAmount * market.aeroPrice);
  ui.veloValue.textContent = money(veloAmount * market.veloPrice);
  ui.total.textContent = format(totalOutput);
  ui.aeroOutput.textContent = format(aeroOutput);
  ui.veloOutput.textContent = format(veloOutput);
  ui.derivedSupply.textContent = compact(supply);
  ui.veloRatio.textContent = format(veloRatio, 4);
  ui.aeroRequired.textContent = format(aeroRatio, 4);
  ui.veloRequired.textContent = format(veloRatio, 4);
  ui.aeroRoutePrice.textContent = money(aeroRoutePrice, 4);
  ui.veloRoutePrice.textContent = money(veloRoutePrice, 4);
  ui.spreadDollar.textContent = money(spread, 4);
  ui.spreadPercent.textContent = `${format(relativeSpread, 2)}%`;
  ui.heroPremium.textContent = `${format(relativeSpread, 2)}%`;
  ui.heroSaving.textContent = money(saving, 0);
  ui.heroPremiumLabel.textContent = `${premiumName} PREMIUM`;
  ui.heroSavingCopy.textContent = `Every $10k routed through ${cheaperName} currently carries about`;
  ui.heroRouteName.textContent = cheaperName;
  ui.heroRouteStamp.className = `asset-stamp ${aeroIsCheaper ? "aero-stamp" : "velo-stamp"}`;
  ui.heroRouteLogo.src = aeroIsCheaper ? DATA_SOURCES.aeroLogo : DATA_SOURCES.veloLogo;
  ui.aeroRouteEntry.classList.toggle("winner-entry", aeroIsCheaper);
  ui.veloRouteEntry.classList.toggle("winner-entry", !aeroIsCheaper);
  setRouteSignal(ui.aeroSignal, aeroIsCheaper);
  setRouteSignal(ui.veloSignal, !aeroIsCheaper);
  ui.cheaperRouteName.textContent = cheaperName;
  ui.premiumRouteName.textContent = premiumName;
  ui.comparisonRouteName.textContent = cheaperName;

  Object.values(periods).forEach((series) => {
    series.data[series.data.length - 1] = signedAeroPremium;
    series.labels[series.labels.length - 1] = "NOW";
    if (series.timestamps?.length === series.data.length) {
      series.timestamps[series.timestamps.length - 1] = Math.floor((market.updatedAt || new Date()).getTime() / 1000);
    }
  });
  drawChart(activePeriod);
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
  const discount = aeroIsPremium
    ? (1 - (1 / (1 + value / 100))) * 100
    : Math.abs(value);

  $("#endGuide").setAttribute("x1", pointX);
  $("#endGuide").setAttribute("x2", pointX);
  $("#endHalo").setAttribute("cx", pointX);
  $("#endHalo").setAttribute("cy", pointY);
  $("#endPoint").setAttribute("cx", pointX);
  $("#endPoint").setAttribute("cy", pointY);
  $("#chartTooltipRoute").textContent = `${cheaperRoute} CHEAPER`;
  $("#chartTooltipValue").textContent = `${Math.abs(discount).toFixed(2)}% DISCOUNT`;
  $("#chartTooltipMetric").textContent = `AERO PREMIUM ${signedPercent(value)}`;
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

function drawChart(period) {
  const { data, labels } = periods[period];
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
  $("#chartHigh").textContent = signedPercent(Math.max(...data));
  const average = data.reduce((sum, value) => sum + value, 0) / data.length;
  $("#chartAverage").textContent = signedPercent(average);
  $("#chartLabels").innerHTML = labels.map((label) => `<span>${label}</span>`).join("");
  chartState = { data, labels, timestamps: periods[period].timestamps, x, y, width, height };
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
  return unitsFromHex(response.result);
}

async function refreshPrices() {
  setDataStatus("loading", "REFRESHING COINBASE");
  const [aero, velo] = await Promise.allSettled([
    fetchCoinbaseMarket("AERO-USD"),
    fetchCoinbaseMarket("VELO-USD"),
  ]);
  let successes = 0;
  if (aero.status === "fulfilled") {
    market.aeroPrice = aero.value.price;
    market.aeroChange = aero.value.change;
    market.updatedAt = aero.value.time;
    successes += 1;
  } else {
    console.warn("AERO price refresh failed", aero.reason);
  }
  if (velo.status === "fulfilled") {
    market.veloPrice = velo.value.price;
    market.veloChange = velo.value.change;
    if (!market.updatedAt || velo.value.time > market.updatedAt) market.updatedAt = velo.value.time;
    successes += 1;
  } else {
    console.warn("VELO price refresh failed", velo.reason);
  }
  updateMarketMeta();
  calculate();
  setDataStatus(successes === 2 ? "live" : "partial", successes === 2 ? "DIRECT DATA LIVE" : "PARTIAL PRICE DATA");
  return successes;
}

async function refreshSupplies() {
  const [aero, velo] = await Promise.allSettled([
    fetchTotalSupply(DATA_SOURCES.baseRpc, DATA_SOURCES.aeroContract),
    fetchTotalSupply(DATA_SOURCES.optimismRpc, DATA_SOURCES.veloContract),
  ]);
  let successes = 0;
  if (aero.status === "fulfilled") {
    market.aeroSupply = aero.value;
    successes += 1;
  } else {
    console.warn("AERO supply RPC failed", aero.reason);
  }
  if (velo.status === "fulfilled") {
    market.veloSupply = velo.value;
    successes += 1;
  } else {
    console.warn("VELO supply RPC failed", velo.reason);
  }
  calculate();
  if (successes < 2) setDataStatus("partial", "PARTIAL ON-CHAIN DATA");
  return successes;
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
  const activeButton = $(`.period-switcher button[data-period="${period}"]`);
  activeButton.classList.add("loading");
  try {
    const [aeroCandles, veloCandles] = await Promise.all([
      fetchCandles("AERO-USD", period),
      fetchCandles("VELO-USD", period),
    ]);
    const veloByTime = new Map(veloCandles.map((candle) => [candle[0], Number(candle[4])]));
    const migrationSupply = market.aeroSupply / market.aeroShare;
    const veloRatio = market.veloSupply / (migrationSupply * market.veloShare);
    const common = aeroCandles
      .filter((candle) => veloByTime.has(candle[0]))
      .map((candle) => ({
        time: candle[0],
        premium: ((Number(candle[4]) / (veloByTime.get(candle[0]) * veloRatio)) - 1) * 100,
      }))
      .filter((point) => Number.isFinite(point.premium));
    if (common.length < 3) throw new Error("Not enough matching Coinbase candles");
    periods[period].data = common.map((point) => point.premium);
    periods[period].labels = chartLabels(common.map((point) => point.time), period);
    periods[period].timestamps = common.map((point) => point.time);
    historyLoaded.add(period);
    calculate();
  } catch (error) {
    console.warn(`${period} history refresh failed`, error);
    drawChart(period);
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
    drawChart(activePeriod);
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
  $("#mobileNav").classList.toggle("open", !open);
});

$$('#mobileNav a').forEach((link) => link.addEventListener("click", () => {
  menuButton.setAttribute("aria-expanded", "false");
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
tick();
setInterval(tick, 1000);

Promise.allSettled([refreshPrices(), refreshSupplies()]).then(() => loadHistory(activePeriod));
setInterval(refreshPrices, 30_000);
setInterval(refreshSupplies, 300_000);
