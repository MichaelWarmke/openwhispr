import Foundation
import MLX
import MLXAudioCore
import MLXAudioSTT
import HuggingFace

public struct CLIArgs: Equatable {
    public var modelPath: String = ""
    public var audioPath: String = ""
    public var quantize: String = "8bit"
    public var socketPath: String = ""
    public var idleTimeoutSeconds: Int = 300
    
    public init(modelPath: String = "", audioPath: String = "", quantize: String = "8bit", socketPath: String = "", idleTimeoutSeconds: Int = 300) {
        self.modelPath = modelPath
        self.audioPath = audioPath
        self.quantize = quantize
        self.socketPath = socketPath
        self.idleTimeoutSeconds = idleTimeoutSeconds
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
        } else if (args[i] == "--serve" || args[i] == "--socket"), i + 1 < args.count, !args[i + 1].hasPrefix("--") {
            cliArgs.socketPath = args[i + 1]
        } else if args[i] == "--idle-timeout", i + 1 < args.count, let sec = Int(args[i + 1]) {
            cliArgs.idleTimeoutSeconds = sec
        }
    }
    return cliArgs
}

public enum Transcriber {
    @MainActor
    public static func run() async {
        let args = parseArgs(CommandLine.arguments)
        
        if !args.socketPath.isEmpty {
            await runServer(args: args)
        } else {
            await runCLI(args: args)
        }
    }
    
    @MainActor
    private static func prepareModelCache(modelPath: String) {
        if FileManager.default.fileExists(atPath: modelPath) {
            if let repoID = Repo.ID(rawValue: modelPath) {
                let modelSubdir = repoID.description.replacingOccurrences(of: "/", with: "_")
                let expectedDir = HubCache.default.cacheDirectory
                    .appendingPathComponent("mlx-audio")
                    .appendingPathComponent(modelSubdir)
                
                let expectedPath = expectedDir.path
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
            }
        }
    }
    
    @MainActor
    private static func transcribeAudio(audioPath: String, model: any STTGenerationModel) throws -> [String: Any] {
        let audioUrl = URL(fileURLWithPath: audioPath)
        let (inputSampleRate, inputAudio) = try loadAudioArray(from: audioUrl)
        
        let mono = inputAudio.ndim > 1 ? inputAudio.mean(axis: -1) : inputAudio
        
        let audioData: MLXArray
        if inputSampleRate == 16000 {
            audioData = mono
        } else {
            audioData = try MLXAudioCore.resampleAudio(mono, from: inputSampleRate, to: 16000)
        }
        
        let result = model.generate(audio: audioData)
        
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
        
        return [
            "success": true,
            "text": result.text,
            "segments": mappedSegments
        ]
    }
    
    @MainActor
    private static func runCLI(args: CLIArgs) async {
        let realStdoutFd = dup(STDOUT_FILENO)
        let realStdout = FileHandle(fileDescriptor: realStdoutFd)
        dup2(STDERR_FILENO, STDOUT_FILENO)
        
        guard !args.modelPath.isEmpty, !args.audioPath.isEmpty else {
            let errJson = JSONError("Missing required arguments --model and --audio")
            if let errData = errJson.data(using: .utf8) {
                realStdout.write(errData)
                realStdout.write(Data([0x0a]))
            }
            exit(1)
        }
        
        do {
            prepareModelCache(modelPath: args.modelPath)
            let model = try await STT.loadModel(modelRepo: args.modelPath)
            let jsonOutput = try transcribeAudio(audioPath: args.audioPath, model: model)
            let jsonData = try JSONSerialization.data(withJSONObject: jsonOutput, options: [])
            realStdout.write(jsonData)
            realStdout.write(Data([0x0a]))
        } catch {
            let errJson = JSONError(error.localizedDescription)
            if let errData = errJson.data(using: .utf8) {
                realStdout.write(errData)
                realStdout.write(Data([0x0a]))
            }
            exit(1)
        }
    }
    
    @MainActor
    private static func runServer(args: CLIArgs) async {
        fputs("[mlx-transcribe] Starting server mode for model: \(args.modelPath)\n", stderr)
        
        guard !args.modelPath.isEmpty else {
            fputs("[mlx-transcribe] Error: --model argument is required for server mode\n", stderr)
            exit(1)
        }
        
        prepareModelCache(modelPath: args.modelPath)
        
        let model: any STTGenerationModel
        do {
            model = try await STT.loadModel(modelRepo: args.modelPath)
            fputs("[mlx-transcribe] Model loaded successfully\n", stderr)
        } catch {
            fputs("[mlx-transcribe] Failed to load model: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
        
        let socketPath = args.socketPath
        unlink(socketPath)
        
        let serverFd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverFd >= 0 else {
            fputs("[mlx-transcribe] Failed to create socket\n", stderr)
            exit(1)
        }
        
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = socketPath.utf8CString
        pathBytes.withUnsafeBufferPointer { b in
            withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
                let raw = UnsafeMutableRawPointer(ptr)
                memcpy(raw, b.baseAddress!, min(b.count, 104))
            }
        }
        
        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { saPtr in
                bind(serverFd, saPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        
        guard bindResult == 0 else {
            fputs("[mlx-transcribe] Failed to bind socket to path: \(socketPath)\n", stderr)
            close(serverFd)
            exit(1)
        }
        
        guard listen(serverFd, 5) == 0 else {
            fputs("[mlx-transcribe] Failed to listen on socket\n", stderr)
            close(serverFd)
            unlink(socketPath)
            exit(1)
        }
        
        // Set 2-second timeout on accept() so we can periodically check idle timeout
        var rcvTimeout = timeval(tv_sec: 2, tv_usec: 0)
        setsockopt(serverFd, SOL_SOCKET, SO_RCVTIMEO, &rcvTimeout, socklen_t(MemoryLayout<timeval>.size))
        
        // Output ready signal for Electron watcher
        fputs("Listening on: \(socketPath)\n", stderr)
        fflush(stderr)
        
        var lastActivity = Date()
        let timeoutSec = args.idleTimeoutSeconds
        
        while true {
            var clientAddr = sockaddr_un()
            var clientAddrLen = socklen_t(MemoryLayout<sockaddr_un>.size)
            let clientFd = withUnsafeMutablePointer(to: &clientAddr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { saPtr in
                    accept(serverFd, saPtr, &clientAddrLen)
                }
            }
            
            if clientFd < 0 {
                if errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR {
                    if timeoutSec > 0 && Date().timeIntervalSince(lastActivity) >= Double(timeoutSec) {
                        fputs("[mlx-transcribe] Idle timeout (\(timeoutSec)s) reached. Shutting down server.\n", stderr)
                        break
                    }
                    continue
                }
                fputs("[mlx-transcribe] Accept error: \(errno)\n", stderr)
                break
            }
            
            lastActivity = Date()
            handleClientConnection(clientFd: clientFd, model: model, args: args)
            close(clientFd)
            lastActivity = Date()
        }
        
        close(serverFd)
        unlink(socketPath)
        exit(0)
    }
    
    @MainActor
    private static func handleClientConnection(clientFd: Int32, model: any STTGenerationModel, args: CLIArgs) {
        var buffer = Data()
        var chunk = [UInt8](repeating: 0, count: 4096)
        
        while true {
            let n = read(clientFd, &chunk, chunk.count)
            if n <= 0 { break }
            buffer.append(chunk, count: n)
            if buffer.contains(0x0a) { break } // newline terminated
        }
        
        guard !buffer.isEmpty else { return }
        
        guard let line = String(data: buffer, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !line.isEmpty,
              let requestData = line.data(using: .utf8),
              let jsonReq = (try? JSONSerialization.jsonObject(with: requestData, options: [])) as? [String: Any] else {
            sendSocketResponse(clientFd: clientFd, json: ["success": false, "error": "Invalid JSON request"])
            return
        }
        
        if let command = jsonReq["command"] as? String {
            if command == "ping" {
                sendSocketResponse(clientFd: clientFd, json: ["status": "ok", "model": args.modelPath])
                return
            } else if command == "shutdown" {
                sendSocketResponse(clientFd: clientFd, json: ["status": "shutdown"])
                fputs("[mlx-transcribe] Shutdown requested via command socket\n", stderr)
                unlink(args.socketPath)
                exit(0)
            }
        }
        
        if let audioPath = jsonReq["audio"] as? String {
            do {
                let result = try transcribeAudio(audioPath: audioPath, model: model)
                sendSocketResponse(clientFd: clientFd, json: result)
            } catch {
                sendSocketResponse(clientFd: clientFd, json: ["success": false, "error": error.localizedDescription])
            }
            return
        }
        
        sendSocketResponse(clientFd: clientFd, json: ["success": false, "error": "Unknown command or missing 'audio' parameter"])
    }
    
    private static func sendSocketResponse(clientFd: Int32, json: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: json, options: []),
              var jsonStr = String(data: data, encoding: .utf8) else {
            return
        }
        jsonStr += "\n"
        if let sendData = jsonStr.data(using: .utf8) {
            sendData.withUnsafeBytes { ptr in
                _ = write(clientFd, ptr.baseAddress!, sendData.count)
            }
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
