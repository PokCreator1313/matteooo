// ============================================================
// Moteur de calcul de dégâts — Run & Bun
// Formule standard (Gen 6-9 style, split Phys/Spé, avec Fée).
// S'appuie sur calc-data.js (CALC_SPECIES / CALC_MOVES / CALC_ABILITIES /
// CALC_ITEMS / CALC_NATURES) et typechart.js (TYPE_CHART).
// ============================================================

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

// Capacités qui touchent réellement les deux adversaires en combat double
// ("all-opponents" / "all-other-pokemon" sur PokeAPI). Seules ces capacités
// subissent le malus x0.75 en combat double — pas les capacités mono-cible.
// Liste vérifiée via PokeAPI (move-target 9 et 11), noms FR = clés CALC_MOVES.
const SPREAD_MOVES = new Set([
  "Surf", "Séisme", "Destruction", "Explosion", "Ampleur", "Danse Folle",
  "Coup d'Jus", "Ébullilave", "Cradovague", "Synchropeine", "Piétisol",
  "Incendie", "Parabocharge", "Tempête Florale", "Bang Sonique",
  "Aria de l'Écume", "Centrifugifle", "Caboche-Kaboum", "Explo-Brume",
  "Gaz Corrosif", "Coupe-Vent", "Mimi-Queue", "Groz'Yeux", "Rugissement",
  "Acide", "Blizzard", "Tranch'Herbe", "Sécrétion", "Météores", "Gaz Toxik",
  "Écume", "Éboulement", "Spore Coton", "Poudreuse", "Vent Glace",
  "Doux Parfum", "Ouragan", "Canicule", "Éruption", "Mégaphone",
  "Tranch'Air", "Giclédo", "Ocroupi", "Anti-Soin", "Séduction", "Trou Noir",
  "Calcination", "Survinsecte", "Toile Élek", "Chant Antique", "Ère Glaciaire",
  "Aboiement", "Voix Enjôleuse", "Orage Adamantin", "Piège de Venin",
  "Éclat Magique", "Myria-Flèches", "Myria-Vagues", "Force Chtonienne",
  "Onde Originelle", "Lame Pangéenne", "Sanction Suprême", "Vibrécaille",
  "Carapiège", "Pika-Splash", "Abattage", "Overdrive", "Feu Envieux",
  "Draco-Énergie", "Fureur Ardente", "Lance de Glace", "Éclat Spectral",
  "Typhon Passionné", "Typhon Hivernal", "Typhon Fulgurant", "Typhon Pyrosable",
  "Toupie Éclat", "Ruée d'Or", "Pluie Térastrale",
]);

// Normalisation accents/casse (identique à norm() de app.js) — requise ici
// car calc.html ne charge pas app.js, seulement calc-engine.js/calc.js.
function norm(s) {
  return (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Table réduite d'objets +12,5%/+20% par type de capacité (noms EN, alignés
// sur CALC_ITEMS qui mappe FR -> EN). Couvre les objets "boost de type" les
// plus courants.
const TYPE_BOOST_ITEMS = {
  "Charcoal": "Feu", "Mystic Water": "Eau", "Miracle Seed": "Plante",
  "Magnet": "Electrik", "Never-Melt Ice": "Glace", "NeverMeltIce": "Glace",
  "Black Belt": "Combat", "Poison Barb": "Poison", "Soft Sand": "Sol",
  "Sharp Beak": "Vol", "Twisted Spoon": "Psy", "Silver Powder": "Insecte",
  "SilverPowder": "Insecte", "Hard Stone": "Roche", "Spell Tag": "Spectre",
  "Dragon Fang": "Dragon", "Black Glasses": "Tenebres", "Metal Coat": "Acier",
  "Fairy Feather": "Fee", "Pixie Plate": "Fee", "Silk Scarf": "Normal",
  "Dread Plate": "Tenebres",
};

// Objets à double type boosté (+20% sur deux types au lieu d'un). Orbe
// Platiné (Griseous Orb) : Dragon ET Spectre, aucune restriction d'espèce
// depuis la Gen 5. Noms EN (alignés sur CALC_ITEMS).
const DUAL_TYPE_BOOST_ITEMS = {
  "Griseous Orb": ["Dragon", "Spectre"],
};

// Graines de terrain : +1 palier Déf (Élek/Herbu) ou Déf. Spé (Brume/Psy)
// pour le défenseur si le terrain correspondant est actif (consommées après
// usage, on suppose ici qu'elles sont encore tenues). Noms EN (alignés sur
// CALC_ITEMS).
const TERRAIN_SEED_ITEMS = {
  "Electric Seed": { terrain: "electrik", stat: "def" },
  "Grassy Seed": { terrain: "herbu", stat: "def" },
  "Misty Seed": { terrain: "brumeux", stat: "spd" },
  "Psychic Seed": { terrain: "psy", stat: "spd" },
};

// Baies "résistance" : réduisent de 50% un coup super efficace du type
// correspondant (consommées après usage — on suppose ici qu'elles sont
// encore tenues au moment du calcul). Noms EN (alignés sur CALC_ITEMS).
const RESIST_BERRIES = {
  "Occa Berry": "Feu", "Passho Berry": "Eau", "Wacan Berry": "Electrik",
  "Rindo Berry": "Plante", "Yache Berry": "Glace", "Chople Berry": "Combat",
  "Kebia Berry": "Poison", "Shuca Berry": "Sol", "Coba Berry": "Vol",
  "Payapa Berry": "Psy", "Tanga Berry": "Insecte", "Charti Berry": "Roche",
  "Kasib Berry": "Spectre", "Haban Berry": "Dragon", "Colbur Berry": "Tenebres",
  "Babiri Berry": "Acier", "Roseli Berry": "Fee",
};

// Gemmes : +30% de dégâts (une seule fois, consommées) si le type
// correspond à celui de la capacité utilisée. Noms EN (alignés sur CALC_ITEMS).
const GEM_ITEMS = {
  "Normal Gem": "Normal", "Fighting Gem": "Combat", "Flying Gem": "Vol",
  "Poison Gem": "Poison", "Ground Gem": "Sol", "Rock Gem": "Roche",
  "Bug Gem": "Insecte", "Ghost Gem": "Spectre", "Steel Gem": "Acier",
  "Fire Gem": "Feu", "Water Gem": "Eau", "Grass Gem": "Plante",
  "Electric Gem": "Electrik", "Psychic Gem": "Psy", "Ice Gem": "Glace",
  "Dragon Gem": "Dragon", "Dark Gem": "Tenebres", "Fairy Gem": "Fee",
};

// Baies boost de stat à PV bas (≤25% des PV max) : +1 palier Attaque/Att.
// Spé au moment du coup (mécanique standard, consommées après usage).
const STAT_BOOST_BERRIES = {
  "Liechi Berry": "atk",
  "Petaya Berry": "spa",
};

// Objets qui doublent une stat pour une espèce précise.
const THICK_CLUB_SPECIES = new Set(["Osselait", "Ossatueur", "Ossatueur-Alola"]);
const LIGHT_BALL_SPECIES = new Set(["Pikachu", "Pikachu-Gmax"]);

function abilityIdByFrName(frName) {
  if (!frName) return null;
  if (CALC_ABILITIES[frName]) return CALC_ABILITIES[frName].id;
  const t = norm(frName);
  const found = Object.keys(CALC_ABILITIES).find(n => norm(n) === t);
  return found ? CALC_ABILITIES[found].id : null;
}

function abilityFrNameById(id) {
  if (!id) return null;
  const found = Object.entries(CALC_ABILITIES).find(([, v]) => v.id === id);
  return found ? found[0] : id;
}

function natureMultiplier(natureFr, statKey) {
  const nat = CALC_NATURES[natureFr];
  if (!nat) return 1;
  if (nat.inc === nat.dec) return 1;
  if (nat.inc === statKey) return 1.1;
  if (nat.dec === statKey) return 0.9;
  return 1;
}

function calcHP(base, iv, ev, level) {
  if (base === 1) return 1; // Ptiravi cas spécial (base HP=1)
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

function calcOther(base, iv, ev, level, natMult) {
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * natMult);
}

// mon = { species, level, nature, ivs:{hp,atk,def,spa,spd,spe}, evs:{...} }
function computeStats(mon) {
  const sp = CALC_SPECIES[mon.species];
  if (!sp) return null;
  const out = {};
  for (const k of STAT_KEYS) {
    const iv = (mon.ivs && mon.ivs[k] != null) ? mon.ivs[k] : 31;
    const ev = (mon.evs && mon.evs[k] != null) ? mon.evs[k] : 0;
    if (k === "hp") {
      out.hp = calcHP(sp.hp, iv, ev, mon.level);
    } else {
      const natMult = natureMultiplier(mon.nature, k);
      out[k] = calcOther(sp[k], iv, ev, mon.level, natMult);
    }
  }
  return out;
}

function statStageMultiplier(stage) {
  const s = Math.max(-6, Math.min(6, stage || 0));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

function applyStage(stat, stage) {
  return Math.floor(stat * statStageMultiplier(stage));
}

// Résout un objet move soit depuis CALC_MOVES (par nom FR), soit un move
// "manuel" fourni directement (name/power/type/cat/prio déjà remplis).
function resolveMove(moveInput) {
  if (moveInput.manual) return moveInput;
  const data = CALC_MOVES[moveInput.name];
  if (!data) return null;
  return {
    name: moveInput.name,
    power: data.power,
    type: data.type,
    cat: data.cat,
    prio: data.prio,
  };
}

// ------------------------------------------------------------------
// Capacités à puissance/stat variable (liées au poids, à la vitesse,
// aux PV, aux modificateurs de stat, ou utilisant une stat différente
// de l'habituelle). Table indexée par nom FR (identique aux clés de
// CALC_MOVES). Vérifié via les mécaniques officielles (Bulbapedia).
// ------------------------------------------------------------------
const MOVE_MECHANIC = {
  // Puissance basée sur le poids de la cible
  "Nœud Herbe": "weight_target",
  "Balayage": "weight_target",
  // Puissance basée sur le ratio de poids attaquant/cible
  "Tacle Feu": "weight_ratio",
  "Tacle Lourd": "weight_ratio",
  // Puissance basée sur le ratio de Vitesse
  "Gyroballe": "speed_ratio_gyro",
  "Boule Élek": "speed_ratio_electro",
  // Puissance basée sur le % de PV actuels de l'attaquant
  "Éruption": "user_hp_pct",
  "Giclédo": "user_hp_pct",
  // Puissance qui augmente quand les PV de l'attaquant baissent
  "Contre": "user_hp_inverse",
  "Gigotage": "user_hp_inverse",
  // Puissance basée sur le % de PV actuels de la cible
  "Essorage": "target_hp_pct",
  "Presse": "target_hp_pct",
  // Puissance basée sur les hausses de stat de l'attaquant
  "Force Ajoutée": "stat_stage_self",
  "Arrogance": "stat_stage_self",
  // Puissance basée sur les hausses de stat de la cible
  "Punition": "stat_stage_target",
  // Utilise la Défense de l'attaquant à la place de l'Attaque
  "Big Splash": "atk_uses_def",
  // Utilise l'Attaque de la cible (avec ses modificateurs) à la place
  // de l'Attaque de l'attaquant
  "Tricherie": "atk_uses_target_atk",
  // Catégorie Spéciale mais utilise la Défense (pas la Déf. Spé.) de la cible
  "Choc Psy": "def_uses_def_stat",
  "Frappe Psy": "def_uses_def_stat",
  "Lame Ointe": "def_uses_def_stat",
  // Puissance doublée selon une condition de statut
  "Châtiment": "double_if_target_status",
  "Choc Venin": "double_if_target_poisoned",
  "Saumure": "double_if_target_low_hp",
  "Façade": "double_if_user_status",
  // Puissance basée sur le % de PV actuels de la cible, mais multiplicateur
  // différent (x100 au lieu de x120)
  "Pression Extrême": "target_hp_pct_100",
};

// ------------------------------------------------------------------
// Capacités à dégâts fixes/directs : contournent entièrement la formule
// de dégâts standard (pas d'Attaque/Défense, pas de STAB, pas de météo...).
// Seule l'immunité de type s'applique toujours. Vérifié via les mécaniques
// officielles (Bulbapedia).
// ------------------------------------------------------------------
const DIRECT_DAMAGE_MECHANIC = {
  "Sonic Boom": { type: "fixed", value: 20 },
  "Draco-Rage": { type: "fixed", value: 40 },
  "Ombre Nocturne": { type: "level" },
  "Frappe Atlas": { type: "level" },
  "Croc Fatal": { type: "half_target_hp" },
  "Ire de la Nature": { type: "half_target_hp" },
  "Cataclysme": { type: "half_target_hp" },
  "Effort": { type: "endeavor" },
  "Tout ou Rien": { type: "final_gambit" },
  "Abîme": { type: "ohko" },
  "Empal'Korne": { type: "ohko" },
  "Guillotine": { type: "ohko" },
  "Glaciation": { type: "ohko" },
};

function powerByWeightTarget(kg) {
  if (kg == null) return null;
  if (kg < 10) return 20;
  if (kg < 25) return 40;
  if (kg < 50) return 60;
  if (kg < 100) return 80;
  if (kg < 200) return 100;
  return 120;
}

function powerByWeightRatio(atkKg, defKg) {
  if (!atkKg || !defKg) return null;
  const ratio = atkKg / defKg;
  if (ratio >= 5) return 120;
  if (ratio >= 4) return 100;
  if (ratio >= 3) return 80;
  if (ratio >= 2) return 60;
  return 40;
}

function powerByGyroBall(atkSpe, defSpe) {
  if (!atkSpe) return 150;
  return Math.max(1, Math.min(150, Math.floor((25 * defSpe) / atkSpe)));
}

function powerByElectroBall(atkSpe, defSpe) {
  const ratio = defSpe > 0 ? atkSpe / defSpe : 4;
  if (ratio >= 4) return 150;
  if (ratio >= 3) return 120;
  if (ratio >= 2) return 80;
  if (ratio >= 1) return 60;
  return 40;
}

function powerByUserHpPct(pct) {
  return Math.max(1, Math.floor(150 * (pct / 100)));
}

function powerByHpInverse(pct) {
  if (pct <= 4.17) return 200;
  if (pct <= 10.42) return 150;
  if (pct <= 20.83) return 100;
  if (pct <= 35.42) return 80;
  if (pct <= 68.75) return 40;
  return 20;
}

function powerByTargetHpPct(pct) {
  return Math.max(1, Math.floor(120 * (pct / 100)));
}

function sumPositiveStages(stages) {
  if (!stages) return 0;
  return STAT_KEYS.filter(k => k !== "hp").reduce((sum, k) => sum + Math.max(0, stages[k] || 0), 0);
}

// Renvoie true si le talent/objet du défenseur annule le coup (immunité).
// Balle Fer (Iron Ball) ancre le défenseur au sol : elle annule à la fois
// l'immunité Sol de Lévitation et celle du type Vol (cette dernière est
// gérée séparément, sur l'efficacité de type, voir plus bas dans computeDamage).
function checkImmunity(moveType, defAbilityId, defTypes, defItemEn) {
  const t = moveType;
  if (t === "Sol" && defItemEn === "Air Balloon") return true;
  if (t === "Sol" && defItemEn === "Iron Ball") return false;
  if (defAbilityId === "LEVITATE" && t === "Sol") return true;
  if (defAbilityId === "WATER_ABSORB" && t === "Eau") return true;
  if (defAbilityId === "VOLT_ABSORB" && t === "Electrik") return true;
  if (defAbilityId === "DRY_SKIN" && t === "Eau") return true;
  if (defAbilityId === "FLASH_FIRE" && t === "Feu") return true;
  if (defAbilityId === "SAP_SIPPER" && t === "Plante") return true;
  if (defAbilityId === "STORM_DRAIN" && t === "Eau") return true;
  if (defAbilityId === "LIGHTNING_ROD" && t === "Electrik") return true;
  if (defAbilityId === "SOUNDPROOF") return false; // dépend de la capacité (son), non modélisé
  return false;
}

/**
 * opts = {
 *   attacker: { species, level, nature, ivs, evs, ability(FR), item(FR),
 *               stages:{atk,def,spa,spd,spe}, status ("brulure" etc.), lowHp (<=1/3),
 *               currentHp (optionnel, prime sur lowHp si fourni) },
 *   defender: { species, level, nature, ivs, evs, ability(FR), item(FR),
 *               stages:{atk,def,spa,spd,spe}, status, fullHp, notFullyEvolved,
 *               currentHp (optionnel, PV actuels pour le calcul de K.O.) },
 *   move: { name } | { manual:true, name, power, type, cat, prio },
 *   field: { weather:'none'|'pluie'|'soleil'|'sable'|'neige',
 *            terrain:'none'|'electrik'|'herbu'|'psy'|'brumeux',
 *            reflect:bool, lightscreen:bool, auroraveil:bool,
 *            crit:bool, multiTarget:bool }
 * }
 * Renvoie { rolls:[16 dégâts], min, max, minPct, maxPct (% des PV max),
 *           minPctCurrent, maxPctCurrent (% des PV actuels), defHp, defCurrentHp,
 *           effectiveness, immune:bool, stab:bool, atkStatUsed, defStatUsed,
 *           hitsToKo, hitsToKoMin, koNow, koNowGuaranteed, notes:[...] }
 */
function computeDamage(opts) {
  const notes = [];
  const { attacker, defender, field = {} } = opts;
  const atkSpecies = CALC_SPECIES[attacker.species];
  const defSpecies = CALC_SPECIES[defender.species];
  if (!atkSpecies || !defSpecies) return { error: "Espèce inconnue." };

  const move = resolveMove(opts.move);
  if (!move) return { error: "Capacité inconnue." };
  if (move.cat === "Statut") {
    return { error: "Capacité de statut (pas de dégâts directs)." };
  }

  const atkStats = computeStats(attacker);
  const defStats = computeStats(defender);
  if (!atkStats || !defStats) return { error: "Stats introuvables." };

  const defHp = defStats.hp;
  const defCurrentHp = defender.currentHp != null ? Math.min(defender.currentHp, defHp) : defHp;
  const atkCurrentHp = attacker.currentHp != null ? Math.min(attacker.currentHp, atkStats.hp) : atkStats.hp;

  // Puissance/stat variable (Nœud Herbe, Gyroballe, Éruption, etc.)
  const mechanic = MOVE_MECHANIC[move.name];
  if (mechanic) {
    const atkSpeEff = applyStage(atkStats.spe, (attacker.stages || {}).spe || 0);
    const defSpeEff = applyStage(defStats.spe, (defender.stages || {}).spe || 0);
    const atkHpPct = attacker.currentHp != null ? Math.max(0, Math.min(100, 100 * attacker.currentHp / atkStats.hp)) : 100;
    const defHpPct = defender.currentHp != null ? Math.max(0, Math.min(100, 100 * defender.currentHp / defStats.hp)) : 100;
    switch (mechanic) {
      case "weight_target": {
        const kg = SPECIES_WEIGHT_KG[defender.species];
        const p = powerByWeightTarget(kg);
        if (p != null) { move.power = p; notes.push(`Puissance selon le poids de la cible (${kg} kg) : ${p}.`); }
        break;
      }
      case "weight_ratio": {
        const atkKg = SPECIES_WEIGHT_KG[attacker.species];
        const defKg = SPECIES_WEIGHT_KG[defender.species];
        const p = powerByWeightRatio(atkKg, defKg);
        if (p != null) { move.power = p; notes.push(`Puissance selon le ratio de poids (${atkKg}/${defKg} kg) : ${p}.`); }
        break;
      }
      case "speed_ratio_gyro": {
        move.power = powerByGyroBall(atkSpeEff, defSpeEff);
        notes.push(`Puissance selon la Vitesse (${defSpeEff}/${atkSpeEff}) : ${move.power}.`);
        break;
      }
      case "speed_ratio_electro": {
        move.power = powerByElectroBall(atkSpeEff, defSpeEff);
        notes.push(`Puissance selon la Vitesse (${atkSpeEff}/${defSpeEff}) : ${move.power}.`);
        break;
      }
      case "user_hp_pct": {
        move.power = powerByUserHpPct(atkHpPct);
        notes.push(`Puissance selon les PV de l'attaquant (${atkHpPct.toFixed(0)}%) : ${move.power}.`);
        break;
      }
      case "user_hp_inverse": {
        move.power = powerByHpInverse(atkHpPct);
        notes.push(`Puissance selon les PV restants de l'attaquant (${atkHpPct.toFixed(0)}%) : ${move.power}.`);
        break;
      }
      case "target_hp_pct": {
        move.power = powerByTargetHpPct(defHpPct);
        notes.push(`Puissance selon les PV de la cible (${defHpPct.toFixed(0)}%) : ${move.power}.`);
        break;
      }
      case "stat_stage_self": {
        const boosts = sumPositiveStages(attacker.stages);
        move.power = 20 + 20 * boosts;
        notes.push(`Puissance selon les hausses de stat de l'attaquant (+${boosts}) : ${move.power}.`);
        break;
      }
      case "stat_stage_target": {
        const boosts = sumPositiveStages(defender.stages);
        move.power = Math.min(200, 60 + 20 * boosts);
        notes.push(`Puissance selon les hausses de stat de la cible (+${boosts}) : ${move.power}.`);
        break;
      }
      case "double_if_target_status": {
        if (defender.status) { move.power *= 2; notes.push("Puissance doublée (cible sous statut)."); }
        break;
      }
      case "double_if_target_poisoned": {
        if (defender.status === "poison" || defender.status === "poison_grave") {
          move.power *= 2; notes.push("Puissance doublée (cible empoisonnée).");
        }
        break;
      }
      case "double_if_target_low_hp": {
        if (defHpPct <= 50) { move.power *= 2; notes.push("Puissance doublée (PV de la cible ≤ 50%)."); }
        break;
      }
      case "double_if_user_status": {
        if (attacker.status) { move.power *= 2; notes.push("Puissance doublée (attaquant sous statut)."); }
        break;
      }
      case "target_hp_pct_100": {
        move.power = Math.max(1, Math.floor(100 * (defHpPct / 100)));
        notes.push(`Puissance selon les PV de la cible (${defHpPct.toFixed(0)}%) : ${move.power}.`);
        break;
      }
      // atk_uses_def / atk_uses_target_atk / def_uses_def_stat sont gérés
      // plus bas, au moment du choix des stats off/déf.
      default: break;
    }
  }
  if (!move.power && !DIRECT_DAMAGE_MECHANIC[move.name]) {
    return { error: "Capacité de statut (pas de dégâts directs)." };
  }

  // abilityActive (case à cocher côté UI) permet de désactiver manuellement
  // l'effet du talent quand il n'est pas actif dans la situation (ex :
  // Intimidation déjà appliquée, talent supprimé/ignoré...). Par défaut
  // (champ absent, ex : équipes de dresseurs) le talent est actif.
  const atkAbilityId = attacker.abilityActive !== false ? abilityIdByFrName(attacker.ability) : null;
  const defAbilityId = defender.abilityActive !== false ? abilityIdByFrName(defender.ability) : null;
  const atkItem = attacker.item || null;
  const defItem = defender.item || null;
  // Les objets sont saisis/stockés en FR (clés de CALC_ITEMS) : on traduit en
  // EN ici pour toutes les comparaisons (tables ci-dessus indexées en EN).
  const atkItemEn = atkItem ? (CALC_ITEMS[atkItem] || atkItem) : null;
  const defItemEn = defItem ? (CALC_ITEMS[defItem] || defItem) : null;

  const defTypes = defSpecies.types;
  const atkTypes = atkSpecies.types;

  if (checkImmunity(move.type, defAbilityId, defTypes, defItemEn)) {
    const reason = defItemEn === "Air Balloon" ? `${defItem} annule l'attaque (immunité Sol).` : `${abilityFrNameById(defAbilityId)} annule l'attaque.`;
    return { immune: true, rolls: [0], min: 0, max: 0, minPct: 0, maxPct: 0, notes: [reason] };
  }

  let effectiveness = typeMultiplier(move.type, defTypes);
  // Balle Fer (Iron Ball) : ancre le défenseur au sol, annule l'immunité Sol
  // du type Vol (on recalcule l'efficacité sans la composante Vol).
  if (move.type === "Sol" && defItemEn === "Iron Ball" && defTypes.includes("Vol")) {
    const groundedTypes = defTypes.filter(t => t !== "Vol");
    effectiveness = groundedTypes.length ? typeMultiplier(move.type, groundedTypes) : 1;
    notes.push(`${defItem} : ancre le défenseur au sol (immunité Vol au Sol annulée).`);
  }
  if (effectiveness === 0) {
    return { immune: true, rolls: [0], min: 0, max: 0, minPct: 0, maxPct: 0, notes: ["Immunité de type."] };
  }

  // Capacités à dégâts fixes/directs (K.O. Direct, Draco-Rage, Frappe Atlas,
  // Effort, Tout ou Rien, etc.) : contournent la formule standard, ne
  // dépendent ni de l'Attaque/Défense ni de la météo/objets/talents (hormis
  // l'immunité de type déjà vérifiée ci-dessus).
  const directMechanic = DIRECT_DAMAGE_MECHANIC[move.name];
  if (directMechanic) {
    let dmg = 0;
    let guaranteedKo = false;
    switch (directMechanic.type) {
      case "fixed":
        dmg = directMechanic.value;
        notes.push(`Dégâts fixes : ${dmg}.`);
        break;
      case "level":
        dmg = attacker.level;
        notes.push(`Dégâts = niveau de l'attaquant : ${dmg}.`);
        break;
      case "half_target_hp":
        dmg = Math.max(1, Math.floor(defCurrentHp / 2));
        notes.push(`Dégâts = moitié des PV actuels de la cible : ${dmg}.`);
        break;
      case "endeavor":
        dmg = Math.max(0, defCurrentHp - atkCurrentHp);
        if (dmg <= 0) {
          return { error: "Effort échoue (l'attaquant n'a pas moins de PV que la cible).", notes };
        }
        notes.push(`Dégâts = différence de PV actuels (cible − attaquant) : ${dmg}.`);
        break;
      case "final_gambit":
        dmg = atkCurrentHp;
        notes.push(`Dégâts = PV actuels de l'attaquant : ${dmg}.`);
        break;
      case "ohko":
        dmg = defCurrentHp;
        guaranteedKo = true;
        notes.push("K.O. Direct : dégâts = PV actuels de la cible (K.O. garanti si le coup touche).");
        break;
    }
    dmg = Math.max(0, Math.min(dmg, defCurrentHp));
    return {
      rolls: [dmg], min: dmg, max: dmg,
      minPct: Math.min(100, +(100 * dmg / defHp).toFixed(1)),
      maxPct: Math.min(100, +(100 * dmg / defHp).toFixed(1)),
      defHp, defCurrentHp,
      minPctCurrent: Math.min(100, +(100 * dmg / defCurrentHp).toFixed(1)),
      maxPctCurrent: Math.min(100, +(100 * dmg / defCurrentHp).toFixed(1)),
      effectiveness, notes, directDamage: true,
      hitsToKo: dmg > 0 ? Math.ceil(defCurrentHp / dmg) : Infinity,
      hitsToKoMin: dmg > 0 ? Math.ceil(defCurrentHp / dmg) : Infinity,
      koNow: guaranteedKo || dmg >= defCurrentHp,
      koNowGuaranteed: guaranteedKo || dmg >= defCurrentHp,
    };
  }

  const isPhysical = move.cat === "Physique";
  const stages = attacker.stages || {};
  const dstages = defender.stages || {};

  // Choix stat off/def, avec prise en compte du critique (ignore baisses
  // atk / hausses def du côté concerné, mécanique standard).
  const critIgnoresDrop = !!field.crit;
  // Damoclès (Body Press) : utilise la Défense de l'attaquant à la place
  // de l'Attaque/Attaque Spéciale. Choc Psy/Frappe Psy/Lame Ointe :
  // catégorie Spéciale mais défense = Défense (pas Déf. Spé.) de la cible.
  const atkUsesDef = mechanic === "atk_uses_def";
  const atkUsesTargetAtk = mechanic === "atk_uses_target_atk";
  const defUsesDefStat = mechanic === "def_uses_def_stat";
  const atkStageKey = atkUsesDef ? "def" : (atkUsesTargetAtk ? "atk" : (isPhysical ? "atk" : "spa"));
  const defStageKey = defUsesDefStat ? "def" : (isPhysical ? "def" : "spd");
  // Tricherie (Foul Play) : la stat offensive vient de la cible (avec ses
  // propres modificateurs), pas de l'attaquant.
  const atkStatsSource = atkUsesTargetAtk ? defStats : atkStats;
  const atkStagesSource = atkUsesTargetAtk ? dstages : stages;
  let atkStage = atkStagesSource[atkStageKey] || 0;
  let defStage = dstages[defStageKey] || 0;

  // Intimidation (côté défenseur) : abaisse l'Attaque (physique) de
  // l'attaquant de 1 palier à l'entrée en combat du défenseur. Ne s'applique
  // qu'à la propre stat d'Attaque de l'attaquant (pas Damoclès/Tricherie).
  if (!atkUsesDef && !atkUsesTargetAtk && atkStageKey === "atk" && defAbilityId === "INTIMIDATE") {
    if (atkAbilityId === "CLEAR_BODY" || atkAbilityId === "WHITE_SMOKE" || atkAbilityId === "HYPER_CUTTER") {
      notes.push(`${abilityFrNameById(atkAbilityId)} bloque l'Intimidation.`);
    } else if (atkAbilityId === "CONTRARY") {
      atkStage += 1;
      notes.push("Intimidation + Contestation (+1 Attaque au lieu de -1).");
    } else if (atkAbilityId === "SIMPLE") {
      atkStage -= 2;
      notes.push("Intimidation + Simple (-2 Attaque).");
    } else if (atkItemEn === "White Herb") {
      notes.push(`${atkItem} annule la baisse d'Attaque due à l'Intimidation (objet consommé).`);
    } else {
      atkStage -= 1;
      notes.push("Intimidation (-1 Attaque de l'attaquant).");
    }
  }

  // Graines de terrain (côté défenseur) : +1 palier Déf/Déf. Spé si le
  // terrain correspondant est actif (consommées après usage, on suppose ici
  // qu'elles sont encore tenues).
  const terrainSeed = defItemEn ? TERRAIN_SEED_ITEMS[defItemEn] : null;
  if (terrainSeed && field.terrain === terrainSeed.terrain && defStageKey === terrainSeed.stat) {
    defStage += 1;
    notes.push(`${defItem} (+1 palier ${terrainSeed.stat === "def" ? "Défense" : "Défense Spéciale"}, terrain actif).`);
  }

  if (critIgnoresDrop) {
    if (atkStage < 0) atkStage = 0;
    if (defStage > 0) defStage = 0;
  }

  // Baies boost de stat à PV bas (Baie Lichii/Pitaye) : +1 palier sur la
  // stat offensive utilisée, si l'attaquant est à ≤25% de ses PV max
  // (consommées après usage, on suppose ici qu'elles sont encore tenues).
  if (!atkUsesDef && !atkUsesTargetAtk) {
    const atkHpPctNow = 100 * atkCurrentHp / atkStats.hp;
    const lowHpForBerry = attacker.currentHp != null ? atkHpPctNow <= 25 : !!attacker.lowHp;
    const berryStatKey = atkItemEn ? STAT_BOOST_BERRIES[atkItemEn] : null;
    if (lowHpForBerry && berryStatKey && berryStatKey === atkStageKey) {
      atkStage += 1;
      notes.push(`${atkItem} (+1 palier ${atkStageKey === "atk" ? "Attaque" : "Attaque Spéciale"}, PV ≤ 25%).`);
    }
  }

  let atkStat = applyStage(atkStatsSource[atkStageKey], atkStage);
  let defStat = applyStage(defStats[defStageKey], defStage);

  // Talents modifiant directement la stat offensive (uniquement quand la
  // stat utilisée est bien l'Attaque/Attaque Spéciale propre à l'attaquant :
  // ne s'applique pas à Damoclès (utilise la Défense) ni à Tricherie
  // (utilise l'Attaque de la cible)).
  const usesOwnOffensiveStat = !atkUsesDef && !atkUsesTargetAtk;
  if (usesOwnOffensiveStat && isPhysical && (atkAbilityId === "HUGE_POWER" || atkAbilityId === "PURE_POWER")) {
    atkStat = atkStat * 2;
    notes.push(`${abilityFrNameById(atkAbilityId)} double l'Attaque.`);
  }
  if (usesOwnOffensiveStat && isPhysical && atkAbilityId === "HUSTLE") {
    atkStat = Math.floor(atkStat * 1.5);
    notes.push("Agitation (+50% Attaque).");
  }
  if (usesOwnOffensiveStat && isPhysical && atkAbilityId === "GUTS" && attacker.status) {
    atkStat = Math.floor(atkStat * 1.5);
    notes.push("Cran (+50% Attaque car statut).");
  }

  // Objets qui doublent une stat pour une espèce précise (Masse Os,
  // Ballelumière). S'applique uniquement quand la stat utilisée est bien
  // celle propre à l'attaquant (pas Damoclès/Tricherie).
  if (usesOwnOffensiveStat) {
    if (atkStageKey === "atk" && atkItemEn === "Thick Club" && THICK_CLUB_SPECIES.has(attacker.species)) {
      atkStat = atkStat * 2;
      notes.push("Masse Os (+100% Attaque).");
    }
    if ((atkStageKey === "atk" || atkStageKey === "spa") && atkItemEn === "Light Ball" && LIGHT_BALL_SPECIES.has(attacker.species)) {
      atkStat = atkStat * 2;
      notes.push(`Ballelumière (+100% ${atkStageKey === "atk" ? "Attaque" : "Attaque Spéciale"}).`);
    }
  }
  if (usesOwnOffensiveStat && isPhysical && atkAbilityId === "GORILLA_TACTICS") {
    atkStat = Math.floor(atkStat * 1.5);
    notes.push("Tacticien (+50% Attaque).");
  }

  // Objets modifiant la stat défensive
  if (defItemEn && norm(defItemEn) === norm("Eviolite") && defender.notFullyEvolved) {
    defStat = Math.floor(defStat * 1.5);
    notes.push("Évoluroc (+50% Déf/Déf.Spé, non complètement évolué).");
  }
  if (defItemEn && norm(defItemEn) === norm("Assault Vest") && defStageKey === "spd") {
    defStat = Math.floor(defStat * 1.5);
    notes.push("Veste de Combat (+50% Défense Spéciale).");
  }

  // Écaille Spéciale : +50% Déf/Déf.Spé si le défenseur a un statut
  if (defAbilityId === "MARVEL_SCALE" && defender.status) {
    defStat = Math.floor(defStat * 1.5);
    notes.push("Écaille Spéciale (+50% Déf/Déf.Spé, statut).");
  }

  // Météo : boosts de stat passifs (Sable +50% Déf.Spé Roche, Neige +50% Déf Glace)
  if (field.weather === "sable" && defStageKey === "spd" && defTypes.includes("Roche")) {
    defStat = Math.floor(defStat * 1.5);
    notes.push("Tempête de sable (+50% Défense Spéciale, type Roche).");
  }
  if (field.weather === "neige" && defStageKey === "def" && defTypes.includes("Glace")) {
    defStat = Math.floor(defStat * 1.5);
    notes.push("Neige (+50% Défense, type Glace).");
  }

  // Dégâts de base
  const level = attacker.level;
  let base = Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * move.power * atkStat / defStat) / 50) + 2;

  let mult = 1;

  // Cibles multiples : seules les capacités qui touchent réellement les deux
  // adversaires (capacités "spread") subissent le malus, pas toutes les capacités.
  if (field.multiTarget && SPREAD_MOVES.has(move.name)) {
    mult *= 0.75;
    notes.push("Cible multiple (capacité qui touche les deux adversaires, -25%).");
  }

  // Météo
  const w = field.weather;
  if (w === "pluie") {
    if (move.type === "Eau") { mult *= 1.5; notes.push("Pluie (+50% Eau)."); }
    else if (move.type === "Feu") { mult *= 0.5; notes.push("Pluie (-50% Feu)."); }
  } else if (w === "soleil") {
    if (move.type === "Feu") { mult *= 1.5; notes.push("Soleil (+50% Feu)."); }
    else if (move.type === "Eau") { mult *= 0.5; notes.push("Soleil (-50% Eau)."); }
  }

  // Terrain (uniquement si Pokémon au sol — non modélisé ici, supposé au sol)
  const terr = field.terrain;
  if (terr === "electrik" && move.type === "Electrik") { mult *= 1.3; notes.push("Champ Électrifié (+30%)."); }
  if (terr === "herbu" && move.type === "Plante") { mult *= 1.3; notes.push("Champ Herbu (+30%)."); }
  if (terr === "psy" && move.type === "Psy") { mult *= 1.3; notes.push("Champ Psychique (+30%)."); }
  if (terr === "brumeux" && move.type === "Dragon") { mult *= 0.5; notes.push("Champ Brumeux (-50% Dragon)."); }

  // Critique
  let critMult = 1;
  if (field.crit) {
    critMult = (atkAbilityId === "SNIPER") ? 2.25 : 1.5;
    notes.push(`Coup critique (x${critMult}).`);
  }

  // STAB
  let stab = 1;
  const hasStab = atkTypes.includes(move.type);
  if (hasStab) {
    stab = (atkAbilityId === "ADAPTABILITY") ? 2 : 1.5;
    notes.push(atkAbilityId === "ADAPTABILITY" ? "STAB Adaptabilité (x2)." : "STAB (x1.5).");
  }

  // Talents bas-PV (Blaze/Torrent/Overgrow/Swarm) — déduits des PV actuels si fournis
  const LOW_HP_ABILITIES = {
    BLAZE: "Feu", TORRENT: "Eau", OVERGROW: "Plante", SWARM: "Insecte",
  };
  const atkIsLowHp = attacker.currentHp != null ? (attacker.currentHp / atkStats.hp <= 1 / 3) : !!attacker.lowHp;
  if (atkIsLowHp && LOW_HP_ABILITIES[atkAbilityId] === move.type) {
    mult *= 1.5;
    notes.push(`${abilityFrNameById(atkAbilityId)} (PV bas, +50% capacité du même type).`);
  }

  // Efficacité de type
  mult *= effectiveness;
  if (effectiveness > 1) notes.push(`Super efficace (x${effectiveness}).`);
  else if (effectiveness < 1) notes.push(`Peu efficace (x${effectiveness}).`);

  // Talents liés à l'efficacité
  if (effectiveness < 1 && atkAbilityId === "TINTED_LENS") {
    mult *= 2;
    notes.push("Filtre Teinté (dégâts doublés, peu efficace).");
  }
  if (effectiveness > 1 && (defAbilityId === "SOLID_ROCK" || defAbilityId === "FILTER" || defAbilityId === "PRISM_ARMOR")) {
    mult *= 0.75;
    notes.push(`${abilityFrNameById(defAbilityId)} (-25%, super efficace).`);
  }
  if (effectiveness > 0 && effectiveness < 1 && atkAbilityId === "TINTED_LENS") {
    // déjà géré ci-dessus (couvre 0.5, 0.25...)
  }

  // Baie résistance du défenseur : -50% si le coup est super efficace et
  // correspond au type de la baie (consommée après usage, on suppose ici
  // qu'elle est encore tenue au moment du calcul).
  if (effectiveness > 1 && defItemEn && RESIST_BERRIES[defItemEn] === move.type) {
    mult *= 0.5;
    notes.push(`${defItem} (-50%, super efficace, type ${move.type}).`);
  }

  // Multiscale / Shadow Shield
  if ((defAbilityId === "MULTISCALE" || defAbilityId === "SHADOW_SHIELD") && defender.fullHp) {
    mult *= 0.5;
    notes.push(`${abilityFrNameById(defAbilityId)} (-50%, PV pleins).`);
  }

  // Thick Fat
  if (defAbilityId === "THICK_FAT" && (move.type === "Feu" || move.type === "Glace")) {
    mult *= 0.5;
    notes.push("Isograisse (-50%, Feu/Glace).");
  }

  // Brûlure (attaquant physique, sans Cran, hors Façade qui ignore
  // explicitement le malus de brûlure)
  if (isPhysical && attacker.status === "brulure" && atkAbilityId !== "GUTS" && norm(move.name || "") !== norm("Façade")) {
    mult *= 0.5;
    notes.push("Brûlure (-50% dégâts physiques).");
  }

  // Écrans (ignorés si critique)
  if (!field.crit) {
    if (field.auroraveil) { mult *= 0.5; notes.push("Voile Aurore (-50%)."); }
    else if (isPhysical && field.reflect) { mult *= 0.5; notes.push("Protection (-50% Physique)."); }
    else if (!isPhysical && field.lightscreen) { mult *= 0.5; notes.push("Mur Lumière (-50% Spéciale)."); }
  }

  // Objets offensifs (comparaisons faites sur le nom EN traduit depuis CALC_ITEMS)
  if (atkItemEn) {
    const itemNorm = norm(atkItemEn);
    if (itemNorm === norm("Choice Band") && isPhysical) { mult *= 1.5; notes.push(`${atkItem} (+50% Attaque, capacité physique).`); }
    if (itemNorm === norm("Choice Specs") && !isPhysical) { mult *= 1.5; notes.push(`${atkItem} (+50% Att. Spé, capacité spéciale).`); }
    if (itemNorm === norm("Life Orb")) { mult *= 1.3; notes.push(`${atkItem} (+30%).`); }
    if (itemNorm === norm("Muscle Band") && isPhysical) { mult *= 1.1; notes.push(`${atkItem} (+10%, capacité physique).`); }
    if (itemNorm === norm("Wise Glasses") && !isPhysical) { mult *= 1.1; notes.push(`${atkItem} (+10%, capacité spéciale).`); }
    if (itemNorm === norm("Expert Belt") && effectiveness > 1) { mult *= 1.2; notes.push(`${atkItem} (+20%, super efficace).`); }
    const boostType = TYPE_BOOST_ITEMS[atkItemEn];
    if (boostType && boostType === move.type) { mult *= 1.2; notes.push(`${atkItem} (+20%, type ${boostType}).`); }
    const dualBoostTypes = DUAL_TYPE_BOOST_ITEMS[atkItemEn];
    if (dualBoostTypes && dualBoostTypes.includes(move.type)) { mult *= 1.2; notes.push(`${atkItem} (+20%, type ${move.type}).`); }
    const gemType = GEM_ITEMS[atkItemEn];
    if (gemType && gemType === move.type) { mult *= 1.3; notes.push(`${atkItem} (+30%, type ${gemType}, consommée après usage).`); }
  }

  // Roll aléatoire 85%-100% (16 valeurs, comme en jeu)
  const rolls = [];
  for (let n = 0; n <= 15; n++) {
    const randPct = (85 + n) / 100;
    let dmg = Math.floor(base * critMult * randPct * stab * mult);
    if (dmg < 1) dmg = 1;
    rolls.push(dmg);
  }

  const min = Math.min(...rolls);
  const max = Math.max(...rolls);
  const minPct = Math.min(100, +(100 * min / defHp).toFixed(1));
  const maxPct = Math.min(100, +(100 * max / defHp).toFixed(1));
  const minPctCurrent = Math.min(100, +(100 * min / defCurrentHp).toFixed(1));
  const maxPctCurrent = Math.min(100, +(100 * max / defCurrentHp).toFixed(1));
  const hitsToKo = max > 0 ? Math.ceil(defCurrentHp / max) : Infinity;
  const hitsToKoMin = min > 0 ? Math.ceil(defCurrentHp / min) : Infinity;
  let koNow = max >= defCurrentHp;
  let koNowGuaranteed = min >= defCurrentHp;

  // Ceinture Force (Focus Sash) / Solidrock (Sturdy) : à PV pleins, le
  // défenseur survit toujours avec 1 PV face à un coup qui l'aurait K.O.
  const survivorItem = defItemEn === "Focus Sash" ? defItem : null;
  const survivorAbility = defAbilityId === "STURDY" ? abilityFrNameById(defAbilityId) : null;
  if (defender.fullHp && defCurrentHp > 1 && (survivorItem || survivorAbility) && koNow) {
    notes.push(`${survivorItem || survivorAbility} (PV pleins) : le défenseur survit avec 1 PV au lieu d'être K.O.`);
    koNow = false;
    koNowGuaranteed = false;
  }

  return {
    rolls, min, max, minPct, maxPct,
    defHp, defCurrentHp, minPctCurrent, maxPctCurrent,
    atkStatUsed: atkStat, defStatUsed: defStat,
    effectiveness, stab: hasStab, notes,
    hitsToKo, hitsToKoMin, koNow, koNowGuaranteed,
    atkStats, defStats,
  };
}
