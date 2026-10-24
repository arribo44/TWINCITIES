const initialCenter = [20, 0];
const initialZoom = 2;
const minMapZoom = 2;
const map = L.map("map", {
    minZoom: minMapZoom,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0,
}).setView(initialCenter, initialZoom);
const citiesById = new Map();
const markerById = new Map();
const twinCountById = new Map();
let cityMarkers = [];
let linkLayers = [];
let selectedCity = null;
let selectedCityId = null;

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    noWrap: true,
}).addTo(map);

const legend = L.DomUtil.create("div", "map-legend", map.getContainer());
legend.innerHTML = `
    <span class="legend-title">${escapeHtml(t("map.legend"))}</span>
    <span class="legend-item"><span class="legend-dot" style="background:#007bff"></span> ≤ 10</span>
    <span class="legend-item"><span class="legend-dot" style="background:#ffc107"></span> 11 – 30</span>
    <span class="legend-item"><span class="legend-dot" style="background:#28a745"></span> 31 – 50</span>
    <span class="legend-item"><span class="legend-dot" style="background:#dc3545"></span> &gt; 50</span>
`;
L.DomEvent.disableClickPropagation(legend);
L.DomEvent.disableScrollPropagation(legend);

function fetchJson(url) {
    return fetch(url).then((response) => response.json());
}

function twinCountColor(twinCount) {
    if (twinCount <= 10) return "#007bff";
    if (twinCount <= 30) return "#ffc107";
    if (twinCount <= 50) return "#28a745";
    return "#dc3545";
}

function computeTwinCounts(links) {
    twinCountById.clear();
    links.forEach((link) => {
        twinCountById.set(link.ville1_id, (twinCountById.get(link.ville1_id) || 0) + 1);
        twinCountById.set(link.ville2_id, (twinCountById.get(link.ville2_id) || 0) + 1);
    });
}

function defaultCityMarkerOptions(twinCount) {
    return {
        radius: 6,
        fillColor: twinCountColor(twinCount || 0),
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
    };
}

function selectedCityMarkerOptions() {
    return {
        radius: 10,
        fillColor: "#ffdd57",
        color: "#ff5722",
        weight: 3,
        opacity: 1,
        fillOpacity: 0.7,
    };
}

function setSelectedMarker(cityId) {
    if (selectedCityId !== null) {
        const previous = markerById.get(selectedCityId);
        if (previous) {
            previous.setStyle(defaultCityMarkerOptions(twinCountById.get(selectedCityId) || 0));
        }
    }
    selectedCityId = cityId;
    if (selectedCityId !== null) {
        const current = markerById.get(selectedCityId);
        if (current) {
            current.setStyle(selectedCityMarkerOptions());
        }
    }
}

function clearMarkers() {
    cityMarkers.forEach((marker) => marker.remove());
    cityMarkers = [];
    markerById.clear();
    selectedCityId = null;
}

function clearLinks() {
    linkLayers.forEach((layer) => layer.remove());
    linkLayers = [];
}

function renderCities(cities) {
    clearMarkers();
    cities.forEach((city) => {
        citiesById.set(city.id, city);
        const twinCount = twinCountById.get(city.id) || 0;
        const marker = L.circleMarker([city.latitude, city.longitude], defaultCityMarkerOptions(twinCount)).addTo(map);

        marker.bindPopup(`<strong>${escapeHtml(city.nom)}</strong><br>${escapeHtml(countryName(city.pays))}<br>${escapeHtml(tn("twins.count", twinCount))}`);
        marker.bindTooltip(escapeHtml(city.nom), {
            direction: "top",
            offset: [0, -8],
            opacity: 0.9,
        });
        marker.on("click", () => selectCity(city.id));
        cityMarkers.push(marker);
        markerById.set(city.id, marker);
    });
}

function renderLinks(links) {
    clearLinks();
    links.forEach((link) => {
        const cityA = citiesById.get(link.ville1_id);
        const cityB = citiesById.get(link.ville2_id);
        if (!cityA || !cityB) {
            return;
        }
        const line = L.polyline(
            [
                [cityA.latitude, cityA.longitude],
                [cityB.latitude, cityB.longitude],
            ],
            { color: "#888", weight: 2, opacity: 0.6 }
        ).addTo(map);
        linkLayers.push(line);
    });
}

function updateSearchResults(cities) {
    const list = document.getElementById("searchResults");
    list.innerHTML = "";
    if (!cities.length) {
        list.innerHTML = `<li class="list-group-item">${escapeHtml(t("search.no_result"))}</li>`;
        return;
    }
    cities.forEach((city) => {
        const item = document.createElement("li");
        item.className = "list-group-item search-result";
        const habitantsNum = Number(city.habitants);
        const habitantsText = (city.habitants !== "" && city.habitants != null && !isNaN(habitantsNum) && habitantsNum > 0)
            ? t("search.inhabitants", { n: formatNumber(habitantsNum) })
            : "";
        const details = [countryName(city.pays), continentName(city.continent), habitantsText].filter(Boolean).join(" — ");
        item.innerHTML = `<strong>${escapeHtml(city.nom)}</strong><br><small>${escapeHtml(details)}</small>`;
        item.addEventListener("click", () => selectCity(city.id));
        list.appendChild(item);
    });
}

function showTwinSection(city) {
    selectedCity = city;
    const twinCard = document.getElementById("twinCard");
    const twinCardTitle = document.getElementById("twinCardTitle");
    const twinResults = document.getElementById("twinResults");
    if (twinCardTitle) {
        twinCardTitle.textContent = tn("twins.count", city.twins.length);
    }
    twinResults.innerHTML = "";
    if (!city.twins.length) {
        twinResults.innerHTML = `<li class="list-group-item">${escapeHtml(t("twins.none"))}</li>`;
    } else {
        const sortedTwins = city.twins.slice().sort((a, b) =>
            String(a.twin_nom).localeCompare(String(b.twin_nom), undefined, { sensitivity: "base" })
        );
        sortedTwins.forEach((twin) => {
            const item = document.createElement("li");
            item.className = "list-group-item twin-result";
            const countryUrl = `/flag?country=${encodeURIComponent(twin.twin_pays)}`;
            item.innerHTML = `
                <img src="${escapeHtml(countryUrl)}" class="flag-icon" alt="${escapeHtml(t("twins.flag_alt", { country: countryName(twin.twin_pays) }))}" onerror="this.style.display='none'" />
                <strong>${escapeHtml(twin.twin_nom)}</strong> (${escapeHtml(countryName(twin.twin_pays))}) — ${formatNumber(Math.round(twin.distance_km))} km`;
            item.addEventListener("click", () => {
                document.getElementById("searchInput").value = twin.twin_nom;
                selectCity(twin.twin_id);
            });
            twinResults.appendChild(item);
        });
    }
    twinCard.classList.remove("d-none");
}

function hideTwinSection() {
    selectedCity = null;
    const twinCard = document.getElementById("twinCard");
    const twinResults = document.getElementById("twinResults");
    twinResults.innerHTML = "";
    twinCard.classList.add("d-none");
}

function highlightCityLinks(city) {
    clearLinks();
    if (!city.twins.length) {
        return;
    }
    city.twins.forEach((twin) => {
        const line = L.polyline(
            [
                [city.latitude, city.longitude],
                [twin.twin_latitude, twin.twin_longitude],
            ],
            { color: "#ff0000", weight: 3, opacity: 0.8 }
        ).addTo(map);
        linkLayers.push(line);
    });
}

function selectCity(cityId) {
    fetchJson(`/api/cities/${cityId}`).then((city) => {
        document.getElementById("searchInput").value = city.nom;
        document.getElementById("searchResults").innerHTML = "";
        showTwinSection(city);
        map.flyTo([city.latitude, city.longitude], 4, { duration: 1.2 });
        highlightCityLinks(city);
        setSelectedMarker(cityId);
        const marker = markerById.get(cityId);
        if (marker) {
            marker.openPopup();
        }
    });
}

let habitantsFilter = { op: null, value: null };

function runCombinedSearch() {
    const searchInput = document.getElementById("searchInput");
    const q = searchInput.value.trim();
    const resultsList = document.getElementById("searchResults");
    if (!q && !habitantsFilter.op) {
        resultsList.innerHTML = "";
        return;
    }
    const params = new URLSearchParams();
    if (q) {
        params.set("q", q);
        // en anglais, « Germany » doit aussi trouver les villes d'« Allemagne »
        matchingCountries(q).forEach((pays) => params.append("pays", pays));
    }
    if (habitantsFilter.op && habitantsFilter.value != null) {
        params.set("habitants_op", habitantsFilter.op);
        params.set("habitants_val", habitantsFilter.value);
    }
    fetchJson(`/api/cities?${params.toString()}`).then(updateSearchResults);
}

function setHabitantsOp(op) {
    const valueInput = document.getElementById("filterHabitantsValue");
    const value = parseFloat(valueInput.value);
    if (isNaN(value)) return;
    habitantsFilter = { op, value };
    const plusBtn = document.getElementById("filterHabitantsPlusBtn");
    const minusBtn = document.getElementById("filterHabitantsMinusBtn");
    if (plusBtn) plusBtn.classList.toggle("active", op === ">");
    if (minusBtn) minusBtn.classList.toggle("active", op === "<");
    runCombinedSearch();
}

function clearSelection() {
    map.closePopup();
    document.getElementById("searchInput").value = "";
    const habitantsValueInput = document.getElementById("filterHabitantsValue");
    if (habitantsValueInput) habitantsValueInput.value = "";
    habitantsFilter = { op: null, value: null };
    const plusBtn = document.getElementById("filterHabitantsPlusBtn");
    const minusBtn = document.getElementById("filterHabitantsMinusBtn");
    if (plusBtn) plusBtn.classList.remove("active");
    if (minusBtn) minusBtn.classList.remove("active");
    document.getElementById("searchResults").innerHTML = "";
    hideTwinSection();
    clearLinks();
    setSelectedMarker(null);
    selectedCity = null;
    map.setView(initialCenter, initialZoom);
}

function bindSearch() {
    const searchInput = document.getElementById("searchInput");
    searchInput.addEventListener("input", runCombinedSearch);

    const plusBtn = document.getElementById("filterHabitantsPlusBtn");
    const minusBtn = document.getElementById("filterHabitantsMinusBtn");
    if (plusBtn) plusBtn.addEventListener("click", () => setHabitantsOp(">"));
    if (minusBtn) minusBtn.addEventListener("click", () => setHabitantsOp("<"));

    document.getElementById("clearSelectionBtn").addEventListener("click", () => {
        clearSelection();
    });
}

function loadData() {
    fetchJson("/api/map").then((mapData) => {
        computeTwinCounts(mapData.links);
        renderCities(mapData.cities);
    });
}

window.addEventListener("DOMContentLoaded", () => {
    bindSearch();
    loadData();
});
