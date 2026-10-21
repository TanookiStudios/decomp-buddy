import SwiftUI

@main
struct DecompBuddyRemoteApp: App {
    @State private var catalog = ProcessInfo.processInfo.environment["DB_DEMO"] != nil ? CatalogStore(preview: DemoData.catalog) : CatalogStore()
    @State private var remote = RemoteStore()
    @State private var pairError: String?

    var body: some Scene {
        WindowGroup {
            TabView {
                Tab("Browse", systemImage: "square.grid.2x2") { BrowseView() }.accessibilityIdentifier("tab-browse")
                Tab("Library", systemImage: "books.vertical") { LibraryView() }.accessibilityIdentifier("tab-library")
                Tab("Wishlist", systemImage: "star") { WishlistView() }.accessibilityIdentifier("tab-wishlist")
                Tab("Computers", systemImage: "desktopcomputer") { ComputersView() }.accessibilityIdentifier("tab-computers")
            }
            .environment(catalog).environment(remote)
            .task {
                #if DEBUG
                // Tests hand the pairing link in at launch (opening the link itself needs a tap on iOS's "Open in…" prompt).
                if let p = ProcessInfo.processInfo.environment["DB_PAIR"], let url = URL(string: p) { pairError = await remote.pair(url); print("DB_PAIR result:", pairError ?? "paired", remote.computers.map(\.name), "library:", remote.library.map(\.title), "status:", remote.status ?? "ok") }
                #endif
                await catalog.refresh(); await remote.refresh()
            }
            // The Camera app opens decompbuddy://pair links from the QR code straight into the app.
            .onOpenURL { url in Task { pairError = await remote.pair(url) } }
            .alert("Couldn't Pair", isPresented: .init(get: { pairError != nil }, set: { if !$0 { pairError = nil } })) { Button("OK") {} } message: { Text(pairError ?? "") }
        }
    }
}
