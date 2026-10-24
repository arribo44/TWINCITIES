// Traductions de l'interface. window.I18N est injecté par le template (_i18n.html).
const I18N = window.I18N || { lang: "fr", messages: {}, countryCodes: {} };

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]);
}

function t(key, params = {}) {
    const text = I18N.messages[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

// pluriel : en français 0 et 1 sont au singulier, en anglais seulement 1
function tn(key, count, params = {}) {
    const singular = I18N.lang === "fr" ? count <= 1 : count === 1;
    return t(`${key}.${singular ? "one" : "other"}`, { n: formatNumber(count), ...params });
}

// le français met une espace avant les deux-points, pas l'anglais
function colon() {
    return I18N.lang === "fr" ? "\u00a0: " : ": ";
}

function formatNumber(value) {
    return Number(value).toLocaleString(I18N.lang);
}

const regionNames = (typeof Intl !== "undefined" && Intl.DisplayNames)
    ? new Intl.DisplayNames([I18N.lang], { type: "region" })
    : null;

function countryNameFromCode(code, fallback) {
    if (!regionNames || !/^[A-Za-z]{2}$/.test(code || "")) return fallback;
    try {
        return regionNames.of(code.toUpperCase()) || fallback;
    } catch (e) {
        return fallback;
    }
}

// les pays sont stockés en français ; on les traduit via leur code ISO
function countryName(frenchName) {
    if (!frenchName || I18N.lang === "fr") return frenchName || "";
    return countryNameFromCode(I18N.countryCodes[frenchName], frenchName);
}

function continentName(frenchName) {
    if (!frenchName) return "";
    const key = `continent.${frenchName}`;
    return key in I18N.messages ? I18N.messages[key] : frenchName;
}

// noms français des pays dont le nom traduit contient la saisie (pour la recherche)
function matchingCountries(query) {
    if (I18N.lang === "fr" || !query) return [];
    const needle = normalizeText(query);
    return Object.keys(I18N.countryCodes).filter((fr) => normalizeText(countryName(fr)).includes(needle));
}

function normalizeText(value) {
    return String(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// éléments rendus côté serveur portant un nom de pays à traduire
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-country]").forEach((el) => {
        el.textContent = countryName(el.dataset.country);
    });
});
