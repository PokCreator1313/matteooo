// ============================================================
// Import direct d'un fichier de sauvegarde .sav (Run & Bun, basé sur la
// structure de sauvegarde Pokémon Génération III / GBA) : reconstitue
// l'équipe (party) exactement comme le fait le script Lua runandbun.lua,
// mais en lisant le fichier .sav au lieu de la RAM d'un émulateur en direct.
//
// Format de sauvegarde Gen III (Ruby/Saphir/Émeraude) :
// - Le fichier est découpé en secteurs de 4096 octets.
// - Chaque secteur a un pied de page de 12 octets à l'offset 0xFF4 :
//     u16 sectionId, u16 checksum, u32 signature (0x08012025), u32 saveIndex.
// - 14 secteurs (sectionId 0-13) forment une sauvegarde complète ; le jeu
//   alterne entre 2 emplacements (A/B) à chaque sauvegarde, donc le fichier
//   contient généralement 2 groupes de 14 secteurs : on garde le groupe dont
//   le compteur saveIndex est le plus élevé (le plus récent).
// - La section 1 ("Team/Items") contient le nombre de Pokémon de l'équipe
//   à l'offset 0x234 et les 6 Pokémon de l'équipe (100 octets chacun) à
//   partir de l'offset 0x238 — mêmes offsets que playerPartyCount/
//   playerParty dans SaveBlock1 (pokeemerald), qui tiennent entièrement
//   dans le premier secteur de SaveBlock1.
// - Chaque Pokémon est chiffré (XOR par personality^otId) et ses 4 sous-
//   structures de 12 octets (Growth/Attacks/EVs&Condition/Misc) sont
//   permutées selon personality % 24 — même logique que readBoxMon() dans
//   runandbun.lua, reproduite ici en JS pur (DataView) sans émulateur.

const SAV_SECTOR_SIZE = 4096;
const SAV_FOOTER_OFFSET = 0xFF4;
const SAV_SIGNATURE = 0x08012025;

const SAV_SUBSTRUCT_SELECTOR = {
  0: [0, 1, 2, 3], 1: [0, 1, 3, 2], 2: [0, 2, 1, 3], 3: [0, 3, 1, 2],
  4: [0, 2, 3, 1], 5: [0, 3, 2, 1], 6: [1, 0, 2, 3], 7: [1, 0, 3, 2],
  8: [2, 0, 1, 3], 9: [3, 0, 1, 2], 10: [2, 0, 3, 1], 11: [3, 0, 2, 1],
  12: [1, 2, 0, 3], 13: [1, 3, 0, 2], 14: [2, 1, 0, 3], 15: [3, 1, 0, 2],
  16: [2, 3, 0, 1], 17: [3, 2, 0, 1], 18: [1, 2, 3, 0], 19: [1, 3, 2, 0],
  20: [2, 1, 3, 0], 21: [3, 1, 2, 0], 22: [2, 3, 1, 0], 23: [3, 2, 1, 0],
};

function savReadSectors(view) {
  const sectors = [];
  const count = Math.floor(view.byteLength / SAV_SECTOR_SIZE);
  for (let i = 0; i < count; i++) {
    const base = i * SAV_SECTOR_SIZE;
    const footer = base + SAV_FOOTER_OFFSET;
    const signature = view.getUint32(footer + 4, true);
    if (signature !== SAV_SIGNATURE) continue;
    sectors.push({
      base,
      sectionId: view.getUint16(footer, true),
      saveIndex: view.getUint32(footer + 8, true),
    });
  }
  return sectors;
}

// Regroupe les secteurs valides par compteur de sauvegarde (saveIndex) et
// renvoie le groupe le plus récent (celui utilisé par la partie en cours).
function savPickLatestSlot(sectors) {
  const groups = new Map();
  for (const s of sectors) {
    if (!groups.has(s.saveIndex)) groups.set(s.saveIndex, []);
    groups.get(s.saveIndex).push(s);
  }
  let best = null;
  for (const [saveIndex, group] of groups) {
    if (!best || saveIndex > best.saveIndex) best = { saveIndex, group };
  }
  return best ? best.group : [];
}

function savDecryptMon(view, address) {
  const personality = view.getUint32(address + 0, true);
  const otId = view.getUint32(address + 4, true);
  const key = (personality ^ otId) >>> 0;
  const pSel = SAV_SUBSTRUCT_SELECTOR[personality % 24];

  const ss = [[], [], [], []];
  for (let i = 0; i < 3; i++) {
    for (let s = 0; s < 4; s++) {
      const raw = view.getUint32(address + 32 + pSel[s] * 12 + i * 4, true);
      ss[s][i] = (raw ^ key) >>> 0;
    }
  }
  const [ss0, ss1, ss2, ss3] = ss;

  const mon = { personality, otId };
  mon.species = ss0[0] & 0xFFFF;
  mon.heldItem = (ss0[0] >>> 16) & 0xFFFF;
  mon.moves = [
    ss1[0] & 0xFFFF, (ss1[0] >>> 16) & 0xFFFF,
    ss1[1] & 0xFFFF, (ss1[1] >>> 16) & 0xFFFF,
  ];
  mon.hpEV = ss2[0] & 0xFF;
  mon.attackEV = (ss2[0] >>> 8) & 0xFF;
  mon.defenseEV = (ss2[0] >>> 16) & 0xFF;
  mon.speedEV = (ss2[0] >>> 24) & 0xFF;
  mon.spAttackEV = ss2[1] & 0xFF;
  mon.spDefenseEV = (ss2[1] >>> 8) & 0xFF;

  const hiddenNature = (ss0[2] >>> 16) & 0x1F;
  const f1 = ss3[1];
  mon.hpIV = (f1 >>> 1) & 0x1F;
  mon.attackIV = (f1 >>> 6) & 0x1F;
  mon.defenseIV = (f1 >>> 11) & 0x1F;
  mon.speedIV = (f1 >>> 16) & 0x1F;
  mon.spAttackIV = (f1 >>> 21) & 0x1F;
  mon.spDefenseIV = (f1 >>> 26) & 0x1F;
  const f2 = ss3[2];
  mon.altAbility = (f2 >>> 29) & 3;

  mon.nature = hiddenNature === 26 ? (personality % 25) : hiddenNature;
  mon.level = view.getUint8(address + 84);
  return mon;
}

function savGetSpeciesName(id) {
  return (id >= 1 && SAV_SPECIES_NAMES[id - 1]) ? SAV_SPECIES_NAMES[id - 1] : null;
}
function savGetItemName(id) {
  return (id >= 1 && SAV_ITEM_NAMES[id - 1]) ? SAV_ITEM_NAMES[id - 1] : "";
}
function savGetMoveName(id) {
  return SAV_MOVE_NAMES[id] || "";
}
function savGetNatureName(id) {
  return SAV_NATURE_NAMES[id] || "";
}
function savGetAbilityName(speciesId, altAbility) {
  const idx = speciesId * 3 + altAbility;
  let name = SAV_ABILITY_NAMES[idx];
  if (!name || name === "None") name = SAV_ABILITY_NAMES[speciesId * 3];
  return (name && name !== "None") ? name : "";
}

// Point d'entrée : ArrayBuffer du fichier .sav -> tableau de mons au même
// format que parseShowdownExport() (species/item/level/nature/ability/moves
// en FR quand possible, evs/ivs), pour une intégration 1:1 avec le reste
// du site (ROSTER_KEY / ROSTER_FULL_KEY).
function parseSavFile(buffer) {
  const view = new DataView(buffer);
  const sectors = savReadSectors(view);
  if (!sectors.length) throw new Error("Aucun secteur de sauvegarde valide trouvé (signature invalide).");
  const slot = savPickLatestSlot(sectors);
  const teamSection = slot.find(s => s.sectionId === 1);
  if (!teamSection) throw new Error("Section Team/Items (id 1) introuvable dans la sauvegarde.");

  const partyCount = Math.min(6, view.getUint8(teamSection.base + 0x234));
  const mons = [];
  for (let i = 0; i < partyCount; i++) {
    const raw = savDecryptMon(view, teamSection.base + 0x238 + i * 100);
    const speciesEn = savGetSpeciesName(raw.species);
    if (!speciesEn) continue;
    const speciesFr = findSpeciesByLooseName(speciesEn) || speciesEn;
    const itemEn = savGetItemName(raw.heldItem);
    const moves = raw.moves
      .map(id => savGetMoveName(id))
      .filter(Boolean)
      .map(m => findMoveByLooseName(m) || m);

    mons.push({
      species: speciesFr,
      item: itemEn,
      level: raw.level || 1,
      nature: savGetNatureName(raw.nature),
      ability: savGetAbilityName(raw.species, raw.altAbility),
      moves,
      evs: { hp: raw.hpEV, atk: raw.attackEV, def: raw.defenseEV, spa: raw.spAttackEV, spd: raw.spDefenseEV, spe: raw.speedEV },
      ivs: { hp: raw.hpIV, atk: raw.attackIV, def: raw.defenseIV, spa: raw.spAttackIV, spd: raw.spDefenseIV, spe: raw.speedIV },
    });
  }
  return mons;
}
