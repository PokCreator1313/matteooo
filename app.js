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

function selectTrainer(idx) {
  currentTrainer = TRAINERS[idx];
  selectedTeam = new Set();
  chain = [];
  activeChainIndex = null;
  renderTrainer(currentTrainer);
  renderTeamSelect();
  renderFaceoff();
}

function renderTrainer(t) {
  const monsWithTypes = t.pokemon.map(p => ({ ...p, types: getTypes(p.species) }));

  // agrégation des menaces : compte des types (STAB) présents dans l'équipe adverse
  const threatCount = {};
  for (const m of monsWithTypes) {
    if (!m.types) continue;
    for (const ty of m.types) threatCount[ty] = (threatCount[ty] || 0) + 1;
  }
  const maxThreat = Math.max(1, ...Object.values(threatCount));
  const threatRows = Object.entries(threatCount).sort((a, b) => b[1] - a[1]).map(([ty, c]) => `
    <div class="threat-row">
      ${typeBadge(ty)}
      <div class="bar-bg"><div class="bar-fill" style="width:${(c/maxThreat)*100}%;background:${TYPE_COLORS[ty]}"></div></div>
      <div class="cnt">${c}</div>
    </div>`).join("");

  const cards = monsWithTypes.map(m => {
    const typesHtml = m.types ? m.types.map(typeBadge).join("") : `<span class="type-badge" style="background:#555">?</span>`;
    return `<div class="mon-card">
      <div class="name">${m.species} <span class="lvl">Nv.${m.level ?? "?"}</span></div>
      <div class="types">${typesHtml}</div>
      ${m.item ? `<div class="field"><b>Objet:</b> ${m.item}</div>` : ""}
      ${m.ability ? `<div class="field"><b>Talent:</b> ${m.ability}</div>` : ""}
      ${m.nature ? `<div class="field"><b>Nature:</b> ${m.nature}</div>` : ""}
      ${m.moves && m.moves.length ? `<div class="field"><b>Capacités:</b><ul>${m.moves.map(mv=>`<li>${mv}</li>`).join("")}</ul></div>` : ""}
    </div>`;
  }).join("");

  trainerView.innerHTML = `
    <div class="trainer-title">${t.name}</div>
    <div class="trainer-meta">${t.chapter}${t.location ? " · " + t.location : ""} · ${t.pokemon.length} Pokémon</div>
    <h2 style="margin-top:4px">Types menaçants dans cette équipe</h2>
    <div class="threat-bars">${threatRows || '<div class="empty-hint">Types inconnus</div>'}</div>
    <h2 style="margin-top:16px">Équipe adverse</h2>
    <div class="team-grid">${cards}</div>
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
    return `<label class="team-check-item">
      <input type="checkbox" class="team-member-select" data-name="${name}" ${checked}>
      <span>${name}</span> ${typesHtml}
    </label>`;
  }).join("");

  teamSelectView.innerHTML = `<div class="team-check-list">${items}</div>`;
}

teamSelectView.addEventListener("change", (e) => {
  const cb = e.target.closest(".team-member-select");
  if (!cb) return;
  if (cb.checked) selectedTeam.add(cb.dataset.name); else selectedTeam.delete(cb.dataset.name);
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
function parseShowdownExport(text) {
  const blocks = text.split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(Boolean);
  const species = [];
  for (const block of blocks) {
    const firstLine = block.split(/\r?\n/)[0].trim();
    if (!firstLine) continue;
    // "Nom @ Objet" ou juste "Nom" ; on ignore les lignes qui ne sont pas un nom de Pokémon
    if (/^(Ability|Level|IVs|EVs|-|Shiny)/i.test(firstLine)) continue;
    const name = firstLine.split(" @ ")[0].trim();
    if (name) species.push(name);
  }
  return species;
}

document.getElementById("lua-import").addEventListener("click", () => {
  const text = document.getElementById("lua-paste").value;
  const statusEl = document.getElementById("lua-import-status");
  const names = parseShowdownExport(text);
  if (!names.length) {
    statusEl.textContent = "Aucun Pokémon détecté dans le texte collé.";
    return;
  }
  const resolved = [];
  const unknown = [];
  for (const n of names) {
    if (getTypes(n)) resolved.push(n); else unknown.push(n);
  }
  rosterArea.value = names.join("\n");
  saveRoster();
  renderTeamSelect();
  renderFaceoff();
  statusEl.textContent = `${names.length} Pokémon importés dans ton roster` +
    (unknown.length ? ` (non reconnus : ${unknown.join(", ")})` : ".");
});

renderTeamSelect();
renderFaceoff();
