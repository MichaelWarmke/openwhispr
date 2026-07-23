const { app } = require("electron");
const { getSettingsStore } = require("./src/stores/settingsStore");

async function run() {
  const store = getSettingsStore ? getSettingsStore() : {};
  console.log("Current state:", store);
}
run();
