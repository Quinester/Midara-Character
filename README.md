# Middara Character Manager

A small desktop app (Electron) for tracking multiple characters across sessions of **Middara: Unintentional Malum**.

## Features

- Manage any number of characters, switch between them in the sidebar
- Stats: Level, XP, Health (current/max with bar), Armor, Defense, Movement, Status Effects
- Inventory & equipment tracking (name, slot, equipped toggle, notes)
- Skills: the 5 discipline trees (Assemblage, Cruor, Martial, Sanctus, Subterfuge) with points invested + notes, plus a free-form ability list
- Campaign/session notes per character
- Duplicate, export (to a `.json` file), and import characters
- **Library**: save items, abilities, and full character templates once, then pick them from a dropdown instead of retyping every time
- **Esper**: each character has an attached Esper sub-sheet for tracking a summoned companion separately from the Adventurer's own stats
- Autosaves to disk as you type — nothing to hit "Save" on

## Using the Library

Click **📚 Library** in the sidebar to manage your saved presets:

- **Items** — add an item once (name, slot, notes) and it shows up in the "Pick from Library" dropdown on any character's Inventory tab. Click **Use**, tweak Equipped/notes if needed, then **Add Item**.
- **Abilities** — same idea for the Skills tab, filtered by whichever Discipline is selected.
- **Character Templates** — click the **⭐** button in any character's header to save that character as a reusable template (stats, disciplines, abilities, inventory — everything). Later, use **+ From Template** in the sidebar to spin up a new character pre-filled from a saved template.

You can also build the library organically during play: when adding an item or ability directly on a character sheet, check **"Save to Library"** before submitting and it's remembered for next time — no need to visit the Library screen at all.

There's no built-in official item/ability database (Middara's cards aren't published online in text form, and Act 2/3 haven't shipped yet), so the library starts empty — it fills up as you use it.

## Using the Esper tab

Each character has an **Esper** tab alongside Stats/Inventory/Skills/Notes. Check **"This character has a summoned Esper"** to reveal its own mini sheet:

- Name, Armor, Defense, Movement, and a Health bar (all separate from the Adventurer's own stats)
- Status Effects (same chip-based add/remove as the main Stats tab)
- Abilities (name, description, and an Active toggle)
- Free-form notes (summon conditions, bond level, flavor, etc.)

When active, the Esper's name and current HP also show up as a small line on that character's card in the sidebar, so you can track both HP pools at a glance. Uncheck the box if a character stops using their Esper — the data stays saved in case they summon it again later.

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
