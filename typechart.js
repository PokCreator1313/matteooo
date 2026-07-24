// Table d'efficacité des types (Gen 6+ standard, avec Fée). Clés en français,
// alignées sur les valeurs produites par TYPES_MAP (voir data.js).
// TYPE_CHART[typeAttaquant][typeDefenseur] = multiplicateur (défaut 1 si absent)
const ALL_TYPES = [
 "Normal","Combat","Vol","Poison","Sol","Roche","Insecte","Spectre","Acier",
 "Feu","Eau","Plante","Electrik","Psy","Glace","Dragon","Tenebres","Fee"
];

const TYPE_CHART = {
 Normal:   { Roche:0.5, Acier:0.5, Spectre:0 },
 Combat:   { Normal:2, Vol:0.5, Poison:0.5, Roche:2, Insecte:0.5, Spectre:0, Acier:2, Psy:0.5, Glace:2, Tenebres:2, Fee:0.5 },
 Vol:      { Combat:2, Roche:0.5, Insecte:2, Acier:0.5, Electrik:0.5, Plante:2 },
 Poison:   { Poison:0.5, Sol:0.5, Roche:0.5, Spectre:0.5, Acier:0, Fee:2, Plante:2 },
 Sol:      { Vol:0, Poison:2, Roche:2, Acier:2, Feu:2, Electrik:2, Plante:0.5, Insecte:0.5 },
 Roche:    { Combat:0.5, Vol:2, Sol:0.5, Acier:0.5, Feu:2, Insecte:2, Glace:2 },
 Insecte:  { Combat:0.5, Vol:0.5, Poison:0.5, Spectre:0.5, Acier:0.5, Feu:0.5, Plante:2, Psy:2, Tenebres:2 },
 Spectre:  { Normal:0, Spectre:2, Tenebres:0.5, Psy:2 },
 Acier:    { Roche:2, Acier:0.5, Feu:0.5, Eau:0.5, Electrik:0.5, Glace:2, Fee:2 },
 Feu:      { Roche:0.5, Acier:2, Feu:0.5, Eau:0.5, Plante:2, Glace:2, Insecte:2, Dragon:0.5 },
 Eau:      { Sol:2, Roche:2, Feu:2, Eau:0.5, Plante:0.5, Dragon:0.5 },
 Plante:   { Vol:0.5, Poison:0.5, Sol:2, Roche:2, Acier:0.5, Feu:0.5, Eau:2, Plante:0.5, Insecte:0.5, Dragon:0.5 },
 Electrik: { Vol:2, Sol:0, Eau:2, Plante:0.5, Electrik:0.5, Dragon:0.5 },
 Psy:      { Combat:2, Poison:2, Acier:0.5, Psy:0.5, Tenebres:0 },
 Glace:    { Vol:2, Sol:2, Roche:0.5, Acier:0.5, Feu:0.5, Eau:0.5, Plante:2, Glace:0.5, Dragon:2 },
 Dragon:   { Acier:0.5, Dragon:2, Fee:0 },
 Tenebres: { Combat:0.5, Spectre:2, Psy:2, Tenebres:0.5, Fee:0.5 },
 Fee:      { Combat:2, Poison:0.5, Acier:0.5, Feu:0.5, Dragon:2, Tenebres:2 },
};

function typeMultiplier(attackType, defendTypes) {
  let mult = 1;
  const row = TYPE_CHART[attackType] || {};
  for (const t of defendTypes) {
    mult *= (row[t] !== undefined ? row[t] : 1);
  }
  return mult;
}

// Meilleur multiplicateur qu'un Pokémon attaquant (typé attackerTypes, via ses
// propres types en attaque STAB) peut infliger à un défenseur (defendTypes).
function bestOffensiveMultiplier(attackerTypes, defendTypes) {
  let best = 0;
  for (const at of attackerTypes) {
    const m = typeMultiplier(at, defendTypes);
    if (m > best) best = m;
  }
  return best;
}

// Pire multiplicateur subi par un défenseur (defendTypes) face aux types
// (STAB) d'un attaquant (attackerTypes).
function worstDefensiveMultiplier(defendTypes, attackerTypes) {
  let worst = 0;
  for (const at of attackerTypes) {
    const m = typeMultiplier(at, defendTypes);
    if (m > worst) worst = m;
  }
  return worst;
}

// Renvoie {weak:[...], resist:[...], immune:[...]} pour un Pokémon de types donnés
function typeProfile(defendTypes) {
  const weak = [], resist = [], immune = [];
  for (const t of ALL_TYPES) {
    const m = typeMultiplier(t, defendTypes);
    if (m === 0) immune.push(t);
    else if (m >= 2) weak.push({ type: t, mult: m });
    else if (m <= 0.5) resist.push({ type: t, mult: m });
  }
  return { weak, resist, immune };
}
