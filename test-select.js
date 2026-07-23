const { ipcMain } = require("electron");
const { PARAKEET_MODEL_INFO, MLX_MODEL_INFO } = require("./src/models/ModelRegistry.ts");
const modelId = "parakeet-rnnt-1.1b-mlx";
const allInfo = { ...PARAKEET_MODEL_INFO, ...MLX_MODEL_INFO };
const info = allInfo[modelId];
const provider = info && info.huggingFaceRepo ? "huggingface" : "nvidia";
console.log("Model:", modelId);
console.log("Provider:", provider);
