const { ipcMain } = require("electron");
const { getSettingsStore } = require("./src/stores/settingsStore");

async function run() {
  const store = require("./src/stores/settingsStore").useSettingsStore;
  if (!store) {
    console.log("No store found");
    return;
  }
  const state = store.getState();
  console.log("Before state:", state.localTranscriptionProvider, state.huggingFaceModel);
  
  state.setLocalTranscriptionProvider("huggingface");
  state.setHuggingFaceModel("parakeet-rnnt-1.1b-mlx");
  
  const stateAfter = store.getState();
  console.log("After state:", stateAfter.localTranscriptionProvider, stateAfter.huggingFaceModel);
}
run();
