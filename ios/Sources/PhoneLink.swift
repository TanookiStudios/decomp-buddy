// Talking to Decomp Buddy on a computer (its Settings → Phone). Every request and answer is sealed with AES-256-GCM
// under the key from the pairing QR code - the same format as the desktop's src/phonecrypto.js: a 12-byte nonce and
// ciphertext+tag, both base64, plus the message's own time so the computer can refuse stale or replayed ones.
import CryptoKit
import Foundation

struct Envelope: Codable { let iv: String; let ct: String }

enum Seal {
    static func seal(_ object: [String: Any], key: SymmetricKey) throws -> Envelope {
        let data = try JSONSerialization.data(withJSONObject: object)
        let box = try AES.GCM.seal(data, using: key)
        return Envelope(iv: Data(box.nonce).base64EncodedString(), ct: (box.ciphertext + box.tag).base64EncodedString())
    }
    static func open(_ env: Envelope, key: SymmetricKey) throws -> Data {
        guard let iv = Data(base64Encoded: env.iv), let raw = Data(base64Encoded: env.ct), raw.count > 16 else { throw LinkError.garbled }
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: raw.dropLast(16), tag: raw.suffix(16))
        return try AES.GCM.open(box, using: key)
    }
}

enum LinkError: LocalizedError {
    case garbled, notPaired, unreachable, refused(String)
    var errorDescription: String? {
        switch self {
        case .garbled: "The computer's answer didn't make sense."
        case .notPaired: "This computer doesn't recognize this phone any more. Pair it again from Decomp Buddy's Settings → Phone."
        case .unreachable: "Can't reach the computer. Check it's on, Decomp Buddy is open, and you're on the same Wi-Fi."
        case .refused(let why): why
        }
    }
}

/// A paired computer. The key lives in the Keychain; everything else in UserDefaults.
struct Computer: Codable, Identifiable, Hashable {
    var id: String          // stable per pairing
    var name: String        // "Mac", "Windows PC" or what was typed on the computer
    var hosts: [String]
    var port: Int
    var keychainKey: String { "computer-\(id)" }

    /// decompbuddy://pair?h=192.168.1.5,10.0.0.2&p=47613&k=<base64 key>&n=Mac
    static func fromPairingLink(_ url: URL) -> (Computer, String)? {
        guard url.scheme == "decompbuddy", url.host == "pair", let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        let v = Dictionary(q.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        guard let key = v["k"], let raw = Data(base64Encoded: key), raw.count == 32, let hosts = v["h"]?.split(separator: ",").map(String.init), !hosts.isEmpty,
              let port = Int(v["p"] ?? ""), (1...65535).contains(port) else { return nil }
        let name = (v["n"] ?? "").trimmingCharacters(in: .whitespaces)
        return (Computer(id: UUID().uuidString, name: name.isEmpty ? "Computer" : String(name.prefix(40)), hosts: hosts, port: port), key)
    }
}

/// One request to one computer: tries each address it gave, answers the decoded "result".
struct PhoneLink {
    let computer: Computer
    let key: SymmetricKey
    var session: URLSession = .shared

    func call<T: Decodable>(_ method: String, _ params: [String: any Sendable] = [:], as: T.Type = T.self) async throws -> T {
        let env = try Seal.seal(["m": method, "p": params, "ts": Int(Date().timeIntervalSince1970 * 1000)], key: key)
        let body = try JSONEncoder().encode(env)
        var lastError: Error = LinkError.unreachable
        for host in computer.hosts {
            guard let url = URL(string: "http://\(host):\(computer.port)/v1") else { continue }
            var req = URLRequest(url: url, timeoutInterval: 6)
            req.httpMethod = "POST"; req.httpBody = body; req.setValue("application/json", forHTTPHeaderField: "content-type")
            do {
                let (data, resp) = try await session.data(for: req)
                let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if status == 401 { throw LinkError.notPaired }
                if status == 403 { throw LinkError.refused("Phone control is switched off on that computer (Decomp Buddy → Settings → Phone).") }
                let plain = try Seal.open(JSONDecoder().decode(Envelope.self, from: data), key: key)
                let answer = try JSONDecoder().decode(Answer<T>.self, from: plain)
                if answer.ok, let result = answer.result { return result }
                throw LinkError.refused(answer.error ?? "The computer said no.")
            } catch let e as LinkError { if case .unreachable = e { lastError = e; continue }; throw e }
            catch { lastError = LinkError.unreachable }
        }
        throw lastError
    }
}

private struct Answer<T: Decodable>: Decodable { let ok: Bool; let result: T?; let error: String? }

// MARK: - What the computer answers

struct Hello: Decodable { let computer: String; let app: String; let target: String; let platform: String }
struct InstalledGame: Decodable, Identifiable, Hashable {
    let folder: String; let title: String; let console: String?; let repo: String?; let repoUrl: String?
    let target: String?; let tag: String?; let status: String?; let lastPlayed: String?; let setUpAt: String?; let onDevice: Bool?
    var id: String { folder }
}
struct Job: Decodable, Identifiable, Hashable { let id: String; let kind: String; let game: String?; let state: String; let message: String?; let at: Double }
