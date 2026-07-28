// ============================================================
// Résolution / traduction EN->FR des noms d'espèces et d'attaques.
// Fonctions pures (aucune dépendance au DOM), partagées entre
// index.html (app.js, import de script Showdown) et calc.html (calc.js).
// Doit être chargé après data.js et calc-data.js.
// ============================================================

function normC(s) {
  return (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const SPECIES_NAMES = Object.keys(CALC_SPECIES).sort((a, b) => a.localeCompare(b, "fr"));
const MOVE_NAMES = Object.keys(CALC_MOVES).sort((a, b) => a.localeCompare(b, "fr"));
const ITEM_NAMES = Object.keys(CALC_ITEMS).sort((a, b) => a.localeCompare(b, "fr"));
const NATURE_NAMES = Object.keys(CALC_NATURES).sort((a, b) => a.localeCompare(b, "fr"));

const EN_FR_OVERRIDE_KEY = "rnb_en_fr_species_v1";

function loadEnFrOverrides() {
  try {
    const obj = JSON.parse(localStorage.getItem(EN_FR_OVERRIDE_KEY) || "{}");
    return (obj && typeof obj === "object") ? obj : {};
  } catch (e) { return {}; }
}

function saveEnFrOverride(rawName, frName) {
  const obj = loadEnFrOverrides();
  obj[rawName] = frName;
  localStorage.setItem(EN_FR_OVERRIDE_KEY, JSON.stringify(obj));
}

function isKnownEnglishName(name) {
  if (!name || typeof TYPES_MAP_EN === "undefined") return false;
  if (TYPES_MAP_EN[name]) return true;
  const t = normC(name);
  return Object.keys(TYPES_MAP_EN).some(n => normC(n) === t);
}

function findSpeciesByLooseName(name) {
  if (!name) return null;
  if (CALC_SPECIES[name]) return name;
  const overrides = loadEnFrOverrides();
  if (overrides[name] && CALC_SPECIES[overrides[name]]) return overrides[name];
  const t = normC(name);
  const overrideKey = Object.keys(overrides).find(k => normC(k) === t);
  if (overrideKey && CALC_SPECIES[overrides[overrideKey]]) return overrides[overrideKey];
  const exact = SPECIES_NAMES.find(n => normC(n) === t);
  if (exact) return exact;
  // Traduction EN->FR (1129 espèces/formes, vérifiées via les CSV officiels de PokeAPI
  // + pokedex.ts de Pokémon Showdown pour le format exact des noms de formes régionales/
  // Méga/Gigamax/etc, tel qu'utilisé dans les exports d'équipe Showdown).
  if (SPECIES_EN_FR[name] && CALC_SPECIES[SPECIES_EN_FR[name]]) return SPECIES_EN_FR[name];
  const enKey = Object.keys(SPECIES_EN_FR).find(k => normC(k) === t);
  if (enKey && CALC_SPECIES[SPECIES_EN_FR[enKey]]) return SPECIES_EN_FR[enKey];
  return null;
}

const MOVE_OVERRIDE_KEY = "rnb_en_fr_moves_v1";
function loadMoveOverrides() {
  try {
    const obj = JSON.parse(localStorage.getItem(MOVE_OVERRIDE_KEY) || "{}");
    return (obj && typeof obj === "object") ? obj : {};
  } catch (e) { return {}; }
}
function saveMoveOverride(rawName, frName) {
  const obj = loadMoveOverrides();
  obj[rawName] = frName;
  localStorage.setItem(MOVE_OVERRIDE_KEY, JSON.stringify(obj));
}
// URL du sprite Pokémon Showdown pour une espèce (nom FR, tel qu'utilisé dans
// CALC_SPECIES). Basé sur SPECIES_SPRITEID (calc-data.js), qui reproduit
// exactement l'algorithme de calcul du "spriteid" du client Pokémon Showdown
// (battle-dex-data.ts : spriteid = toID(baseSpecies) + "-" + toID(forme)),
// vérifié par requêtes sur le CDN officiel (play.pokemonshowdown.com/sprites/gen5/).
function getSpeciesSpriteUrl(frName) {
  if (!frName) return null;
  const spriteid = SPECIES_SPRITEID[frName];
  if (!spriteid) return null;
  return `https://play.pokemonshowdown.com/sprites/gen5/${spriteid}.png`;
}

function findMoveByLooseName(name) {
  if (!name) return null;
  if (CALC_MOVES[name]) return name;
  const overrides = loadMoveOverrides();
  if (overrides[name] && CALC_MOVES[overrides[name]]) return overrides[name];
  const t = normC(name);
  const overrideKey = Object.keys(overrides).find(k => normC(k) === t);
  if (overrideKey && CALC_MOVES[overrides[overrideKey]]) return overrides[overrideKey];
  const exact = MOVE_NAMES.find(n => normC(n) === t);
  if (exact) return exact;
  // Traduction EN->FR (486 attaques, vérifiées via les CSV officiels de PokeAPI :
  // move_names.csv/languages.csv, source déjà créditée dans le footer du site).
  // Gère aussi le format d'export Showdown pour Puissance Cachée : "Hidden Power [Fire]".
  const hp = name.match(/^hidden power\s*\[?\s*([a-z]+)\s*\]?$/i);
  const normalizedEn = hp ? `Hidden Power ${hp[1][0].toUpperCase()}${hp[1].slice(1).toLowerCase()}` : name;
  if (MOVE_EN_FR[normalizedEn] && CALC_MOVES[MOVE_EN_FR[normalizedEn]]) return MOVE_EN_FR[normalizedEn];
  const enKey = Object.keys(MOVE_EN_FR).find(k => normC(k) === t);
  if (enKey && CALC_MOVES[MOVE_EN_FR[enKey]]) return MOVE_EN_FR[enKey];
  return null;
}

// Résout un nom d'objet FR ou EN (export Showdown) vers la clé FR de
// CALC_ITEMS (158 objets, table ITEM_EN_FR = inverse exact de CALC_ITEMS).
function findItemByLooseName(name) {
  if (!name) return null;
  if (CALC_ITEMS[name]) return name;
  const t = normC(name);
  const exact = ITEM_NAMES.find(n => normC(n) === t);
  if (exact) return exact;
  if (ITEM_EN_FR[name] && CALC_ITEMS[ITEM_EN_FR[name]]) return ITEM_EN_FR[name];
  const enKey = Object.keys(ITEM_EN_FR).find(k => normC(k) === t);
  if (enKey && CALC_ITEMS[ITEM_EN_FR[enKey]]) return ITEM_EN_FR[enKey];
  return null;
}
