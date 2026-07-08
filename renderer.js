// ---------- Constants ----------
const DISCIPLINES = ['Assemblage', 'Cruor', 'Martial', 'Sanctus', 'Subterfuge'];
const DISCIPLINE_VARS = {
  Assemblage: '--d-assemblage',
  Cruor: '--d-cruor',
  Martial: '--d-martial',
  Sanctus: '--d-sanctus',
  Subterfuge: '--d-subterfuge',
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
    level: 1,
    xp: 0,
    health: { current: 10, max: 10 },
    armor: 0,
    defense: 10,
    movement: 6,
    statusEffects: [],
    disciplines,
    abilities: [],
    inventory: [],
    notes: '',
    esper: blankEsper(),
  };
}

function blankEsper() {
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

  renderSidebar();
  renderSheet();
  renderLibraryItems();
  renderLibraryAbilities();
  renderLibraryTemplates();
  showView('character');
  bindStaticListeners();
}

function normalizeLibrary() {
  if (!Array.isArray(library.items)) library.items = [];
  if (!Array.isArray(library.abilities)) library.abilities = [];
  if (!Array.isArray(library.characterTemplates)) library.characterTemplates = [];
}

function normalizeCharacter(c) {
  if (!c.disciplines) c.disciplines = {};
  DISCIPLINES.forEach((d) => {
    if (!c.disciplines[d]) c.disciplines[d] = { points: 0, notes: '' };
  });
  if (!c.statusEffects) c.statusEffects = [];
  if (!c.abilities) c.abilities = [];
  if (!c.inventory) c.inventory = [];
  if (!c.health) c.health = { current: 10, max: 10 };
  if (typeof c.notes !== 'string') c.notes = '';

  if (!c.esper) c.esper = blankEsper();
  if (typeof c.esper.active !== 'boolean') c.esper.active = false;
  if (typeof c.esper.name !== 'string') c.esper.name = '';
  if (!c.esper.health) c.esper.health = { current: 0, max: 0 };
  if (!Array.isArray(c.esper.statusEffects)) c.esper.statusEffects = [];
  if (!Array.isArray(c.esper.abilities)) c.esper.abilities = [];
  if (typeof c.esper.notes !== 'string') c.esper.notes = '';
  if (typeof c.esper.armor !== 'number') c.esper.armor = 0;
  if (typeof c.esper.defense !== 'number') c.esper.defense = 0;
  if (typeof c.esper.movement !== 'number') c.esper.movement = 0;
}

// ---------- Sidebar ----------
function renderSidebar() {
  const list = document.getElementById('characterList');
  list.innerHTML = '';
  characters.forEach((c) => {
    const pct = c.health.max > 0 ? Math.max(0, Math.min(100, (c.health.current / c.health.max) * 100)) : 0;
    const card = document.createElement('div');
    card.className = 'char-card' + (c.id === activeId ? ' active' : '');
    const esperLine = c.esper && c.esper.active
      ? `<div class="char-esper-line"><span>${escapeHtml(c.esper.name || 'Esper')}</span><span>${c.esper.health.current}/${c.esper.health.max} HP</span></div>`
      : '';
    card.innerHTML = `
      <div class="char-card-name"><span>${escapeHtml(c.name || 'Unnamed')}</span></div>
      <div class="char-card-class">${escapeHtml(c.className || 'No class set')} &middot; Lv ${c.level || 1}</div>
      <div class="char-hp-bar"><div class="char-hp-bar-fill" style="width:${pct}%"></div></div>
      <div class="char-hp-text">${c.health.current} / ${c.health.max} HP</div>
      ${esperLine}
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

// ---------- Sheet render ----------
function renderSheet() {
  const empty = document.getElementById('emptyState');
  const sheet = document.getElementById('characterSheet');
  const c = getActive();

  if (!c) {
    empty.classList.remove('hidden');
    sheet.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  sheet.classList.remove('hidden');

  document.getElementById('charName').value = c.name || '';
  document.getElementById('charClass').value = c.className || '';

  document.getElementById('statLevel').value = c.level ?? 1;
  document.getElementById('statXp').value = c.xp ?? 0;
  document.getElementById('statArmor').value = c.armor ?? 0;
  document.getElementById('statDefense').value = c.defense ?? 0;
  document.getElementById('statMovement').value = c.movement ?? 0;

  document.getElementById('healthCurrent').value = c.health.current;
  document.getElementById('healthMax').value = c.health.max;
  updateHealthBar(c);

  renderStatusEffects(c);
  renderInventory(c);
  renderDisciplines(c);
  renderAbilities(c);
  renderEsper(c);

  document.getElementById('notesArea').value = c.notes || '';
}

function renderEsper(c) {
  document.getElementById('esperActive').checked = c.esper.active;
  document.getElementById('esperPanel').classList.toggle('hidden', !c.esper.active);
  document.getElementById('esperEmptyMsg').classList.toggle('hidden', c.esper.active);

  document.getElementById('esperName').value = c.esper.name || '';
  document.getElementById('esperArmor').value = c.esper.armor ?? 0;
  document.getElementById('esperDefense').value = c.esper.defense ?? 0;
  document.getElementById('esperMovement').value = c.esper.movement ?? 0;
  document.getElementById('esperHealthCurrent').value = c.esper.health.current;
  document.getElementById('esperHealthMax').value = c.esper.health.max;
  updateEsperHealthBar(c);

  renderEsperStatusEffects(c);
  renderEsperAbilities(c);

  document.getElementById('esperNotes').value = c.esper.notes || '';
}

function updateEsperHealthBar(c) {
  const pct = c.esper.health.max > 0 ? Math.max(0, Math.min(100, (c.esper.health.current / c.esper.health.max) * 100)) : 0;
  document.getElementById('esperHealthBarFill').style.width = pct + '%';
}

function renderEsperStatusEffects(c) {
  const wrap = document.getElementById('esperStatusList');
  wrap.innerHTML = '';
  c.esper.statusEffects.forEach((effect, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${escapeHtml(effect)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
      c.esper.statusEffects.splice(idx, 1);
      renderEsperStatusEffects(c);
      scheduleSave();
    });
    chip.appendChild(btn);
    wrap.appendChild(chip);
  });
}

function renderEsperAbilities(c) {
  const wrap = document.getElementById('esperAbilityList');
  wrap.innerHTML = '';
  if (c.esper.abilities.length === 0) {
    wrap.innerHTML = '<div class="muted">No abilities added yet.</div>';
    return;
  }
  c.esper.abilities.forEach((ab, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(ab.name)} ${ab.active ? '<span class="li-badge equipped">Active</span>' : ''}</div>
        ${ab.description ? `<div class="li-sub">${escapeHtml(ab.description)}</div>` : ''}
      </div>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      c.esper.abilities.splice(idx, 1);
      renderEsperAbilities(c);
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

function renderInventory(c) {
  const wrap = document.getElementById('inventoryList');
  wrap.innerHTML = '';
  if (c.inventory.length === 0) {
    wrap.innerHTML = '<div class="muted">No items yet.</div>';
    return;
  }
  c.inventory.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(item.name)} <span class="li-badge">${escapeHtml(item.slot)}</span> ${item.equipped ? '<span class="li-badge equipped">Equipped</span>' : ''}</div>
        ${item.notes ? `<div class="li-sub">${escapeHtml(item.notes)}</div>` : ''}
      </div>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      c.inventory.splice(idx, 1);
      renderInventory(c);
      renderSidebar();
      scheduleSave();
    });
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
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(ab.name)} <span class="li-badge">${escapeHtml(ab.discipline)}</span> ${ab.tier ? `<span class="li-badge">Tier ${ab.tier}</span>` : ''} ${ab.learned ? '<span class="li-badge learned">Learned</span>' : ''}</div>
        ${ab.description ? `<div class="li-sub">${escapeHtml(ab.description)}</div>` : ''}
      </div>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      c.abilities.splice(idx, 1);
      renderAbilities(c);
      scheduleSave();
    });
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
function populateItemLibrarySelect() {
  const select = document.getElementById('itemLibrarySelect');
  const current = select.value;
  select.innerHTML = '<option value="">— Pick from Library —</option>' +
    library.items.map((it) => `<option value="${it.id}">${escapeHtml(it.name)} (${escapeHtml(it.slot)})</option>`).join('');
  select.value = current;
}

function populateAbilityLibrarySelect() {
  const select = document.getElementById('abilityLibrarySelect');
  const disciplineSelect = document.getElementById('abilityDiscipline');
  const filterDiscipline = disciplineSelect ? disciplineSelect.value : null;
  const filtered = filterDiscipline
    ? library.abilities.filter((a) => a.discipline === filterDiscipline)
    : library.abilities;
  select.innerHTML = '<option value="">— Pick from Library —</option>' +
    filtered.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}${a.tier ? ' (Tier ' + a.tier + ')' : ''}</option>`).join('');
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
  if (library.items.length === 0) {
    wrap.innerHTML = '<div class="muted">No items saved yet.</div>';
    return;
  }
  library.items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="li-main">
        <div class="li-name">${escapeHtml(item.name)} <span class="li-badge">${escapeHtml(item.slot)}</span></div>
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
        <div class="li-sub">${escapeHtml(tpl.className || 'No class set')} &middot; Lv ${tpl.level || 1}</div>
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
      (tpl) => `${escapeHtml(tpl.templateName)}<div class="mo-sub">${escapeHtml(tpl.className || 'No class set')} &middot; Lv ${tpl.level || 1}</div>`,
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
  bindNumber('statLevel', 'level');
  bindNumber('statXp', 'xp');
  bindNumber('statArmor', 'armor');
  bindNumber('statDefense', 'defense');
  bindNumber('statMovement', 'movement');

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

  // Use from library (item)
  document.getElementById('useLibraryItemBtn').addEventListener('click', () => {
    const select = document.getElementById('itemLibrarySelect');
    const item = library.items.find((it) => it.id === select.value);
    if (!item) return;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemSlot').value = item.slot;
    document.getElementById('itemNotes').value = item.notes || '';
  });

  // Inventory form
  document.getElementById('inventoryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = getActive();
    if (!c) return;
    const name = document.getElementById('itemName').value.trim();
    if (!name) return;
    const slot = document.getElementById('itemSlot').value;
    const equipped = document.getElementById('itemEquipped').checked;
    const notes = document.getElementById('itemNotes').value.trim();
    const saveToLibrary = document.getElementById('itemSaveToLibrary').checked;
    c.inventory.push({ id: uid(), name, slot, equipped, notes });

    if (saveToLibrary) {
      const exists = library.items.some(
        (it) => it.name.toLowerCase() === name.toLowerCase() && it.slot === slot
      );
      if (!exists) {
        library.items.push({ id: uid(), name, slot, notes });
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

  // Use from library (ability)
  document.getElementById('useLibraryAbilityBtn').addEventListener('click', () => {
    const select = document.getElementById('abilityLibrarySelect');
    const ability = library.abilities.find((a) => a.id === select.value);
    if (!ability) return;
    document.getElementById('abilityName').value = ability.name;
    document.getElementById('abilityDiscipline').value = ability.discipline;
    document.getElementById('abilityTier').value = ability.tier || '';
    document.getElementById('abilityDesc').value = ability.description || '';
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

  // Esper: active toggle
  document.getElementById('esperActive').addEventListener('change', (e) => {
    const c = getActive();
    if (!c) return;
    c.esper.active = e.target.checked;
    document.getElementById('esperPanel').classList.toggle('hidden', !c.esper.active);
    document.getElementById('esperEmptyMsg').classList.toggle('hidden', c.esper.active);
    renderSidebar();
    scheduleSave();
  });

  document.getElementById('esperName').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.esper.name = e.target.value;
    renderSidebar();
    scheduleSave();
  });

  const bindEsperNumber = (id, field) => {
    document.getElementById(id).addEventListener('input', (e) => {
      const c = getActive();
      if (!c) return;
      c.esper[field] = Number(e.target.value) || 0;
      scheduleSave();
    });
  };
  bindEsperNumber('esperArmor', 'armor');
  bindEsperNumber('esperDefense', 'defense');
  bindEsperNumber('esperMovement', 'movement');

  document.getElementById('esperHealthCurrent').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.esper.health.current = Number(e.target.value) || 0;
    updateEsperHealthBar(c);
    renderSidebar();
    scheduleSave();
  });
  document.getElementById('esperHealthMax').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.esper.health.max = Number(e.target.value) || 0;
    updateEsperHealthBar(c);
    renderSidebar();
    scheduleSave();
  });

  document.getElementById('esperStatusForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = getActive();
    if (!c) return;
    const input = document.getElementById('esperStatusInput');
    const val = input.value.trim();
    if (!val) return;
    c.esper.statusEffects.push(val);
    input.value = '';
    renderEsperStatusEffects(c);
    scheduleSave();
  });

  document.getElementById('esperAbilityForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = getActive();
    if (!c) return;
    const name = document.getElementById('esperAbilityName').value.trim();
    if (!name) return;
    const description = document.getElementById('esperAbilityDesc').value.trim();
    const active = document.getElementById('esperAbilityActive').checked;
    c.esper.abilities.push({ id: uid(), name, description, active });
    e.target.reset();
    renderEsperAbilities(c);
    scheduleSave();
  });

  document.getElementById('esperNotes').addEventListener('input', (e) => {
    const c = getActive();
    if (!c) return;
    c.esper.notes = e.target.value;
    scheduleSave();
  });

  // Library: add item
  document.getElementById('libraryItemForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('libItemName').value.trim();
    if (!name) return;
    const slot = document.getElementById('libItemSlot').value;
    const notes = document.getElementById('libItemNotes').value.trim();
    library.items.push({ id: uid(), name, slot, notes });
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
}

init();
