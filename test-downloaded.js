const fs = require("fs");
const path = require("path");
const { getCacheRoot } = require("./src/helpers/modelDirUtils");
const MlxServerManager = require("./src/helpers/mlxServer");
const manager = new MlxServerManager();
const modelName = "parakeet-rnnt-1.1b-mlx";
const modelDir = path.join(getCacheRoot(), "huggingface", modelName);

console.log("Model Dir:", modelDir);
console.log("Exists?", fs.existsSync(modelDir));
if (fs.existsSync(modelDir)) {
  console.log("Contents:", fs.readdirSync(modelDir));
}
console.log("isModelDownloaded?", manager.isModelDownloaded(modelName, modelDir));
