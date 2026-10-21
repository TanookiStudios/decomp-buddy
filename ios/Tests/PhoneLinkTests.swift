import CryptoKit
import XCTest
@testable import DecompBuddyRemote

final class PhoneLinkTests: XCTestCase {
    // Made by the desktop's src/phonecrypto.js seal() with key = 32 bytes of 7, { m: "hello", p: { x: 1 }, ts: 1700000000000 }.
    func testOpensWhatTheDesktopSealed() throws {
        let key = SymmetricKey(data: Data(repeating: 7, count: 32))
        let env = Envelope(iv: "XtEO19xusaF61tJJ", ct: "Stt4/R5Jeq9s7teSqedfk+HT5ttIfgYU6Me6KIVCHzm9AINrFVx8byphE96pLbrh1V6ZKSUXaB1cCPbC")
        let obj = try JSONSerialization.jsonObject(with: Seal.open(env, key: key)) as? [String: Any]
        XCTAssertEqual(obj?["m"] as? String, "hello")
        XCTAssertEqual((obj?["p"] as? [String: Any])?["x"] as? Int, 1)
        XCTAssertEqual(obj?["ts"] as? Int, 1_700_000_000_000)
    }
    func testRoundTripAndWrongKey() throws {
        let key = SymmetricKey(size: .bits256)
        let env = try Seal.seal(["m": "library", "ts": 1], key: key)
        XCTAssertNoThrow(try Seal.open(env, key: key))
        XCTAssertThrowsError(try Seal.open(env, key: SymmetricKey(size: .bits256)))
    }
    func testPairingLink() throws {
        let k = Data(repeating: 1, count: 32).base64EncodedString().addingPercentEncoding(withAllowedCharacters: .alphanumerics)!
        let (c, key) = try XCTUnwrap(Computer.fromPairingLink(URL(string: "decompbuddy://pair?h=192.168.1.5,10.0.0.2&p=47613&k=\(k)&n=Mac")!))
        XCTAssertEqual(c.hosts, ["192.168.1.5", "10.0.0.2"]); XCTAssertEqual(c.port, 47613); XCTAssertEqual(c.name, "Mac")
        XCTAssertEqual(Data(base64Encoded: key)?.count, 32)
        XCTAssertNil(Computer.fromPairingLink(URL(string: "decompbuddy://pair?h=1.2.3.4&p=47613&k=short")!))
        XCTAssertNil(Computer.fromPairingLink(URL(string: "https://evil.example/pair?h=1.2.3.4&p=1&k=\(k)")!))
    }
}
