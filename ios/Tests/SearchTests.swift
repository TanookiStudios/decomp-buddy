import XCTest
@testable import DecompBuddyRemote

final class SearchTests: XCTestCase {
    private func g(_ t: String) -> CatalogGame { CatalogGame(id: t, title: t, console: "PS3", project: nil, repoUrl: nil, platforms: [], version: nil, latestVersion: nil, status: nil, description: nil, facts: nil, scan: nil) }
    func testNumeralsOrderAndRanking() {
        let games = [g("Mega Man X4"), g("God of War III Remastered"), g("Mega Man X"), g("Pokémon Emerald")]
        XCTAssertEqual(Search.filter(games, "God of War 3").map(\.title), ["God of War III Remastered"])
        XCTAssertEqual(Search.filter(games, "war god").map(\.title), ["God of War III Remastered"])
        XCTAssertEqual(Search.filter(games, "Mega Man X").first?.title, "Mega Man X")
        XCTAssertEqual(Search.filter(games, "pokemon").map(\.title), ["Pokémon Emerald"])
        XCTAssertEqual(Search.filter(games, "").count, 4)
    }
}
