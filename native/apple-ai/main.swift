// decomp-buddy-ai: a tiny bridge to Apple's on-device model (Foundation Models, macOS 26+, Apple Intelligence on).
//   decomp-buddy-ai --status          -> {"available":true} or {"available":false,"reason":"..."}
//   decomp-buddy-ai "<instructions>"  -> reads the prompt on stdin, prints the model's plain-text answer
// Exit codes: 0 ok, 2 unavailable, 3 prompt too long for the model, 1 anything else (message on stderr).
import Foundation
import FoundationModels

@main struct DecompBuddyAI {
  static func main() async {
    let args = CommandLine.arguments.dropFirst()
    let model = SystemLanguageModel.default
    if args.first == "--status" {
      print(statusLine(model.availability, contextSize: model.contextSize))
      return
    }
    guard case .available = model.availability else { fail(2, "Apple Intelligence isn't available on this Mac (\(model.availability)).") }
    let prompt = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let session = LanguageModelSession(instructions: args.first ?? "")
    do {
      let reply = try await session.respond(to: prompt, options: GenerationOptions(temperature: 0))
      print(reply.content)
    } catch let error as LanguageModelSession.GenerationError {
      if case .exceededContextWindowSize = error { fail(3, "The README is too long for Apple's on-device model.") }
      fail(1, "Apple's model couldn't answer: \(error.localizedDescription)")
    } catch { fail(1, "Apple's model couldn't answer: \(error.localizedDescription)") }
  }
  static func fail(_ code: Int32, _ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8)); exit(code)
  }
}
