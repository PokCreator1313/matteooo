// ============================================================
// Interface du calculateur de dégâts (page 2)
// (normC, findSpeciesByLooseName, findMoveByLooseName et les
// fonctions de résolution EN->FR sont définies dans translate.js,
// partagé avec app.js pour la traduction automatique à l'import)
// ============================================================

document.getElementById("calc-species-list").innerHTML = SPECIES_NAMES.map(n => `<option value="${n}"></option>`).join("");
document.getElementById("calc-move-list").innerHTML = MOVE_NAMES.map(n => `<option value="${n}"></option>`).join("");
document.getElementById("calc-item-list").innerHTML = ITEM_NAMES.map(n => `<option value="${n}"></option>`).join("");

// Traduction EN->FR des natures (25 valeurs fixes, vérifiées contre Poképédia ET
// recoupées avec les effets inc/dec de CALC_NATURES). Les 5 natures neutres
// (Hardy/Docile/Serious/Bashful/Quirky) n'ont aucun effet : nature="" suffit déjà.
// Gentle et Lax n'existent pas du tout dans CALC_NATURES (non modélisées ici).
const NATURE_EN_FR = {
  Bold: "Assuré", Brave: "Brave", Calm: "Calme", Quiet: "Discret", Mild: "Doux",
  Rash: "Foufou", Jolly: "Jovial", Impish: "Malin", Sassy: "Malpoli",
  Modest: "Modeste", Naive: "Naïf", Hasty: "Pressé", Careful: "Prudent",
  Relaxed: "Relax", Adamant: "Rigide", Lonely: "Solo", Timid: "Timide",
  Naughty: "Naughty",
};
const NEUTRAL_EN_NATURES = ["Hardy", "Docile", "Serious", "Bashful", "Quirky"];

function findNatureKeyLoose(name) {
  if (!name) return null;
  if (CALC_NATURES[name]) return name;
  const direct = findLooseKey(NATURE_NAMES, name);
  if (direct) return direct;
  const en = Object.keys(NATURE_EN_FR).find(k => normC(k) === normC(name));
  if (en) return NATURE_EN_FR[en];
  if (NEUTRAL_EN_NATURES.some(n => normC(n) === normC(name))) return ""; // neutre = pas de nature
  return null;
}

function findLooseKey(names, name) {
  if (!name) return null;
  if (names.includes(name)) return name;
  const t = normC(name);
  return names.find(n => normC(n) === t) || null;
}

// Résout un nom de talent FR ou EN vers la clé FR de CALC_ABILITIES (jamais deviné :
// correspondance exacte/accents FR, ou EN via le champ .name déjà présent dans les données).
function findAbilityKeyLoose(name) {
  if (!name) return null;
  if (CALC_ABILITIES[name]) return name;
  const t = normC(name);
  const frMatch = Object.keys(CALC_ABILITIES).find(k => normC(k) === t);
  if (frMatch) return frMatch;
  const enMatch = Object.keys(CALC_ABILITIES).find(k => normC(CALC_ABILITIES[k].name || "") === t);
  return enMatch || null;
}

function blankMon(extra) {
  return Object.assign({
    species: "", level: 100, nature: "",
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: "", abilityActive: true, item: "",
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    status: "", // "" | brulure | paralysie | poison | poison_grave | sommeil | gel
    currentHp: null, // null = PV pleins (suit automatiquement le max)
  }, extra);
}

// Statuts principaux et leur effet standard (Gen 6-9) sur les stats :
// - Brûlure : -50% dégâts physiques infligés (déjà géré via computeDamage).
// - Paralysie : Vitesse x0.5 (sauf Pied Véloce qui l'annule et boost x1.5 à la place).
// - Poison / Poison grave / Sommeil / Gel : aucun effet direct sur les stats,
//   mais comptent comme "statué" pour Cran (Guts) et Écaille Spéciale (Marvel Scale).
const STATUS_OPTIONS = [
  { key: "", label: "Sain" },
  { key: "brulure", label: "Brûlé" },
  { key: "paralysie", label: "Paralysé" },
  { key: "poison", label: "Empoisonné" },
  { key: "poison_grave", label: "Gravement empoisonné" },
  { key: "sommeil", label: "Endormi" },
  { key: "gel", label: "Gelé" },
];

function statusSpeedMult(mon) {
  if (mon.status === "paralysie") {
    return abilityIdByFrName(mon.ability) === "QUICK_FEET" ? 1.5 : 0.5;
  }
  if (mon.status && abilityIdByFrName(mon.ability) === "QUICK_FEET") return 1.5;
  return 1;
}

// Valeur affichée d'une stat : applique le stage de combat puis, pour la
// Vitesse, l'effet du statut (Paralysie / Pied Véloce).
function displayStat(mon, key, stats) {
  if (!stats) return "—";
  if (key === "hp") return stats.hp;
  let v = applyStage(stats[key], mon.stages[key] || 0);
  if (key === "spe") v = Math.floor(v * statusSpeedMult(mon));
  return v;
}

function blankSlot() {
  return { name: "" };
}

// Résout chaque nom de capacité (souvent en anglais, venant d'un import
// Showdown) vers son nom français canonique quand c'est possible, comme
// pour le moveset du dresseur adverse (déjà en français dans les données).
function movesFromNames(names) {
  const arr = (names || []).filter(Boolean).slice(0, 4).map(n => Object.assign(blankSlot(), { name: findMoveByLooseName(n) || n }));
  while (arr.length < 4) arr.push(blankSlot());
  return arr;
}

const state = {
  attacker: blankMon({}),
  defender: blankMon({ notFullyEvolved: false }),
  atkMoveset: [blankSlot(), blankSlot(), blankSlot(), blankSlot()],
  defMoveset: [blankSlot(), blankSlot(), blankSlot(), blankSlot()],
  atkActiveSlot: 0,
  defActiveSlot: 0,
  field: { weather: "none", terrain: "none", reflect: false, lightscreen: false, auroraveil: false, crit: false, multiTarget: false },
};

function movesetArr(ms) { return ms === "atk" ? state.atkMoveset : state.defMoveset; }
function activeSlotOf(ms) { return ms === "atk" ? state.atkActiveSlot : state.defActiveSlot; }
function setActiveSlot(ms, i) { if (ms === "atk") state.atkActiveSlot = i; else state.defActiveSlot = i; }
function movesetElId(ms) { return ms === "atk" ? "attacker-moveset" : "defender-moveset"; }
function attackerDefenderFor(ms) {
  return ms === "atk"
    ? { atkMon: state.attacker, defMon: state.defender }
    : { atkMon: state.defender, defMon: state.attacker };
}

const STAT_LABELS = { hp: "PV", atk: "Atk", def: "Déf", spa: "AtkS", spd: "DéfS", spe: "Vit" };

function abilityOptionsForSpecies(speciesName, currentVal) {
  const resolved = findSpeciesByLooseName(speciesName);
  const sp = resolved ? CALC_SPECIES[resolved] : null;
  if (!sp) return `<option value="">—</option>`;
  const opts = sp.abilities.map(id => {
    const fr = abilityFrNameById(id);
    return `<option value="${fr}" ${fr === currentVal ? "selected" : ""}>${fr}</option>`;
  }).join("");
  return `<option value="">—</option>` + opts;
}

function getResolvedStats(mon) {
  const resolved = findSpeciesByLooseName(mon.species);
  if (!resolved) return null;
  return computeStats(Object.assign({}, mon, { species: resolved }));
}

// ---------- Grille IV/EV/Mod./Stat finale (stages inclus par stat) ----------
function stageSelectHtml(mon, side, key) {
  const v = mon.stages[key] || 0;
  const opts = [];
  for (let s = 6; s >= -6; s--) opts.push(`<option value="${s}" ${s === v ? "selected" : ""}>${s > 0 ? "+" + s : s}</option>`);
  return `<select class="calc-stage" data-side="${side}" data-stat="${key}">${opts.join("")}</select>`;
}

function statGrid(mon, side, stats) {
  const rows = ["hp", "atk", "def", "spa", "spd", "spe"].map(k => {
    let display = displayStat(mon, k, stats);
    const stageCell = k === "hp" ? `<div></div>` : stageSelectHtml(mon, side, k);
    return `
    <div class="stat-label">${STAT_LABELS[k]}</div>
    <input type="number" min="0" max="31" class="calc-iv" data-side="${side}" data-stat="${k}" value="${mon.ivs[k]}">
    <input type="number" min="0" max="252" step="4" class="calc-ev" data-side="${side}" data-stat="${k}" value="${mon.evs[k]}">
    ${stageCell}
    <div class="stat-computed" id="stat-computed-${side}-${k}">${display}</div>`;
  }).join("");
  return `<div class="calc-stat-grid">
    <div></div><div class="stat-head">IV</div><div class="stat-head">EV</div><div class="stat-head">Mod.</div><div class="stat-head">Val.</div>
    ${rows}
  </div>`;
}

// ---------- PV actuels ----------
function hpField(mon, side, stats) {
  const max = stats ? stats.hp : null;
  const cur = mon.currentHp != null ? mon.currentHp : max;
  const pct = (max && cur != null) ? Math.max(0, Math.min(100, Math.round(100 * cur / max))) : null;
  return `<div class="calc-field">
    <label>PV actuels${max ? ` (max ${max})` : ""}</label>
    <div class="calc-hp-row">
      <input type="number" min="0" max="${max || 9999}" class="calc-currenthp" data-side="${side}"
        value="${max != null ? cur : ""}" placeholder="—" ${max ? "" : "disabled"}>
      <span class="calc-hp-pct" id="hp-pct-${side}">${pct != null ? pct + "%" : "—"}</span>
      <button type="button" class="secondary calc-hp-reset" data-side="${side}">Max</button>
    </div>
  </div>`;
}

function updateHpPct(side) {
  const mon = state[side];
  const stats = getResolvedStats(mon);
  const max = stats ? stats.hp : null;
  const cur = mon.currentHp != null ? mon.currentHp : max;
  const pct = (max && cur != null) ? Math.max(0, Math.min(100, Math.round(100 * cur / max))) : null;
  const el = document.getElementById(`hp-pct-${side}`);
  if (el) el.textContent = pct != null ? pct + "%" : "—";
}

function renderMonForm(mon, side, panelExtras) {
  const el = document.getElementById(`${side === "attacker" ? "attacker" : "defender"}-form`);
  const stats = getResolvedStats(mon);
  const natureOpts = `<option value="">Neutre</option>` + NATURE_NAMES.map(n => `<option value="${n}" ${n === mon.nature ? "selected" : ""}>${n}</option>`).join("");
  el.innerHTML = `
    <div class="calc-field">
      <label>Pokémon</label>
      <div class="calc-search-wrap">
        <input type="text" class="calc-species-input" data-side="${side}" list="calc-species-list" value="${mon.species}" placeholder="Nom du Pokémon...">
      </div>
    </div>
    <div class="row">
      <div class="calc-field">
        <label>Niveau</label>
        <input type="number" min="1" max="100" class="calc-level" data-side="${side}" value="${mon.level}">
      </div>
      <div class="calc-field">
        <label>Nature</label>
        <select class="calc-nature" data-side="${side}">${natureOpts}</select>
      </div>
    </div>
    <div class="row">
      <div class="calc-field">
        <label>Talent</label>
        <div class="calc-ability-row">
          <select class="calc-ability" data-side="${side}">${abilityOptionsForSpecies(mon.species, mon.ability)}</select>
          <label class="calc-ability-toggle" title="Décoche si le talent n'est pas actif dans cette situation (ex : Intimidation déjà appliquée, talent annulé...)">
            <input type="checkbox" class="calc-ability-active" data-side="${side}" ${mon.abilityActive !== false ? "checked" : ""}>
          </label>
        </div>
      </div>
      <div class="calc-field">
        <label>Objet</label>
        <input type="text" class="calc-item" data-side="${side}" list="calc-item-list" value="${mon.item}" placeholder="Aucun">
      </div>
    </div>
    <div class="calc-field">
      <label>Statut</label>
      <select class="calc-status" data-side="${side}">${STATUS_OPTIONS.map(o => `<option value="${o.key}" ${o.key === mon.status ? "selected" : ""}>${o.label}</option>`).join("")}</select>
    </div>
    ${hpField(mon, side, stats)}
    <div class="calc-field">
      <label>IV / EV / Mod. combat / Stat finale</label>
      ${statGrid(mon, side, stats)}
    </div>
    ${panelExtras || ""}
  `;
}

function renderAttackerForm() {
  renderMonForm(state.attacker, "attacker", "");
}

function renderDefenderForm() {
  const extras = `
    <div class="calc-checks">
      <label><input type="checkbox" id="def-notevolved" ${state.defender.notFullyEvolved ? "checked" : ""}> Non évolué (Éviolite)</label>
    </div>`;
  renderMonForm(state.defender, "defender", extras);
}

function typeBadgeC(t) {
  const c = TYPE_COLORS_CALC[t] || "#888";
  return `<span class="type-badge" style="background:${c}">${t}</span>`;
}
const TYPE_COLORS_CALC = {
  Normal:"#A8A77A", Combat:"#C22E28", Vol:"#A98FF3", Poison:"#A33EA1",
  Sol:"#E2BF65", Roche:"#B6A136", Insecte:"#A6B91A", Spectre:"#735797",
  Acier:"#B7B7CE", Feu:"#EE8130", Eau:"#6390F0", Plante:"#7AC74C",
  Electrik:"#F7D02C", Psy:"#F95587", Glace:"#96D9D6", Dragon:"#6F35FC",
  Tenebres:"#705746", Fee:"#D685AD",
};

// ---------- Moveset (4 capacités) ----------
function resolveSlotMove(slot) {
  return { name: findMoveByLooseName(slot.name) || slot.name };
}

function buildComputeOpts(ms, slot) {
  const { atkMon, defMon } = attackerDefenderFor(ms);
  const aSpecies = findSpeciesByLooseName(atkMon.species);
  const dSpecies = findSpeciesByLooseName(defMon.species);
  if (!aSpecies || !dSpecies) return null;
  if (!findMoveByLooseName(slot.name)) return null;
  return {
    attacker: Object.assign({}, atkMon, { species: aSpecies }),
    defender: Object.assign({}, defMon, { species: dSpecies }),
    move: resolveSlotMove(slot),
    field: state.field,
  };
}

function computeForSlot(ms, i) {
  const slot = movesetArr(ms)[i];
  const opts = buildComputeOpts(ms, slot);
  if (!opts) return null;
  return computeDamage(opts);
}

function badgeClassAndText(r) {
  if (!r) return { cls: "dim", text: "—" };
  if (r.error) return { cls: "dim", text: "—" };
  if (r.immune) return { cls: "imm", text: "Immun." };
  const cls = r.maxPct >= 100 ? "ohko" : r.maxPct >= 50 ? "high" : "";
  return { cls, text: `${r.minPct}–${r.maxPct}%` };
}

function slotBadgeHtml(ms, i) {
  const r = computeForSlot(ms, i);
  const { cls, text } = badgeClassAndText(r);
  return `<span class="calc-slot-badge ${cls}" id="slot-badge-${ms}-${i}">${text}</span>`;
}

function updateSlotBadge(ms, i) {
  const el = document.getElementById(`slot-badge-${ms}-${i}`);
  if (el) el.outerHTML = slotBadgeHtml(ms, i);
}

function updateAllSlotBadges() {
  for (let i = 0; i < state.atkMoveset.length; i++) updateSlotBadge("atk", i);
  for (let i = 0; i < state.defMoveset.length; i++) updateSlotBadge("def", i);
}

function slotType(slot) {
  const key = findMoveByLooseName(slot.name);
  return key ? CALC_MOVES[key].type : null;
}

function slotTypeBadgeHtml(ms, i) {
  const slot = movesetArr(ms)[i];
  const t = slotType(slot);
  const inner = t ? typeBadgeC(t) : `<span class="type-badge calc-type-badge-empty">—</span>`;
  return `<span class="calc-move-type" id="slot-type-${ms}-${i}">${inner}</span>`;
}

function updateSlotTypeBadge(ms, i) {
  const el = document.getElementById(`slot-type-${ms}-${i}`);
  if (el) el.outerHTML = slotTypeBadgeHtml(ms, i);
}

// Physique / Spéciale / Statut — déjà présent dans CALC_MOVES (champ .cat,
// vérifié pour les 486 capacités : 224 Physique / 141 Spéciale / 121 Statut),
// simplement pas encore affiché dans le formulaire de moveset.
const CAT_ABBR = { Physique: "Phys.", "Spéciale": "Spé.", Statut: "Statut" };
const CAT_CLASS = { Physique: "phys", "Spéciale": "spe", Statut: "statut" };

function slotCat(slot) {
  const key = findMoveByLooseName(slot.name);
  return key ? CALC_MOVES[key].cat : null;
}

function slotCatBadgeHtml(ms, i) {
  const slot = movesetArr(ms)[i];
  const cat = slotCat(slot);
  const cls = cat ? CAT_CLASS[cat] : "empty";
  const text = cat ? CAT_ABBR[cat] : "—";
  return `<span class="calc-slot-cat calc-slot-cat-${cls}" id="slot-cat-${ms}-${i}" title="Catégorie">${text}</span>`;
}

function updateSlotCatBadge(ms, i) {
  const el = document.getElementById(`slot-cat-${ms}-${i}`);
  if (el) el.outerHTML = slotCatBadgeHtml(ms, i);
}

function slotPower(slot) {
  const key = findMoveByLooseName(slot.name);
  return key ? CALC_MOVES[key].power : null;
}

function slotPowerHtml(ms, i) {
  const slot = movesetArr(ms)[i];
  const p = slotPower(slot);
  return `<span class="calc-slot-power" id="slot-power-${ms}-${i}" title="Puissance de base">${p != null ? p : "—"}</span>`;
}

function updateSlotPower(ms, i) {
  const el = document.getElementById(`slot-power-${ms}-${i}`);
  if (el) el.outerHTML = slotPowerHtml(ms, i);
}

function moveResolveBtnHtml(ms, i, slot) {
  const unresolved = slot.name && !findMoveByLooseName(slot.name);
  return unresolved
    ? `<button type="button" class="secondary calc-move-resolve-btn" data-ms="${ms}" data-idx="${i}" title="'${slot.name}' n'est pas reconnu — cliquer pour associer le nom français">?</button>`
    : "";
}

function updateMoveResolveBtn(ms, i) {
  const rows = document.querySelectorAll(`#${movesetElId(ms)} .calc-move-row`);
  const row = rows[i];
  if (!row) return;
  const slot = movesetArr(ms)[i];
  const existing = row.querySelector(".calc-move-resolve-btn");
  const html = moveResolveBtnHtml(ms, i, slot);
  if (existing) existing.outerHTML = html;
  else if (html) row.insertAdjacentHTML("beforeend", html);
}

function movesetRow(ms, slot, i) {
  const active = i === activeSlotOf(ms) ? " active" : "";
  return `<div class="calc-move-row${active}">
    <label class="calc-move-radio" title="Voir le détail de cette capacité">
      <input type="radio" name="active-slot-${ms}" class="calc-slot-radio" data-ms="${ms}" data-idx="${i}" ${i === activeSlotOf(ms) ? "checked" : ""}>
    </label>
    <div class="calc-move-inputs">
      <input type="text" class="calc-slot-name" data-ms="${ms}" data-idx="${i}" list="calc-move-list" value="${slot.name}" placeholder="Capacité ${i + 1}...">
    </div>
    ${slotTypeBadgeHtml(ms, i)}
    ${slotCatBadgeHtml(ms, i)}
    ${slotPowerHtml(ms, i)}
    ${slotBadgeHtml(ms, i)}
    ${moveResolveBtnHtml(ms, i, slot)}
  </div>`;
}

function renderMovesetForm(ms) {
  const el = document.getElementById(movesetElId(ms));
  const arr = movesetArr(ms);
  el.innerHTML = `<div class="calc-moveset">
      ${arr.map((slot, i) => movesetRow(ms, slot, i)).join("")}
    </div>
    <p class="sub" style="margin:4px 0 0">% = dégâts min–max infligés (% des PV max de l'autre Pokémon). Le rond à gauche choisit la capacité détaillée dans les résultats.</p>`;
}

function renderFieldForm() {
  const el = document.getElementById("field-form");
  const f = state.field;
  el.innerHTML = `
    <div class="calc-field">
      <label>Météo</label>
      <select id="field-weather">
        <option value="none" ${f.weather === "none" ? "selected" : ""}>Aucune</option>
        <option value="pluie" ${f.weather === "pluie" ? "selected" : ""}>Pluie</option>
        <option value="soleil" ${f.weather === "soleil" ? "selected" : ""}>Soleil</option>
        <option value="sable" ${f.weather === "sable" ? "selected" : ""}>Tempête de sable</option>
        <option value="neige" ${f.weather === "neige" ? "selected" : ""}>Neige</option>
      </select>
    </div>
    <div class="calc-field">
      <label>Terrain</label>
      <select id="field-terrain">
        <option value="none" ${f.terrain === "none" ? "selected" : ""}>Aucun</option>
        <option value="electrik" ${f.terrain === "electrik" ? "selected" : ""}>Champ Électrifié</option>
        <option value="herbu" ${f.terrain === "herbu" ? "selected" : ""}>Champ Herbu</option>
        <option value="psy" ${f.terrain === "psy" ? "selected" : ""}>Champ Psychique</option>
        <option value="brumeux" ${f.terrain === "brumeux" ? "selected" : ""}>Champ Brumeux</option>
      </select>
    </div>
    <div class="calc-checks">
      <label><input type="checkbox" id="field-crit" ${f.crit ? "checked" : ""}> Coup critique</label>
      <label><input type="checkbox" id="field-reflect" ${f.reflect ? "checked" : ""}> Protection</label>
      <label><input type="checkbox" id="field-lightscreen" ${f.lightscreen ? "checked" : ""}> Mur Lumière</label>
      <label><input type="checkbox" id="field-auroraveil" ${f.auroraveil ? "checked" : ""}> Voile Aurore</label>
      <label><input type="checkbox" id="field-multi" ${f.multiTarget ? "checked" : ""}> Cible multiple (combat double)</label>
    </div>
  `;
}

// ---------- Résultat détaillé (capacité active, dans chaque sens) ----------
function renderResultBlock(ms) {
  const label = ms === "atk" ? "Attaquant → Défenseur" : "Défenseur → Attaquant";
  const { atkMon, defMon } = attackerDefenderFor(ms);

  if (!findSpeciesByLooseName(atkMon.species) || !findSpeciesByLooseName(defMon.species)) {
    return `<div class="calc-result-block"><div class="calc-result-dir">${label}</div>
      <div class="empty-hint">Renseigne les deux Pokémon.</div></div>`;
  }
  const slot = movesetArr(ms)[activeSlotOf(ms)];
  const opts = buildComputeOpts(ms, slot);
  if (!opts) {
    return `<div class="calc-result-block"><div class="calc-result-dir">${label}</div>
      <div class="empty-hint">Choisis une capacité pour la case sélectionnée.</div></div>`;
  }

  const r = computeDamage(opts);

  if (r.error) {
    return `<div class="calc-result-block"><div class="calc-result-dir">${label}</div>
      <div class="calc-error">${r.error}</div></div>`;
  }
  const activeLabel = slot.name;

  if (r.immune) {
    return `<div class="calc-result-block"><div class="calc-result-dir">${label}</div>
      <div class="calc-result-main"><div class="calc-result-range">Immunité</div>
      <div class="calc-result-pct">${activeLabel} — 0 dégât</div></div>
      ${r.notes.length ? `<div class="calc-notes"><b>Détails :</b><ul>${r.notes.map(n => `<li>${n}</li>`).join("")}</ul></div>` : ""}</div>`;
  }

  let koText;
  if (r.koNowGuaranteed) koText = "K.O. garanti à ce coup.";
  else if (r.koNow) koText = "K.O. possible à ce coup (selon les rolls).";
  else koText = r.hitsToKo === r.hitsToKoMin
    ? `${r.hitsToKo} coup${r.hitsToKo > 1 ? "s" : ""} pour K.O. (garanti, PV actuels)`
    : `${r.hitsToKoMin}–${r.hitsToKo} coups pour K.O. selon les rolls (PV actuels)`;

  const showCurrent = r.defCurrentHp !== r.defHp;

  return `<div class="calc-result-block">
    <div class="calc-result-dir">${label}</div>
    <div class="calc-result-main">
      <div class="calc-result-pct" style="margin-bottom:2px">${activeLabel}</div>
      <div class="calc-result-range">${r.min} – ${r.max} PV</div>
      <div class="calc-result-pct">${r.minPct}% – ${r.maxPct}% des PV max (${r.defHp} PV)</div>
      ${showCurrent ? `<div class="calc-result-pct">${r.minPctCurrent}% – ${r.maxPctCurrent}% des PV actuels (${r.defCurrentHp} PV)</div>` : ""}
      <div class="calc-result-ko">${koText}</div>
    </div>
    <div class="calc-rolls">${r.rolls.map(v => `<span>${v}</span>`).join("")}</div>
    ${r.notes.length ? `<div class="calc-notes"><b>Détails du calcul :</b><ul>${r.notes.map(n => `<li>${n}</li>`).join("")}</ul></div>` : ""}
  </div>`;
}

function renderResult() {
  renderMyBoxGrid();
  const resEl = document.getElementById("calc-result");
  if (!findSpeciesByLooseName(state.attacker.species) || !findSpeciesByLooseName(state.defender.species)) {
    resEl.innerHTML = `<div class="empty-hint">Renseigne un attaquant, un défenseur et un moveset des deux côtés.</div>`;
    return;
  }
  resEl.innerHTML = renderResultBlock("atk") + renderResultBlock("def");
}

function renderAll() {
  renderAttackerForm();
  renderDefenderForm();
  renderMovesetForm("atk");
  renderMovesetForm("def");
  renderFieldForm();
  renderResult();
}

// ---------- Événements ----------
document.addEventListener("input", (e) => {
  const t = e.target;

  if (t.classList.contains("calc-species-input")) {
    const side = t.dataset.side;
    state[side].species = t.value;
    const resolved = findSpeciesByLooseName(t.value);
    if (resolved && !CALC_SPECIES[resolved].abilities.includes(abilityIdByFrName(state[side].ability))) {
      state[side].ability = "";
    }
    if (side === "attacker") renderAttackerForm(); else renderDefenderForm();
    updateAllSlotBadges();
    renderResult();
    return;
  }
  if (t.classList.contains("calc-level")) {
    state[t.dataset.side].level = Math.max(1, Math.min(100, parseInt(t.value, 10) || 1));
    updateHpPct(t.dataset.side);
    updateAllSlotBadges();
    renderResult();
    return;
  }
  if (t.classList.contains("calc-item")) {
    state[t.dataset.side].item = t.value;
    updateAllSlotBadges();
    renderResult();
    return;
  }
  if (t.classList.contains("calc-currenthp")) {
    const side = t.dataset.side;
    state[side].currentHp = t.value === "" ? null : Math.max(0, parseInt(t.value, 10) || 0);
    updateHpPct(side);
    updateAllSlotBadges();
    renderResult();
    return;
  }
  if (t.classList.contains("calc-iv") || t.classList.contains("calc-ev")) {
    const side = t.dataset.side, stat = t.dataset.stat;
    const max = t.classList.contains("calc-iv") ? 31 : 252;
    const v = Math.max(0, Math.min(max, parseInt(t.value, 10) || 0));
    state[side][t.classList.contains("calc-iv") ? "ivs" : "evs"][stat] = v;
    const mon = state[side];
    const stats = getResolvedStats(mon);
    if (stats) {
      const cell = document.getElementById(`stat-computed-${side}-${stat}`);
      if (cell) cell.textContent = displayStat(mon, stat, stats);
      if (stat === "hp") updateHpPct(side);
    }
    updateAllSlotBadges();
    renderResult();
    return;
  }
  if (t.classList.contains("calc-slot-name")) {
    const ms = t.dataset.ms, i = parseInt(t.dataset.idx, 10);
    // Normalise vers le nom FR canonique dès que possible (accents/casse,
    // ou override déjà connu), pour que le champ affiche le même format
    // que le moveset de l'adversaire.
    const resolved = findMoveByLooseName(t.value);
    movesetArr(ms)[i].name = resolved || t.value;
    if (resolved && resolved !== t.value) t.value = resolved;
    updateSlotBadge(ms, i);
    updateSlotTypeBadge(ms, i);
    updateSlotCatBadge(ms, i);
    updateSlotPower(ms, i);
    updateMoveResolveBtn(ms, i);
    if (i === activeSlotOf(ms)) renderResult();
    return;
  }
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".calc-move-resolve-btn");
  if (!btn) return;
  const ms = btn.dataset.ms, i = parseInt(btn.dataset.idx, 10);
  const raw = movesetArr(ms)[i].name;
  const typed = (prompt(`"${raw}" n'est pas reconnu comme capacité. Nom français correspondant ?`) || "").trim();
  if (!typed) return;
  const resolved = CALC_MOVES[typed] ? typed : MOVE_NAMES.find(n => normC(n) === normC(typed)) || null;
  if (!resolved) { alert(`"${typed}" n'est pas un nom de capacité reconnu dans la base du calculateur.`); return; }
  saveMoveOverride(raw, resolved);
  movesetArr(ms)[i].name = resolved;
  const rows = document.querySelectorAll(`#${movesetElId(ms)} .calc-move-row`);
  const input = rows[i] && rows[i].querySelector(".calc-slot-name");
  if (input) input.value = resolved;
  updateSlotTypeBadge(ms, i);
  updateSlotPower(ms, i);
  updateSlotBadge(ms, i);
  updateMoveResolveBtn(ms, i);
  if (i === activeSlotOf(ms)) renderResult();
});

function refreshStatCells(side) {
  const stats = getResolvedStats(state[side]);
  for (const k of Object.keys(STAT_LABELS)) {
    const cell = document.getElementById(`stat-computed-${side}-${k}`);
    if (cell) cell.textContent = displayStat(state[side], k, stats);
  }
}

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.classList.contains("calc-nature")) {
    state[t.dataset.side].nature = t.value;
    refreshStatCells(t.dataset.side);
    updateHpPct(t.dataset.side);
    updateAllSlotBadges();
    renderResult();
    return;
  }
  if (t.classList.contains("calc-ability")) { state[t.dataset.side].ability = t.value; state[t.dataset.side].abilityActive = true; refreshStatCells(t.dataset.side); updateAllSlotBadges(); renderResult(); return; }
  if (t.classList.contains("calc-ability-active")) { state[t.dataset.side].abilityActive = t.checked; refreshStatCells(t.dataset.side); updateAllSlotBadges(); renderResult(); return; }
  if (t.classList.contains("calc-stage")) {
    const side = t.dataset.side, stat = t.dataset.stat;
    state[side].stages[stat] = parseInt(t.value, 10) || 0;
    refreshStatCells(side);
    updateAllSlotBadges();
    renderResult();
    return;
  }
  if (t.classList.contains("calc-status")) {
    state[t.dataset.side].status = t.value;
    refreshStatCells(t.dataset.side);
    updateAllSlotBadges();
    renderResult();
    return;
  }
  if (t.id === "def-notevolved") { state.defender.notFullyEvolved = t.checked; updateAllSlotBadges(); renderResult(); return; }

  if (t.classList.contains("calc-slot-radio")) {
    const ms = t.dataset.ms;
    setActiveSlot(ms, parseInt(t.dataset.idx, 10));
    document.getElementById(movesetElId(ms)).querySelectorAll(".calc-move-row").forEach((row, i) => row.classList.toggle("active", i === activeSlotOf(ms)));
    renderResult();
    return;
  }

  if (t.id === "field-weather") { state.field.weather = t.value; updateAllSlotBadges(); renderResult(); return; }
  if (t.id === "field-terrain") { state.field.terrain = t.value; updateAllSlotBadges(); renderResult(); return; }
  if (t.id === "field-crit") { state.field.crit = t.checked; updateAllSlotBadges(); renderResult(); return; }
  if (t.id === "field-reflect") { state.field.reflect = t.checked; updateAllSlotBadges(); renderResult(); return; }
  if (t.id === "field-lightscreen") { state.field.lightscreen = t.checked; updateAllSlotBadges(); renderResult(); return; }
  if (t.id === "field-auroraveil") { state.field.auroraveil = t.checked; updateAllSlotBadges(); renderResult(); return; }
  if (t.id === "field-multi") { state.field.multiTarget = t.checked; updateAllSlotBadges(); renderResult(); return; }
});

document.addEventListener("click", (e) => {
  const resetBtn = e.target.closest(".calc-hp-reset");
  if (resetBtn) {
    const side = resetBtn.dataset.side;
    state[side].currentHp = null;
    if (side === "attacker") renderAttackerForm(); else renderDefenderForm();
    updateAllSlotBadges();
    renderResult();
  }
});

// ---------- Choisir l'attaquant depuis mon équipe (roster) ----------
const ROSTER_KEY = "rnb_roster_v1";
const ROSTER_FULL_KEY = "rnb_roster_full_v1";

function loadRosterList() {
  const saved = localStorage.getItem(ROSTER_KEY);
  if (!saved) return [];
  return saved.split("\n").map(s => s.trim()).filter(Boolean);
}

function loadRosterFull() {
  try {
    const arr = JSON.parse(localStorage.getItem(ROSTER_FULL_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function findRosterFullMon(name) {
  const full = loadRosterFull();
  return full.find(m => m.species === name) || full.find(m => normC(m.species) === normC(name)) || null;
}

function populateTeamPick() {
  const sel = document.getElementById("team-pick-select");
  const roster = loadRosterList();
  if (!roster.length) {
    sel.innerHTML = `<option value="">Roster vide (renseigne-le dans Prépa Combat)</option>`;
    return;
  }
  sel.innerHTML = `<option value="">— sélectionner —</option>` +
    roster.map(n => `<option value="${n}" ${n === state.attacker.species ? "selected" : ""}>${n}</option>`).join("");
}

// ---------- Résolution des noms non reconnus (ex: import anglais) ----------
let pendingResolveName = null;

function showSpeciesResolver(rawName) {
  pendingResolveName = rawName;
  const el = document.getElementById("calc-species-resolver");
  if (!el) return;
  const hint = isKnownEnglishName(rawName) ? " (nom anglais détecté)" : "";
  el.innerHTML = `<div class="calc-field calc-resolver-box">
    <label>"${rawName}" n'est pas reconnu${hint}. Indique le nom français correspondant :</label>
    <div class="row" style="gap:6px">
      <input type="text" id="calc-resolver-input" list="calc-species-list" placeholder="Nom français...">
      <button type="button" id="calc-resolver-confirm" class="secondary">Associer</button>
    </div>
  </div>`;
}

function hideSpeciesResolver() {
  pendingResolveName = null;
  const el = document.getElementById("calc-species-resolver");
  if (el) el.innerHTML = "";
}

function applyAttackerSpecies(name) {
  const full = findRosterFullMon(name);
  state.attacker.species = name;
  state.attacker.currentHp = null;
  state.attacker.ability = "";

  if (full) {
    state.attacker.level = full.level || 100;
    const natKey = full.nature ? findNatureKeyLoose(full.nature) : null;
    state.attacker.nature = natKey || "";
    const itemKey = full.item ? findLooseKey(ITEM_NAMES, full.item) : null;
    state.attacker.item = itemKey || full.item || "";
    state.attacker.evs = Object.assign({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, full.evs);
    state.attacker.ivs = Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, full.ivs);
  }

  const resolved = findSpeciesByLooseName(name);
  if (resolved) {
    hideSpeciesResolver();
    if (full && full.ability) {
      const abKey = findAbilityKeyLoose(full.ability);
      if (abKey && CALC_SPECIES[resolved].abilities.includes(abilityIdByFrName(abKey))) {
        state.attacker.ability = abKey;
      }
    }
    if (state.attacker.ability && !CALC_SPECIES[resolved].abilities.includes(abilityIdByFrName(state.attacker.ability))) {
      state.attacker.ability = "";
    }
  } else {
    showSpeciesResolver(name);
  }

  if (full && full.moves && full.moves.length) {
    state.atkMoveset = movesFromNames(full.moves);
    state.atkActiveSlot = 0;
  }

  renderAttackerForm();
  renderMyTeamPills();
  renderMovesetForm("atk");
  updateAllSlotBadges();
  renderResult();
}

document.getElementById("team-pick-select").addEventListener("change", (e) => {
  const name = e.target.value;
  if (!name) return;
  applyAttackerSpecies(name);
});

document.addEventListener("click", (e) => {
  if (e.target.id !== "calc-resolver-confirm" || !pendingResolveName) return;
  const input = document.getElementById("calc-resolver-input");
  const typed = input ? input.value.trim() : "";
  const resolved = typed && (CALC_SPECIES[typed] ? typed : SPECIES_NAMES.find(n => normC(n) === normC(typed)) || null);
  if (!resolved) {
    alert(`"${typed}" n'est pas un nom reconnu dans la base du calculateur.`);
    return;
  }
  saveEnFrOverride(pendingResolveName, resolved);
  const raw = pendingResolveName;
  applyAttackerSpecies(raw);
});

// ---------- Liaison avec Prépa Combat (index.html) ----------
const TRAINER_LINK_KEY = "rnb_selected_trainer_idx";
const TEAM_LINK_KEY = "rnb_selected_team_v1";
const myTeamEl = document.getElementById("calc-my-team");

function loadSelectedTeamLink() {
  try {
    const arr = JSON.parse(localStorage.getItem(TEAM_LINK_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function renderMyTeamPills() {
  const team = loadSelectedTeamLink();
  if (!team.length) { myTeamEl.innerHTML = ""; return; }
  myTeamEl.innerHTML = `<p class="sub" style="margin:0 0 6px">Ton équipe pour ce combat (Prépa Combat) — clique pour charger comme attaquant :</p>` +
    team.map(name => {
      const known = findSpeciesByLooseName(name);
      const cls = "calc-trainer-pill" + (findSpeciesByLooseName(state.attacker.species) === known && known ? " active" : "");
      const spriteUrl = known ? getSpeciesSpriteUrl(known) : null;
      const title = known ? name : "Espèce non reconnue dans la base du calculateur";
      const content = spriteUrl
        ? `<img class="calc-pill-sprite" src="${spriteUrl}" alt="${name}" loading="lazy">`
        : `${name}${known ? "" : " ⚠"}`;
      return `<div class="${cls}" data-name="${name}" title="${title}">${content}</div>`;
    }).join("");
}

myTeamEl.addEventListener("click", (e) => {
  const pill = e.target.closest(".calc-trainer-pill");
  if (!pill) return;
  applyAttackerSpecies(pill.dataset.name);
});

// ---------- Box complète (tout le roster) avec code couleur vitesse/OHKO ----------
const myBoxEl = document.getElementById("calc-my-box");

// Construit un Pokémon "candidat" à partir d'un nom du roster : reprend le
// set complet (niveau/nature/EV/IV/talent/objet/moves) si connu via l'import
// Lua (ROSTER_FULL_KEY), sinon des valeurs par défaut neutres (comme pour un
// nouvel attaquant choisi manuellement, cf. applyAttackerSpecies).
function buildRosterCandidateMon(name) {
  const resolved = findSpeciesByLooseName(name);
  if (!resolved) return { resolved: null, mon: null, moves: [] };
  const mon = blankMon({ species: resolved });
  const full = findRosterFullMon(name);
  if (full) {
    mon.level = full.level || 100;
    const natKey = full.nature ? findNatureKeyLoose(full.nature) : null;
    mon.nature = natKey || "";
    const itemKey = full.item ? findLooseKey(ITEM_NAMES, full.item) : null;
    mon.item = itemKey || full.item || "";
    mon.evs = Object.assign({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, full.evs);
    mon.ivs = Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, full.ivs);
    if (full.ability) {
      const abKey = findAbilityKeyLoose(full.ability);
      if (abKey && CALC_SPECIES[resolved].abilities.includes(abilityIdByFrName(abKey))) mon.ability = abKey;
    }
  }
  const moves = (full && full.moves && full.moves.length) ? full.moves : [];
  return { resolved, mon, moves };
}

// Meilleure capacité (parmi celles fournies) d'un attaquant contre un
// défenseur donné, au sens "dégâts max les plus élevés". Renvoie null si
// aucune capacité connue/utilisable n'est fournie (pas de données).
function bestMoveVs(atkMon, moveNames, defMon) {
  let best = null, any = false;
  for (const raw of moveNames) {
    const resolved = findMoveByLooseName(raw);
    if (!resolved) continue;
    const r = computeDamage({ attacker: atkMon, defender: defMon, move: { name: resolved }, field: state.field });
    if (r.error) continue;
    any = true;
    if (!best || r.maxPct > best.maxPct || (r.maxPct === best.maxPct && r.minPct > best.minPct)) best = r;
  }
  return any ? best : null;
}

// "always" = K.O. garanti dès ce coup, "maybe" = possible selon les rolls,
// "no" = jamais en un coup, null = pas assez de données (moveset inconnu).
function classifyOhko(best) {
  if (!best) return null;
  if (best.minPct >= 100) return "always";
  if (best.maxPct >= 100) return "maybe";
  return "no";
}

// aggressive=true : c'est le Pokémon de la box qui OHKO.
// aggressive=false : c'est le Pokémon de la box qui se fait OHKO.
// Couleurs reprises exactement de la légende fournie (Teambuilder Showdown).
function ohkoColorFor(status, aggressive) {
  if (status === "always") return aggressive ? "#1ED508" : "#DC0D0C";
  if (status === "maybe") return aggressive ? "#D9FF08" : "#FF7F17";
  return null;
}

// Cas où ni l'un ni l'autre ne OHKO : on regarde la "tankiness" (inspiré de
// la légende de couleurs du Teambuilder Pokémon Showdown) :
// - "hardCounter" : le Pokémon de la box encaisse large (4HKO minimum même au
//   pire tirage du défenseur) ET menace sérieusement en retour (2HKO au pire
//   tirage). C'est un vrai counter, pas juste un mur passif.
// - "wall" : encaisse large mais ne menace pas beaucoup en retour.
// Nécessite un moveset connu des deux côtés, sinon pas de couleur (comme pour
// classifyOhko).
function classifyStalemate(atkBest, defBest) {
  if (!defBest) return null;
  const tanky = defBest.maxPct <= 25; // survit à au moins 4 coups, même au pire tirage
  if (!tanky) return null;
  const threatens = !!atkBest && atkBest.maxPct >= 50; // menace un 2HKO au pire tirage
  return threatens ? "hardCounter" : "wall";
}

// Couleurs reprises exactement de la légende fournie (Teambuilder Showdown).
function stalemateColor(kind) {
  if (kind === "hardCounter") return "#1295ED";
  if (kind === "wall") return "#0E0BF1";
  return null;
}

function tileBackground(atkStatus, defStatus, stalemateKind) {
  const c1 = ohkoColorFor(atkStatus, true);
  const c2 = ohkoColorFor(defStatus, false);
  if (c1 && c2) return `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`;
  if (c1) return c1;
  if (c2) return c2;
  const sc = stalemateColor(stalemateKind);
  if (sc) return sc;
  return null;
}

function speedBorderColor(atkSpe, defSpe) {
  if (atkSpe == null || defSpe == null) return null;
  // Couleurs reprises exactement de la légende fournie (Teambuilder Showdown).
  if (atkSpe > defSpe) return "#7EE4FF"; // outspeed
  if (atkSpe === defSpe) return "#894197"; // égalité
  return null; // plus lent : pas de bordure particulière
}

function renderMyBoxGrid() {
  if (!myBoxEl) return;
  const roster = loadRosterList();
  if (!roster.length) { myBoxEl.innerHTML = ""; return; }

  const defResolved = findSpeciesByLooseName(state.defender.species);
  const defMonForCalc = defResolved ? Object.assign({}, state.defender, { species: defResolved }) : null;
  const defStats = defMonForCalc ? computeStats(defMonForCalc) : null;
  const defSpe = defStats ? displayStat(state.defender, "spe", defStats) : null;
  const defMoveNames = defMonForCalc ? movesetArr("def").map(s => s.name).filter(Boolean) : [];

  myBoxEl.innerHTML = roster.map(name => {
    const { resolved, mon, moves } = buildRosterCandidateMon(name);
    const spriteUrl = resolved ? getSpeciesSpriteUrl(resolved) : null;
    const active = resolved && resolved === findSpeciesByLooseName(state.attacker.species) ? " active" : "";
    let borderColor = null, bg = null;
    const titleParts = [name];

    if (resolved && defMonForCalc) {
      const atkStats = computeStats(mon);
      borderColor = speedBorderColor(atkStats ? atkStats.spe : null, defSpe);

      const atkBest = moves.length ? bestMoveVs(mon, moves, defMonForCalc) : null;
      const defBest = defMoveNames.length ? bestMoveVs(defMonForCalc, defMoveNames, mon) : null;
      const atkStatus = classifyOhko(atkBest);
      const defStatus = classifyOhko(defBest);
      const stalemateKind = (atkStatus === "no" && defStatus === "no") ? classifyStalemate(atkBest, defBest) : null;
      bg = tileBackground(atkStatus, defStatus, stalemateKind);

      if (atkStatus === "always") titleParts.push("OHKO garanti sur le défenseur");
      else if (atkStatus === "maybe") titleParts.push("OHKO possible sur le défenseur");
      if (defStatus === "always") titleParts.push("Se fait OHKO garanti");
      else if (defStatus === "maybe") titleParts.push("Se fait OHKO possible");
      if (stalemateKind === "hardCounter") titleParts.push("Counter solide (encaisse large, menace sérieusement en retour)");
      else if (stalemateKind === "wall") titleParts.push("Mur (encaisse large, ne menace pas beaucoup en retour)");
      if (!moves.length) titleParts.push("Moveset inconnu (import Lua requis pour la couleur OHKO)");
    } else if (!resolved) {
      titleParts.push("non reconnu dans la base du calculateur");
    } else if (!defMonForCalc) {
      titleParts.push("choisis un défenseur pour voir le code couleur");
    }

    const style = `${borderColor ? `border-color:${borderColor};` : ""}${bg ? `background:${bg};` : ""}`;
    const content = spriteUrl
      ? `<img class="calc-box-sprite" src="${spriteUrl}" alt="${name}" loading="lazy">`
      : `<span class="calc-box-nosprite">?</span>`;
    return `<div class="calc-box-tile${active}" data-name="${name}" title="${titleParts.join(" — ")}" style="${style}">${content}</div>`;
  }).join("");
}

myBoxEl.addEventListener("click", (e) => {
  const tile = e.target.closest(".calc-box-tile");
  if (!tile) return;
  applyAttackerSpecies(tile.dataset.name);
});

// ---------- Choisir le défenseur depuis un dresseur adverse ----------
let selectedTrainer = null;
let selectedTrainerMonIdx = null;

const trainerSearchInput = document.getElementById("calc-trainer-search");
const trainerResultsEl = document.getElementById("calc-trainer-results");
const trainerTeamEl = document.getElementById("calc-trainer-team");

function renderTrainerSearchResults(query) {
  const q = normC(query);
  if (!q) { trainerResultsEl.classList.remove("open"); trainerResultsEl.innerHTML = ""; return; }
  const matches = TRAINERS.filter(t => normC(t.name).includes(q) || normC(t.location || "").includes(q)).slice(0, 40);
  trainerResultsEl.innerHTML = matches.length
    ? matches.map(t => {
        const idx = TRAINERS.indexOf(t);
        return `<div class="search-item" data-idx="${idx}">
          <div>${t.name}</div>
          <div class="chap">${t.chapter}${t.location ? " · " + t.location : ""} · ${t.pokemon.length} Pokémon</div>
        </div>`;
      }).join("")
    : `<div class="search-item">Aucun résultat</div>`;
  trainerResultsEl.classList.add("open");
}

function renderTrainerTeam() {
  if (!selectedTrainer) { trainerTeamEl.innerHTML = ""; return; }
  trainerTeamEl.innerHTML = `<p class="sub" style="margin:0 0 6px">${selectedTrainer.name} — clique un Pokémon pour le charger comme défenseur :</p>` +
    selectedTrainer.pokemon.map((m, i) => {
      const cls = "calc-trainer-pill" + (i === selectedTrainerMonIdx ? " active" : "");
      const known = findSpeciesByLooseName(m.species);
      const spriteUrl = known ? getSpeciesSpriteUrl(known) : null;
      const title = `${m.species} — Nv.${m.level ?? "?"}${known ? "" : " (non reconnu dans la base du calculateur)"}`;
      const content = spriteUrl
        ? `<img class="calc-pill-sprite" src="${spriteUrl}" alt="${m.species}" loading="lazy">`
        : `${m.species}${known ? "" : " ⚠"}`;
      return `<div class="${cls}" data-mon-idx="${i}" title="${title}">${content}<span class="lvl">Nv.${m.level ?? "?"}</span></div>`;
    }).join("");
}

function applyTrainerMonToDefender(mon) {
  const resolvedSpecies = findSpeciesByLooseName(mon.species);
  if (!resolvedSpecies) return;
  state.defender.species = resolvedSpecies;
  state.defender.currentHp = null;
  if (mon.level) state.defender.level = mon.level;
  const natKey = mon.nature ? findNatureKeyLoose(mon.nature) : null;
  state.defender.nature = natKey || "";
  const itemKey = mon.item ? findLooseKey(ITEM_NAMES, mon.item) : null;
  state.defender.item = itemKey || "";
  state.defender.ability = "";
  if (mon.ability) {
    const abKey = findAbilityKeyLoose(mon.ability);
    if (abKey) state.defender.ability = abKey;
  }
  state.defMoveset = movesFromNames(mon.moves);
  state.defActiveSlot = 0;
  renderDefenderForm();
  renderMovesetForm("def");
  updateAllSlotBadges();
  renderResult();
}

trainerSearchInput.addEventListener("input", e => renderTrainerSearchResults(e.target.value));
trainerSearchInput.addEventListener("focus", e => { if (e.target.value) renderTrainerSearchResults(e.target.value); });
document.addEventListener("click", (e) => {
  if (!trainerResultsEl.contains(e.target) && e.target !== trainerSearchInput) {
    trainerResultsEl.classList.remove("open");
  }
});
function selectTrainerByIdx(idx, fromSync) {
  selectedTrainer = TRAINERS[idx];
  selectedTrainerIdx = idx;
  selectedTrainerMonIdx = null;
  renderTrainerTeam();
  renderTrainerNav();
  if (!fromSync) {
    // Propage le changement de combat à la page Prépa Combat (index.html) et
    // réinitialise l'équipe choisie pour ce combat (nouvelle sélection requise).
    localStorage.setItem(TRAINER_LINK_KEY, String(idx));
    localStorage.setItem(TEAM_LINK_KEY, JSON.stringify([]));
    renderMyTeamPills();
  }
}

trainerResultsEl.addEventListener("click", (e) => {
  const item = e.target.closest(".search-item");
  if (!item || item.dataset.idx === undefined) return;
  selectTrainerByIdx(parseInt(item.dataset.idx, 10));
  trainerResultsEl.classList.remove("open");
  trainerSearchInput.value = "";
});

// ---------- Navigation combat précédent/suivant (ordre du fichier Dresseurs.xlsx) ----------
let selectedTrainerIdx = null;
const calcTrainerNavEl = document.getElementById("calc-trainer-nav");
const calcTrainerHomeBtn = document.getElementById("calc-trainer-home");
const calcTrainerPrevBtn = document.getElementById("calc-trainer-prev");
const calcTrainerNextBtn = document.getElementById("calc-trainer-next");

function renderTrainerNav() {
  if (selectedTrainerIdx === null) { calcTrainerNavEl.style.display = "none"; return; }
  calcTrainerNavEl.style.display = "flex";
  calcTrainerPrevBtn.disabled = selectedTrainerIdx <= 0;
  calcTrainerNextBtn.disabled = selectedTrainerIdx >= TRAINERS.length - 1;
}

calcTrainerHomeBtn.addEventListener("click", () => selectTrainerByIdx(0));
calcTrainerPrevBtn.addEventListener("click", () => {
  if (selectedTrainerIdx > 0) selectTrainerByIdx(selectedTrainerIdx - 1);
});
calcTrainerNextBtn.addEventListener("click", () => {
  if (selectedTrainerIdx < TRAINERS.length - 1) selectTrainerByIdx(selectedTrainerIdx + 1);
});
trainerTeamEl.addEventListener("click", (e) => {
  const pill = e.target.closest(".calc-trainer-pill");
  if (!pill) return;
  const idx = parseInt(pill.dataset.monIdx, 10);
  const mon = selectedTrainer.pokemon[idx];
  if (!findSpeciesByLooseName(mon.species)) return;
  selectedTrainerMonIdx = idx;
  renderTrainerTeam();
  applyTrainerMonToDefender(mon);
});

function loadTrainerLink() {
  const raw = localStorage.getItem(TRAINER_LINK_KEY);
  const parsed = raw !== null ? parseInt(raw, 10) : NaN;
  const idx = (!Number.isNaN(parsed) && TRAINERS[parsed]) ? parsed : 0; // premier combat par défaut
  selectedTrainer = TRAINERS[idx];
  selectedTrainerIdx = idx;
  selectedTrainerMonIdx = null;
  renderTrainerTeam();
  renderTrainerNav();
}

// Synchro live si les deux pages sont ouvertes dans des onglets différents
window.addEventListener("storage", (e) => {
  if (e.key === TRAINER_LINK_KEY) loadTrainerLink();
  if (e.key === TEAM_LINK_KEY) renderMyTeamPills();
  if (e.key === ROSTER_KEY) { populateTeamPick(); renderMyBoxGrid(); }
});

populateTeamPick();
loadTrainerLink();
renderMyTeamPills();
renderAll();
