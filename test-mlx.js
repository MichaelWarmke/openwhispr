const MlxServerManager = require("./src/helpers/mlxServer");
async function run() {
  const manager = new MlxServerManager();
  // Override isAvailable so it bypasses checks
  manager.isAvailable = () => true;
  manager.isModelDownloaded = () => true;
  
  try {
    console.log("Starting server...");
    const res = await manager.startServer("test-model", "/tmp");
    console.log("Server started on port:", res.port);
    await manager.stopServer();
    console.log("Server stopped");
  } catch (err) {
    console.error("Error:", err);
    await manager.stopServer();
  }
}
run();
