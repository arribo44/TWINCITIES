const adminState = {
    cities: [],
    twins: [],
    batchs: [],
    citySort: { key: null, dir: 1 },
    twinSort: { key: null, dir: 1 },
    cityPagination: { page: 1, pageSize: 50, totalPages: 1 },
    twinPagination: { page: 1, pageSize: 50, totalPages: 1 },
};

function fetchJson(url, options = {}) {
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const opts = {
        credentials: 'same-origin',
        ...options,
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfMeta ? csrfMeta.content : "",
            ...(options.headers || {}),
        },
    };
    return fetch(url, opts).then((response) => {
        if (response.status === 401) {
            // not authenticated -> redirect to login
            window.location = '/login';
            return Promise.reject({ error: t("error.auth_required") });
        }
        if (!response.ok) {
            // le message d'erreur du serveur est conservé ; « erreur réseau » seulement si la réponse n'est pas du JSON
            return response.json().then((j) => Promise.reject(j), () => Promise.reject({ error: t("error.network") }));
        }
        return response.json();
    });
}

// les libellés des batchs sont stockés en français en base
function batchLabel(label) {
    const key = `batch.${label}`;
    return key in I18N.messages ? I18N.messages[key] : label;
}

function getTwinCount(cityId) {
    return adminState.twins.filter((t) => t.ville1_id === cityId || t.ville2_id === cityId).length;
}

function renderCityTable() {
    const tbody = document.getElementById("cityTable");
    if (!tbody) return;
    tbody.innerHTML = "";
    const fullList = applyCityFilters();

    const pagination = adminState.cityPagination;
    const pageSize = pagination.pageSize;
    const totalPages = Math.max(1, Math.ceil(fullList.length / pageSize));
    if (pagination.page > totalPages) pagination.page = totalPages;
    if (pagination.page < 1) pagination.page = 1;
    pagination.totalPages = totalPages;
    const start = (pagination.page - 1) * pageSize;
    const list = fullList.slice(start, start + pageSize);

    list.forEach((city) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHtml(city.nom)}</td>
            <td class="col-pays" title="${escapeHtml(city.pays)}">${escapeHtml(city.pays)}</td>
            <td>${city.habitants != null ? city.habitants.toLocaleString() : ""}</td>
            <td>${escapeHtml(city.continent)}</td>
            <td>${getTwinCount(city.id)}</td>
            <td>${city.search_twin ? '<i class="fas fa-times text-danger"></i>' : ""}</td>
            <td>${escapeHtml(city.id_wikidata)}</td>
            <td class="text-nowrap">
                <button class="btn btn-sm btn-primary mr-1" data-id="${city.id}" data-action="edit" title="${escapeHtml(t("admin.edit"))}"><i class="fas fa-pencil-alt"></i></button>
                <button class="btn btn-sm btn-danger" data-id="${city.id}" data-action="delete" title="${escapeHtml(t("admin.delete"))}"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    const pageInfo = document.getElementById("cityPageInfo");
    if (pageInfo) pageInfo.textContent = tn("admin.page.info_cities", fullList.length, { page: pagination.page, pages: totalPages });
    const firstBtn = document.getElementById("cityPageFirst");
    const prevBtn = document.getElementById("cityPagePrev");
    const nextBtn = document.getElementById("cityPageNext");
    const lastBtn = document.getElementById("cityPageLast");
    if (firstBtn) firstBtn.disabled = pagination.page <= 1;
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= totalPages;
    if (lastBtn) lastBtn.disabled = pagination.page >= totalPages;
}

function applyTwinFilters() {
    const cityNameA = (document.getElementById('filterTwinCityNameA')||{}).value.trim().toLowerCase() || '';
    const countryA = (document.getElementById('filterTwinCountryA')||{}).value || '';
    const continentA = (document.getElementById('filterTwinContinentA')||{}).value || '';
    const cityNameB = (document.getElementById('filterTwinCityNameB')||{}).value.trim().toLowerCase() || '';
    const countryB = (document.getElementById('filterTwinCountryB')||{}).value || '';
    const continentB = (document.getElementById('filterTwinContinentB')||{}).value || '';
    let list = adminState.twins.filter((twin) => {
        const cityA = adminState.cities.find((c) => c.id === twin.ville1_id);
        const cityB = adminState.cities.find((c) => c.id === twin.ville2_id);
        if (cityNameA && !String((cityA && cityA.nom) || '').toLowerCase().includes(cityNameA)) return false;
        if (countryA && !(cityA && cityA.pays === countryA)) return false;
        if (continentA && !(cityA && cityA.continent === continentA)) return false;
        if (cityNameB && !String((cityB && cityB.nom) || '').toLowerCase().includes(cityNameB)) return false;
        if (countryB && !(cityB && cityB.pays === countryB)) return false;
        if (continentB && !(cityB && cityB.continent === continentB)) return false;
        return true;
    });

    const { key, dir } = adminState.twinSort;
    if (key) {
        const fieldGetters = {
            villeA: (t) => (adminState.cities.find((c) => c.id === t.ville1_id) || {}).nom || '',
            paysA: (t) => (adminState.cities.find((c) => c.id === t.ville1_id) || {}).pays || '',
            villeB: (t) => (adminState.cities.find((c) => c.id === t.ville2_id) || {}).nom || '',
            paysB: (t) => (adminState.cities.find((c) => c.id === t.ville2_id) || {}).pays || '',
        };
        const getField = fieldGetters[key];
        if (getField) {
            list = list.slice().sort((a, b) =>
                String(getField(a)).localeCompare(String(getField(b)), undefined, { sensitivity: 'base' }) * dir
            );
        }
    }
    return list;
}

function renderTwinTable() {
    const tbody = document.getElementById("twinTable");
    if (!tbody) return;
    tbody.innerHTML = "";
    const fullList = applyTwinFilters();

    const pagination = adminState.twinPagination;
    const pageSize = pagination.pageSize;
    const totalPages = Math.max(1, Math.ceil(fullList.length / pageSize));
    if (pagination.page > totalPages) pagination.page = totalPages;
    if (pagination.page < 1) pagination.page = 1;
    pagination.totalPages = totalPages;
    const start = (pagination.page - 1) * pageSize;
    const list = fullList.slice(start, start + pageSize);

    list.forEach((twin) => {
        const cityA = adminState.cities.find((c) => c.id === twin.ville1_id);
        const cityB = adminState.cities.find((c) => c.id === twin.ville2_id);
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHtml(cityA ? cityA.nom : twin.ville1_id)}</td>
            <td>${escapeHtml(cityA ? cityA.pays : "")}</td>
            <td>${escapeHtml(cityB ? cityB.nom : twin.ville2_id)}</td>
            <td>${escapeHtml(cityB ? cityB.pays : "")}</td>
            <td>${twin.distance_km}</td>
            <td class="text-nowrap">
                <button class="btn btn-sm btn-danger" data-id="${twin.id}" data-action="delete" title="${escapeHtml(t("admin.delete"))}"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    const pageInfo = document.getElementById("twinPageInfo");
    if (pageInfo) pageInfo.textContent = tn("admin.page.info_twins", fullList.length, { page: pagination.page, pages: totalPages });
    const firstBtn = document.getElementById("twinPageFirst");
    const prevBtn = document.getElementById("twinPagePrev");
    const nextBtn = document.getElementById("twinPageNext");
    const lastBtn = document.getElementById("twinPageLast");
    if (firstBtn) firstBtn.disabled = pagination.page <= 1;
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= totalPages;
    if (lastBtn) lastBtn.disabled = pagination.page >= totalPages;
}

function populateTwinFilterOptions() {
    const cityNameList = document.getElementById('twinCityNameOptions');
    if (cityNameList) {
        const names = uniqueSorted(adminState.cities.map(c=>c.nom));
        cityNameList.innerHTML = names.map(n=>`<option value="${escapeHtml(n)}"></option>`).join('');
    }
    const countries = uniqueSorted(adminState.cities.map(c=>c.pays));
    const continents = uniqueSorted(adminState.cities.map(c=>c.continent));
    ['filterTwinCountryA', 'filterTwinCountryB'].forEach((id) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const previous = sel.value;
        sel.innerHTML = `<option value="">${escapeHtml(t("admin.all"))}</option>` + countries.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if (previous && countries.includes(previous)) sel.value = previous;
    });
    ['filterTwinContinentA', 'filterTwinContinentB'].forEach((id) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const previous = sel.value;
        sel.innerHTML = `<option value="">${escapeHtml(t("admin.all"))}</option>` + continents.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if (previous && continents.includes(previous)) sel.value = previous;
    });
}

function updateDashboard(stats) {
    const elTotalCities = document.getElementById("adminTotalCities");
    if (elTotalCities) elTotalCities.textContent = stats.total_cities;
    const elTotalTwins = document.getElementById("adminTotalTwins");
    if (elTotalTwins) elTotalTwins.textContent = stats.total_links;
    const elAvg = document.getElementById("adminAvgDistance");
    if (elAvg) elAvg.textContent = `${stats.avg_distance} km`;
}

function loadAdminData() {
    return Promise.all([
        fetchJson("/api/admin/cities"),
        fetchJson("/api/admin/twins"),
        fetchJson("/api/stats"),
    ]).then(([cities, twins, stats]) => {
        adminState.cities = cities;
        adminState.twins = twins;
        populateFilterOptions();
        populateTwinFilterOptions();
        renderCityTable();
        renderTwinTable();
        updateDashboard(stats);
    });
}

function uniqueSorted(arr) {
    return Array.from(new Set(arr)).filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b)));
}

function populateFilterOptions() {
    const countrySel = document.getElementById('filterCountry');
    const contSel = document.getElementById('filterContinent');
    const cityNameList = document.getElementById('cityNameOptions');
    if (!countrySel || !contSel) return;

    const previousCountry = countrySel.value;
    const previousContinent = contSel.value;

    const continents = uniqueSorted(adminState.cities.map(c=>c.continent));
    contSel.innerHTML = `<option value="">${escapeHtml(t("admin.all"))}</option>` + continents.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    contSel.value = (previousContinent && continents.includes(previousContinent)) ? previousContinent : '';

    const continentFilter = contSel.value;
    const countryScope = continentFilter
        ? adminState.cities.filter(c => c.continent === continentFilter)
        : adminState.cities;
    const countries = uniqueSorted(countryScope.map(c=>c.pays));
    countrySel.innerHTML = `<option value="">${escapeHtml(t("admin.all"))}</option>` + countries.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    countrySel.value = (previousCountry && countries.includes(previousCountry)) ? previousCountry : '';

    if (cityNameList) {
        const countryFilter = countrySel.value;
        let cityScope = countryScope;
        if (countryFilter) cityScope = cityScope.filter(c => c.pays === countryFilter);
        const names = uniqueSorted(cityScope.map(c=>c.nom));
        cityNameList.innerHTML = names.map(n=>`<option value="${escapeHtml(n)}"></option>`).join('');
    }
}

function applyCityFilters() {
    let list = adminState.cities.slice();
    const cityName = (document.getElementById('filterCityName')||{}).value.trim().toLowerCase() || '';
    const country = (document.getElementById('filterCountry')||{}).value || '';
    const continent = (document.getElementById('filterContinent')||{}).value || '';
    const searchTwin = (document.getElementById('filterSearchTwin')||{}).value || '';
    const twinCountOp = (document.getElementById('filterTwinCountOp')||{}).value || '';
    const twinCountValRaw = (document.getElementById('filterTwinCountVal')||{}).value || '';
    const twinCountVal = twinCountValRaw === '' ? NaN : parseInt(twinCountValRaw, 10);
    const op = (document.getElementById('filterHabitantsOp')||{}).value || '';
    const valRaw = (document.getElementById('filterHabitantsVal')||{}).value || '';
    const val = valRaw === '' ? NaN : parseInt(valRaw, 10);
    if (cityName) list = list.filter(c=>String(c.nom||'').toLowerCase().includes(cityName));
    if (country) list = list.filter(c=>c.pays === country);
    if (continent) list = list.filter(c=>c.continent === continent);
    if (searchTwin !== '') list = list.filter(c => (c.search_twin ? 1 : 0) === parseInt(searchTwin, 10));
    if (twinCountOp && !isNaN(twinCountVal)) {
        if (twinCountOp === '>') list = list.filter(c => getTwinCount(c.id) > twinCountVal);
        if (twinCountOp === '<') list = list.filter(c => getTwinCount(c.id) < twinCountVal);
        if (twinCountOp === '=') list = list.filter(c => getTwinCount(c.id) === twinCountVal);
    }
    if (op && !isNaN(val)) {
        if (op === '>') list = list.filter(c => (c.habitants||0) > val);
        if (op === '<') list = list.filter(c => (c.habitants||0) < val);
        if (op === '=') list = list.filter(c => (c.habitants||0) === val);
    }
    const { key, dir } = adminState.citySort;
    if (key) {
        list.sort((a, b) => {
            if (key === 'habitants') {
                return ((a.habitants || 0) - (b.habitants || 0)) * dir;
            }
            if (key === 'twinCount') {
                return (getTwinCount(a.id) - getTwinCount(b.id)) * dir;
            }
            if (key === 'search_twin') {
                return ((a.search_twin ? 1 : 0) - (b.search_twin ? 1 : 0)) * dir;
            }
            return String(a[key] || '').localeCompare(String(b[key] || ''), undefined, { sensitivity: 'base' }) * dir;
        });
    }
    return list;
}

function resetCityForm() {
    const f = document.getElementById("cityForm");
    if (f) f.reset();
    const id = document.getElementById("cityId");
    if (id) id.value = "";
    const populationBtn = document.getElementById('cityWikidataUpdateBtn');
    if (populationBtn) populationBtn.style.display = 'none';
    const wdInput = document.getElementById("cityWikidata");
    if (wdInput) wdInput.dispatchEvent(new Event('input'));
    setFormStatus("");
}

// message sous le formulaire ; kind : "info", "success" ou "danger"
function setFormStatus(message, kind = "info") {
    const el = document.getElementById("cityFormStatus");
    if (!el) return;
    el.className = message ? `small mt-2 text-${kind === "info" ? "muted" : kind}` : "small";
    el.textContent = message;
}

function loadCityIntoForm(city) {
    document.getElementById("cityId").value = city.id;
    document.getElementById("cityName").value = city.nom;
    document.getElementById("cityCountry").value = city.pays;
    document.getElementById("cityContinent").value = city.continent;
    document.getElementById("cityWikidata").value = city.id_wikidata || "";
    // trigger input event so the Wikidata buttons update their disabled state
    document.getElementById("cityWikidata").dispatchEvent(new Event('input'));
    document.getElementById("cityPopulation").value = city.habitants || "";
    // show the population update button when habitants is empty/null/non-numeric
    const btn = document.getElementById('cityWikidataUpdateBtn');
    const h = city.habitants;
    const show = (h === null || h === undefined || h === '' || Number.isNaN(Number(h)));
    if (btn) btn.style.display = show ? 'inline-block' : 'none';
    document.getElementById("cityLatitude").value = city.latitude;
    document.getElementById("cityLongitude").value = city.longitude;
    setFormStatus("");
}

// 1er bouton : remplit la fiche (nom, pays, continent, habitants, coordonnées) depuis Wikidata
function fillCityFromWikidata(button) {
    const code = document.getElementById("cityWikidata").value.trim();
    if (!code) return;
    button.disabled = true;
    setFormStatus(t("admin.cities.wikidata_loading"));
    fetchJson(`/api/admin/wikidata_city?wikidata=${encodeURIComponent(code)}`).then((data) => {
        const currentId = parseInt(document.getElementById("cityId").value, 10) || null;
        if (data.existing && data.existing.id !== currentId) {
            const city = adminState.cities.find((c) => c.id === data.existing.id);
            if (city && confirm(t("admin.cities.exists_confirm", { city: data.existing.nom, qid: data.wikidata }))) {
                loadCityIntoForm(city);
            } else {
                setFormStatus("");
            }
            return;
        }
        const fields = [
            ["cityName", data.nom, "admin.name"],
            ["cityCountry", data.pays, "admin.country"],
            ["cityContinent", data.continent, "admin.continent"],
            ["cityPopulation", data.habitants, "admin.population"],
            ["cityLatitude", data.latitude, "admin.latitude"],
            ["cityLongitude", data.longitude, "admin.longitude"],
        ];
        const missing = [];
        fields.forEach(([id, value, labelKey]) => {
            if (value === null || value === undefined || value === "") {
                missing.push(t(labelKey));
            } else {
                document.getElementById(id).value = value;
            }
        });
        document.getElementById("cityWikidata").value = data.wikidata;
        const populationBtn = document.getElementById('cityWikidataUpdateBtn');
        if (populationBtn && data.habitants != null) populationBtn.style.display = 'none';
        const parts = [t("admin.cities.wikidata_loaded", { city: data.nom })];
        if (data.population_date) parts.push(t("admin.cities.wikidata_population_year", { year: data.population_date.slice(0, 4) }));
        if (missing.length) parts.push(t("admin.cities.wikidata_missing", { fields: missing.join(", ") }));
        setFormStatus(parts.join(" "), missing.length ? "warning" : "success");
    }).catch((err) => {
        setFormStatus((err && err.error) ? err.error : t("admin.cities.wikidata_fetch_error"), "danger");
    }).finally(() => {
        button.disabled = !document.getElementById("cityWikidata").value.trim();
    });
}

function bindCityForm() {
    const form = document.getElementById("cityForm");
    if (!form) return;
    const wikidataUpdateBtn = document.getElementById('cityWikidataUpdateBtn');
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const cityId = document.getElementById("cityId").value;
        const payload = {
            nom: document.getElementById("cityName").value,
            habitants: parseInt(document.getElementById("cityPopulation").value, 10) || null,
            pays: document.getElementById("cityCountry").value,
            continent: document.getElementById("cityContinent").value,
            id_wikidata: document.getElementById("cityWikidata").value || null,
            latitude: parseFloat(document.getElementById("cityLatitude").value),
            longitude: parseFloat(document.getElementById("cityLongitude").value),
        };

        const method = cityId ? "PUT" : "POST";
        const url = cityId ? `/api/admin/cities/${cityId}` : "/api/admin/cities";

        fetchJson(url, { method, body: JSON.stringify(payload) }).then((resp) => {
            return loadAdminData().then(() => {
                if (cityId) {
                    setFormStatus(t("admin.cities.saved"), "success");
                    return;
                }
                // nouvelle ville : on la garde dans le formulaire pour enchaîner sur ses jumelages
                const created = adminState.cities.find((c) => c.id === resp.id);
                if (created) loadCityIntoForm(created);
                setFormStatus(t("admin.cities.saved_new", { city: payload.nom, button: t("admin.cities.wikidata_fetch") }), "success");
            });
        }).catch((err) => {
            setFormStatus(t("admin.cities.save_error", { msg: (err && err.error) ? err.error : t("error.network") }), "danger");
        });
    });

    if (wikidataUpdateBtn) {
        wikidataUpdateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const cityId = parseInt((document.getElementById('cityId')||{value:''}).value, 10) || null;
            if (!cityId) { alert(t("admin.cities.select_first")); return; }
            wikidataUpdateBtn.disabled = true;
            fetchJson(`/api/admin/cities/${cityId}/wikidata_population`, { method: 'POST' }).then((res) => {
                if (res && typeof res.population !== 'undefined') {
                    document.getElementById('cityPopulation').value = res.population;
                    loadAdminData();
                    alert(t("admin.cities.population_updated", { n: formatNumber(res.population) }));
                } else {
                    alert(t("admin.cities.population_not_found"));
                }
            }).catch((e)=>{
                console.error('Wikidata update error', e);
                const msg = (e && e.error) ? e.error : JSON.stringify(e);
                alert(t("admin.cities.wikidata_update_error", { msg }));
            }).finally(()=>{ wikidataUpdateBtn.disabled = false; });
        });
    }

    const resetBtn = document.getElementById("cityReset");
    if (resetBtn) resetBtn.addEventListener("click", resetCityForm);

    // enable/disable Wikidata fetch and open buttons when wikidata input changes
    const wikidataInput = document.getElementById("cityWikidata");
    const wikidataBtn = document.getElementById("wikidataFetchBtn");
    const wikidataCityBtn = document.getElementById("wikidataCityBtn");
    const openWikidataBtn = document.getElementById("openWikidataBtn");
    function updateWikidataBtn() {
        if (!wikidataInput) return;
        const v = (wikidataInput.value || "").trim();
        if (wikidataBtn) wikidataBtn.disabled = v === "";
        if (wikidataCityBtn) wikidataCityBtn.disabled = v === "";
        if (openWikidataBtn) openWikidataBtn.disabled = v === "";
    }
    if (wikidataCityBtn) wikidataCityBtn.addEventListener("click", () => fillCityFromWikidata(wikidataCityBtn));
    // Entrée dans le champ Wikidata : remplit la fiche au lieu d'enregistrer le formulaire
    if (wikidataInput) wikidataInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); if (wikidataCityBtn && !wikidataCityBtn.disabled) fillCityFromWikidata(wikidataCityBtn); }
    });
    if (wikidataInput) wikidataInput.addEventListener("input", updateWikidataBtn);
    updateWikidataBtn();

    if (openWikidataBtn) {
        openWikidataBtn.addEventListener('click', () => {
            const code = (document.getElementById('cityWikidata')||{value:''}).value.trim();
            if (!code) return;
            let id = code.toUpperCase();
            if (!id.startsWith('Q')) id = 'Q' + id;
            const url = `https://www.wikidata.org/wiki/${encodeURIComponent(id)}`;
            window.open(url, '_blank');
        });
    }

    if (wikidataBtn) {
        wikidataBtn.addEventListener("click", () => {
            const wikicode = (wikidataInput.value || "").trim();
            if (!wikicode) return;
            const cityId = parseInt((document.getElementById("cityId")||{value:''}).value, 10) || null;
            const city = adminState.cities.find(c => c.id === cityId) || null;
            fetchJson(`/api/admin/wikidata_twins?wikidata=${encodeURIComponent(wikicode)}`).then((res) => {
                // API may return either array or { subject_continent, results }
                let results = res;
                let subjectContinent = null;
                if (res && res.results) { results = res.results; subjectContinent = res.subject_continent; }
                // if subject continent available, prefill form
                if (subjectContinent) {
                    const el = document.getElementById('cityContinent'); if (el) el.value = subjectContinent;
                }
                if (cityId) {
                    fetchJson(`/api/admin/cities/${cityId}/search_twin`, { method: 'POST' }).then(() => {
                        if (city) city.search_twin = true;
                        renderCityTable();
                    }).catch(() => {});
                }
                openWikidataModal(wikicode, city, results, subjectContinent);
            }).catch((err) => {
                alert(t("admin.cities.wikidata_fetch_error"));
                console.error(err);
            });
        });
    }
}

function bindTableActions() {
    const cityTableEl = document.getElementById("cityTable");
    if (cityTableEl) {
        cityTableEl.addEventListener("click", (event) => {
            const button = event.target.closest("button");
            if (!button) return;
            const id = button.dataset.id;
            const action = button.dataset.action;
            if (action === "edit") {
                const city = adminState.cities.find((item) => item.id === parseInt(id, 10));
                if (!city) return;
                loadCityIntoForm(city);
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
            if (action === "delete" && confirm(t("admin.cities.confirm_delete"))) {
                fetchJson(`/api/admin/cities/${id}`, { method: "DELETE" }).then(loadAdminData).catch(() => {});
            }
        });
    }

    const twinTableEl = document.getElementById("twinTable");
    if (twinTableEl) {
        twinTableEl.addEventListener("click", (event) => {
            const button = event.target.closest("button");
            if (!button) return;
            const id = button.dataset.id;
            const action = button.dataset.action;
            if (action === "delete" && confirm(t("admin.twins.confirm_delete"))) {
                fetchJson(`/api/admin/twins/${id}`, { method: "DELETE" }).then(loadAdminData).catch(() => {});
            }
        });
    }
}

function loadBatchsData() {
    const select = document.getElementById("batchSelect");
    if (!select) return;
    fetchJson("/api/admin/batchs").then((batchs) => {
        adminState.batchs = batchs;
        select.innerHTML = `<option value="">${escapeHtml(t("admin.batchs.choose"))}</option>`
            + batchs.map((b) => `<option value="${b.id}">${escapeHtml(batchLabel(b.libelle_batch))}</option>`).join('');
    });
}

function runHabitantsCorrection(button) {
    const pays = button.dataset.pays;
    if (!pays) return;
    if (!confirm(t("admin.batchs.correction_confirm", { country: pays }))) return;
    button.disabled = true;
    const icon = button.querySelector('i');
    if (icon) icon.className = 'fas fa-spinner fa-spin';
    fetchJson('/api/admin/habitants/correction', { method: 'POST', body: JSON.stringify({ pays }) }).then((res) => {
        alert(t("admin.batchs.correction_done", { updated: formatNumber(res.updated), total: formatNumber(res.total) }));
        const success = res.updated === res.total;
        button.classList.remove('btn-warning');
        button.classList.add(success ? 'btn-success' : 'btn-danger');
        if (icon) icon.className = success ? 'fas fa-check' : 'fas fa-times';
    }).catch((err) => {
        const msg = (err && err.error) ? err.error : t("admin.batchs.correction_error");
        alert(msg);
        button.classList.remove('btn-warning');
        button.classList.add('btn-danger');
        if (icon) icon.className = 'fas fa-times';
    });
    // le bouton reste désactivé définitivement, succès ou échec : plus aucun traitement possible sur cette ligne
}

function renderBatchResultsTable(columns, rows, batch) {
    const container = document.getElementById("batchResultsTable");
    if (!container) return;
    if (!rows.length) {
        container.innerHTML = '<p class="text-muted">Aucun enregistrement.</p>';
        return;
    }
    const withCorrection = !!batch && batch.libelle_batch === 'Villes sans habitants';
    const headCols = withCorrection ? columns.concat([t("admin.batchs.correction")]) : columns;
    const thead = `<thead><tr>${headCols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map((row) => {
        const cells = columns.map((c) => `<td>${escapeHtml(row[c])}</td>`).join('');
        const correctionCell = withCorrection
            ? `<td><button type="button" class="btn btn-sm btn-warning batch-correction-btn" data-pays="${escapeHtml(row.pays)}" title="${escapeHtml(t("admin.batchs.correction_title", { country: row.pays }))}"><i class="fas fa-bolt"></i></button></td>`
            : '';
        return `<tr>${cells}${correctionCell}</tr>`;
    }).join('')}</tbody>`;
    container.innerHTML = `<table class="table table-sm table-bordered table-striped">${thead}${tbody}</table>`;

    if (withCorrection) {
        container.querySelectorAll('.batch-correction-btn').forEach((btn) => {
            btn.addEventListener('click', () => runHabitantsCorrection(btn));
        });
    }
}

function bindBatchControls() {
    const select = document.getElementById("batchSelect");
    const sqlArea = document.getElementById("batchSql");
    const executeBtn = document.getElementById("batchExecuteBtn");
    const resultBox = document.getElementById("batchResult");
    const resultsTable = document.getElementById("batchResultsTable");
    if (!select || !sqlArea || !executeBtn) return;

    select.addEventListener("change", () => {
        const batch = (adminState.batchs || []).find((b) => String(b.id) === select.value);
        sqlArea.value = batch ? batch.batch_sql : "";
        executeBtn.disabled = !batch;
        if (resultBox) resultBox.innerHTML = "";
        if (resultsTable) resultsTable.innerHTML = "";
    });

    executeBtn.addEventListener("click", () => {
        const batchId = select.value;
        if (!batchId) return;
        if (!confirm(t("admin.batchs.confirm"))) return;
        const batch = (adminState.batchs || []).find((b) => String(b.id) === batchId);
        executeBtn.disabled = true;
        if (resultsTable) resultsTable.innerHTML = "";
        fetchJson(`/api/admin/batchs/${batchId}/execute`, { method: "POST" }).then((res) => {
            const durationMsg = (typeof res.duration_ms !== 'undefined') ? ` (${res.duration_ms} ms)` : '';
            if (Array.isArray(res.rows)) {
                if (resultBox) {
                    resultBox.innerHTML = `<div class="alert alert-success">${escapeHtml(t("admin.batchs.query_ok", { n: formatNumber(res.rows.length), duration: durationMsg }))}</div>`;
                }
                renderBatchResultsTable(res.columns, res.rows, batch);
            } else if (resultBox) {
                resultBox.innerHTML = `<div class="alert alert-success">${escapeHtml(t("admin.batchs.update_ok", { n: formatNumber(res.rows_affected), duration: durationMsg }))}</div>`;
            }
        }).catch((err) => {
            if (resultBox) {
                const msg = (err && err.error) ? err.error : t("admin.batchs.error");
                resultBox.innerHTML = `<div class="alert alert-danger">${escapeHtml(msg)}</div>`;
            }
        }).finally(() => {
            executeBtn.disabled = false;
        });
    });
}

window.addEventListener("DOMContentLoaded", () => {
    // bind only when elements exist on the current admin page
    bindCityForm();
    bindTableActions();
    bindFilterControls();
    bindTwinFilterControls();
    bindBatchControls();
    bindPaginationControls("city", adminState.cityPagination, renderCityTable);
    bindPaginationControls("twin", adminState.twinPagination, renderTwinTable);
    bindSortControls();

    const needsData = document.getElementById("cityTable") || document.getElementById("twinTable") || document.getElementById("adminTotalCities");
    if (needsData) {
        loadAdminData();
    }
    loadBatchsData();
});

function bindSortableHeaders(tableBodyId, sortState, renderFn) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;
    const table = tbody.closest("table");
    if (!table) return;
    const headers = table.querySelectorAll("thead th.sortable[data-sort]");
    if (!headers.length) return;
    headers.forEach((th) => {
        th.addEventListener("click", () => {
            const key = th.dataset.sort;
            if (sortState.key === key) {
                sortState.dir *= -1;
            } else {
                sortState.key = key;
                sortState.dir = 1;
            }
            headers.forEach((h) => {
                h.classList.remove("sort-asc", "sort-desc");
                const icon = h.querySelector("i");
                if (icon) icon.className = "fas fa-sort";
            });
            const icon = th.querySelector("i");
            if (sortState.dir === 1) {
                th.classList.add("sort-asc");
                if (icon) icon.className = "fas fa-sort-up";
            } else {
                th.classList.add("sort-desc");
                if (icon) icon.className = "fas fa-sort-down";
            }
            renderFn();
        });
    });
}

function bindSortControls() {
    bindSortableHeaders("cityTable", adminState.citySort, () => {
        adminState.cityPagination.page = 1;
        renderCityTable();
    });
    bindSortableHeaders("twinTable", adminState.twinSort, () => {
        adminState.twinPagination.page = 1;
        renderTwinTable();
    });
}

function bindFilterControls() {
    const applyBtn = document.getElementById('filterApply');
    const resetBtn = document.getElementById('filterReset');
    const cityNameInput = document.getElementById('filterCityName');
    const continentSel = document.getElementById('filterContinent');
    const countrySel = document.getElementById('filterCountry');
    if (cityNameInput) cityNameInput.addEventListener('input', () => { adminState.cityPagination.page = 1; renderCityTable(); });
    if (continentSel) continentSel.addEventListener('change', () => { populateFilterOptions(); adminState.cityPagination.page = 1; renderCityTable(); });
    if (countrySel) countrySel.addEventListener('change', () => { populateFilterOptions(); adminState.cityPagination.page = 1; renderCityTable(); });
    if (applyBtn) applyBtn.addEventListener('click', (e)=>{ e.preventDefault(); adminState.cityPagination.page = 1; renderCityTable(); });
    if (resetBtn) resetBtn.addEventListener('click', (e)=>{ e.preventDefault(); const fn=document.getElementById('filterCityName'); if(fn) fn.value=''; const fc=document.getElementById('filterCountry'); if(fc) fc.value=''; const fco=document.getElementById('filterContinent'); if(fco) fco.value=''; const fst=document.getElementById('filterSearchTwin'); if(fst) fst.value=''; const fto=document.getElementById('filterTwinCountOp'); if(fto) fto.value=''; const ftv=document.getElementById('filterTwinCountVal'); if(ftv) ftv.value=''; const fo=document.getElementById('filterHabitantsOp'); if(fo) fo.value=''; const fv=document.getElementById('filterHabitantsVal'); if(fv) fv.value=''; populateFilterOptions(); adminState.cityPagination.page = 1; renderCityTable(); });
}

function bindTwinFilterControls() {
    const fieldIds = [
        'filterTwinCityNameA', 'filterTwinCountryA', 'filterTwinContinentA',
        'filterTwinCityNameB', 'filterTwinCountryB', 'filterTwinContinentB',
    ];
    const fields = fieldIds.map((id) => document.getElementById(id)).filter(Boolean);
    fields.forEach((el) => {
        const evt = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evt, () => {
            adminState.twinPagination.page = 1;
            renderTwinTable();
        });
    });
    const resetBtn = document.getElementById('filterTwinReset');
    if (resetBtn) resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fields.forEach((el) => { el.value = ''; });
        adminState.twinPagination.page = 1;
        renderTwinTable();
    });
}

function bindPaginationControls(prefix, paginationState, renderFn) {
    const pageSizeSel = document.getElementById(`${prefix}PageSize`);
    const firstBtn = document.getElementById(`${prefix}PageFirst`);
    const prevBtn = document.getElementById(`${prefix}PagePrev`);
    const nextBtn = document.getElementById(`${prefix}PageNext`);
    const lastBtn = document.getElementById(`${prefix}PageLast`);
    const gotoInput = document.getElementById(`${prefix}PageGoto`);
    const goBtn = document.getElementById(`${prefix}PageGo`);
    if (!pageSizeSel) return;

    pageSizeSel.value = String(paginationState.pageSize);
    pageSizeSel.addEventListener('change', () => {
        paginationState.pageSize = parseInt(pageSizeSel.value, 10) || 50;
        paginationState.page = 1;
        renderFn();
    });
    if (firstBtn) firstBtn.addEventListener('click', () => {
        paginationState.page = 1;
        renderFn();
    });
    if (prevBtn) prevBtn.addEventListener('click', () => {
        paginationState.page = Math.max(1, paginationState.page - 1);
        renderFn();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        paginationState.page = Math.min(paginationState.totalPages, paginationState.page + 1);
        renderFn();
    });
    if (lastBtn) lastBtn.addEventListener('click', () => {
        paginationState.page = paginationState.totalPages;
        renderFn();
    });
    const goToPage = () => {
        if (!gotoInput) return;
        const n = parseInt(gotoInput.value, 10);
        if (!n || isNaN(n)) return;
        paginationState.page = Math.min(Math.max(1, n), paginationState.totalPages);
        gotoInput.value = '';
        renderFn();
    };
    if (goBtn) goBtn.addEventListener('click', goToPage);
    if (gotoInput) gotoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); goToPage(); }
    });
}

// --- Wikidata modal handling ---
function computeDistanceKm(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
    const R = 6371; // km
    const toRad = (v) => v * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}

function openWikidataModal(wikicode, city, results, subjectContinent) {
    const header = document.getElementById('wikidataModalHeader');
    const tbody = document.getElementById('wikidataResults');
    if (!tbody) return;
    header.textContent = t("admin.wikidata.header", { city: city ? city.nom : "—", code: wikicode });
    tbody.innerHTML = '';
    results.forEach((r, idx) => {
        const tr = document.createElement('tr');
        const coord = (r.latitude && r.longitude) ? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}` : '';
        const existingCity = adminState.cities.find(c => c.id_wikidata === r.wikidata);
        const cityExists = !!existingCity;
        const twinExists = !!(cityExists && city && adminState.twins.some(t =>
            (t.ville1_id === city.id && t.ville2_id === existingCity.id) ||
            (t.ville1_id === existingCity.id && t.ville2_id === city.id)
        ));
        const addBtnAttrs = cityExists ? 'disabled' : '';
        const addBtnLabel = escapeHtml(cityExists ? t("admin.wikidata.exists") : t("admin.wikidata.add"));
        const twinBtnAttrs = twinExists ? 'disabled' : '';
        const twinBtnLabel = escapeHtml(twinExists ? t("admin.wikidata.exists") : t("admin.wikidata.twin"));
        tr.innerHTML = `
            <td>${escapeHtml(r.label || r.wikidata)}</td>
            <td>${escapeHtml(r.country)}</td>
            <td>${coord}</td>
            <td>
                <button class="btn btn-sm btn-outline-success mr-1" data-action="add" data-idx="${idx}" ${addBtnAttrs}>${addBtnLabel}</button>
                <button class="btn btn-sm btn-outline-primary" data-action="twin" data-idx="${idx}" ${twinBtnAttrs}>${twinBtnLabel}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // bind actions
    tbody.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const action = btn.dataset.action;
            const idx = parseInt(btn.dataset.idx, 10);
            const item = results[idx];
                if (action === 'add') {
                // create city
                const payload = {
                    nom: item.label || item.wikidata,
                    habitants: (item.habitants != null) ? item.habitants : (item.population != null ? item.population : 0),
                    pays: (typeof item.country !== 'undefined') ? item.country : '',
                    continent: (typeof item.continent !== 'undefined' && item.continent) ? item.continent : (subjectContinent || ''),
                    latitude: (typeof item.latitude !== 'undefined' && item.latitude !== null) ? item.latitude : 0,
                    longitude: (typeof item.longitude !== 'undefined' && item.longitude !== null) ? item.longitude : 0,
                    id_wikidata: item.wikidata,
                };
                fetchJson('/api/admin/cities', { method: 'POST', body: JSON.stringify(payload) }).then((resp) => {
                        if (resp && resp.existed) {
                            loadAdminData();
                            btn.disabled = true;
                            btn.textContent = t("admin.wikidata.exists");
                        } else {
                            loadAdminData();
                            btn.disabled = true;
                            btn.textContent = t("admin.wikidata.added");
                        }
                }).catch((e) => {
                    console.error('Create city error:', e);
                    const msg = (e && e.error) ? e.error : (e && e.message) ? e.message : JSON.stringify(e);
                    alert(t("admin.wikidata.city_error", { msg }));
                });
            }
            if (action === 'twin') {
                // create twin between current city and this item
                const currentCityId = (document.getElementById('cityId')||{value:''}).value;
                if (!currentCityId) { alert(t("admin.wikidata.select_target")); return; }
                // find if item already exists in DB by wikidata
                const existing = adminState.cities.find(c => c.id_wikidata === item.wikidata);
                const ensureAndTwin = (otherId) => {
                    const lat1 = parseFloat((document.getElementById('cityLatitude')||{value:''}).value);
                    const lon1 = parseFloat((document.getElementById('cityLongitude')||{value:''}).value);
                    const lat2 = item.latitude;
                    const lon2 = item.longitude;
                    const dist = computeDistanceKm(lat1, lon1, lat2, lon2);
                    fetchJson('/api/admin/twins', { method: 'POST', body: JSON.stringify({ ville1_id: parseInt(currentCityId,10), ville2_id: otherId, distance_km: dist }) }).then((resp) => {
                        loadAdminData();
                        btn.disabled = true; btn.textContent = (resp && resp.existed) ? t("admin.wikidata.exists") : t("admin.wikidata.twinned");
                    }).catch((e) => { console.error(e); alert(t("admin.wikidata.twin_error")); });
                };

                if (existing) {
                    ensureAndTwin(existing.id);
                } else {
                    // create city then twin
                    const payload = {
                        nom: item.label || item.wikidata,
                        habitants: (item.habitants != null) ? item.habitants : (item.population != null ? item.population : 0),
                        pays: (typeof item.country !== 'undefined') ? item.country : '',
                        continent: (typeof item.continent !== 'undefined' && item.continent) ? item.continent : (subjectContinent || ''),
                        latitude: (typeof item.latitude !== 'undefined' && item.latitude !== null) ? item.latitude : 0,
                        longitude: (typeof item.longitude !== 'undefined' && item.longitude !== null) ? item.longitude : 0,
                        id_wikidata: item.wikidata,
                    };
                    fetchJson('/api/admin/cities', { method: 'POST', body: JSON.stringify(payload) }).then((resp) => {
                        const otherId = resp.id;
                        loadAdminData();
                        ensureAndTwin(otherId);
                    }).catch((e) => {
                        console.error('Create city (twin) error:', e);
                        const msg = (e && e.error) ? e.error : (e && e.message) ? e.message : JSON.stringify(e);
                        alert(t("admin.wikidata.city_error", { msg }));
                    });
                }
            }
        });
    });

    // show modal (Bootstrap)
    $('#wikidataModal').modal('show');
}
