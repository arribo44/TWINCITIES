function fetchJson(url, options = {}) {
    return fetch(url, options).then((response) => response.json());
}

function buildChart(canvasId, labels, values, labelText, color) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    return new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: labelText,
                    data: values,
                    backgroundColor: color,
                    borderColor: color,
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true },
            },
        },
    });
}

let countryChart = null;
let continentChart = null;
let scopeChart = null;
let topCitiesChart = null;

const CHOROPLETH_GEOJSON_URL =
    "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/cultural/ne_50m_admin_0_countries.json";
const CHOROPLETH_RAMP = [
    "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7",
    "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
];
const CHOROPLETH_NO_DATA = "#e1e0d9";
const CHOROPLETH_BORDER = "#c3c2b7";
const CHOROPLETH_HOVER_BORDER = "#0b0b0b";

let choroplethMap = null;
let choroplethLayer = null;
let worldGeoJsonPromise = null;

function loadWorldGeoJson() {
    if (!worldGeoJsonPromise) {
        worldGeoJsonPromise = fetchJson(CHOROPLETH_GEOJSON_URL);
    }
    return worldGeoJsonPromise;
}

function choroplethColor(ratio) {
    const idx = Math.min(CHOROPLETH_RAMP.length - 1, Math.round(ratio * (CHOROPLETH_RAMP.length - 1)));
    return CHOROPLETH_RAMP[idx];
}

function buildChoroplethLegend(maxValue) {
    const legend = document.getElementById("statsChoroplethLegend");
    const gradient = CHOROPLETH_RAMP.join(",");
    legend.innerHTML = `
        <span class="mr-2">0</span>
        <div style="flex:1;height:12px;background:linear-gradient(to right, ${gradient});border-radius:4px;"></div>
        <span class="ml-2">${maxValue}</span>
        <span class="ml-4 d-flex align-items-center">
            <span style="display:inline-block;width:12px;height:12px;background:${CHOROPLETH_NO_DATA};border-radius:2px;margin-right:4px;"></span>
            ${escapeHtml(t("stats.no_twin"))}
        </span>
    `;
}

function updateChoropleth(countryMap) {
    const counts = {};
    let maxValue = 0;
    countryMap.forEach((item) => {
        counts[item.code] = item;
        maxValue = Math.max(maxValue, item.value);
    });

    if (!choroplethMap) {
        choroplethMap = L.map("statsChoropleth", {
            scrollWheelZoom: false,
            worldCopyJump: false,
            minZoom: 1,
        }).setView([15, 10], 1);
    }

    loadWorldGeoJson().then((geojson) => {
        if (choroplethLayer) {
            choroplethMap.removeLayer(choroplethLayer);
        }
        choroplethLayer = L.geoJSON(geojson, {
            style: (feature) => {
                const entry = counts[feature.properties.ADM0_A3];
                const value = entry ? entry.value : 0;
                return {
                    fillColor: value ? choroplethColor(value / maxValue) : CHOROPLETH_NO_DATA,
                    fillOpacity: 0.9,
                    color: CHOROPLETH_BORDER,
                    weight: 1,
                };
            },
            onEachFeature: (feature, layer) => {
                const entry = counts[feature.properties.ADM0_A3];
                const props = feature.properties;
                const isoCode = [props.ISO_A2_EH, props.ISO_A2].find((c) => /^[A-Z]{2}$/.test(c || ""));
                const name = entry ? countryName(entry.name) : countryNameFromCode(isoCode, props.NAME);
                const value = entry ? entry.value : 0;
                layer.bindTooltip(`${escapeHtml(name)}${colon()}${escapeHtml(tn("twins.count", value))}`, { sticky: true });
                layer.on("mouseover", () => layer.setStyle({ weight: 2, color: CHOROPLETH_HOVER_BORDER }));
                layer.on("mouseout", () => layer.setStyle({ weight: 1, color: CHOROPLETH_BORDER }));
            },
        }).addTo(choroplethMap);
    });

    buildChoroplethLegend(maxValue);
}

function updateStats(stats) {
    document.getElementById("statsTotalCountries").textContent = formatNumber(stats.total_countries);
    document.getElementById("statsTotalCities").textContent = formatNumber(stats.total_cities);
    document.getElementById("statsTotalLinks").textContent = formatNumber(stats.total_links);
    document.getElementById("statsMinDistance").textContent = `${formatNumber(stats.min_distance)} km`;
    document.getElementById("statsAvgDistance").textContent = `${formatNumber(stats.avg_distance)} km`;
    document.getElementById("statsMaxDistance").textContent = `${formatNumber(stats.max_distance)} km`;

    const countryLabels = stats.countries.map((item) => countryName(item.label));
    const countryValues = stats.countries.map((item) => item.value);
    const continentLabels = stats.continents.map((item) => continentName(item.label));
    const continentValues = stats.continents.map((item) => item.value);

    if (countryChart) {
        countryChart.destroy();
    }
    if (continentChart) {
        continentChart.destroy();
    }

    countryChart = buildChart("statsCountryChart", countryLabels, countryValues, t("stats.dataset"), "rgba(60, 141, 188, 0.8)");
    continentChart = buildChart("statsContinentChart", continentLabels, continentValues, t("stats.dataset"), "rgba(40, 167, 69, 0.8)");

    updateChoropleth(stats.country_map);
    buildScopeChart(stats.scope);
    renderTwinPairsTable("statsLongestTable", stats.longest);
    renderTwinPairsTable("statsShortestTable", stats.shortest);
    buildTopCitiesChart(stats.top_cities);
}

function flagImg(country) {
    return `<img src="/flag?country=${encodeURIComponent(country)}" class="flag-icon" alt="" onerror="this.remove()" />`;
}

function cityCell(city, country) {
    return `${flagImg(country)}<strong>${escapeHtml(city)}</strong> <span class="country">(${escapeHtml(countryName(country))})</span>`;
}

function renderTwinPairsTable(tbodyId, pairs) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = pairs.map((pair, index) => `
        <tr>
            <td class="text-right text-muted">${index + 1}</td>
            <td>${cityCell(pair.ville1, pair.pays1)}<span class="pair-sep">↔</span>${cityCell(pair.ville2, pair.pays2)}</td>
            <td class="text-right text-nowrap">${formatNumber(Math.round(pair.distance_km))} km</td>
        </tr>
    `).join("");
}

function buildScopeChart(scope) {
    if (scopeChart) scopeChart.destroy();
    const keys = ["same_country", "same_continent", "intercontinental"];
    const values = keys.map((key) => scope[key]);
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    scopeChart = new Chart(document.getElementById("statsScopeChart"), {
        type: "doughnut",
        data: {
            labels: keys.map((key) => t(`stats.scope.${key}`)),
            datasets: [{
                data: values,
                // du plus proche au plus lointain : rampe de bleus de la carte
                backgroundColor: [CHOROPLETH_RAMP[3], CHOROPLETH_RAMP[7], CHOROPLETH_RAMP[11]],
                borderColor: "#fff",
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom" },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}${colon()}${formatNumber(ctx.raw)} (${formatNumber(Math.round(ctx.raw * 100 / total))} %)`,
                    },
                },
            },
        },
    });
}

function buildTopCitiesChart(cities) {
    if (topCitiesChart) topCitiesChart.destroy();
    topCitiesChart = new Chart(document.getElementById("statsTopCitiesChart"), {
        type: "bar",
        data: {
            labels: cities.map((city) => `${city.label} (${countryName(city.pays)})`),
            datasets: [{
                label: t("stats.twinnings"),
                data: cities.map((city) => city.value),
                backgroundColor: "rgba(60, 141, 188, 0.8)",
                borderColor: "rgba(60, 141, 188, 0.8)",
                borderWidth: 1,
            }],
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true } },
        },
    });
}

window.addEventListener("DOMContentLoaded", () => {
    fetchJson("/api/stats").then(updateStats);
});
