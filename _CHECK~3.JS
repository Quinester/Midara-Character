// ---------- Constants ----------
const DISCIPLINES = ['Assemblage', 'Cruor', 'Martial', 'Sanctus', 'Subterfuge'];
const DISCIPLINE_VARS = {
  Assemblage: '--d-assemblage',
  Cruor: '--d-cruor',
  Martial: '--d-martial',
  Sanctus: '--d-sanctus',
  Subterfuge: '--d-subterfuge',
};

// Official per-slot equip limits from the Middara rulebook's "Item Limits" box
// (pg. 24 of the 1.2 Final rulebook): 2 Hands of Weapons, 1 Armor, 1 Core,
// 1 Accessory, 3 Relics, 3 Consumables. Weapon is tracked here as a simple
// equipped-item-count cap of 2 (approximating "2 hands") — this doesn't yet
// distinguish 1-Handed vs 2-Handed weapons, since that isn't tracked per-item
// in the data yet, so it won't catch two 2-Handed weapons being equipped at
// once. Any slot not listed here (e.g. "Other") has no limit. Per-character
// exceptions (e.g. Rook Lars's extra Consumable) live on c.equipLimitOverrides.
const EQUIP_LIMITS = {
  Weapon: 2,
  Armor: 1,
  Core: 1,
  Accessory: 1,
  Relic: 3,
  Consumable: 3,
};

// ---------- State ----------
let characters = [];
let activeId = null;
let saveTimer = null;

let library = { items: [], abilities: [], characterTemplates: [] };
let librarySaveTimer = null;
let currentView = 'character'; // 'character' | 'library'

// ---------- Helpers ----------
function uid() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function blankCharacter(name) {
  const disciplines = {};
  DISCIPLINES.forEach((d) => {
    disciplines[d] = { points: 0, notes: '' };
  });
  return {
    id: uid(),
    name: name || 'New Character',
    className: '',
    xp: 0,
    health: { current: 10, max: 10 },
    armor: 0,
    defense: 10,
    movement: 6,
    stamina: 3,
    presence: 0,
    lore: 0,
    agility: 0,
    perception: 0,
    strength: 0,
    conviction: '',
    casting: '',
    statusEffects: [],
    disciplines,
    abilities: [],
    inventory: [],
    notes: '',
    esper: blankSummon(),
    familiar: blankSummon(),
    // Per-character overrides to the default EQUIP_LIMITS (e.g. Rook Lars's
    // extra Consumable slot: { Consumable: 4 }). Empty by default.
    equipLimitOverrides: {},
  };
}

function blankSummon() {
  return {
    active: false,
    name: '',
    health: { current: 0, max: 0 },
    armor: 0,
    defense: 0,
    movement: 0,
    statusEffects: [],
    abilities: [],
    notes: '',
  };
}

function getActive() {
  return characters.find((c) => c.id === activeId) || null;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.api.saveCharacters(characters);
  }, 300);
}

function scheduleLibrarySave() {
  clearTimeout(librarySaveTimer);
  librarySaveTimer = setTimeout(() => {
    window.api.saveLibrary(library);
  }, 300);
}

// ---------- Init ----------
async function init() {
  characters = (await window.api.loadCharacters()) || [];
  // normalize any missing fields from older saves
  characters.forEach(normalizeCharacter);
  if (characters.length > 0) activeId = characters[0].id;

  library = (await window.api.loadLibrary()) || { items: [], abilities: [], characterTemplates: [] };
  normalizeLibrary();

  populateDisciplineSelect();
  populateLibraryDisciplineSelect();
  populateItemLibrarySelect();
  populateAbilityLibrarySelect();
  populateAllSummonLibrarySelects();

  renderSidebar();
  renderSheet();
  renderLibraryItems();
  renderLibraryAbilities();
  renderLibraryEspers();
  renderLibraryTemplates();
  showView('character');
  bindStaticListeners();
}

function normalizeLibrary() {
  if (!Array.isArray(library.items)) library.items = [];
  if (!Array.isArray(library.abilities)) library.abilities = [];
  if (!Array.isArray(library.characterTemplates)) library.characterTemplates = [];
  if (!Array.isArray(library.espers)) library.espers = [];
  library.items.forEach((it) => {
    if (typeof it.rarity !== 'string') it.rarity = '';
    // Most items have exactly 1 physical copy in the base game; only items with
    // more than 1 copy carry an explicit quantity in the seed file, so anything
    // missing/invalid safely defaults to 1 rather than needing every item edited.
    if (typeof it.quantity !== 'number' || it.quantity < 1) it.quantity = 1;
    // "Unique" is an orthogonal tag, not a rarity tier — an item can be e.g.
    // Mundane AND Unique at once, so it's tracked as its own boolean.
    if (typeof it.unique !== 'boolean') it.unique = false;
  });
}

// ---------- Item availability (quantity vs. in-play) ----------
// Counts how many copies of each item name are currently sitting in ANY
// character's inventory (not just the active one), so the random-item picker
// can respect real remaining availability instead of an infinite supply.
function getInPlayCounts() {
  const counts = new Map();
  characters.forEach((c) => {
    (c.inventory || []).forEach((it) => {
      const key = (it.name || '').trim().toLowerCase();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return counts;
}

function getRemainingCount(libItem, inPlayCounts) {
  const counts = inPlayCounts || getInPlayCounts();
  const key = (libItem.name || '').trim().toLowerCase();
  const inPlay = counts.get(key) || 0;
  const qty = typeof libItem.quantity === 'number' && libItem.quantity > 0 ? libItem.quantity : 1;
  return Math.max(0, qty - inPlay);
}

// Weighted random pick: an item with 4 remaining copies is 4x more likely to be
// drawn than one with 1 remaining copy, matching a shuffled-deck draw.
function pickRandomItem(candidates, inPlayCounts) {
  const weighted = candidates
    .map((it) => ({ item: it, weight: getRemainingCount(it, inPlayCounts) }))
    .filter((w) => w.weight > 0);
  if (weighted.length === 0) return null;
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let r = Math.random() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return w.item;
  }
  return weighted[weighted.length - 1].item;
}

function normalizeCharacter(c) {
  if (!c.disciplines) c.disciplines = {};
  DISCIPLINES.forEach((d) => {
    if (!c.disciplines[d]) c.disciplines[d] = { points: 0, notes: '' };
  });
  if (!c.statusEffects) c.statusEffects = [];
  if (!c.abilities) c.abilities = [];
  if (!c.inventory) c.inventory = [];
  c.inventory.forEach((it) => {
    if (typeof it.rarity !== 'string') it.rarity = '';
    if (typeof it.unique !== 'boolean') it.unique = false;
  });
  if (!c.health) c.health = { current: 10, max: 10 };
  if (typeof c.notes !== 'string') c.notes = '';
  if (typeof c.stamina !== 'number') c.stamina = 3;
  c.stamina = Math.max(0, Math.min(5, c.stamina));
  ['presence', 'lore', 'agility', 'perception', 'strength'].forEach((f) => {
    if (typeof c[f] !== 'number') c[f] = 0;
  });
  if (typeof c.conviction !== 'string') c.conviction = '';
  if (typeof c.casting !== 'string') c.casting = '';
  if (!c.equipLimitOverrides || typeof c.equipLimitOverrides !== 'object') c.equipLimitOverrides = {};

  ['esper', 'familiar'].forEach((kind) => {
    if (!c[kind]) c[kind] = blankSummon();
    const s = c[kind];
    if (typeof s.active !== 'boolean') s.active = false;
    if (typeof s.name !== 'string') s.name = '';
    if (!s.health) s.health = { current: 0, max: 0 };
    if (!Array.isArray(s.statusEffects)) s.statusEffects = [];
    if (!Array.isArray(s.abilities)) s.abilities = [];
    if (typeof s.notes !== 'string') s.notes = '';
    if (typeof s.armor !== 'number') s.armor = 0;
    if (typeof s.defense !== 'number') s.defense = 0;
    if (typeof s.movement !== 'number') s.movement = 0;
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Sidebar ----------
function renderSidebar() {
  const list = document.getElementById('characterList');
  list.innerHTML = '';
  characters.forEach((c) => {
    const pct = c.health.max > 0 ? Math.max(0, Math.min(100, (c.health.current / c.health.max) * 100)) : 0;
    const card = document.createElement('div');
    card.className = 'char-card' + (c.id === activeId ? ' active' : '');
    const summonLines = ['familiar', 'esper']
      .filter((kind) => c[kind] && c[kind].active)
      .map((kind) => {
        const s = c[kind];
        const label = s.name || (kind === 'familiar' ? 'Familiar' : 'Esper');
        return `<div class="char-esper-line"><span>${escapeHtml(label)}</span><span>${s.health.current}/${s.health.max} HP</span></div>`;
      })
      .join('');
    card.innerHTML = `
      <div class="char-card-name"><span>${escapeHtml(c.name || 'Unnamed')}</span></div>
      <div class="char-card-class">${escapeHtml(c.className || 'No class set')}</div>
      <div class="char-hp-bar"><div class="char-hp-bar-fill" style="width:${pct}%"></div></div>
      <div class="char-hp-text">${c.health.current} / ${c.health.max} HP</div>
      ${summonLines}
    `;
    card.addEventListener('click', () => {
      activeId = c.id;
      showView('character');
      renderSidebar();
      renderSheet();
    });
    list.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

// ---------- Usage tracking (Flip / Exhaust / Per Encounter) ----------
// Each keyword gets its own backend field so future logic (auto-reset on turn/
// encounter end, flip-state behavior, etc.) can treat them independently.
const USAGE_KEYWORDS = [
  { field: 'usedExhaust', label: 'Exhausted', match: /exhaust/i },
  { field: 'usedPerEncounter', label: 'Used (Per Encounter)', match: /per encounter/i },
  { field: 'usedFlip', label: 'Flipped', match: /\bflip/i },
];

function detectUsageFlags(text) {
  if (!text) return [];
  return USAGE_KEYWORDS.filter((k) => k.match.test(text));
}

// Scans both the name and the notes/description together — card layouts often put the
// keyword tag (e.g. "Flip:", "(Exhaust)") right next to the title, and people re-typing
// an ability by hand tend to put it in whichever field they type first.
function usageFlagsHtml(obj, ...textParts) {
  const text = textParts.filter(Boolean).join(' ');
  const flags = detectUsageFlags(text);
  if (flags.length === 0) return '';
  return `<div class="usage-flags">${flags
    .map(
      (k) => `<label class="checkbox-label"><input type="checkbox" data-usage-field="${k.field}" ${obj[k.field] ? 'checked' : ''} /> ${k.label}</label>`
    )
    .join('')}</div>`;
}

function bindUsageFlagListeners(row, obj, onChange) {
  row.querySelectorAll('[data-usage-field]').forEach((input) => {
    input.addEventListener('change', () => {
      obj[input.dataset.usageField] = input.checked;
      onChange();
    });
  });
}

// Clears one usage-tracking field (usedExhaust / usedPerEncounter / usedFlip) across
// every item, ability, and Familiar/Esper summon ability on a character — used by the
// New Turn / New Encounter / Restore buttons. Each field is reset independently since
// they represent different real-world triggers (end of turn vs. end of encounter vs.
// a Restore effect), matching how they were tracked independently to begin with.
function resetUsageField(c, field) {
  const collections = [c.inventory, c.abilities, c.familiar.abilities, c.esper.abilities];
  collections.forEach((list) => {
    list.forEach((obj) => {
      if (obj[field]) obj[field] = false;
    });
  });
}

// ---------- Sheet render ----------
function renderSheet() {
  const empty = document.getElementById('emptyState');
  const sheet = document.getElementById('characterSheet');
  const c = getActive();
  editingInventoryIdx = null;
  editingAbilityIdx = null;

  if (!c) {
    empty.classList.remove('hidden');
    sheet.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  sheet.classList.remove('hidden');

  document.getElementById('charName').value = c.name || '';
  document.getElementById('charClass').value = c.className || '';

  document.getElementById('statXp').value = c.xp ?? 0;
  document.getElementById('statArmor').value = c.armor ?? 0;
  document.getElementById('statDefense').value = c.defense ?? 0;
  document.getElementById('statMovement').value = c.movement ?? 0;
  document.getElementById('statStamina').value = c.stamina ?? 3;
  document.getElementById('statPresence').value = c.presence ?? 0;
  document.getElementById('statLore').value = c.lore ?? 0;
  document.getElementById('statAgility').value = c.agility ?? 0;
  document.getElementById('statPerception').value = c.perception ?? 0;
  document.getElementById('statStrength').value = c.strength ?? 0;
  document.getElementById('statConviction').value = c.conviction || '';
  document.getElementById('statCasting').value = c.casting || '';

  document.getElementById('healthCurrent').value = c.health.current;
  document.getElementById('healthMax').value = c.health.max;
  updateHealthBar(c);

  renderStatusEffects(c);
  renderInventory(c);
  renderDisciplines(c);
  renderAbilities(c);
  renderSummon(c, 'familiar');
  renderSummon(c, 'esper');

  document.getElementById('notesArea').value = c.notes || '';
}

function renderSummon(c, kind) {
  const s = c[kind];
  document.getElementById(`${kind}Active`).checked = s.active;
  document.getElementById(`${kind}Panel`).classList.toggle('hidden', !s.active);
  document.getElementById(`${kind}EmptyMsg`).classList.toggle('hidden', s.active);

  document.getElementById(`${kind}Name`).value = s.name || '';
  document.getElementById(`${kind}Armor`).value = s.armor ?? 0;
  document.getElementById(`${kind}Defense`).value = s.defense ?? 0;
  document.getElementById(`${kind}Movement`).value = s.movement ?? 0;
  document.getElementById(`${kind}HealthCurrent`).value = s.health.current;
  document.getElementById(`${kind}HealthMax`).value = s.health.max;
  updateSummonHealthBar(c, kind);

  renderSummonStatusEffects(c, kind);
  renderSummonAbilities(c, kind);

  document.getElementById(`${kind}Notes`).value = s.notes || '';
}

function updateSummonHealthBar(c, kind) {
  const s = c[kind];
  const pct = s.health.max > 0 ? Math.max(0, Math.min(100, (s.health.current / s.health.max) * 100)) : 0;
  document.getElementById(`${kind}HealthBarFill`).style.width = pct + '%';
}

function renderSummonStatusEffects(c, kind) {
  const s = c[kind];
  const wrap = document.getElementById(`${kind}StatusList`);
  wrap.innerHTML = '';
  s.statusEffects.forEach((effect, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${escapeHtml(effect)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
      s.statusEffects.splice(idx, 1);
      renderSummonStatusEffects(c, kind);
      scheduleSave();
    });
    chip.appendChild(btn);
    wrap.appendChild(chip);
  });
}

function renderSummonAbilities(c, kind) {
  const s = c[kind];
  const wrap = document.getElementById(`${kind}AbilityList`);
  wrap.innerHTML = '';
  if (s.abilities.length === 0) {
    wrap.innerHTML = '<div class="muted">No abilities added yet.</div>';
    return;
  }
  s.abilities.forEach((ab, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(ab.name)} ${ab.active ? '<span class="li-badge equipped">Active</span>' : ''}</div>
        ${ab.description ? `<div class="li-sub">${escapeHtml(ab.description)}</div>` : ''}
        ${usageFlagsHtml(ab, ab.name, ab.description)}
      </div>
    `;
    bindUsageFlagListeners(row, ab, () => scheduleSave());
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      s.abilities.splice(idx, 1);
      renderSummonAbilities(c, kind);
      scheduleSave();
    });
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function updateHealthBar(c) {
  const pct = c.health.max > 0 ? Math.max(0, Math.min(100, (c.health.current / c.health.max) * 100)) : 0;
  document.getElementById('healthBarFill').style.width = pct + '%';
}

function renderStatusEffects(c) {
  const wrap = document.getElementById('statusList');
  wrap.innerHTML = '';
  c.statusEffects.forEach((effect, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${escapeHtml(effect)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
      c.statusEffects.splice(idx, 1);
      renderStatusEffects(c);
      scheduleSave();
    });
    chip.appendChild(btn);
    wrap.appendChild(chip);
  });
}

// ---------- Equip limits ----------
function getEquipLimit(c, slot) {
  const overrides = c.equipLimitOverrides || {};
  if (typeof overrides[slot] === 'number') return overrides[slot];
  return EQUIP_LIMITS[slot]; // undefined for slots with no limit (e.g. "Other")
}

function countEquippedInSlot(c, slot, excludeItemId) {
  return c.inventory.filter((it) => it.slot === slot && it.equipped && it.id !== excludeItemId).length;
}

// Checks whether equipping one more item in `slot` is allowed. Returns true if
// it's fine (or the slot has no limit); alerts and returns false if it would
// exceed the limit. `excludeItemId` lets an already-equipped item being edited
// skip counting itself twice.
function tryEquip(c, slot, excludeItemId) {
  const limit = getEquipLimit(c, slot);
  if (typeof limit !== 'number') return true;
  const current = countEquippedInSlot(c, slot, excludeItemId);
  if (current >= limit) {
    alert(`Can't equip: the limit for ${slot} is ${limit} (already ${current} equipped). The item will be added/saved as not equipped.`);
    return false;
  }
  return true;
}

function renderEquipSummary(c) {
  const bar = document.getElementById('equipSummaryBar');
  if (!bar) return;
  const slots = ['Weapon', 'Armor', 'Core', 'Accessory', 'Relic', 'Consumable'];
  bar.innerHTML = slots
    .map((slot) => {
      const limit = getEquipLimit(c, slot);
      if (typeof limit !== 'number') return '';
      const count = countEquippedInSlot(c, slot);
      const over = count > limit;
      return `<span class="equip-chip${over ? ' equip-over' : ''}">${slot} ${count}/${limit}</span>`;
    })
    .join('');
}

let editingInventoryIdx = null;

function renderInventory(c) {
  renderEquipSummary(c);
  const wrap = document.getElementById('inventoryList');
  wrap.innerHTML = '';
  if (c.inventory.length === 0) {
    wrap.innerHTML = '<div class="muted">No items yet.</div>';
    return;
  }
  c.inventory.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';

    if (idx === editingInventoryIdx) {
      const slots = ['Weapon', 'Armor', 'Core', 'Accessory', 'Relic', 'Consumable', 'Other'];
      const rarities = ['Mundane', 'Common', 'Uncommon', 'Rare', 'Story'];
      row.innerHTML = `
        <div class="li-main item-form">
          <input type="text" class="edit-item-name" value="${escapeHtml(item.name)}" placeholder="Item name" />
          <select class="edit-item-slot">
            ${slots.map((s) => `<option ${s === item.slot ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <select class="edit-item-rarity">
            <option value="" ${!item.rarity ? 'selected' : ''}>No Rarity</option>
            ${rarities.map((r) => `<option ${r === item.rarity ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <label class="checkbox-label"><input type="checkbox" class="edit-item-unique" ${item.unique ? 'checked' : ''} /> Unique</label>
          <label class="checkbox-label"><input type="checkbox" class="edit-item-equipped" ${item.equipped ? 'checked' : ''} /> Equipped</label>
          <input type="text" class="edit-item-notes" value="${escapeHtml(item.notes || '')}" placeholder="Notes (modifiers, qty, etc.)" />
        </div>
      `;
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn small';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => {
        const name = row.querySelector('.edit-item-name').value.trim();
        if (!name) return;
        const newSlot = row.querySelector('.edit-item-slot').value;
        let wantEquipped = row.querySelector('.edit-item-equipped').checked;
        if (wantEquipped && !tryEquip(c, newSlot, item.id)) wantEquipped = false;
        item.name = name;
        item.slot = newSlot;
        item.rarity = row.querySelector('.edit-item-rarity').value;
        item.unique = row.querySelector('.edit-item-unique').checked;
        item.equipped = wantEquipped;
        item.notes = row.querySelector('.edit-item-notes').value;
        editingInventoryIdx = null;
        renderInventory(c);
        renderSidebar();
        scheduleSave();
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn small';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        editingInventoryIdx = null;
        renderInventory(c);
      });
      row.appendChild(saveBtn);
      row.appendChild(cancelBtn);
      wrap.appendChild(row);
      return;
    }

    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(item.name)} <span class="li-badge">${escapeHtml(item.slot)}</span> ${item.rarity ? `<span class="li-badge rarity-${escapeHtml(item.rarity.toLowerCase())}">${escapeHtml(item.rarity)}</span>` : ''} ${item.unique ? '<span class="li-badge unique-tag">Unique</span>' : ''} ${item.equipped ? '<span class="li-badge equipped">Equipped</span>' : ''}</div>
        ${item.notes ? `<div class="li-sub">${escapeHtml(item.notes)}</div>` : ''}
        ${usageFlagsHtml(item, item.name, item.notes)}
      </div>
    `;
    bindUsageFlagListeners(row, item, () => scheduleSave());
    const editBtn = document.createElement('button');
    editBtn.className = 'save-to-lib-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => {
      editingInventoryIdx = idx;
      renderInventory(c);
    });
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-to-lib-btn';
    saveBtn.title = 'Save to Library';
    saveBtn.textContent = '📥';
    saveBtn.addEventListener('click', () => {
      const presetData = { name: item.name, slot: item.slot, rarity: item.rarity || '', unique: !!item.unique, notes: item.notes || '' };
      const existingIdx = library.items.findIndex(
        (x) => x.name.toLowerCase() === item.name.toLowerCase() && x.slot === item.slot
      );
      if (existingIdx >= 0) {
        library.items[existingIdx] = { ...library.items[existingIdx], ...presetData };
      } else {
        library.items.push({ id: uid(), ...presetData });
      }
      populateItemLibrarySelect();
      renderLibraryItems();
      scheduleLibrarySave();
      saveBtn.classList.add('saved-flash');
      setTimeout(() => saveBtn.classList.remove('saved-flash'), 800);
    });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      c.inventory.splice(idx, 1);
      renderInventory(c);
      renderSidebar();
      scheduleSave();
    });
    row.appendChild(editBtn);
    row.appendChild(saveBtn);
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function renderDisciplines(c) {
  const grid = document.getElementById('disciplineGrid');
  grid.innerHTML = '';
  DISCIPLINES.forEach((d) => {
    const data = c.disciplines[d];
    const card = document.createElement('div');
    card.className = 'discipline-card';
    card.style.setProperty('--d', `var(${DISCIPLINE_VARS[d]})`);
    card.innerHTML = `
      <h3>${d}</h3>
      <div class="points-row">
        <input type="number" min="0" value="${data.points}" data-discipline="${d}" class="discipline-points" />
        <span>points invested</span>
      </div>
      <textarea placeholder="Notes on ${d} tree..." data-discipline="${d}" class="discipline-notes">${escapeHtml(data.notes)}</textarea>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('.discipline-points').forEach((input) => {
    input.addEventListener('input', () => {
      const d = input.dataset.discipline;
      c.disciplines[d].points = Number(input.value) || 0;
      scheduleSave();
    });
  });
  grid.querySelectorAll('.discipline-notes').forEach((ta) => {
    ta.addEventListener('input', () => {
      const d = ta.dataset.discipline;
      c.disciplines[d].notes = ta.value;
      scheduleSave();
    });
  });
}

let editingAbilityIdx = null;

function renderAbilities(c) {
  const wrap = document.getElementById('abilityList');
  wrap.innerHTML = '';
  if (c.abilities.length === 0) {
    wrap.innerHTML = '<div class="muted">No abilities added yet.</div>';
    return;
  }
  c.abilities.forEach((ab, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';

    if (idx === editingAbilityIdx) {
      row.innerHTML = `
        <div class="li-main item-form">
          <input type="text" class="edit-ability-name" value="${escapeHtml(ab.name)}" placeholder="Ability name" />
          <select class="edit-ability-discipline">
            ${DISCIPLINES.map((d) => `<option ${d === ab.discipline ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          <input type="number" class="edit-ability-tier" value="${ab.tier || ''}" placeholder="Tier" min="1" style="width:70px" />
          <label class="checkbox-label"><input type="checkbox" class="edit-ability-learned" ${ab.learned ? 'checked' : ''} /> Learned</label>
          <input type="text" class="edit-ability-desc" value="${escapeHtml(ab.description || '')}" placeholder="Description / effect" />
        </div>
      `;
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn small';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => {
        const name = row.querySelector('.edit-ability-name').value.trim();
        if (!name) return;
        ab.name = name;
        ab.discipline = row.querySelector('.edit-ability-discipline').value;
        ab.tier = Number(row.querySelector('.edit-ability-tier').value) || null;
        ab.learned = row.querySelector('.edit-ability-learned').checked;
        ab.description = row.querySelector('.edit-ability-desc').value;
        editingAbilityIdx = null;
        renderAbilities(c);
        scheduleSave();
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn small';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        editingAbilityIdx = null;
        renderAbilities(c);
      });
      row.appendChild(saveBtn);
      row.appendChild(cancelBtn);
      wrap.appendChild(row);
      return;
    }

    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(ab.name)} <span class="li-badge">${escapeHtml(ab.discipline)}</span> ${ab.tier ? `<span class="li-badge">Tier ${ab.tier}</span>` : ''} ${ab.learned ? '<span class="li-badge learned">Learned</span>' : ''}</div>
        ${ab.description ? `<div class="li-sub">${escapeHtml(ab.description)}</div>` : ''}
        ${usageFlagsHtml(ab, ab.name, ab.description)}
      </div>
    `;
    bindUsageFlagListeners(row, ab, () => scheduleSave());
    const editBtn = document.createElement('button');
    editBtn.className = 'save-to-lib-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => {
      editingAbilityIdx = idx;
      renderAbilities(c);
    });
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-to-lib-btn';
    saveBtn.title = 'Save to Library';
    saveBtn.textContent = '📥';
    saveBtn.addEventListener('click', () => {
      const presetData = {
        name: ab.name,
        discipline: ab.discipline,
        tier: ab.tier || null,
        description: ab.description || '',
      };
      const existingIdx = library.abilities.findIndex(
        (x) => x.name.toLowerCase() === ab.name.toLowerCase() && x.discipline === ab.discipline
      );
      if (existingIdx >= 0) {
        library.abilities[existingIdx] = { ...library.abilities[existingIdx], ...presetData };
      } else {
        library.abilities.push({ id: uid(), ...presetData });
      }
      populateAbilityLibrarySelect();
      renderLibraryAbilities();
      scheduleLibrarySave();
      saveBtn.classList.add('saved-flash');
      setTimeout(() => saveBtn.classList.remove('saved-flash'), 800);
    });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      c.abilities.splice(idx, 1);
      renderAbilities(c);
      scheduleSave();
    });
    row.appendChild(editBtn);
    row.appendChild(saveBtn);
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function populateDisciplineSelect() {
  const select = document.getElementById('abilityDiscipline');
  select.innerHTML = DISCIPLINES.map((d) => `<option value="${d}">${d}</option>`).join('');
}

function populateLibraryDisciplineSelect() {
  const select = document.getElementById('libAbilityDiscipline');
  select.innerHTML = DISCIPLINES.map((d) => `<option value="${d}">${d}</option>`).join('');
}

// ---------- View switching ----------
function showView(view) {
  currentView = view;
  const empty = document.getElementById('emptyState');
  const sheet = document.getElementById('characterSheet');
  const libView = document.getElementById('libraryView');
  const libBtn = document.getElementById('libraryBtn');

  if (view === 'library') {
    empty.classList.add('hidden');
    sheet.classList.add('hidden');
    libView.classList.remove('hidden');
    libBtn.classList.add('active');
  } else {
    libView.classList.add('hidden');
    libBtn.classList.remove('active');
    renderSheet(); // shows empty state or sheet depending on activeId
  }
}

// ---------- Library selects (on character sheet forms) ----------
function filterItems(items, slotSelectId, raritySelectId, uniqueCheckboxId) {
  const slotSelect = document.getElementById(slotSelectId);
  const raritySelect = document.getElementById(raritySelectId);
  const uniqueCheckbox = uniqueCheckboxId ? document.getElementById(uniqueCheckboxId) : null;
  const filterSlot = slotSelect ? slotSelect.value : '';
  const filterRarity = raritySelect ? raritySelect.value : '';
  const filterUniqueOnly = uniqueCheckbox ? uniqueCheckbox.checked : false;
  return items.filter((it) => {
    if (filterSlot && it.slot !== filterSlot) return false;
    if (filterRarity && (it.rarity || '') !== filterRarity) return false;
    if (filterUniqueOnly && !it.unique) return false;
    return true;
  });
}

function populateItemLibrarySelect() {
  const select = document.getElementById('itemLibrarySelect');
  const current = select.value;
  const filtered = filterItems(library.items, 'itemFilterSlot', 'itemFilterRarity', 'itemFilterUnique');
  const inPlayCounts = getInPlayCounts();
  select.innerHTML = '<option value="">— Pick from Library, adds instantly —</option>' +
    filtered.map((it) => {
      const remaining = getRemainingCount(it, inPlayCounts);
      return `<option value="${it.id}">${it.unique ? '★ ' : ''}${escapeHtml(it.name)} (${escapeHtml(it.slot)}${it.rarity ? ', ' + escapeHtml(it.rarity) : ''}) — ${remaining} left</option>`;
    }).join('');
  select.value = current;
  if (select.value !== current) select.value = '';
}

// Adds a library item preset straight into a character's inventory (equipped
// defaults to false — use the row's ✎ edit button afterward to tweak Equipped/
// notes/etc). Skips the old "Use → fill form → Add Item" two-step flow.
function addLibraryItemToInventory(c, libItem) {
  c.inventory.push({
    id: uid(),
    name: libItem.name,
    slot: libItem.slot,
    rarity: libItem.rarity || '',
    unique: !!libItem.unique,
    equipped: false,
    notes: libItem.notes || '',
  });
  renderInventory(c);
  populateItemLibrarySelect();
  scheduleSave();
}

function populateAbilityLibrarySelect() {
  const select = document.getElementById('abilityLibrarySelect');
  const disciplineSelect = document.getElementById('abilityDiscipline');
  const filterDiscipline = disciplineSelect ? disciplineSelect.value : null;
  const filtered = filterDiscipline
    ? library.abilities.filter((a) => a.discipline === filterDiscipline)
    : library.abilities;
  select.innerHTML = '<option value="">— Pick from Library, adds instantly —</option>' +
    filtered.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}${a.tier ? ' (Tier ' + a.tier + ')' : ''}</option>`).join('');
}

// Adds a library ability preset straight into a character's ability list (learned
// defaults to false — toggle it on the row afterward if needed). Skips the old
// "Use → fill form → Add Ability" two-step flow, same as the item picker.
function addLibraryAbilityToCharacter(c, libAbility) {
  c.abilities.push({
    id: uid(),
    name: libAbility.name,
    discipline: libAbility.discipline,
    tier: libAbility.tier || null,
    learned: false,
    description: libAbility.description || '',
  });
  renderAbilities(c);
  populateAbilityLibrarySelect();
  scheduleSave();
}

function populateSummonLibrarySelect(kind) {
  const select = document.getElementById(`${kind}LibrarySelect`);
  const wantTypes = kind === 'familiar' ? ['Familiar'] : ['Exalted Esper', 'Loyal Esper'];
  const filtered = library.espers.filter((e) => wantTypes.includes(e.type) || e.type === 'Other' || !e.type);
  select.innerHTML = '<option value="">— Pick from Library —</option>' +
    filtered.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.type ? ' (' + escapeHtml(e.type) + ')' : ''}</option>`).join('');
}

function populateAllSummonLibrarySelects() {
  populateSummonLibrarySelect('esper');
  populateSummonLibrarySelect('familiar');
}

function applySummonPreset(c, kind, preset) {
  const s = c[kind];
  s.name = preset.name;
  if (typeof preset.armor === 'number') s.armor = preset.armor;
  if (typeof preset.defense === 'number') s.defense = preset.defense;
  if (typeof preset.movement === 'number') s.movement = preset.movement;
  if (typeof preset.healthMax === 'number' && preset.healthMax > 0) {
    s.health.max = preset.healthMax;
    s.health.current = preset.healthMax;
  }
  if (Array.isArray(preset.abilities) && preset.abilities.length > 0) {
    s.abilities = preset.abilities.map((a) => ({
      id: uid(),
      name: a.name,
      description: a.description || '',
      active: false,
    }));
  }
  if (preset.notes) s.notes = preset.notes;
}

// ---------- Modal ----------
function showChoiceModal(title, items, labelFn, onSelect) {
  const overlay = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  document.getElementById('modalTitle').textContent = title;
  body.innerHTML = '';
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'modal-option';
    btn.innerHTML = labelFn(item);
    btn.addEventListener('click', () => {
      hideModal();
      onSelect(item);
    });
    body.appendChild(btn);
  });
  overlay.classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}

// ---------- Library render (management view) ----------
function renderLibraryItems() {
  const wrap = document.getElementById('libraryItemList');
  wrap.innerHTML = '';
  const filtered = filterItems(library.items, 'libItemFilterSlot', 'libItemFilterRarity', 'libItemFilterUnique');
  if (library.items.length === 0) {
    wrap.innerHTML = '<div class="muted">No items saved yet.</div>';
    return;
  }
  if (filtered.length === 0) {
    wrap.innerHTML = '<div class="muted">No items match the current filters.</div>';
    return;
  }
  const inPlayCounts = getInPlayCounts();
  filtered.forEach((item) => {
    const idx = library.items.indexOf(item);
    const remaining = getRemainingCount(item, inPlayCounts);
    const row = document.createElement('div');
    row.className = 'list-item';
    row.dataset.itemId = item.id;
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(item.name)} <span class="li-badge">${escapeHtml(item.slot)}</span> ${item.rarity ? `<span class="li-badge rarity-${escapeHtml(item.rarity.toLowerCase())}">${escapeHtml(item.rarity)}</span>` : ''} ${item.unique ? '<span class="li-badge unique-tag">Unique</span>' : ''} <span class="li-badge">${remaining} / ${item.quantity} left</span></div>
        ${item.notes ? `<div class="li-sub">${escapeHtml(item.notes)}</div>` : ''}
      </div>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      library.items.splice(idx, 1);
      renderLibraryItems();
      populateItemLibrarySelect();
      scheduleLibrarySave();
    });
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function renderLibraryAbilities() {
  const wrap = document.getElementById('libraryAbilityList');
  wrap.innerHTML = '';
  if (library.abilities.length === 0) {
    wrap.innerHTML = '<div class="muted">No abilities saved yet.</div>';
    return;
  }
  library.abilities.forEach((ab, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(ab.name)} <span class="li-badge">${escapeHtml(ab.discipline)}</span> ${ab.tier ? `<span class="li-badge">Tier ${ab.tier}</span>` : ''}</div>
        ${ab.description ? `<div class="li-sub">${escapeHtml(ab.description)}</div>` : ''}
      </div>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      library.abilities.splice(idx, 1);
      renderLibraryAbilities();
      populateAbilityLibrarySelect();
      scheduleLibrarySave();
    });
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function renderLibraryEspers() {
  const wrap = document.getElementById('libraryEsperList');
  wrap.innerHTML = '';
  if (library.espers.length === 0) {
    wrap.innerHTML = '<div class="muted">No Espers saved yet.</div>';
    return;
  }
  library.espers.forEach((e, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    const extraBadges = [
      e.healthMax ? `<span class="li-badge">${e.healthMax} HP</span>` : '',
      Array.isArray(e.abilities) && e.abilities.length > 0 ? `<span class="li-badge">${e.abilities.length} ${e.abilities.length === 1 ? 'ability' : 'abilities'}</span>` : '',
    ].join(' ');
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(e.name)} ${e.type ? `<span class="li-badge">${escapeHtml(e.type)}</span>` : ''} ${extraBadges}</div>
        ${e.notes ? `<div class="li-sub">${escapeHtml(e.notes)}</div>` : ''}
      </div>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      library.espers.splice(idx, 1);
      renderLibraryEspers();
      populateAllSummonLibrarySelects();
      scheduleLibrarySave();
    });
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function renderLibraryTemplates() {
  const wrap = document.getElementById('libraryTemplateList');
  wrap.innerHTML = '';
  if (library.characterTemplates.length === 0) {
    wrap.innerHTML = '<div class="muted">No character templates saved yet.</div>';
    return;
  }
  library.characterTemplates.forEach((tpl, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(tpl.templateName)}</div>
        <div class="li-sub">${escapeHtml(tpl.className || 'No class set')}</div>
      </div>
    `;
    const useBtn = document.createElement('button');
    useBtn.className = 'btn small';
    useBtn.textContent = 'New Character';
    useBtn.addEventListener('click', () => createCharacterFromTemplate(tpl));
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      library.characterTemplates.splice(idx, 1);
      renderLibraryTemplates();
      scheduleLibrarySave();
    });
    row.appendChild(useBtn);
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function createCharacterFromTemplate(tpl) {
  const copy = JSON.parse(JSON.stringify(tpl));
  delete copy.templateName;
  copy.id = uid();
  copy.name = tpl.templateName;
  normalizeCharacter(copy);
  characters.push(copy);
  activeId = copy.id;
  showView('character');
  renderSidebar();
  renderSheet();
  scheduleSave();
  document.getElementById('charName').focus();
  document.getElementById('charName').select();
}

// ---------- Static listeners ----------
function bindStaticListeners() {
  document.getElementById('newCharBtn').addEventListener('click', () => {
    const c = blankCharacter('New Character');
    characters.push(c);
    activeId = c.id;
    showView('character');
    renderSidebar();
    renderSheet();
    scheduleSave();
    document.getElementById('charName').focus();
    document.getElementById('charName').select();
  });

  document.getElementById('fromTemplateBtn').addEventListener('click', () => {
    if (library.characterTemplates.length === 0) {
      alert("No character templates saved yet. Save one from a character's header (⭐ button) first.");
      return;
    }
    showChoiceModal(
      'Choose a Template',
      library.characterTemplates,
      (tpl) => `${escapeHtml(tpl.templateName)}<div class="mo-sub">${escapeHtml(tpl.className || 'No class set')}</div>`,
      (tpl) => createCharacterFromTemplate(tpl)
    );
  });

  document.getElementById('libraryBtn').addEventListener('click', () => {
    showView(currentView === 'library' ? 'character' : 'library');
  });

  document.getElementById('modalCancelBtn').addEventListener('click', hideModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') hideModal();
  });

  document.getElementById('saveTemplateBtn').addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    const name = prompt('Template name:', c.name || 'Template');
    if (!name) return;
    const tpl = JSON.parse(JSON.stringify(c));
    delete tpl.id;
    tpl.id = uid();
    tpl.templateName = name.trim();
    library.characterTemplates.push(tpl);
    renderLibraryTemplates();
    scheduleLibrarySave();
  });

  document.getElementById('importBtn').addEventListener('click', async () => {
    const result = await window.api.importCharacter();
    if (result.canceled) return;
    const c = result.character;
    // Guard against picking a Library data file (items/abilities/espers) here by mistake —
    // that file has no character-like "name"/"health" fields but does have top-level
    // "source" + array "abilities" + array "espers", which is the seed/library shape.
    const looksLikeLibraryFile =
      c && typeof c === 'object' &&
      typeof c.name === 'undefined' &&
      typeof c.health === 'undefined' &&
      Array.isArray(c.abilities) &&
      Array.isArray(c.espers);
    if (looksLikeLibraryFile) {
      alert(
        'This looks like a Library data file (items/abilities/espers), not a single character export.\n\n' +
        'Open the 📚 Library screen instead and use its "Import Library Data" button.'
      );
      return;
    }
    c.id = uid(); // always assign a fresh id to avoid collisions
    normalizeCharacter(c);
    characters.push(c);
    activeId = c.id;
    showView('character');
    renderSidebar();
    renderSheet();
    scheduleSave();
  });

  document.getElementById('duplicateBtn').addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    const copy = JSON.parse(JSON.stringify(c));
    copy.id = uid();
    copy.name = c.name + ' (Copy)';
    characters.push(copy);
    activeId = copy.id;
    renderSidebar();
    renderSheet();
    scheduleSave();
  });

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const c = getActive();
    if (!c) return;
    await window.api.exportCharacter(c);
  });

  document.getElementById('deleteBtn').addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    characters = characters.filter((x) => x.id !== c.id);
    activeId = characters.length > 0 ? characters[0].id : null;
    renderSidebar();
    renderSheet();
    scheduleSave();
  });

  // Turn/encounter management: clear usage-tracking checkboxes in bulk.
  document.getElementById('newTurnBtn').addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    resetUsageField(c, 'usedExhaust');
    c.stamina = Math.min(5, (c.stamina || 0) + 3);
    renderSheet();
    scheduleSave();
  });
  document.getElementById('newEncounterBtn').addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    resetUsageField(c, 'usedPerEncounter');
    resetUsageField(c, 'usedExhaust');
    renderSheet();
    scheduleSave();
  });
  document.getElementById('restoreBtn').addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    resetUsageField(c, 'usedFlip');
    renderSheet();
    scheduleSave();
  });

  // Tabs (character sheet)
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Tabs (library view)
  document.querySelectorAll('.lib-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lib-tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.lib-tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('libtab-' + btn.dataset.libtab).classList.add('active');
    });
  });

  // Header fields
  document.getElementById('charName').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.name = e.target.value;
    renderSidebar();
    scheduleSave();
  });
  document.getElementById('charClass').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.className = e.target.value;
    renderSidebar();
    scheduleSave();
  });

  // Stat fields
  const bindNumber = (id, field) => {
    document.getElementById(id).addEventListener('input', (e) => {
      const c = getActive();
      if (!c) return;
      c[field] = Number(e.target.value) || 0;
      scheduleSave();
    });
  };
  bindNumber('statXp', 'xp');
  bindNumber('statArmor', 'armor');
  bindNumber('statDefense', 'defense');
  bindNumber('statMovement', 'movement');
  bindNumber('statPresence', 'presence');
  bindNumber('statLore', 'lore');
  bindNumber('statAgility', 'agility');
  bindNumber('statPerception', 'perception');
  bindNumber('statStrength', 'strength');

  const bindText = (id, field) => {
    document.getElementById(id).addEventListener('input', (e) => {
      const c = getActive();
      if (!c) return;
      c[field] = e.target.value;
      scheduleSave();
    });
  };
  bindText('statConviction', 'conviction');
  bindText('statCasting', 'casting');

  document.getElementById('statStamina').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    let val = Number(e.target.value) || 0;
    val = Math.max(0, Math.min(5, val));
    c.stamina = val;
    e.target.value = val;
    scheduleSave();
  });

  document.getElementById('healthCurrent').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.health.current = Number(e.target.value) || 0;
    updateHealthBar(c);
    renderSidebar();
    scheduleSave();
  });
  document.getElementById('healthMax').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.health.max = Number(e.target.value) || 0;
    updateHealthBar(c);
    renderSidebar();
    scheduleSave();
  });

  // Status effect form
  document.getElementById('statusForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = getActive();
    if (!c) return;
    const input = document.getElementById('statusInput');
    const val = input.value.trim();
    if (!val) return;
    c.statusEffects.push(val);
    input.value = '';
    renderStatusEffects(c);
    scheduleSave();
  });

  // Pick from library (item) — adds straight to inventory, no separate "Use" step.
  document.getElementById('itemLibrarySelect').addEventListener('change', (e) => {
    const c = getActive();
    const select = e.target;
    if (!c || !select.value) return;
    const item = library.items.find((it) => it.id === select.value);
    select.value = '';
    if (!item) return;
    addLibraryItemToInventory(c, item);
  });

  // Item filters (Inventory tab picker)
  document.getElementById('itemFilterSlot').addEventListener('change', () => {
    populateItemLibrarySelect();
  });
  document.getElementById('itemFilterRarity').addEventListener('change', () => {
    populateItemLibrarySelect();
  });
  document.getElementById('itemFilterUnique').addEventListener('change', () => {
    populateItemLibrarySelect();
  });

  // Get Random (character Inventory tab picker) — picks a random item from the
  // currently filtered set, weighted by remaining copies, and adds it straight
  // to inventory (same instant-add behavior as the library dropdown above).
  document.getElementById('randomItemBtn').addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    const filtered = filterItems(library.items, 'itemFilterSlot', 'itemFilterRarity', 'itemFilterUnique');
    const inPlayCounts = getInPlayCounts();
    const picked = pickRandomItem(filtered, inPlayCounts);
    if (!picked) {
      alert('No items with remaining copies match the current filters.');
      return;
    }
    const remainingAfter = Math.max(0, getRemainingCount(picked, inPlayCounts) - 1);
    addLibraryItemToInventory(c, picked);
    alert(`🎲 Added ${picked.name} (${remainingAfter} of ${picked.quantity} remaining).`);
  });

  // Inventory form
  document.getElementById('inventoryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = getActive();
    if (!c) return;
    const name = document.getElementById('itemName').value.trim();
    if (!name) return;
    const slot = document.getElementById('itemSlot').value;
    const rarity = document.getElementById('itemRarity').value;
    const unique = document.getElementById('itemUnique').checked;
    let equipped = document.getElementById('itemEquipped').checked;
    if (equipped && !tryEquip(c, slot)) equipped = false;
    const notes = document.getElementById('itemNotes').value.trim();
    const saveToLibrary = document.getElementById('itemSaveToLibrary').checked;
    c.inventory.push({ id: uid(), name, slot, rarity, unique, equipped, notes });

    if (saveToLibrary) {
      const exists = library.items.some(
        (it) => it.name.toLowerCase() === name.toLowerCase() && it.slot === slot
      );
      if (!exists) {
        library.items.push({ id: uid(), name, slot, rarity, unique, notes });
        populateItemLibrarySelect();
        renderLibraryItems();
        scheduleLibrarySave();
      }
    }

    e.target.reset();
    renderInventory(c);
    scheduleSave();
  });

  // Ability discipline change -> refilter library select
  document.getElementById('abilityDiscipline').addEventListener('change', () => {
    populateAbilityLibrarySelect();
  });

  // Pick from library (ability) — adds straight to the character, no separate "Use" step.
  // The Discipline dropdown above still filters which abilities show up in this list.
  document.getElementById('abilityLibrarySelect').addEventListener('change', (e) => {
    const c = getActive();
    const select = e.target;
    if (!c || !select.value) return;
    const ability = library.abilities.find((a) => a.id === select.value);
    select.value = '';
    if (!ability) return;
    addLibraryAbilityToCharacter(c, ability);
  });

  // Ability form
  document.getElementById('abilityForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = getActive();
    if (!c) return;
    const name = document.getElementById('abilityName').value.trim();
    if (!name) return;
    const discipline = document.getElementById('abilityDiscipline').value;
    const tier = Number(document.getElementById('abilityTier').value) || null;
    const learned = document.getElementById('abilityLearned').checked;
    const description = document.getElementById('abilityDesc').value.trim();
    const saveToLibrary = document.getElementById('abilitySaveToLibrary').checked;
    c.abilities.push({ id: uid(), name, discipline, tier, learned, description });

    if (saveToLibrary) {
      const exists = library.abilities.some(
        (a) => a.name.toLowerCase() === name.toLowerCase() && a.discipline === discipline
      );
      if (!exists) {
        library.abilities.push({ id: uid(), name, discipline, tier, description });
        populateAbilityLibrarySelect();
        renderLibraryAbilities();
        scheduleLibrarySave();
      }
    }

    e.target.reset();
    renderAbilities(c);
    scheduleSave();
  });

  // Notes
  document.getElementById('notesArea').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.notes = e.target.value;
    scheduleSave();
  });

  // Summons: Familiar and Esper (Exalted Esper) slots
  bindSummonListeners('esper');
  bindSummonListeners('familiar');

  // Library item filters (Library screen Items tab)
  document.getElementById('libItemFilterSlot').addEventListener('change', () => {
    renderLibraryItems();
  });
  document.getElementById('libItemFilterRarity').addEventListener('change', () => {
    renderLibraryItems();
  });
  document.getElementById('libItemFilterUnique').addEventListener('change', () => {
    renderLibraryItems();
  });

  // Get Random (Library screen Items tab) — picks a random item from the
  // currently filtered set, weighted by remaining copies, and flashes it in the list.
  document.getElementById('libRandomItemBtn').addEventListener('click', () => {
    const filtered = filterItems(library.items, 'libItemFilterSlot', 'libItemFilterRarity', 'libItemFilterUnique');
    const inPlayCounts = getInPlayCounts();
    const picked = pickRandomItem(filtered, inPlayCounts);
    if (!picked) {
      alert('No items with remaining copies match the current filters.');
      return;
    }
    const remaining = getRemainingCount(picked, inPlayCounts);
    const row = document.querySelector(`#libraryItemList [data-item-id="${picked.id}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('saved-flash');
      setTimeout(() => row.classList.remove('saved-flash'), 1200);
    }
    alert(`🎲 ${picked.name} (${picked.slot}${picked.rarity ? ', ' + picked.rarity : ''}) — ${remaining} of ${picked.quantity} remaining.`);
  });

  // Library: add item
  document.getElementById('libraryItemForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('libItemName').value.trim();
    if (!name) return;
    const slot = document.getElementById('libItemSlot').value;
    const rarity = document.getElementById('libItemRarity').value;
    const unique = document.getElementById('libItemUnique').checked;
    const notes = document.getElementById('libItemNotes').value.trim();
    library.items.push({ id: uid(), name, slot, rarity, unique, notes });
    e.target.reset();
    renderLibraryItems();
    populateItemLibrarySelect();
    scheduleLibrarySave();
  });

  // Library: add ability
  document.getElementById('libraryAbilityForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('libAbilityName').value.trim();
    if (!name) return;
    const discipline = document.getElementById('libAbilityDiscipline').value;
    const tier = Number(document.getElementById('libAbilityTier').value) || null;
    const description = document.getElementById('libAbilityDesc').value.trim();
    library.abilities.push({ id: uid(), name, discipline, tier, description });
    e.target.reset();
    renderLibraryAbilities();
    populateAbilityLibrarySelect();
    scheduleLibrarySave();
  });

  // Library: add esper
  document.getElementById('libraryEsperForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('libEsperName').value.trim();
    if (!name) return;
    const type = document.getElementById('libEsperType').value;
    const notes = document.getElementById('libEsperNotes').value.trim();
    library.espers.push({ id: uid(), name, type, notes });
    e.target.reset();
    renderLibraryEspers();
    populateAllSummonLibrarySelects();
    scheduleLibrarySave();
  });

  // Library: import from file
  document.getElementById('importLibraryBtn').addEventListener('click', async () => {
    const result = await window.api.importLibraryFile();
    if (result.canceled) return;
    if (!result.data) {
      alert('Could not read that file as JSON.');
      return;
    }
    const summary = mergeLibraryData(result.data);
    renderLibraryItems();
    renderLibraryAbilities();
    renderLibraryEspers();
    renderLibraryTemplates();
    populateItemLibrarySelect();
    populateAbilityLibrarySelect();
    populateAllSummonLibrarySelects();
    scheduleLibrarySave();
    alert(
      `Imported: ${summary.items} new item(s), ${summary.abilities} new ability(ies), ${summary.espers} new Esper(s), ${summary.characterTemplates} new Character Template(s).` +
      (summary.updated ? ` Updated ${summary.updated} existing entr${summary.updated === 1 ? 'y' : 'ies'} with new info.` : '')
    );
  });
}

// ---------- Library import merge ----------
function mergeLibraryData(data) {
  const summary = { items: 0, abilities: 0, espers: 0, characterTemplates: 0, updated: 0 };

  (data.items || []).forEach((it) => {
    if (!it || !it.name || !it.slot) return;
    const idx = library.items.findIndex(
      (x) => x.name.toLowerCase() === it.name.toLowerCase() && x.slot === it.slot
    );
    if (idx >= 0) {
      let changed = false;
      if (it.notes && it.notes !== library.items[idx].notes) {
        library.items[idx].notes = it.notes;
        changed = true;
      }
      if (it.rarity && it.rarity !== library.items[idx].rarity) {
        library.items[idx].rarity = it.rarity;
        changed = true;
      }
      if (typeof it.quantity === 'number' && it.quantity > 0 && it.quantity !== library.items[idx].quantity) {
        library.items[idx].quantity = it.quantity;
        changed = true;
      }
      if (typeof it.unique === 'boolean' && it.unique !== library.items[idx].unique) {
        library.items[idx].unique = it.unique;
        changed = true;
      }
      if (changed) summary.updated++;
      return;
    }
    library.items.push({
      id: uid(),
      name: it.name,
      slot: it.slot,
      rarity: it.rarity || '',
      unique: !!it.unique,
      notes: it.notes || '',
      quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1,
    });
    summary.items++;
  });

  (data.abilities || []).forEach((a) => {
    if (!a || !a.name || !a.discipline) return;
    const idx = library.abilities.findIndex(
      (x) => x.name.toLowerCase() === a.name.toLowerCase() && x.discipline === a.discipline
    );
    if (idx >= 0) {
      let changed = false;
      if (a.description && a.description !== library.abilities[idx].description) {
        library.abilities[idx].description = a.description;
        changed = true;
      }
      if (a.tier && a.tier !== library.abilities[idx].tier) {
        library.abilities[idx].tier = a.tier;
        changed = true;
      }
      if (changed) summary.updated++;
      return;
    }
    library.abilities.push({
      id: uid(),
      name: a.name,
      discipline: a.discipline,
      tier: a.tier || null,
      description: a.description || '',
    });
    summary.abilities++;
  });

  (data.espers || []).forEach((e) => {
    if (!e || !e.name) return;
    const idx = library.espers.findIndex((x) => x.name.toLowerCase() === e.name.toLowerCase());
    if (idx >= 0) {
      let changed = false;
      const fields = ['type', 'notes', 'armor', 'defense', 'movement', 'healthMax'];
      fields.forEach((f) => {
        if (e[f] && e[f] !== library.espers[idx][f]) {
          library.espers[idx][f] = e[f];
          changed = true;
        }
      });
      if (Array.isArray(e.abilities) && e.abilities.length > 0) {
        library.espers[idx].abilities = e.abilities.map((a) => ({ name: a.name, description: a.description || '' }));
        changed = true;
      }
      if (changed) summary.updated++;
      return;
    }
    library.espers.push({
      id: uid(),
      name: e.name,
      type: e.type || '',
      notes: e.notes || '',
      armor: e.armor || 0,
      defense: e.defense || 0,
      movement: e.movement || 0,
      healthMax: e.healthMax || 0,
      abilities: Array.isArray(e.abilities)
        ? e.abilities.map((a) => ({ name: a.name, description: a.description || '' }))
        : [],
    });
    summary.espers++;
  });

  (data.characterTemplates || []).forEach((tpl) => {
    if (!tpl || !tpl.templateName) return;
    const idx = library.characterTemplates.findIndex(
      (x) => (x.templateName || '').toLowerCase() === tpl.templateName.toLowerCase()
    );
    if (idx >= 0) {
      if (tpl.notes && tpl.notes !== library.characterTemplates[idx].notes) {
        library.characterTemplates[idx] = { ...library.characterTemplates[idx], ...tpl, id: library.characterTemplates[idx].id };
        summary.updated++;
      }
      return;
    }
    library.characterTemplates.push({ id: uid(), ...tpl });
    summary.characterTemplates++;
  });

  return summary;
}

// ---------- Summon (Familiar / Esper) listeners ----------
function bindSummonListeners(kind) {
  document.getElementById(`${kind}Active`).addEventListener('change', (e) => {
    const c = getActive();
    if (!c) return;
    c[kind].active = e.target.checked;
    document.getElementById(`${kind}Panel`).classList.toggle('hidden', !c[kind].active);
    document.getElementById(`${kind}EmptyMsg`).classList.toggle('hidden', c[kind].active);
    renderSidebar();
    scheduleSave();
  });

  document.getElementById(`${kind}Name`).addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c[kind].name = e.target.value;
    renderSidebar();
    scheduleSave();
  });

  document.getElementById(`useLibrary${capitalize(kind)}Btn`).addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    const select = document.getElementById(`${kind}LibrarySelect`);
    const preset = library.espers.find((e) => e.id === select.value);
    if (!preset) return;
    applySummonPreset(c, kind, preset);
    renderSummon(c, kind);
    renderSidebar();
    scheduleSave();
  });

  document.getElementById(`saveLibrary${capitalize(kind)}Btn`).addEventListener('click', () => {
    const c = getActive();
    if (!c) return;
    const s = c[kind];
    if (!s.name.trim()) {
      alert('Give this summon a name before saving it to the Library.');
      return;
    }
    const type = kind === 'familiar' ? 'Familiar' : 'Exalted Esper';
    const presetData = {
      name: s.name.trim(),
      type,
      notes: s.notes || '',
      armor: s.armor || 0,
      defense: s.defense || 0,
      movement: s.movement || 0,
      healthMax: s.health.max || 0,
      abilities: s.abilities.map((a) => ({ name: a.name, description: a.description || '' })),
    };
    const existingIdx = library.espers.findIndex(
      (e) => e.name.toLowerCase() === presetData.name.toLowerCase() && e.type === type
    );
    if (existingIdx >= 0) {
      library.espers[existingIdx] = { ...library.espers[existingIdx], ...presetData };
    } else {
      library.espers.push({ id: uid(), ...presetData });
    }
    renderLibraryEspers();
    populateAllSummonLibrarySelects();
    scheduleLibrarySave();
    alert(`Saved "${presetData.name}" to the Library.`);
  });

  ['Armor', 'Defense', 'Movement'].forEach((field) => {
    document.getElementById(`${kind}${field}`).addEventListener('input', (e) => {
      const c = getActive();
      if (!c) return;
      c[kind][field.toLowerCase()] = Number(e.target.value) || 0;
      scheduleSave();
    });
  });

  document.getElementById(`${kind}HealthCurrent`).addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c[kind].health.current = Number(e.target.value) || 0;
    updateSummonHealthBar(c, kind);
    renderSidebar();
    scheduleSave();
  });
  document.getElementById(`${kind}HealthMax`).addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c[kind].health.max = Number(e.target.value) || 0;
    updateSummonHealthBar(c, kind);
    renderSidebar();
    scheduleSave();
  });

  document.getElementById(`${kind}StatusForm`).addEventListener('submit', (e) => {
    e.preventDefault();
    const c = getActive();
    if (!c) return;
    const input = document.getElementById(`${kind}StatusInput`);
    const val = input.value.trim();
    if (!val) return;
    c[kind].statusEffects.push(val);
    input.value = '';
    renderSummonStatusEffects(c, kind);
    scheduleSave();
  });

  document.getElementById(`${kind}AbilityForm`).addEventListener('submit', (e) => {
    e.preventDefault();
    const c = getActive();
    if (!c) return;
    const name = document.getElementById(`${kind}AbilityName`).value.trim();
    if (!name) return;
    const description = document.getElementById(`${kind}AbilityDesc`).value.trim();
    const active = document.getElementById(`${kind}AbilityActive`).checked;
    c[kind].abilities.push({ id: uid(), name, description, active });
    e.target.reset();
    renderSummonAbilities(c, kind);
    scheduleSave();
  });

  document.getElementById(`${kind}Notes`).addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c[kind].notes = e.target.value;
    scheduleSave();
  });
}

init();
