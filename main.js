const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

function dataFilePath() {
  return path.join(app.getPath('userData'), 'characters.json');
}

function libraryFilePath() {
  return path.join(app.getPath('userData'), 'library.json');
}

async function readCharacters() {
  try {
    const raw = await fs.readFile(dataFilePath(), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

async function writeCharacters(characters) {
  await fs.writeFile(dataFilePath(), JSON.stringify(characters, null, 2), 'utf-8');
}

async function readLibrary() {
  try {
    const raw = await fs.readFile(libraryFilePath(), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { items: [], abilities: [], characterTemplates: [] };
  }
}

async function writeLibrary(library) {
  await fs.writeFile(libraryFilePath(), JSON.stringify(library, null, 2), 'utf-8');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#161320',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('characters:load', async () => {
  return readCharacters();
});

ipcMain.handle('characters:save', async (_event, characters) => {
  await writeCharacters(characters);
  return true;
});

ipcMain.handle('library:load', async () => {
  return readLibrary();
});

ipcMain.handle('library:save', async (_event, library) => {
  await writeLibrary(library);
  return true;
});

ipcMain.handle('character:export', async (_event, character) => {
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export Character',
    defaultPath: `${(character.name || 'character').replace(/[\\/:*?"<>|]/g, '_')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  await fs.writeFile(filePath, JSON.stringify(character, null, 2), 'utf-8');
  return { canceled: false, filePath };
});

ipcMain.handle('character:import', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import Character',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };
  try {
    const raw = await fs.readFile(filePaths[0], 'utf-8');
    const character = JSON.parse(raw);
    return { canceled: false, character };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
});
