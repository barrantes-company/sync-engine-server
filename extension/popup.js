'use strict';

const workspaceInput = document.getElementById('workspace-url');
const workspaceForm = document.getElementById('workspace-form');
const openButton = document.getElementById('open-workspace');
const status = document.getElementById('status');
const STORAGE_KEY = 'syncEngineWorkspaceUrl';

function normalizedWorkspaceUrl(value) {
  const url = new URL(value);
  const isLocalDevelopment = url.protocol === 'http:' && url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !isLocalDevelopment) {
    throw new Error('Usa una dirección HTTPS (o HTTP en localhost para desarrollo).');
  }
  return url.href;
}

chrome.storage.local.get(STORAGE_KEY).then((result) => {
  if (result[STORAGE_KEY]) {
    workspaceInput.value = result[STORAGE_KEY];
    openButton.disabled = false;
  }
}).catch((error) => {
  status.textContent = `No se pudo cargar la dirección: ${error.message}`;
});

workspaceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const url = normalizedWorkspaceUrl(workspaceInput.value.trim());
    await chrome.storage.local.set({ [STORAGE_KEY]: url });
    workspaceInput.value = url;
    openButton.disabled = false;
    status.textContent = 'Dirección guardada.';
  } catch (error) {
    status.textContent = error instanceof TypeError
      ? 'Escribe una dirección web válida.'
      : error.message;
  }
});

openButton.addEventListener('click', async () => {
  try {
    const url = normalizedWorkspaceUrl(workspaceInput.value.trim());
    await chrome.tabs.create({ url });
  } catch (error) {
    status.textContent = error instanceof TypeError
      ? 'Escribe una dirección web válida.'
      : error.message;
  }
});
