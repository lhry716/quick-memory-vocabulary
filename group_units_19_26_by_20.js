const fs = require('fs');

const source = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份 2_Unit19-26_完整單字卡.json';
const output = '/Users/lhry716/Documents/快速記憶法/快速記憶法備份 2_Unit19-26_完整單字卡_每20張分組.json';
const db = JSON.parse(fs.readFileSync(source, 'utf8'));
const now = Date.now();
const targetUnitIds = new Set(Array.from({ length: 8 }, (_, index) => `photo-unit-${index + 19}`));

// Textbook order, so each 20-card group stays as close as possible to the
// page sequence and keeps a headword with its related cards.
const order = {
  19: ['allergy','antibiotic','artery','bruise','caffeine','calm','capsule','category','cause','checkup','cholesterol','chronic','clinic','complexion','compulsory','contagious','contaminate'],
  20: ['cosmetic','countless','cradle','detergent','diagnose','disable','dose','emerge','environment','epidemic','faint','fertile','gender','handicap','herb'],
  21: ['heredity','hospitalize','immunity','infect','influenza','inject','injury','insane','internal','mental','mortality','muscle','nervous','nourish','obsess','optimistic','paralysis','pharmacy'],
  22: ['pregnant','recover','resistance','safety','sanitation','skeleton','sneeze','spine','sprain','symptom','therapy','vaccinate','vigorous','virus','vomit','yoga'],
  23: ['accustom','alter','altitude','Antarctic','antenna','balance','barren','blossom','breed','comet','consequence','conservation','creature','crystal','demolish','depletion'],
  24: ['desert','devastating','dissolve','diversity','drought','dump','ecology','emission','evoke','exposure','extent','extinct','famine','forecast','fossil','fragile','glacier'],
  25: ['global','humanity','hybrid','impact','inspect','mammal','marine','massive','migrant','migration','moisture','native','offspring','outbreak','perish','petroleum','predator','prey'],
  26: ['prosper','reduce','refuge','reproduce','reptile','scene','soil','species','struggle','sustainable','temperature','trace','tropical','vapor','vegetation','vibrate','wildlife'],
};

const formParent = {
  allergic:'allergy', calmness:'calm', categorize:'category', causal:'cause', clinical:'clinic',
  cosmetics:'cosmetic', count:'countless', diagnosis:'diagnose', disabled:'disable', disability:'disable', dosage:'dose', emergence:'emerge', environmental:'environment', fertilizer:'fertile', fertility:'fertile', handicapped:'handicap', herbal:'herb', herbalist:'herb',
  hereditary:'heredity', hospital:'hospitalize', immune:'immunity', infection:'infect', infectious:'infect', injure:'injury', mentality:'mental', mortal:'mortality', muscular:'muscle', nourishment:'nourish', obsession:'obsess', optimism:'optimistic', paralyze:'paralysis', pharmacist:'pharmacy',
  pregnancy:'pregnant', recovery:'recover', resist:'resistance', safe:'safety', spinal:'spine', vaccine:'vaccinate', vigor:'vigorous',
  accustomed:'accustom', breeding:'breed', consequential:'consequence', consequently:'consequence', conserve:'conservation', demolition:'demolish', deplete:'depletion',
  devastate:'devastating', dissolution:'dissolve', diverse:'diversity', ecological:'ecology', emit:'emission', expose:'exposure', extension:'extent', extend:'extent', extinction:'extinct',
  globe:'global', human:'humanity', inspection:'inspect', mass:'massive', migration:'migrant', moist:'moisture',
  prosperity:'prosper', reduction:'reduce', refugee:'refuge', reproduction:'reproduce', scenery:'scene', scenic:'scene', sustain:'sustainable', vaporize:'vapor', vegetable:'vegetation', vegetarian:'vegetation', vibration:'vibrate',
};

db.studyGroups = db.studyGroups.filter((group) => !targetUnitIds.has(group.unitId));
for (let number = 19; number <= 26; number += 1) {
  const unitId = `photo-unit-${number}`;
  const rank = new Map(order[number].map((term, index) => [term.toLowerCase(), index]));
  const cards = db.words
    .map((word, originalIndex) => ({ word, originalIndex }))
    .filter(({ word }) => word.unitId === unitId)
    .sort((a, b) => {
      const aParent = (formParent[a.word.term.toLowerCase()] || a.word.anchor || a.word.term).toLowerCase();
      const bParent = (formParent[b.word.term.toLowerCase()] || b.word.anchor || b.word.term).toLowerCase();
      const byPage = (rank.get(aParent) ?? 999) - (rank.get(bParent) ?? 999);
      return byPage || a.originalIndex - b.originalIndex;
    })
    .map(({ word }) => word.id);
  for (let offset = 0, groupNumber = 1; offset < cards.length; offset += 20, groupNumber += 1) {
    db.studyGroups.push({
      id: `generated-photo-unit-${number}-${groupNumber}`,
      unitId,
      groupNumber,
      wordIds: cards.slice(offset, offset + 20),
      createdAt: now,
    });
  }
}

db.updatedAt = now;
fs.writeFileSync(output, JSON.stringify(db, null, 2) + '\n');
const report = Object.fromEntries(Array.from({ length: 8 }, (_, index) => index + 19).map((number) => {
  const unitId = `photo-unit-${number}`;
  const groups = db.studyGroups.filter((group) => group.unitId === unitId);
  return [number, groups.map((group) => group.wordIds.length)];
}));
console.log(JSON.stringify({ output, groups: report }, null, 2));
