#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform !== "darwin" || process.arch !== "arm64") {
  console.log("[mlx-transcribe] Native MLX compilation is only supported on macOS Apple Silicon (darwin-arm64). Skipping.");
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, "..");
const packageDir = path.join(projectRoot, "scripts", "mlx-native-source");
const outputDir = path.join(projectRoot, "resources", "bin");
const outputBinary = path.join(outputDir, "mlx-transcribe");

console.log("[mlx-transcribe] Starting native Swift MLX transcription compilation...");

// 1. Build using Swift PM
const buildResult = spawnSync("swift", [
  "build",
  "-c", "release",
  "--arch", "arm64",
  "-Xswiftc", "-strict-concurrency=minimal"
], {
  cwd: packageDir,
  stdio: "inherit"
});

if (buildResult.status !== 0) {
  console.warn("\n[mlx-transcribe] WARNING: Swift compilation failed!");
  console.warn("[mlx-transcribe] This is likely due to a corrupted macOS Command Line Tools installation (missing PackageDescription symbols).");
  console.warn("[mlx-transcribe] To resolve this, run: sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install");
  console.warn("[mlx-transcribe] Continuing without MLX binary (MLX functionality will be unavailable in development).\n");
  process.exit(0);
}

// 2. Locate built binary
const builtBinaryPath = path.join(packageDir, ".build", "arm64-apple-macosx", "release", "mlx-transcribe");
if (!fs.existsSync(builtBinaryPath)) {
  console.warn(`\n[mlx-transcribe] WARNING: Compiled binary not found at: ${builtBinaryPath}`);
  console.warn("[mlx-transcribe] Continuing without MLX binary.\n");
  process.exit(0);
}

// 3. Ensure output bin directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 4. Copy binary to resources/bin
try {
  fs.copyFileSync(builtBinaryPath, outputBinary);
  fs.chmodSync(outputBinary, 0o755); // make executable
  console.log(`[mlx-transcribe] Successfully compiled and copied binary to: ${outputBinary}`);
} catch (err) {
  console.error(`[mlx-transcribe] Failed to copy compiled binary: ${err.message}`);
  process.exit(1);
}

// 5. Compile and bundle native Metal shaders
const metalSourceDir = path.join(packageDir, ".build", "checkouts", "mlx-swift", "Source", "Cmlx");
if (fs.existsSync(metalSourceDir)) {
  console.log("[mlx-transcribe] Compiling native Metal shaders...");
  
  const generatedMetalDir = path.join(metalSourceDir, "mlx-generated", "metal");
  const findResult = spawnSync("find", [generatedMetalDir, "-name", "*.metal"]);
  
  if (findResult.status === 0) {
    const metalFiles = findResult.stdout.toString().trim().split("\n").filter(Boolean);
    const includePath = path.join(metalSourceDir, "mlx");
    const outputLib = path.join(outputDir, "mlx.metallib");
    
    const compileResult = spawnSync("xcrun", [
      "-sdk", "macosx", "metal", "-Ofast",
      "-I", includePath,
      ...metalFiles,
      "-o", outputLib
    ], {
      stdio: "inherit"
    });
    
    if (compileResult.status === 0) {
      console.log(`[mlx-transcribe] Successfully compiled and copied Metal shader library to: ${outputLib}`);
    } else {
      console.warn("[mlx-transcribe] WARNING: Metal shader compilation failed! MLX GPU acceleration may be unavailable.");
    }
  } else {
    console.warn("[mlx-transcribe] WARNING: Could not locate Metal shader source files.");
  }
}

