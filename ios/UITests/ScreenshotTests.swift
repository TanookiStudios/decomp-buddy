// App Store screenshots and the App Review walkthrough, from made-up demo data (DB_DEMO=1) - never a real library.
// scripts/capture-screenshots.sh runs this and fails if any screen is missing.
import XCTest

final class ScreenshotTests: XCTestCase {
    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
    }
    private func tab(_ app: XCUIApplication, _ label: String) {
        let b = app.tabBars.buttons[label]
        XCTAssertTrue(b.waitForExistence(timeout: 10), "tab \(label) missing"); b.tap()
    }

    func testScreens() {
        let app = XCUIApplication(); app.launchEnvironment["DB_DEMO"] = "1"; app.launch()
        XCTAssertTrue(app.navigationBars["Browse"].waitForExistence(timeout: 15)); shot(app, "01-browse")
        app.staticTexts["Neon Agent"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Install On Living Room PC"].waitForExistence(timeout: 10)); shot(app, "02-game")
        tab(app, "Library"); XCTAssertTrue(app.staticTexts["Starfield Racer"].waitForExistence(timeout: 10)); shot(app, "03-library")
        tab(app, "Wishlist"); shot(app, "04-wishlist")
        tab(app, "Computers"); XCTAssertTrue(app.staticTexts["Living Room PC"].waitForExistence(timeout: 10)); shot(app, "05-computers")
    }
}
