const market = {
  aeroSupply: 1_940_444_000.428,
  veloSupply: 2_543_682_868.231,
  aeroPrice: 0.4923,
  veloPrice: 0.02096,
  aeroShare: 0.945,
  veloShare: 0.055,
};

const defaults = { aero: 10_000, velo: 200_000 };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ui = {
  aero: $("#aeroAmount"), velo: $("#veloAmount"),
  aeroValue: $("#aeroValue"), veloValue: $("#veloValue"), total: $("#totalOutput"),
  aeroOutput: $("#aeroOutput"), veloOutput: $("#veloOutput"), derivedSupply: $("#derivedSupply"),
  veloRatio: $("#veloRatio"), aeroRequired: $("#aeroRequired"),
  veloRequired: $("#veloRequired"), aeroRoutePrice: $("#aeroRoutePrice"),
  veloRoutePrice: $("#veloRoutePrice"), spreadDollar: $("#spreadDollar"),
  spreadPercent: $("#spreadPercent"), heroPremium: $("#heroPremium"), heroSaving: $("#heroSaving"),
};

const number = (value) => {
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const format = (value, digits = 2) => new Intl.NumberFormat("en-US", {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(Number.isFinite(value) ? value : 0);

const money = (value, digits = 2) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(Number.isFinite(value) ? value : 0);

const compact = (value) => value >= 1e9 ? `${(value / 1e9).toFixed(2)}B` : `${(value / 1e6).toFixed(2)}M`;

function calculate() {
  const aeroAmount = number(ui.aero.value);
  const veloAmount = number(ui.velo.value);
  const supply = market.aeroSupply / market.aeroShare;
  const aeroRatio = 1;
  const veloRatio = market.veloSupply / (supply * market.veloShare);
  const aeroOutput = aeroAmount;
  const veloOutput = veloAmount / veloRatio;
  const totalOutput = aeroOutput + veloOutput;
  const aeroRoutePrice = aeroRatio * market.aeroPrice;
  const veloRoutePrice = veloRatio * market.veloPrice;
  const spread = Math.abs(aeroRoutePrice - veloRoutePrice);
  const premium = ((aeroRoutePrice / veloRoutePrice) - 1) * 100;
  const totalInputValue = aeroAmount * market.aeroPrice + veloAmount * market.veloPrice;
  const expensive = Math.max(aeroRoutePrice, veloRoutePrice);
  const cheap = Math.min(aeroRoutePrice, veloRoutePrice);
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
  ui.spreadPercent.textContent = `${format(Math.abs(premium), 2)}%`;
  ui.heroPremium.textContent = `${format(Math.abs(premium), 2)}%`;
  ui.heroSaving.textContent = money(saving, 0);

}

[ui.aero, ui.velo].forEach((input) => input.addEventListener("input", calculate));

$("#resetButton").addEventListener("click", () => {
  ui.aero.value = defaults.aero;
  ui.velo.value = defaults.velo;
  calculate();
});

const periods = {
  "24H": { data: [3.2,3.55,3.1,3.9,4.44,4.05,4.61,4.18,4.31], labels: ["00:00","06:00","12:00","18:00","NOW"] },
  "7D": { data: [1.55,2.08,1.18,2.75,3.5,2.88,4.12,3.81,4.31], labels: ["10 JUL","12 JUL","14 JUL","15 JUL","NOW"] },
  "30D": { data: [2.2,2.8,1.6,.8,2.4,3.9,3.2,4.7,5.6,3.8,4.2,6.1,5.2,4.31], labels: ["17 JUN","24 JUN","01 JUL","08 JUL","16 JUL"] },
  "1Y": { data: [-2.8,-1.2,1.1,4.8,3.2,6.6,8.4,5.2,2.8,1.6,3.7,4.31], labels: ["JUL '25","OCT '25","JAN '26","APR '26","JUL '26"] },
};

function drawChart(period) {
  const { data, labels } = periods[period];
  const width = 1000, height = 340, top = 22, bottom = 33, min = -5, max = 10;
  const x = (index) => index * (width / (data.length - 1));
  const y = (value) => top + ((max - value) / (max - min)) * (height - top - bottom);
  const points = data.map((value, index) => `${x(index)},${y(value)}`);
  const lastY = y(data.at(-1));
  $("#chartLine").setAttribute("points", points.join(" "));
  $("#chartArea").setAttribute("d", `M${points[0]} L${points.slice(1).join(" L")} L${width},${height-bottom} L0,${height-bottom} Z`);
  $("#endHalo").setAttribute("cy", lastY);
  $("#endPoint").setAttribute("cy", lastY);
  $("#chartCallout").style.top = `${(lastY / height) * 340}px`;
  $("#chartCallout strong").textContent = `+${data.at(-1).toFixed(2)}%`;
  $("#chartLatest").textContent = `+${data.at(-1).toFixed(2)}%`;
  $("#chartHigh").textContent = `+${Math.max(...data).toFixed(2)}%`;
  const average = data.reduce((sum, value) => sum + value, 0) / data.length;
  $("#chartAverage").textContent = `${average >= 0 ? "+" : ""}${average.toFixed(2)}%`;
  $("#chartLabels").innerHTML = labels.map((label) => `<span>${label}</span>`).join("");
}

$$(".period-switcher button").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".period-switcher button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    drawChart(button.dataset.period);
  });
});

function tick() {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
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
}, { threshold: .1 });

$$('.entrance, .reveal').forEach((element) => observer.observe(element));
calculate();
drawChart("30D");
tick();
setInterval(tick, 1000);
