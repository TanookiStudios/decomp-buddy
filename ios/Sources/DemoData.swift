// Made-up computers, games and jobs (fictional titles: no real company's games in screenshots) for screenshots and the App Review video (DB_DEMO=1). Never real data.
import Foundation

enum DemoData {
    @MainActor static func load(into s: RemoteStore) {
        s.computers = [Computer(id: "demo-pc", name: "Living Room PC", hosts: ["192.168.0.20"], port: 47613), Computer(id: "demo-mac", name: "Mac", hosts: ["192.168.0.21"], port: 47613)]
        s.selectedID = "demo-pc"
        s.library = [
            InstalledGame(folder: "/demo/1", title: "Starfield Racer", console: "Classic Console", repo: "demo/starfield-racer", repoUrl: nil, target: "windows", tag: "9.0.2", status: "ready", lastPlayed: "2026-10-19T20:00:00Z", setUpAt: nil, onDevice: false),
            InstalledGame(folder: "/demo/2", title: "Moonlight Quest", console: "Retro Console", repo: "demo/moonlight-quest", repoUrl: nil, target: "windows", tag: "v1.0.2", status: "ready", lastPlayed: nil, setUpAt: nil, onDevice: false),
        ]
        s.jobs = [Job(id: "demo-job", kind: "install", game: "Neon Agent", state: "working", message: "Setting up Neon Agent…", at: Date().timeIntervalSince1970 * 1000)]
        s.wishlist = []
    }
    static let catalog: [CatalogGame] = [
        .init(id: "demo:1", title: "Neon Agent", console: "Classic Console", project: "neon-agent", repoUrl: "https://github.com/demo/pd", platforms: ["Windows", "macOS", "Linux"], version: "v1.2", latestVersion: nil, status: "latest", description: "A native PC port built from the decompilation, with mouse look and widescreen.", facts: .init(completeness: "playable", aiUse: nil), scan: .init(at: "2026-10-18", files: 3)),
        .init(id: "demo:2", title: "Starfield Racer", console: "Classic Console", project: "starfield-racer", repoUrl: "https://github.com/demo/starfield-racer", platforms: ["Windows", "macOS", "Linux"], version: "9.0.2", latestVersion: nil, status: "latest", description: "Bring your own copy and play it natively, with mods and enhancements.", facts: .init(completeness: "playable", aiUse: nil), scan: .init(at: "2026-10-18", files: 3)),
        .init(id: "demo:3", title: "Moonlight Quest", console: "Retro Console", project: "moonlight-quest", repoUrl: "https://github.com/demo/moonlight-quest", platforms: ["Windows", "Linux"], version: "v1.0.3", latestVersion: nil, status: "latest", description: "A static recompilation that runs natively at high frame rates.", facts: .init(completeness: "playable", aiUse: nil), scan: .init(at: "2026-10-18", files: 2)),
        .init(id: "demo:4", title: "Castle Crawler", console: "Classic PC", project: "castle-crawler", repoUrl: "https://github.com/demo/doom", platforms: ["Windows", "macOS", "Linux"], version: "3.1", latestVersion: nil, status: "latest", description: "A faithful source port.", facts: .init(completeness: "playable", aiUse: nil), scan: .init(at: "2026-10-18", files: 3)),
    ]
}
