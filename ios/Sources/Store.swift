// Paired computers (keys in the Keychain), and what the chosen computer last told us.
import CryptoKit
import Foundation
import Observation
import Security

enum Keychain {
    static func set(_ value: String, for account: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "decomp-buddy-remote", kSecAttrAccount as String: account]
        SecItemDelete(q as CFDictionary)
        var add = q; add[kSecValueData as String] = Data(value.utf8); add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
    static func get(_ account: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "decomp-buddy-remote", kSecAttrAccount as String: account, kSecReturnData as String: true]
        var out: CFTypeRef?
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? (out as? Data).flatMap { String(data: $0, encoding: .utf8) } : nil
    }
    static func delete(_ account: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "decomp-buddy-remote", kSecAttrAccount as String: account] as CFDictionary)
    }
}

@MainActor @Observable
final class RemoteStore {
    var computers: [Computer] = []
    var selectedID: String?
    var library: [InstalledGame] = []
    var jobs: [Job] = []
    var finder: Set<String> = []
    var wishlist: Set<String> = []
    var status: String?
    var busy = false
    private let demo = ProcessInfo.processInfo.environment["DB_DEMO"] != nil

    init() {
        if let d = UserDefaults.standard.data(forKey: "computers"), let c = try? JSONDecoder().decode([Computer].self, from: d) { computers = c }
        selectedID = UserDefaults.standard.string(forKey: "selectedComputer") ?? computers.first?.id
        wishlist = Set(UserDefaults.standard.stringArray(forKey: "wishlist") ?? [])
        if demo { DemoData.load(into: self) }
    }

    var selected: Computer? { computers.first { $0.id == selectedID } ?? computers.first }

    private func link(_ c: Computer) -> PhoneLink? {
        if demo { return nil }
        guard let k = Keychain.get(c.keychainKey), let raw = Data(base64Encoded: k) else { return nil }
        return PhoneLink(computer: c, key: SymmetricKey(data: raw))
    }
    private func save() {
        UserDefaults.standard.set(try? JSONEncoder().encode(computers), forKey: "computers")
        UserDefaults.standard.set(selectedID, forKey: "selectedComputer")
        UserDefaults.standard.set(Array(wishlist), forKey: "wishlist")
    }

    /// From the QR code (or a decompbuddy://pair link): checks the computer answers before keeping it.
    func pair(_ url: URL) async -> String? {
        guard let (c, key) = Computer.fromPairingLink(url) else { return "That isn't a Decomp Buddy pairing code." }
        Keychain.set(key, for: c.keychainKey)
        do {
            let hello: Hello = try await PhoneLink(computer: c, key: SymmetricKey(data: Data(base64Encoded: key)!)).call("hello")
            var named = c; named.name = hello.computer
            computers.removeAll { $0.hosts == c.hosts && $0.port == c.port }   // pairing again replaces the old entry
            computers.append(named); selectedID = named.id; save()
            await refresh()
            return nil
        } catch { Keychain.delete(c.keychainKey); return error.localizedDescription }
    }

    func forget(_ c: Computer) { Keychain.delete(c.keychainKey); computers.removeAll { $0.id == c.id }; if selectedID == c.id { selectedID = computers.first?.id }; save(); library = []; jobs = [] }
    func select(_ c: Computer) { selectedID = c.id; save(); Task { await refresh() } }

    func refresh() async {
        guard let c = selected else { return }
        guard let l = link(c) else { if !demo { status = "This phone lost its pairing with \(c.name). Pair it again in the Computers tab." }; return }
        do {
            library = try await l.call("library")
            jobs = try await l.call("jobs")
            finder = Set(try await l.call("finder", as: [String].self))
            let theirs: [String: Bool] = try await l.call("wishlist")
            wishlist.formUnion(theirs.filter(\.value).keys)   // the two lists merge; the phone sends the union back
            try? await syncWishlist(l)
            status = nil
        } catch { status = error.localizedDescription }
    }

    private func syncWishlist(_ l: PhoneLink) async throws {
        let _: Bool = try await l.call("setWishlist", ["wishlist": Dictionary(uniqueKeysWithValues: wishlist.map { ($0, true) })])
    }
    func toggleWish(_ id: String) {
        if wishlist.contains(id) { wishlist.remove(id) } else { wishlist.insert(id) }
        save()
        if let c = selected, let l = link(c) { Task { try? await syncWishlist(l) } }
    }

    /// Ask the computer to do something; afterwards the library and jobs are read again.
    @discardableResult
    func run(_ method: String, _ params: [String: any Sendable]) async -> String? {
        guard let c = selected else { return "Pair a computer first (Computers tab)." }
        if demo { return nil }
        guard let l = link(c) else { return "This computer needs pairing again." }
        busy = true; defer { busy = false }
        do {
            if method == "play" || method == "backupSaves" { let _: Bool = try await l.call(method, params) } else { let _: Job = try await l.call(method, params) }
            await refresh(); return nil
        } catch { return error.localizedDescription }
    }

    func updateAvailable(_ g: InstalledGame, in catalog: CatalogStore) -> String? {
        guard let repo = g.repo?.lowercased(), let tag = g.tag,
              let cg = catalog.games.first(where: { ($0.repoUrl ?? "").lowercased().hasSuffix("/" + repo) && $0.title == g.title }) ?? catalog.games.first(where: { ($0.repoUrl ?? "").lowercased().hasSuffix("/" + repo) }),
              let v = cg.version, v != tag else { return nil }
        return v
    }
}
