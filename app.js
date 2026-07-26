const TYPE_COLORS = {
  Normal:"#A8A77A", Combat:"#C22E28", Vol:"#A98FF3", Poison:"#A33EA1",
  Sol:"#E2BF65", Roche:"#B6A136", Insecte:"#A6B91A", Spectre:"#735797",
  Acier:"#B7B7CE", Feu:"#EE8130", Eau:"#6390F0", Plante:"#7AC74C",
  Electrik:"#F7D02C", Psy:"#F95587", Glace:"#96D9D6", Dragon:"#6F35FC",
  Tenebres:"#705746", Fee:"#D685AD",
};

function norm(s) {
  return (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function typeBadge(t) {
  const c = TYPE_COLORS[t] || "#888";
  return `<span class="type-badge" style="background:${c}">${t}</span>`;
}

function getTypes(species) {
  if (!species) return null;
  if (TYPES_MAP[species]) return TYPES_MAP[species];
  if (TYPES_MAP_EN[species]) return TYPES_MAP_EN[species];
  const target = norm(species);
  const frMatch = Object.keys(TYPES_MAP).find(n => norm(n) === target);
  if (frMatch) return TYPES_MAP[frMatch];
  const enMatch = Object.keys(TYPES_MAP_EN).find(n => norm(n) === target);
  if (enMatch) return TYPES_MAP_EN[enMatch];
  return null;
}

// ---------- Recherche de combat ----------
const searchInput = document.getElementById("trainer-search");
const searchResults = document.getElementById("search-results");
const trainerView = document.getElementById("trainer-view");

function renderSearchResults(query) {
  const q = norm(query);
  if (!q) { searchResults.classList.remove("open"); searchResults.innerHTML = ""; return; }
  const matches = TRAINERS.filter(t => norm(t.name).includes(q) || norm(t.location || "").includes(q))
    .slice(0, 40);
  if (!matches.length) {
    searchResults.innerHTML = `<div class="search-item">Aucun résultat</div>`;
  } else {
    searchResults.innerHTML = matches.map((t, i) => {
      const idx = TRAINERS.indexOf(t);
      return `<div class="search-item" data-idx="${idx}">
        <div>${t.name}</div>
        <div class="chap">${t.chapter}${t.location ? " · " + t.location : ""} · ${t.pokemon.length} Pokémon</div>
      </div>`;
    }).join("");
  }
  searchResults.classList.add("open");
}

searchInput.addEventListener("input", e => renderSearchResults(e.target.value));
searchInput.addEventListener("focus", e => { if (e.target.value) renderSearchResults(e.target.value); });
document.addEventListener("click", e => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.classList.remove("open");
  }
});
searchResults.addEventListener("click", e => {
  const item = e.target.closest(".search-item");
  if (!item || item.dataset.idx === undefined) return;
  selectTrainer(parseInt(item.dataset.idx, 10));
  searchResults.classList.remove("open");
  searchInput.value = "";
});

let currentTrainer = null;
let selectedTeam = new Set();
let chain = []; // suite ordonnée de tours : { oppIdx, teammate }
let activeChainIndex = null; // index du tour actuellement affiché en détail

// ---------- Liaison avec le calculateur (calc.html) ----------
const TRAINER_LINK_KEY = "rnb_selected_trainer_idx";
const TEAM_LINK_KEY = "rnb_selected_team_v1";

function saveTeamLink() {
  localStorage.setItem(TEAM_LINK_KEY, JSON.stringify([...selectedTeam]));
}

function loadTeamFromLink() {
  try {
    const arr = JSON.parse(localStorage.getItem(TEAM_LINK_KEY) || "[]");
    selectedTeam = new Set(arr);
  } catch {
    selectedTeam = new Set();
  }
}

// Restaure le combat et l'équipe déjà choisis (ex: retour depuis calc.html) sans rien réinitialiser.
function initTrainerFromLink() {
  const raw = localStorage.getItem(TRAINER_LINK_KEY);
  const parsed = raw !== null ? parseInt(raw, 10) : NaN;
  const idx = (!Number.isNaN(parsed) && TRAINERS[parsed]) ? parsed : 0;
  currentTrainer = TRAINERS[idx];
  currentTrainerIdx = idx;
  loadTeamFromLink();
  chain = [];
  activeChainIndex = null;
  renderTrainer(currentTrainer);
  renderTeamSelect();
  renderFaceoff();
  renderTrainerNav();
}

function selectTrainer(idx, fromSync) {
  currentTrainer = TRAINERS[idx];
  currentTrainerIdx = idx;
  selectedTeam = new Set();
  chain = [];
  activeChainIndex = null;
  if (!fromSync) {
    // Propage le changement de combat au calculateur (calc.html) et
    // réinitialise l'équipe choisie pour ce combat (nouvelle sélection requise).
    localStorage.setItem(TRAINER_LINK_KEY, String(idx));
  }
  saveTeamLink();
  renderTrainer(currentTrainer);
  renderTeamSelect();
  renderFaceoff();
  renderTrainerNav();
}

// Synchro live si calc.html (défenseur) change de combat dans un autre onglet
window.addEventListener("storage", (e) => {
  if (e.key === TRAINER_LINK_KEY) {
    const idx = parseInt(e.newValue, 10);
    if (!Number.isNaN(idx) && TRAINERS[idx]) selectTrainer(idx, true);
  }
});

// ---------- Navigation combat précédent/suivant (ordre du fichier Dresseurs.xlsx) ----------
let currentTrainerIdx = null;
const trainerNavEl = document.getElementById("trainer-nav");
const trainerHomeBtn = document.getElementById("trainer-home");
const trainerPrevBtn = document.getElementById("trainer-prev");
const trainerNextBtn = document.getElementById("trainer-next");

function renderTrainerNav() {
  if (currentTrainerIdx === null) { trainerNavEl.style.display = "none"; return; }
  trainerNavEl.style.display = "flex";
  trainerPrevBtn.disabled = currentTrainerIdx <= 0;
  trainerNextBtn.disabled = currentTrainerIdx >= TRAINERS.length - 1;
}

trainerHomeBtn.addEventListener("click", () => selectTrainer(0));
trainerPrevBtn.addEventListener("click", () => {
  if (currentTrainerIdx > 0) selectTrainer(currentTrainerIdx - 1);
});
trainerNextBtn.addEventListener("click", () => {
  if (currentTrainerIdx < TRAINERS.length - 1) selectTrainer(currentTrainerIdx + 1);
});

function renderTrainer(t) {
  const monsWithTypes = t.pokemon.map(p => ({ ...p, types: getTypes(p.species) }));

  // combats doubles : dresseurs séparés (ex: "X & Y [Double]") + owner par mon
  const isDouble = / & .*\[Double\]/.test(t.name) && monsWithTypes.every(m => m.owner !== undefined);
  const subNames = isDouble ? t.name.replace(" [Double]", "").split(" & ") : null;

  function monCard(m) {
    const typesHtml = m.types ? m.types.map(typeBadge).join("") : `<span class="type-badge" style="background:#555">?</span>`;
    const ownerClass = isDouble ? ` owner-${m.owner}` : "";
    const resolvedSpecies = findSpeciesByLooseName(m.species);
    const spriteUrl = resolvedSpecies ? getSpeciesSpriteUrl(resolvedSpecies) : null;
    return `<div class="mon-card${ownerClass}">
      <div class="name">${spriteUrl ? `<img class="mon-sprite" src="${spriteUrl}" alt="${m.species}" loading="lazy">` : ""}${m.species} <span class="lvl">Nv.${m.level ?? "?"}</span></div>
      <div class="types">${typesHtml}</div>
      ${m.item ? `<div class="field"><b>Objet:</b> ${m.item}</div>` : ""}
      ${m.ability ? `<div class="field"><b>Talent:</b> ${m.ability}</div>` : ""}
      ${m.nature ? `<div class="field"><b>Nature:</b> ${m.nature}</div>` : ""}
      ${m.moves && m.moves.length ? `<div class="field"><b>Capacités:</b><ul>${m.moves.map(mv=>`<li>${mv}</li>`).join("")}</ul></div>` : `<div class="field"><b>Capacités:</b> moveset de level-up par défaut (non personnalisé)</div>`}
    </div>`;
  }

  let cards;
  if (isDouble) {
    cards = subNames.map((sn, i) => {
      const mons = monsWithTypes.filter(m => m.owner === i);
      return `<div class="double-group double-group-${i}">
        <div class="double-group-label">${sn}</div>
        <div class="team-grid">${mons.map(monCard).join("")}</div>
      </div>`;
    }).join("");
  } else {
    cards = `<div class="team-grid">${monsWithTypes.map(monCard).join("")}</div>`;
  }

  trainerView.innerHTML = `
    <div class="trainer-title">${t.name}</div>
    <div class="trainer-meta">${t.chapter}${t.location ? " · " + t.location : ""} · ${t.pokemon.length} Pokémon</div>
    <h2 style="margin-top:4px">Équipe adverse</h2>
    ${cards}
  `;
}

// ---------- Roster ----------
const rosterArea = document.getElementById("roster-area");
const STORAGE_KEY = "rnb_roster_v1";

function loadRoster() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) rosterArea.value = saved;
}
function saveRoster() {
  localStorage.setItem(STORAGE_KEY, rosterArea.value);
}
loadRoster();
rosterArea.addEventListener("input", () => { saveRoster(); renderTeamSelect(); renderFaceoff(); });

document.getElementById("roster-import").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    rosterArea.value = reader.result.trim();
    saveRoster();
    renderTeamSelect();
    renderFaceoff();
  };
  reader.readAsText(file, "utf-8");
  e.target.value = "";
});

document.getElementById("roster-export").addEventListener("click", () => {
  const blob = new Blob([rosterArea.value], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "roster.txt";
  a.click();
});

function getRosterList() {
  return rosterArea.value.split("\n").map(s => s.trim()).filter(Boolean);
}

// autocomplete datalist
const datalist = document.getElementById("dex-datalist");
datalist.innerHTML = DEX_NAMES.map(n => `<option value="${n}"></option>`).join("");

// ---------- Types résolus tolérants (accents/casse) ----------
function resolveTypes(name) {
  let types = getTypes(name);
  if (!types) {
    const target = norm(name);
    const found = DEX_NAMES.find(n => norm(n) === target);
    if (found) types = getTypes(found);
  }
  return types;
}

function multClass(m) {
  if (m === 0) return "mult-0";
  if (m === 4) return "mult-4";
  if (m === 2) return "mult-2";
  if (m === 0.25) return "mult-0-25";
  if (m === 0.5) return "mult-0-5";
  return "mult-1";
}

// ---------- 2b. Équipe pour ce combat (sélection dans le roster) ----------
const teamSelectView = document.getElementById("team-select-view");

function renderTeamSelect() {
  const roster = getRosterList();
  if (!roster.length) {
    teamSelectView.innerHTML = `<div class="empty-hint">Renseigne ton roster ci-dessus.</div>`;
    return;
  }

  const rosterSet = new Set(roster);
  for (const n of [...selectedTeam]) if (!rosterSet.has(n)) selectedTeam.delete(n);

  const items = roster.map(name => {
    const types = resolveTypes(name);
    const typesHtml = types ? types.map(typeBadge).join("") : `<span class="type-badge" style="background:#555">?</span>`;
    const checked = selectedTeam.has(name) ? "checked" : "";
    const resolvedSpecies = findSpeciesByLooseName(name);
    const spriteUrl = resolvedSpecies ? getSpeciesSpriteUrl(resolvedSpecies) : null;
    return `<label class="team-check-item">
      <input type="checkbox" class="team-member-select" data-name="${name}" ${checked}>
      ${spriteUrl ? `<img class="team-check-sprite" src="${spriteUrl}" alt="${name}" loading="lazy">` : ""}
      <div class="team-check-info">
        <div class="name">${name}</div>
        <div class="types">${typesHtml}</div>
      </div>
    </label>`;
  }).join("");

  teamSelectView.innerHTML = `<div class="team-check-list">${items}</div>`;
}

teamSelectView.addEventListener("change", (e) => {
  const cb = e.target.closest(".team-member-select");
  if (!cb) return;
  if (cb.checked) selectedTeam.add(cb.dataset.name); else selectedTeam.delete(cb.dataset.name);
  saveTeamLink();
  renderFaceoff();
});

// ---------- 3. Face à face ----------
const faceoffView = document.getElementById("faceoff-view");

function getSelectedTeamData() {
  return getRosterList()
    .filter(n => selectedTeam.has(n))
    .map(name => ({ name, types: resolveTypes(name) }))
    .filter(r => r.types);
}

function renderFaceoff() {
  if (!currentTrainer) {
    faceoffView.innerHTML = `<div class="empty-hint">Choisis d'abord un combat ci-dessus.</div>`;
    return;
  }
  const teamData = getSelectedTeamData();
  if (!teamData.length) {
    faceoffView.innerHTML = `<div class="empty-hint">Sélectionne au moins un Pokémon de ton équipe dans la section 2.</div>`;
    return;
  }

  const opponents = currentTrainer.pokemon.map((p, idx) => ({ idx, species: p.species, types: getTypes(p.species) }));
  const known = opponents.filter(o => o.types);
  const unknown = opponents.filter(o => !o.types).map(o => o.species);

  const teamNames = new Set(teamData.map(t => t.name));
  chain.forEach(turn => { if (turn.teammate && !teamNames.has(turn.teammate)) turn.teammate = null; });
  if (activeChainIndex !== null && !chain[activeChainIndex]) activeChainIndex = null;

  // Pokémon adverses à ajouter comme prochain tour de la chaîne
  const addPills = known.map(o => `<div class="suggested-pill faceoff-add-pill" data-idx="${o.idx}">+ ${o.species}</div>`).join("");

  // Chaîne ordonnée de tours (comme dans l'exemple de la capture d'écran)
  const nodes = chain.map((turn, i) => {
    const opp = known.find(o => o.idx === turn.oppIdx);
    const cls = ["chain-node"];
    if (i === activeChainIndex) cls.push("active");
    return `<div class="${cls.join(" ")}" data-chain-idx="${i}">
      <span class="chain-num">#${i + 1}</span>
      <span>${opp ? opp.species : "?"}</span>
      <span class="chain-arrow">→</span>
      <span>${turn.teammate || "?"}</span>
      <span class="chain-remove" data-remove-idx="${i}" title="Retirer ce tour">✕</span>
    </div>`;
  }).join(`<div class="chain-link"></div>`);

  let detail = `<div class="empty-hint">Clique sur "+ Pokémon adverse" ci-dessus pour ajouter un tour à la chaîne.</div>`;
  if (activeChainIndex !== null && chain[activeChainIndex]) {
    const turn = chain[activeChainIndex];
    const opp = known.find(o => o.idx === turn.oppIdx);
    if (opp) {
      const options = teamData.map(r => {
        const o2 = bestOffensiveMultiplier(r.types, opp.types);
        return `<option value="${r.name}" ${turn.teammate === r.name ? "selected" : ""}>${r.name} (x${o2})</option>`;
      }).join("");
      const chosenData = turn.teammate ? teamData.find(t => t.name === turn.teammate) : null;
      const off = chosenData ? bestOffensiveMultiplier(chosenData.types, opp.types) : null;
      const def = chosenData ? worstDefensiveMultiplier(chosenData.types, opp.types) : null;
      detail = `<div class="vs-compact-row">
        <div class="vs-compact-mon">Tour ${activeChainIndex + 1} : ${opp.species} ${opp.types.map(typeBadge).join("")}</div>
        <div class="vs-compact-label">VS</div>
        <div class="vs-compact-pick">
          <select class="chain-teammate-select">
            <option value="">— choisir —</option>
            ${options}
          </select>
          ${chosenData ? `<span class="matchup-cell ${multClass(off)}">x${off}</span><span class="matchup-cell ${multClass(def)}">x${def}${def >= 2 ? " ⚠" : ""}</span>` : ""}
        </div>
      </div>`;
    }
  }

  faceoffView.innerHTML = `
    <p class="sub">Clique pour ajouter un tour à la chaîne, dans l'ordre où tu penses les affronter.</p>
    <div class="suggested-list">${addPills}</div>
    ${unknown.length ? `<p class="sub" style="color:var(--bad)">Non reconnus côté adverse : ${unknown.join(", ")}</p>` : ""}
    <div class="chain-row">${nodes || '<div class="empty-hint">Chaîne vide.</div>'}</div>
    ${chain.length ? `<div class="row" style="margin:8px 0"><button type="button" class="secondary" id="chain-clear">Vider la chaîne</button></div>` : ""}
    <div style="margin-top:6px">${detail}</div>
  `;
}

faceoffView.addEventListener("click", (e) => {
  const addPill = e.target.closest(".faceoff-add-pill");
  if (addPill) {
    chain.push({ oppIdx: parseInt(addPill.dataset.idx, 10), teammate: null });
    activeChainIndex = chain.length - 1;
    renderFaceoff();
    return;
  }
  const remove = e.target.closest(".chain-remove");
  if (remove) {
    const i = parseInt(remove.dataset.removeIdx, 10);
    chain.splice(i, 1);
    if (activeChainIndex === i) activeChainIndex = null;
    else if (activeChainIndex !== null && activeChainIndex > i) activeChainIndex--;
    renderFaceoff();
    return;
  }
  const node = e.target.closest(".chain-node");
  if (node) {
    activeChainIndex = parseInt(node.dataset.chainIdx, 10);
    renderFaceoff();
    return;
  }
  if (e.target.closest("#chain-clear")) {
    chain = [];
    activeChainIndex = null;
    renderFaceoff();
  }
});

faceoffView.addEventListener("change", (e) => {
  const select = e.target.closest(".chain-teammate-select");
  if (!select || activeChainIndex === null) return;
  chain[activeChainIndex].teammate = select.value || null;
  renderFaceoff();
});

// ---------- Import depuis l'export Lua (format Showdown) ----------
const STAT_KEY_ALIASES = { hp: "hp", atk: "atk", def: "def", spa: "spa", spd: "spd", spe: "spe" };
function normStatKey(s) { return STAT_KEY_ALIASES[(s || "").toLowerCase()] || null; }

function parseShowdownExport(text) {
  const blocks = text.split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(Boolean);
  const mons = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let head = lines[0];
    if (/^(Ability|Level|IVs|EVs|-|Shiny)/i.test(head)) continue;

    let item = "";
    const atIdx = head.indexOf(" @ ");
    if (atIdx !== -1) { item = head.slice(atIdx + 3).trim(); head = head.slice(0, atIdx).trim(); }
    // "Surnom (Espèce)" ou juste "Espèce"
    const nickMatch = head.match(/\(([^)]+)\)/);
    const rawSpecies = (nickMatch ? nickMatch[1] : head.replace(/\s*\(.*\)\s*/, "")).trim();
    if (!rawSpecies) continue;
    // Traduction EN->FR automatique (voir translate.js) : accepte aussi bien un nom
    // français déjà correct qu'un nom anglais issu d'un export Showdown classique.
    const species = findSpeciesByLooseName(rawSpecies) || rawSpecies;

    const mon = {
      species, item, level: 100, nature: "", ability: "", moves: [],
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if ((m = line.match(/^Ability:\s*(.+)$/i))) { mon.ability = m[1].trim(); continue; }
      if ((m = line.match(/^Level:\s*(\d+)$/i))) { mon.level = Math.max(1, Math.min(100, parseInt(m[1], 10) || 100)); continue; }
      if ((m = line.match(/^EVs:\s*(.+)$/i))) {
        m[1].split("/").forEach(part => {
          const pm = part.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
          const key = pm && normStatKey(pm[2]);
          if (key) mon.evs[key] = parseInt(pm[1], 10);
        });
        continue;
      }
      if ((m = line.match(/^IVs:\s*(.+)$/i))) {
        m[1].split("/").forEach(part => {
          const pm = part.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
          const key = pm && normStatKey(pm[2]);
          if (key) mon.ivs[key] = parseInt(pm[1], 10);
        });
        continue;
      }
      if ((m = line.match(/^([A-Za-zÀ-ÿ]+)\s+Nature$/i))) { mon.nature = m[1].trim(); continue; }
      if ((m = line.match(/^-\s*(.+)$/))) {
        if (mon.moves.length < 4) {
          const rawMove = m[1].trim();
          mon.moves.push(findMoveByLooseName(rawMove) || rawMove);
        }
        continue;
      }
    }
    mons.push(mon);
  }
  return mons;
}

const ROSTER_FULL_KEY = "rnb_roster_full_v1";
function saveRosterFull(mons) {
  localStorage.setItem(ROSTER_FULL_KEY, JSON.stringify(mons));
}

document.getElementById("lua-import").addEventListener("click", () => {
  const text = document.getElementById("lua-paste").value;
  const statusEl = document.getElementById("lua-import-status");
  const mons = parseShowdownExport(text);
  if (!mons.length) {
    statusEl.textContent = "Aucun Pokémon détecté dans le texte collé.";
    return;
  }
  const unknown = [];
  for (const m of mons) {
    if (!getTypes(m.species)) unknown.push(m.species);
  }
  rosterArea.value = mons.map(m => m.species).join("\n");
  saveRoster();
  saveRosterFull(mons);
  renderTeamSelect();
  renderFaceoff();
  statusEl.textContent = `${mons.length} Pokémon importés dans ton roster (niveau, nature, objet, capacités inclus)` +
    (unknown.length ? ` (non reconnus : ${unknown.join(", ")})` : ".");
});

initTrainerFromLink(); // restaure le dernier combat + équipe choisie (pas de reset en changeant de page)

// ---------- 4. Bloc-notes ----------
const notesArea = document.getElementById("notes-area");
const NOTES_KEY = "rnb_notes_v1";
function loadNotes() {
  const saved = localStorage.getItem(NOTES_KEY);
  if (saved !== null) notesArea.value = saved;
}
function saveNotes() {
  localStorage.setItem(NOTES_KEY, notesArea.value);
}
loadNotes();
notesArea.addEventListener("input", saveNotes);
