import Foundation
import MLXTranscribeCore

@main
struct App {
    static func main() async {
        await Transcriber.run()
    }
}
