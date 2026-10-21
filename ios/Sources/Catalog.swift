// The public catalog (the same list the desktop app and decompbuddy.com show), cached so Browse works offline.
// No box art on the phone: games show a plain title card, so nothing here pictures someone else's game.
import Foundation
import Observation

struct CatalogGame: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let console: String
    let project: String?
    let repoUrl: String?
    let platforms: [String]
    let version: String?
    let latestVersion: String?
    let status: String?
    let description: String?
    let facts: Facts?
    let scan: Scan?
    struct Facts: Decodable, Hashable { let completeness: String?; let aiUse: String? }
    struct Scan: Decodable, Hashable { let at: String?; let files: Int? }

    var completeness: String {
        switch facts?.completeness { case "playable": "Complete"; case "mostly": "Mostly Playable"; case "partial": "Partly Playable"; case "wip": "Not Playable Yet"; default: "" }
    }
}

private struct CatalogDoc: Decodable { let count: Int?; let games: [CatalogGame] }

@MainActor @Observable
final class CatalogStore {
    static let url = URL(string: "https://tanookistudios.com/decomp-buddy/catalog.json")!
    var games: [CatalogGame] = []
    var loading = false
    var error: String?
    private var cacheFile: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "catalog.json") }

    init(preview: [CatalogGame]? = nil) {
        if let preview { games = preview; return }
        if let d = try? Data(contentsOf: cacheFile), let doc = try? JSONDecoder().decode(CatalogDoc.self, from: d) { games = doc.games }
    }

    func refresh() async {
        if ProcessInfo.processInfo.environment["DB_DEMO"] != nil { return }   // screenshots use fixed demo data
        loading = true; defer { loading = false }
        do {
            let (d, _) = try await URLSession.shared.data(from: Self.url)
            let doc = try JSONDecoder().decode(CatalogDoc.self, from: d)
            games = doc.games; error = nil
            try? d.write(to: cacheFile, options: .atomic)
        } catch { self.error = games.isEmpty ? "Couldn't load the catalog. Check your internet connection." : nil }
    }

    func game(_ id: String) -> CatalogGame? { games.first { $0.id == id } }
}

/// The desktop's search rules: no accents or punctuation, any word order, Roman numerals as digits, best matches first.
enum Search {
    private static let roman = ["ii": "2", "iii": "3", "iv": "4", "vi": "6", "vii": "7", "viii": "8", "ix": "9"]
    static func words(_ s: String) -> [String] {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "en_US")).lowercased()
            .replacingOccurrences(of: "&", with: " and ")
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map { roman[String($0)] ?? String($0) }
    }
    static func filter(_ games: [CatalogGame], _ query: String) -> [CatalogGame] {
        let q = words(query); guard !q.isEmpty else { return games }
        let qs = q.joined(separator: " ")
        func rank(_ g: CatalogGame) -> Int {
            let t = words(g.title).joined(separator: " ")
            return t == qs ? 0 : t.hasPrefix(qs + " ") ? 1 : t.hasPrefix(qs) ? 2 : t.contains(qs) ? 3 : 4
        }
        return games.filter { g in let hay = " " + words("\(g.title) \(g.project ?? "")").joined(separator: " ") + " "; return q.allSatisfy { hay.contains(" " + $0) } }
            .enumerated().sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }.map(\.element)
    }
}
