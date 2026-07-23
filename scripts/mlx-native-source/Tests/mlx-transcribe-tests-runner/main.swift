import Foundation
import HuggingFace
import MLXTranscribeCore

func assert(_ condition: Bool, _ message: String, file: String = #file, line: Int = #line) {
    if !condition {
        print("✗ Assertion failed at \(file):\(line) - \(message)")
        exit(1)
    }
}

func testParseArgsEmpty() {
    let args = ["/path/to/binary"]
    let parsed = parseArgs(args)
    assert(parsed == CLIArgs(modelPath: "", audioPath: "", quantize: "8bit"), "Empty arguments should yield defaults")
    print("✓ testParseArgsEmpty passed")
}

func testParseArgsFull() {
    let args = [
        "/path/to/binary",
        "--model", "/path/to/model",
        "--audio", "/path/to/audio.wav",
        "--quantize", "4bit"
    ]
    let parsed = parseArgs(args)
    assert(parsed == CLIArgs(modelPath: "/path/to/model", audioPath: "/path/to/audio.wav", quantize: "4bit"), "Full arguments should parse correctly")
    print("✓ testParseArgsFull passed")
}

func testParseArgsMissingValues() {
    let args = [
        "/path/to/binary",
        "--model",
        "--audio"
    ]
    let parsed = parseArgs(args)
    assert(parsed == CLIArgs(modelPath: "", audioPath: "", quantize: "8bit"), "Missing values should fall back to empty paths")
    print("✓ testParseArgsMissingValues passed")
}

func testJSONErrorEscaping() {
    let errorMsg = "Something went wrong: \"nested quote\"\nnew line"
    let jsonError = Transcriber.JSONError(errorMsg)
    
    guard let data = jsonError.data(using: .utf8) else {
        assert(false, "Failed to convert error string to Data")
        return
    }
    
    do {
        if let dict = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
            assert(dict["success"] as? Bool == false, "JSON success key should be false")
            assert(dict["error"] as? String == errorMsg, "JSON error message should be correctly escaped")
        } else {
            assert(false, "JSON root is not a dictionary")
        }
    } catch {
        assert(false, "Failed to parse output as JSON: \(error.localizedDescription)")
    }
    print("✓ testJSONErrorEscaping passed")
}

func testLocalModelPathSymlinking() {
    // 1. Create a temporary folder simulating a local model cache
    let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    
    let dummyConfig = ["model_type": "parakeet"]
    let configData = try? JSONSerialization.data(withJSONObject: dummyConfig, options: [])
    try? configData?.write(to: tempDir.appendingPathComponent("config.json"))
    
    let modelPath = tempDir.path
    
    // 2. Compute expected symlink path
    guard let repoID = Repo.ID(rawValue: modelPath) else {
        assert(false, "Failed to parse temporary model directory as Repo.ID")
        return
    }
    
    let modelSubdir = repoID.description.replacingOccurrences(of: "/", with: "_")
    let expectedDir = HubCache.default.cacheDirectory
        .appendingPathComponent("mlx-audio")
        .appendingPathComponent(modelSubdir)
    let expectedPath = expectedDir.path
    
    // 3. Setup phase: create an invalid/incomplete empty directory at expectedPath to simulate failed download cache
    try? FileManager.default.removeItem(atPath: expectedPath)
    try? FileManager.default.createDirectory(at: expectedDir, withIntermediateDirectories: true)
    
    // 4. Simulate target behavior (should detect incomplete dir, delete it, and create shadow dir with individual symlinks)
    let configJsonPath = expectedDir.appendingPathComponent("config.json").path
    if !FileManager.default.fileExists(atPath: configJsonPath) {
        try? FileManager.default.removeItem(atPath: expectedPath)
        try? FileManager.default.createDirectory(at: expectedDir, withIntermediateDirectories: true)
        
        let localURL = URL(fileURLWithPath: modelPath)
        if let localFiles = try? FileManager.default.contentsOfDirectory(at: localURL, includingPropertiesForKeys: nil) {
            for localFile in localFiles {
                let destPath = expectedDir.appendingPathComponent(localFile.lastPathComponent).path
                try? FileManager.default.createSymbolicLink(atPath: destPath, withDestinationPath: localFile.path)
            }
        }
    }
    
    // 5. Verify shadow directory exists and config.json inside it is a valid symlink pointing to our temp config
    var isDir: ObjCBool = false
    let exists = FileManager.default.fileExists(atPath: expectedPath, isDirectory: &isDir)
    assert(exists, "Expected shadow directory should be created")
    assert(isDir.boolValue, "expectedPath must be a real directory, not a symbolic link itself")
    
    let configSymlinkPath = expectedDir.appendingPathComponent("config.json").path
    guard let destPath = try? FileManager.default.destinationOfSymbolicLink(atPath: configSymlinkPath) else {
        assert(false, "Failed to read symlink destination")
        return
    }
    
    let expectedConfigPath = tempDir.appendingPathComponent("config.json").path
    
    // Resolve symbolic links in both paths to ensure comparison is robust on macOS (/var vs /private/var)
    let resolvedDest = URL(fileURLWithPath: destPath).resolvingSymlinksInPath().path
    let resolvedExpected = URL(fileURLWithPath: expectedConfigPath).resolvingSymlinksInPath().path
    
    assert(resolvedDest == resolvedExpected, "config.json symlink destination should point to our original local config.json")
    
    // Clean up
    try? FileManager.default.removeItem(atPath: expectedPath)
    try? FileManager.default.removeItem(at: tempDir)
    
    print("✓ testLocalModelPathSymlinking passed")
}

print("---------------------------------------")
print("Running mlx-transcribe custom test runner...")
testParseArgsEmpty()
testParseArgsFull()
testParseArgsMissingValues()
testJSONErrorEscaping()
testLocalModelPathSymlinking()
print("All tests passed successfully!")
print("---------------------------------------")
