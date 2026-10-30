import SwiftUI
import VisionKit

// A game's picture: its project's own artwork when it has some, else a title tile colored by console. Never
// commercial box art (see CatalogGame.projectArtURL). Images load as rows scroll into view and stay cached.
struct GameArt: View {
    let title: String; let console: String; var url: URL? = nil; var size: CGFloat = 52
    private static let colors: [Color] = [.purple, .blue, .teal, .green, .orange, .red, .pink, .indigo]
    var body: some View {
        AsyncImage(url: url, transaction: .init(animation: .easeOut(duration: 0.2))) { phase in
            if let image = phase.image { image.resizable().scaledToFill() } else { tile }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size / 5))
        .accessibilityHidden(true)
    }
    private var tile: some View {
        let words = title.replacingOccurrences(of: #"\([^)]*\)"#, with: "", options: .regularExpression).split { !$0.isLetter && !$0.isNumber }
        let initials = words.prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
        let color = Self.colors[console.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF } % Self.colors.count]
        return Rectangle().fill(color.gradient).overlay(Text(initials.isEmpty ? "?" : initials).font(.system(size: size * 0.38, weight: .bold, design: .rounded)).foregroundStyle(.white))
    }
}

struct BrowseView: View {
    @Environment(CatalogStore.self) private var catalog
    @Environment(RemoteStore.self) private var remote
    @State private var query = ""
    @State private var console = ""
    @State private var mineOnly = false
    private var consoles: [String] { Array(Set(catalog.games.map(\.console))).sorted() }
    private var shown: [CatalogGame] {
        Search.filter(catalog.games.filter { (console.isEmpty || $0.console == console) && (!mineOnly || remote.finder.contains($0.id)) }, query)
    }
    var body: some View {
        NavigationStack {
            List {
                if let e = catalog.error { Text(e).foregroundStyle(.secondary) }
                ForEach(shown.prefix(400)) { g in
                    NavigationLink(value: g) {
                        HStack(spacing: 12) {
                            GameArt(title: g.title, console: g.console, url: g.projectArtURL)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(g.title).font(.headline)
                                Text([g.console, g.completeness].filter { !$0.isEmpty }.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .navigationTitle("Browse")
            .navigationDestination(for: CatalogGame.self) { GameView(game: $0) }
            .searchable(text: $query, prompt: "Search Games")
            .refreshable { await catalog.refresh() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Console", selection: $console) { Text("All Consoles").tag(""); ForEach(consoles, id: \.self) { Text($0).tag($0) } }
                        if !remote.finder.isEmpty { Toggle("Games I Have Files For", isOn: $mineOnly) }
                    } label: { Label("Filter", systemImage: "line.3.horizontal.decrease.circle") }
                }
            }
            .overlay { if catalog.games.isEmpty && catalog.loading { ProgressView("Loading the catalog…") } }
        }
    }
}

struct GameView: View {
    let game: CatalogGame
    @Environment(RemoteStore.self) private var remote
    @State private var message: String?
    var body: some View {
        List {
            Section {
                HStack(spacing: 14) { GameArt(title: game.title, console: game.console, url: game.projectArtURL, size: 72); VStack(alignment: .leading) { Text(game.title).font(.title3.bold()); Text(game.console).foregroundStyle(.secondary) } }
                if let d = game.description, !d.isEmpty { Text(d) }
            }
            Section("At A Glance") {
                if !game.completeness.isEmpty { LabeledContent("How Complete", value: game.completeness) }
                LabeledContent("Runs On", value: game.platforms.isEmpty ? "No builds yet" : game.platforms.joined(separator: ", "))
                if let v = game.version { LabeledContent("Version", value: v) }
                if game.scan != nil { Label("Scanned For Malware", systemImage: "checkmark.shield") }
                if remote.finder.contains(game.id) { Label("Your game files are ready for this", systemImage: "checkmark.circle") }
                Text("You need your own copy of the game. Nothing is downloaded to this phone - the game is set up on your computer.").font(.footnote).foregroundStyle(.secondary)
            }
            Section {
                Button {
                    Task { message = await remote.run("install", ["id": game.id]) ?? "Sent to \(remote.selected?.name ?? "your computer"). Follow it in Library." }
                } label: { Label(remote.selected.map { "Install On \($0.name)" } ?? "Pair A Computer To Install", systemImage: "arrow.down.circle") }
                .disabled(remote.selected == nil || remote.busy)
                Button { remote.toggleWish(game.id) } label: { Label(remote.wishlist.contains(game.id) ? "Remove From Wishlist" : "Add To Wishlist", systemImage: remote.wishlist.contains(game.id) ? "star.fill" : "star") }
                if let m = message { Text(m).font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle(game.title).navigationBarTitleDisplayMode(.inline)
    }
}

struct LibraryView: View {
    @Environment(RemoteStore.self) private var remote
    @Environment(CatalogStore.self) private var catalog
    @State private var message: String?
    var body: some View {
        NavigationStack {
            List {
                if remote.selected == nil { ContentUnavailableView("No Computer Paired", systemImage: "desktopcomputer", description: Text("Pair Decomp Buddy on your computer in the Computers tab.")) }
                if let s = remote.status { Text(s).foregroundStyle(.secondary) }
                if let m = message { Text(m).font(.footnote) }
                let active = remote.jobs.filter { $0.state != "done" && $0.state != "failed" } + remote.jobs.filter { $0.state == "done" || $0.state == "failed" }.prefix(3)
                if !active.isEmpty {
                    Section("Activity") {
                        ForEach(active) { j in VStack(alignment: .leading) { Text(j.game ?? j.kind).font(.headline); Text(j.message ?? j.state).font(.subheadline).foregroundStyle(j.state == "failed" ? .red : .secondary) }.accessibilityElement(children: .combine) }
                    }
                }
                // Continue Playing: the last few games played on that computer, one tap from starting again.
                let recent = remote.library.filter { $0.lastPlayed != nil }.sorted { ($0.lastPlayed ?? "") > ($1.lastPlayed ?? "") }.prefix(3)
                if !recent.isEmpty {
                    Section("Continue Playing") {
                        ForEach(recent) { g in
                            HStack(spacing: 12) {
                                GameArt(title: g.title, console: g.console ?? "", url: catalog.game(repo: g.repo)?.projectArtURL, size: 60)
                                VStack(alignment: .leading, spacing: 2) { Text(g.title).font(.headline); Text(g.console ?? "").font(.subheadline).foregroundStyle(.secondary) }
                                Spacer()
                                Button { act("play", g) } label: { Label("Play", systemImage: "play.fill") }.buttonStyle(.borderedProminent).disabled(remote.busy)
                            }
                            .accessibilityElement(children: .contain)
                        }
                    }
                }
                if !remote.library.isEmpty {
                    Section("Installed On \(remote.selected?.name ?? "")") {
                        ForEach(remote.library) { g in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 12) {
                                    GameArt(title: g.title, console: g.console ?? "", url: catalog.game(repo: g.repo)?.projectArtURL, size: 44)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(g.title).font(.headline)
                                        Text([g.console, g.tag].compactMap { $0 }.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                                    }
                                }
                                HStack {
                                    Button("Play") { act("play", g) }.buttonStyle(.borderedProminent)
                                    if let v = remote.updateAvailable(g, in: catalog) { Button("Update To \(v)") { act("update", g) }.buttonStyle(.bordered) }
                                    Button("Back Up Saves") { act("backupSaves", g) }.buttonStyle(.bordered)
                                }.font(.subheadline).disabled(remote.busy)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Library")
            .refreshable { await remote.refresh() }
            .task { while !Task.isCancelled { await remote.refresh(); try? await Task.sleep(for: .seconds(remote.jobs.contains { $0.state == "working" || $0.state == "queued" } ? 3 : 30)) } }
        }
    }
    private func act(_ m: String, _ g: InstalledGame) { Task { message = await remote.run(m, ["folder": g.folder]) ?? (m == "play" ? "Starting \(g.title) on the computer." : m == "update" ? "Updating \(g.title)…" : "Saves backed up.") } }
}

struct WishlistView: View {
    @Environment(RemoteStore.self) private var remote
    @Environment(CatalogStore.self) private var catalog
    var body: some View {
        NavigationStack {
            List {
                let games = remote.wishlist.compactMap { catalog.game($0) }.sorted { $0.title < $1.title }
                if games.isEmpty { ContentUnavailableView("Nothing Here Yet", systemImage: "star", description: Text("Tap Add To Wishlist on any game. Your wishlist stays in sync with Decomp Buddy on your computer.")) }
                ForEach(games) { g in NavigationLink(value: g) { Text(g.title) } }
                    .onDelete { idx in for i in idx { remote.toggleWish(games[i].id) } }
            }
            .navigationTitle("Wishlist")
            .navigationDestination(for: CatalogGame.self) { GameView(game: $0) }
        }
    }
}

struct ComputersView: View {
    @Environment(RemoteStore.self) private var remote
    @State private var scanning = false
    @State private var pasted = ""
    @State private var message: String?
    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(remote.computers) { c in
                        Button { remote.select(c) } label: { HStack { Label(c.name, systemImage: "desktopcomputer"); Spacer(); if c.id == remote.selected?.id { Image(systemName: "checkmark").accessibilityLabel("Selected") } } }
                            .swipeActions { Button("Forget", role: .destructive) { remote.forget(c) } }
                    }
                } footer: { Text(remote.computers.isEmpty ? "" : "Swipe a computer to forget it.") }
                Section("Pair A Computer") {
                    Text("On your computer, open Decomp Buddy → Settings → Phone and switch on Let My Phone Control Decomp Buddy. A code appears.").font(.subheadline)
                    if DataScannerViewController.isSupported { Button { scanning = true } label: { Label("Pair", systemImage: "qrcode.viewfinder") } }
                    else { Text("Point your iPhone's Camera app at the code - it opens this app and pairs.").font(.subheadline).foregroundStyle(.secondary) }
                    TextField("Or paste the pairing link", text: $pasted).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .onSubmit { pair(pasted) }
                    if let m = message { Text(m).font(.footnote).foregroundStyle(.secondary) }
                }
                Section { Text("Works on your home Wi-Fi. Messages between this phone and your computer are encrypted, and nothing goes through the internet.").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("Computers")
            .sheet(isPresented: $scanning) { QRScanner { code in scanning = false; pair(code) }.ignoresSafeArea() }
        }
    }
    private func pair(_ s: String) {
        guard let url = URL(string: s.trimmingCharacters(in: .whitespacesAndNewlines)) else { message = "That isn't a Decomp Buddy pairing code."; return }
        message = "Pairing…"; Task { message = await remote.pair(url) ?? "Paired." }
    }
}

struct QRScanner: UIViewControllerRepresentable {
    let found: (String) -> Void
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let v = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], isHighlightingEnabled: true)
        v.delegate = context.coordinator; try? v.startScanning(); return v
    }
    func updateUIViewController(_ v: DataScannerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(found: found) }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void; var done = false
        init(found: @escaping (String) -> Void) { self.found = found }
        func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            for case .barcode(let b) in items { if let p = b.payloadStringValue, p.hasPrefix("decompbuddy://pair"), !done { done = true; found(p) } }
        }
    }
}
