import Foundation
import MLX
import MLXAudioCore
import MLXAudioSTT
import HuggingFace

public struct CLIArgs: Equatable {
    public var modelPath: String = ""
    public var audioPath: String = ""
    public var quantize: String = "8bit"
    
    public init(modelPath: String = "", audioPath: String = "", quantize: String = "8bit") {
        self.modelPath = modelPath
        self.audioPath = audioPath
        self.quantize = quantize
    }
}

public func parseArgs(_ args: [String]) -> CLIArgs {
    var cliArgs = CLIArgs()
    for i in 0..<args.count {
        if args[i] == "--model", i + 1 < args.count, !args[i + 1].hasPrefix("--") {
            cliArgs.modelPath = args[i + 1]
        } else if args[i] == "--audio", i + 1 < args.count, !args[i + 1].hasPrefix("--") {
            cliArgs.audioPath = args[i + 1]
        } else if args[i] == "--quantize", i + 1 < args.count, !args[i + 1].hasPrefix("--") {
            cliArgs.quantize = args[i + 1]
        }
    }
    return cliArgs
}

public enum Transcriber {
    @MainActor
    public static func run() async {
        // 1. Duplicate stdout to a private descriptor so we can output clean JSON to the caller
        let realStdoutFd = dup(STDOUT_FILENO)
        let realStdout = FileHandle(fileDescriptor: realStdoutFd)
        
        // 2. Redirect stdout (1) to stderr (2). Any print() or printf() from libraries will go to stderr.
        dup2(STDERR_FILENO, STDOUT_FILENO)
        
        let args = parseArgs(CommandLine.arguments)
        
        guard !args.modelPath.isEmpty, !args.audioPath.isEmpty else {
            let errJson = JSONError("Missing required arguments --model and --audio")
            if let errData = errJson.data(using: .utf8) {
                realStdout.write(errData)
                realStdout.write(Data([0x0a]))
            }
            exit(1)
        }
        
        do {
            // 3. If the model path is a local directory, ensure its files are mapped into the Hugging Face cache.
            // Creating a real directory in the cache containing symbolic links to individual files
            // bypasses macOS POSIX "Not a directory" errors in Foundation's contentsOfDirectory URL listing.
            if FileManager.default.fileExists(atPath: args.modelPath) {
                if let repoID = Repo.ID(rawValue: args.modelPath) {
                    let modelSubdir = repoID.description.replacingOccurrences(of: "/", with: "_")
                    let expectedDir = HubCache.default.cacheDirectory
                        .appendingPathComponent("mlx-audio")
                        .appendingPathComponent(modelSubdir)
                    
                    let expectedPath = expectedDir.path
                    let configJsonPath = expectedDir.appendingPathComponent("config.json").path
                    
                    // If config.json doesn't exist, the cache is incomplete or empty. Clear and symlink individual files.
                    if !FileManager.default.fileExists(atPath: configJsonPath) {
                        try? FileManager.default.removeItem(atPath: expectedPath)
                        try? FileManager.default.createDirectory(at: expectedDir, withIntermediateDirectories: true)
                        
                        let localURL = URL(fileURLWithPath: args.modelPath)
                        if let localFiles = try? FileManager.default.contentsOfDirectory(at: localURL, includingPropertiesForKeys: nil) {
                            for localFile in localFiles {
                                let destPath = expectedDir.appendingPathComponent(localFile.lastPathComponent).path
                                try? FileManager.default.createSymbolicLink(atPath: destPath, withDestinationPath: localFile.path)
                            }
                        }
                    }
                }
            }
            
            // 4. Load Model (Supports local folder or HuggingFace repo ID)
            let model = try await STT.loadModel(modelRepo: args.modelPath)
            
            // 5. Load and resample audio file to 16kHz mono natively
            let audioUrl = URL(fileURLWithPath: args.audioPath)
            let (inputSampleRate, inputAudio) = try loadAudioArray(from: audioUrl)
            
            // Convert to mono if multi-channel
            let mono = inputAudio.ndim > 1 ? inputAudio.mean(axis: -1) : inputAudio
            
            // Resample to 16000 Hz if necessary
            let audioData: MLXArray
            if inputSampleRate == 16000 {
                audioData = mono
            } else {
                audioData = try MLXAudioCore.resampleAudio(mono, from: inputSampleRate, to: 16000)
            }
            
            // 6. Perform transcription
            let result = model.generate(audio: audioData)
            
            // 7. Extract and map segments safely
            let mappedSegments: [[String: Any]] = (result.segments ?? []).compactMap { seg in
                guard let text = seg["text"] as? String else { return nil }
                
                let start: Double
                if let startVal = seg["start"] as? Double {
                    start = startVal
                } else if let startFloat = seg["start"] as? Float {
                    start = Double(startFloat)
                } else if let startNum = seg["start"] as? NSNumber {
                    start = startNum.doubleValue
                } else {
                    start = 0.0
                }
                
                let end: Double
                if let endVal = seg["end"] as? Double {
                    end = endVal
                } else if let endFloat = seg["end"] as? Float {
                    end = Double(endFloat)
                } else if let endNum = seg["end"] as? NSNumber {
                    end = endNum.doubleValue
                } else {
                    end = 0.0
                }
                
                return [
                    "text": text,
                    "start": start,
                    "end": end
                ]
            }
            
            // 8. Output the result in JSON format directly to the private stdout handle
            let jsonOutput: [String: Any] = [
                "success": true,
                "text": result.text,
                "segments": mappedSegments
            ]
            
            let jsonData = try JSONSerialization.data(withJSONObject: jsonOutput, options: [])
            realStdout.write(jsonData)
            realStdout.write(Data([0x0a])) // Newline
        } catch {
            let errJson = JSONError(error.localizedDescription)
            if let errData = errJson.data(using: .utf8) {
                realStdout.write(errData)
                realStdout.write(Data([0x0a]))
            }
            exit(1)
        }
    }
    
    public static func JSONError(_ msg: String) -> String {
        let escapedMsg = msg
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
            .replacingOccurrences(of: "\t", with: "\\t")
        return "{\"success\": false, \"error\": \"\(escapedMsg)\"}"
    }
}
