# Middara Character Manager

A small desktop app (Electron) for tracking multiple characters across sessions of **Middara: Unintentional Malum**.

## Features

- Manage any number of characters, switch between them in the sidebar
- Stats: XP, Health (current/max with bar), Armor, Defense, Movement, Stamina (0-5), the 5 core attributes (Presence, Lore, Agility, Perception, Strength), Conviction Dice, Casting Dice, Status Effects
- Inventory & equipment tracking (name, slot, equipped toggle, notes), with the official per-slot equip limits enforced (see below)
- Skills: the 5 discipline trees (Assemblage, Cruor, Martial, Sanctus, Subterfuge) with points invested + notes, plus a free-form ability list
- Campaign/session notes per character
- Duplicate, export (to a `.json` file), and import characters
- **Library**: save items, abilities, and full character templates once, then pick them from a dropdown instead of retyping every time
- **Summons**: each character has independent Familiar and Esper sub-sheets — both can be active at the same time, each tracked separately from the Adventurer's own stats
- **Usage tracking**: any item, ability, or summon ability whose text mentions Flip, Exhaust, or Per Encounter automatically gets a matching checkbox so you can mark it used during play — each keyword is tracked independently
- **Turn/Encounter buttons**: at the top of a character's sheet, next to the name — **New Turn** clears all Exhausted checkboxes and adds +3 Stamina (capped at 5), **New Encounter** clears all Per Encounter AND Exhausted checkboxes (a new encounter also resets exhaustion), and **Restore** clears all Flipped checkboxes. All three sweep across Inventory items, Skills-tab Abilities, and both Familiar/Esper summon abilities at once.
- Autosaves to disk as you type — nothing to hit "Save" on

## Using the Library

Click **📚 Library** in the sidebar to manage your saved presets:

- **Items** — add an item once (name, slot, rarity, notes) and it shows up in the "Pick from Library" dropdown on any character's Inventory tab. Selecting an item there adds it straight to the character's inventory — no extra "Use"/confirm step — and you can tweak Equipped, notes, and everything else afterward with the row's ✎ edit button. Both the Library's Items tab and a character's Inventory tab have Type and Rarity filter dropdowns above the list/picker — narrow by either or both to quickly find what you're looking for. Item slot options are Weapon, Armor, Core, Accessory, **Relic**, Consumable, and Other.
- **Quantity & availability** — every library item now carries a `quantity`: how many physical copies of that card exist in the base game (pulled from the seed file; defaults to 1 for anything not explicitly set). The app tracks how many copies are currently sitting in *any* character's inventory ("in play") and shows **remaining = quantity − in play** next to each item, both in the Library's Items list and in the "Pick from Library" dropdown on a character's Inventory tab.
- **🎲 Get Random** — next to the Type/Rarity filters (on both the Library's Items tab and a character's Inventory tab) is a **Get Random** button. It picks a random item from whatever the filters currently show, weighted by remaining copies (an item with 4 left is 4x more likely to come up than one with 1 left), and skips anything with 0 remaining. On the Inventory tab it adds the pick straight to inventory; in the Library it flashes the picked row.
- **Unique** — a standalone **Unique** checkbox (separate from Rarity) marks items that are one-of-a-kind regardless of type or rarity tier — e.g. a Mundane item and a Rare item can both be Unique. It shows up as its own checkbox on the item add/edit forms, as an orange "Unique" badge on item rows, and as a **"Unique only"** filter checkbox next to the Type/Rarity dropdowns (Library Items tab and character Inventory tab) so you can narrow down to just the unique pool.
- **Abilities** — same idea for the Skills tab: pick one from the "Pick from Library" dropdown and it's added straight to the character's ability list, no extra step. The Discipline dropdown above it still filters which abilities show up, so you can narrow the list before picking. Like items, every ability row has a ✎ edit button (name, discipline, tier, Learned, description) so you can adjust it after adding.
- **Character Templates** — click the **⭐** button in any character's header to save that character as a reusable template (stats, disciplines, abilities, inventory — everything). Later, use **+ From Template** in the sidebar to spin up a new character pre-filled from a saved template.

You can also build the library organically during play: when adding an item or ability directly on a character sheet, check **"Save to Library"** before submitting and it's remembered for next time — no need to visit the Library screen at all.

Already have items or abilities on a character sheet that you forgot to check that box for? Every item and ability row on the Inventory and Skills tabs now has a small **📥** button — click it to push that exact row into the Library retroactively, any time. It briefly highlights to confirm the save. Duplicate names (same name + slot for items, same name + discipline for abilities) are skipped automatically.

There's no built-in official item/ability database (Middara's cards aren't published online in text form, and Act 2/3 haven't shipped yet), so the library starts empty — it fills up as you use it.

### Importing library data

Click **Import** in the top-right of the Library screen to load presets from a JSON file — useful for bulk-loading data from a source you trust (a Tabletop Simulator mod export, a spreadsheet you built, another copy of this app, etc.) instead of adding entries one at a time.

The file should look like:
```json
{
  "items": [{ "name": "...", "slot": "Weapon", "rarity": "Uncommon", "unique": false, "quantity": 1, "notes": "..." }],
  "abilities": [{ "name": "...", "discipline": "Cruor", "tier": 2, "description": "..." }],
  "espers": [{ "name": "...", "type": "Familiar", "notes": "..." }],
  "characterTemplates": [{ "templateName": "...", "className": "Adventurer", "health": { "current": 12, "max": 12 }, "armor": 0, "defense": 7, "movement": 6, "stamina": 3, "presence": 0, "lore": 0, "agility": 0, "perception": 0, "strength": 0, "conviction": "2 Purple", "casting": "1 Purple", "notes": "..." }]
}
```
`rarity` is optional (Mundane, Common, Uncommon, Rare, or Story) — omit it or leave it blank if unknown. `unique` is an independent optional boolean (defaults to `false`) — an item can be any rarity AND unique at the same time. `quantity` is also optional and defaults to 1 if omitted.
Any of the four arrays can be omitted. Duplicate names (matched case-insensitively against what's already in your library — `templateName` for Character Templates) are skipped automatically, so it's safe to re-import the same file later.

A seed file, `middara-library-seed.json`, ships alongside this app — it was built from a Tabletop Simulator digital copy of the base game and contains all 110 official Discipline ability names (across all 5 trees, with correct tier), the names of the 4 Exalted Espers, 4 Familiars, and 6 Loyal Espers (Enslaved Spirit, Agares, Femke, Diem, Eliphie, Zulfiqar — found on the Act 1 Command AI Tiles), 254 Act 1 items (weapons, armor, cores, accessories, relics, and consumables), and the 4 premade Adventurers (Rook Lars, Nightingale Arsen, Zeke Jeong, Remi Moretti) as Character Templates. Import it to pre-fill your Abilities, Espers, Items, and Character Templates pickers with real names.

### The 4 Adventurers

The base game's 4 premade Adventurers ship in the seed file as Character Templates rather than a separate picker, since the app already has a Library → Character Templates feature built for exactly this. After importing the seed file, open the sidebar's **+ From Template** picker to spin up a new character pre-filled as Rook Lars, Nightingale Arsen, Zeke Jeong, or Remi Moretti — Health, Armor, Defense, Movement, Stamina, all 5 core attributes, Conviction Dice, and Casting Dice are set from their tile stats, and their passive/ability text is folded into the new character's Notes. These 4 don't include the 7 "Hidden" alternate Adventurer variants also found in the mod files, since the base game only puts these 4 in play by default.

### Attributes and dice

Every character's Stats tab now has the 5 core attributes from the tabletop rules — **Presence, Lore, Agility, Perception, Strength** — as plain number fields, plus free-text **Conviction Dice** and **Casting Dice** fields (e.g. `2 Purple`, `1 White`) since dice count and color vary by character. These are blank/zero by default on a new character and fill in automatically when you spin one up from a Character Template that has them set (all 4 Adventurer templates in the seed file do).

Loyal Espers show up as their own `type` in the Library's Espers tab (and in the "Add to Library" form's Type dropdown), alongside Exalted Esper and Familiar. On a character sheet's Summons tab, the Esper slot's "Pick from Library" dropdown offers both Exalted Espers and Loyal Espers (since either can be summoned into that slot), while the Familiar slot's dropdown only offers Familiars. Unlike the Exalted Espers/Familiars (name-only, no card text was recoverable for those), all 6 Loyal Espers have full rule text transcribed directly off their Command Tile images — passive traits, every ability with its SP cost, and full stat lines (Presence/Lore/Agility/Perception/Strength, Combat Dice, Conviction, Casting). Their Health and Defense are marked with a `*` on the source tile (scales with whoever summoned them), so they're recorded as `*` rather than a fixed number.

Full rule text has been transcribed directly off the card images for Assemblage, Cruor, Martial, Sanctus, and Subterfuge (108 of 110 abilities). Only two Martial cards (Anticipated Attack, Blood Rage) still have blank descriptions — their source card images were never cached by the Tabletop Simulator mod on the machine this was built on, so their text couldn't be recovered. Re-importing this seed file is safe even if you already imported an older copy — matching abilities are updated with the new info instead of being skipped.

Items are similarly transcribed from the Act 1 gear cards: 168 of 254 items have full rule text (cost, dice, hands/range, all abilities, and equip bonuses) transcribed directly off the card images. The remaining 86 items have a name and correct slot but a blank `notes` field — their card images were never cached by the mod, so no text could be recovered for them. All 254 items also carry a `rarity` (Mundane, Common, Uncommon, Rare, or Story) pulled from the source cards — 220 of 254 have a known rarity; 34 are blank because their rarity couldn't be determined. None are pre-marked `unique` yet — that's a separate flag from rarity, so mark items unique yourself as you identify them. Every item also carries a `quantity` — how many physical copies of that card actually exist in the base game, counted directly from the Tabletop Simulator mod file (112 items have more than 1 copy, e.g. Vitality Juice Box ×10, Bottled Blessing ×4; the rest are single copies). Re-importing this seed file is safe even if you already imported an older copy — matching entries are updated with the new info (including rarity and quantity) instead of being skipped, so descriptions, rarities, and quantities will fill in automatically as more get transcribed.

66 of the 254 items are Relics — cross-checked directly against the mod's `Gear_Relic` tag and correctly re-slotted (they were originally miscategorized as Accessory/Weapon/Consumable during the initial card transcription, since the app didn't have a Relic slot option yet). One additional Relic-tagged object from the mod, "Brute Serum," isn't in the seed file at all — it's tagged `Hidden`/`BP3` in the source data, suggesting a hidden blueprint/boss-drop item rather than standard shop loot, so it was left out of scope.

## Equip limits

Per the rulebook's "Item Limits" box (pg. 24), an Adventurer can't equip more than: **2 Weapons** (2 Hands), **1 Armor**, **1 Core**, **1 Accessory**, **3 Relics**, and **3 Consumables**. The Inventory tab shows a small summary bar above the item list (e.g. `Weapon 1/2`, `Relic 3/3`) so you can see how close each slot is to full at a glance — a slot turns red if it's somehow over its limit (e.g. from old data).

Checking **Equipped** on the Add Item form or an item's ✎ edit form is blocked once a slot is full — you'll get an alert and the item is saved as not-equipped instead, so nothing is lost, it just doesn't count as equipped. Slots without an official limit (**Core** upgrades aside, and the catch-all **Other** type) aren't capped.

**Rook Lars** is a documented exception — his passive grants an extra Consumable slot, so his template (and any character made from it) is capped at **4 Consumables** instead of 3. This is stored per-character as `equipLimitOverrides` (e.g. `{ "Consumable": 4 }`), so it survives export/import and duplication.

Two things this doesn't model, since they're dynamic rather than fixed per character: the rulebook also lets Weapons take up either 1 or 2 of the "2 Hands" depending on whether they're 1-Handed or 2-Handed (not yet tracked per-item, so the Weapon limit here is a simple "2 equipped Weapons" count instead), and a few Abilities/Items (like the Assemblage discipline "Helping Hands" or the Seraphim Sidekick Core) grant temporary extra Relic/Consumable slots while active — those aren't auto-detected, so you'll need to bump `equipLimitOverrides` yourself (or just equip past the shown limit and disregard the alert) if a character has one of those active.

## Using the Summons tab

Each character has a **Summons** tab alongside Stats/Inventory/Skills/Notes, with two independent sections: **Familiar** and **Esper** (Exalted Esper). Since a character can have both active in play at once, each has its own toggle — check **"This character has a summoned Familiar"** and/or **"This character has a summoned Esper"** to reveal either mini sheet (or both):

- Name (with a "Pick from Library" dropdown — the Library's Espers tab holds reusable presets, filtered to show Familiar names on the Familiar picker and Exalted Esper names on the Esper picker), Armor, Defense, Movement, and a Health bar (all separate from the Adventurer's own stats, and separate from each other)
- Status Effects (same chip-based add/remove as the main Stats tab)
- Abilities (name, description, and an Active toggle)
- Free-form notes (summon conditions, bond level, flavor, etc.)

Whichever are active also show up as small HP lines on that character's card in the sidebar, so you can track all of a character's HP pools at a glance. Uncheck a box if a character stops using that summon — the data stays saved in case it's summoned again later.

**Save to Library:** once you've filled in a Familiar or Esper's name, stats, and abilities, click the **Save to Library** button next to its "Pick from Library" dropdown. This saves the whole thing — name, Armor/Defense/Movement, max Health, notes, and every ability — as a reusable preset, not just the name. Next time (on this character or any other), pick it from the dropdown and hit **Use** to fill in everything at once instead of retyping it. Saving again under the same name updates that preset in place, so you can tweak a summon's stats mid-campaign and re-save to keep the library version current.

## Running it in VS Code

1. Open this `middara-character-manager` folder in VS Code (`File > Open Folder...`).
2. Open a terminal in VS Code (`` Terminal > New Terminal ``).
3. Install dependencies (only needed once):

   ```
   npm install
   ```

4. Start the app:

   ```
   npm start
   ```

This launches the app in its own window. Character data is saved automatically to your OS's app data folder (not this project folder), so it persists between runs. Use the Export button on a character to save a portable `.json` copy anywhere you like, and Import to bring one back in.

## Customizing

The stat fields and discipline names are meant to match the base game, but you own the data model — open `renderer.js` and look for the `DISCIPLINES` array or `blankCharacter()` function if you want to adjust fields, add new trees, or change defaults. All UI is plain HTML/CSS/JS (no build step), so edits take effect the next time you run `npm start`.
