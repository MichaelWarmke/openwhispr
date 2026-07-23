const { ipcMain } = require("electron");
const IPCHandlers = require("./src/helpers/ipcHandlers");
const AppManagerMock = {
  windowManager: {},
  trayManager: {},
  environmentManager: { getActiveEnv: () => "development" },
  databaseManager: { getNotes: () => [] },
  whisperManager: {},
  parakeetManager: new (require("./src/helpers/parakeet"))(),
  mlxManager: new (require("./src/helpers/mlxManager"))(),
  globeKeyManager: {},
  windowsKeyManager: {},
};
AppManagerMock.parakeetManager.initializeAtStartup({});
AppManagerMock.mlxManager.initializeAtStartup({});

async function run() {
  const handlers = new IPCHandlers(AppManagerMock);
  const mlxModels = await handlers.mlxManager.listModels();
  const parakeetModels = await handlers.parakeetManager.listParakeetModels();
  console.log(JSON.stringify({ models: [...parakeetModels.models, ...mlxModels], cache_dir: parakeetModels.cache_dir, success: true }, null, 2));
}
run();
