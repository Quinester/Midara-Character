const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadCharacters: () => ipcRenderer.invoke('characters:load'),
  saveCharacters: (characters) => ipcRenderer.invoke('characters:save', characters),
  exportCharacter: (character) => ipcRenderer.invoke('character:export', character),
  importCharacter: () => ipcRenderer.invoke('character:import'),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: (library) => ipcRenderer.invoke('library:save', library),
  importLibraryFile: () => ipcRenderer.invoke('library:importFile'),
});
