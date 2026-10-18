package com.tanookistudios.decompbuddy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ParsingTests {
    private val catalogJson = """
    { "count": 5, "games": [
      { "id": "github:owner/doomport", "slug": "doom", "title": "Doom", "console": "PC", "project": "DoomPort",
        "repo": "Owner/DoomPort", "repoUrl": "https://github.com/Owner/DoomPort", "host": "github",
        "iconUrl": null, "boxartUrl": "https://example.com/doom.png", "platforms": ["Windows"], "version": "v2.0",
        "plan": { "targets": ["windows", "android"] }, "scan": null, "facts": { "archived": false } },
      { "id": "github:someone/ship", "title": "Ship Game", "console": "Nintendo 64", "project": "Ship",
        "repo": "someone/ship", "platforms": ["Windows", "Android"], "version": "1.0", "plan": { "targets": ["windows"] } },
      { "id": "github:pc/only", "title": "Desktop Only", "console": "GameCube", "project": "Only",
        "repo": "pc/only", "platforms": ["Windows", "Linux"], "version": "3", "plan": null },
      { "id": "github:col/multi#second-game", "title": "Second Game", "console": "Game Boy", "project": "Multi",
        "repo": "col/multi", "platforms": ["Windows"], "version": "0.3", "plan": { "targets": ["android"] } },
      { "id": "github:new/fields", "title": "Brand New", "console": "PS2", "project": "New", "repo": "new/fields",
        "platforms": ["Android"], "version": null, "plan": null, "somethingAddedLater": { "x": 1 } }
    ] }"""

    private val plansJson = """
    { "updatedAt": "2026-10-18", "plans": {
      "github:owner/doomport": { "tag": "v2.0", "targets": {
        "windows": { "games": [ { "game_title": "Doom", "build": { "method": "release", "release_asset": "doom.zip" } } ] },
        "android": { "redirect_repo": null, "games": [ {
          "game_title": "Doom", "console": "PC",
          "build": { "method": "release", "release_asset": "doom.apk", "release_tag": "v2.0", "package_id": "com.doom",
                     "scanned": { "sha256": "ABCDEF", "at": "2026-10-01", "engine": "clamav" } },
          "game_files": [ { "label": "DOOM.WAD", "description": "Your WAD", "accepted_formats": [".wad"],
            "expected_filename": "doom.wad", "push_to": "DoomPort/wads", "drop_into": "Game Files",
            "expected_hashes": [ { "algo": "md5", "value": "abc" } ], "expected_size": 12 } ],
          "first_run": ["Open it"], "notes": [] } ] } } },
      "github:someone/ship": { "tag": "1.0", "targets": { "windows": { "games": [] } } },
      "github:col/multi": { "tag": "0.3", "targets": { "android": { "redirect_repo": "col/multi-android", "games": [
        { "game_title": "First Game", "build": { "method": "release", "release_asset": "first.apk", "scanned": { "flagged": true } } },
        { "game_title": "Second Game", "build": { "method": "release", "release_asset": "second.apk", "release_tag": "0.3a" } } ] } } }
    } }"""

    private val games = androidGames(json.decodeFromString(catalogJson), json.decodeFromString(plansJson))

    @Test fun keepsOnlyAndroidGames() {
        assertEquals(listOf("Brand New", "Doom", "Second Game", "Ship Game"), games.map { it.game.title })
    }

    @Test fun gameWithAndroidPlanIsInstallable() {
        val doom = games.single { it.game.title == "Doom" }
        assertTrue(doom.installable)
        assertTrue(doom.scannedClean)
        assertEquals("v2.0", doom.installTag)
        assertEquals("Owner/DoomPort", doom.repoForReleases)
        assertEquals("DoomPort/wads", doom.plan!!.gameFiles.single().pushTo)
        assertEquals(12L, doom.plan.gameFiles.single().expectedSize)
    }

    @Test fun androidPlatformWithoutPlanIsComingSoon() {
        val ship = games.single { it.game.title == "Ship Game" }
        assertNull(ship.plan)
        assertFalse(ship.installable)
        assertEquals("1.0", ship.installTag)
        val brandNew = games.single { it.game.title == "Brand New" }
        assertFalse(brandNew.installable)
        assertNull(brandNew.installTag)
    }

    @Test fun collectionPicksItsOwnGameAndRedirectRepo() {
        val second = games.single { it.game.title == "Second Game" }
        assertEquals("second.apk", second.plan!!.build.releaseAsset)
        assertEquals("0.3a", second.installTag)
        assertEquals("col/multi-android", second.repoForReleases)
        assertFalse(second.scannedClean)
    }

    @Test fun parsesTheEmptyLivePlansShape() {
        val none = androidGames(json.decodeFromString(catalogJson), json.decodeFromString("""{ "plans": {} }"""))
        assertTrue(none.none { it.installable })
        assertEquals(4, none.size) // the catalog alone still says which games run on Android
    }
}

class PushPathTests {
    @Test fun acceptsNormalFolders() {
        assertEquals("QuestZDoom/wads/doom.wad", safeStoragePath("QuestZDoom/wads", "doom.wad"))
        assertEquals("Ports/x/rom.z64", safeStoragePath("Ports//x/", "rom.z64"))
        assertEquals("Ports/rom.z64", safeStoragePath("./Ports", "rom.z64"))
    }

    @Test fun refusesEscapes() {
        assertNull(safeStoragePath("/sdcard/Ports", "a.bin"))
        assertNull(safeStoragePath("Ports/../../data", "a.bin"))
        assertNull(safeStoragePath("..", "a.bin"))
        assertNull(safeStoragePath("Ports\\wads", "a.bin"))
        assertNull(safeStoragePath("Ports", "..\\a.bin"))
        assertNull(safeStoragePath("Ports", "../a.bin"))
        assertNull(safeStoragePath("Ports", ".."))
        assertNull(safeStoragePath("C:/Ports", "a.bin"))
        assertNull(safeStoragePath("Ports", "a\u0000.bin"))
        assertNull(safeStoragePath("", "a.bin"))
        assertNull(safeStoragePath(null, "a.bin"))
        assertNull(safeStoragePath("Ports", null))
    }
}

class ScanDecisionTests {
    @Test fun matchInstalls() = assertEquals(ScanDecision.Install, scanDecision(Scanned(sha256 = "ABCDEF"), "abcdef"))
    @Test fun mismatchRefuses() = assertEquals(ScanDecision.Mismatch, scanDecision(Scanned(sha256 = "abcdef"), "123456"))
    @Test fun flaggedRefusesEvenBeforeDownload() {
        assertEquals(ScanDecision.Flagged, scanDecision(Scanned(flagged = true), null))
        assertEquals(ScanDecision.Flagged, scanDecision(Scanned(flagged = true, sha256 = "abc"), "abc"))
    }
    @Test fun unscannedIsAllowedButMarked() {
        assertEquals(ScanDecision.NotScanned, scanDecision(null, "abc"))
        assertEquals(ScanDecision.NotScanned, scanDecision(Scanned(), "abc"))
    }
}

class HashTests {
    private fun hash(text: String, vararg algos: String) = Hasher.hash(text.byteInputStream(), algos.toSet())

    @Test fun knownDigests() {
        val r = hash("abc", "md5", "sha1", "sha256", "crc32", "whirlpool")
        assertEquals(3L, r.size)
        assertEquals("900150983cd24fb0d6963f7d28e17f72", r.digests["md5"])
        assertEquals("a9993e364706816aba3e25717850c26c9cd0d89d", r.digests["sha1"])
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", r.digests["sha256"])
        assertEquals("352441c2", r.digests["crc32"])
        assertFalse("whirlpool" in r.digests)
    }

    private fun spec(vararg hashes: Pair<String, String>, size: Long? = null) =
        GameFile(label = "ROM", expectedHashes = hashes.map { ExpectedHash(it.first, it.second) }, expectedSize = size)

    @Test fun anyPublishedHashMatches() {
        val s = spec("sha1" to "0000", "md5" to "900150983CD24FB0D6963F7D28E17F72")
        assertEquals(FileCheck.Ok, checkGameFile(s, hash("abc", *algosFor(s).toTypedArray())))
    }

    @Test fun crc32WithDroppedZerosAndPrefix() {
        // crc32("a") = e8b7be43
        assertEquals(FileCheck.Ok, checkGameFile(spec("crc32" to "0xE8B7BE43"), hash("a", "crc32")))
        val zeros = Hasher.Result(1, mapOf("crc32" to "0000abcd"))
        assertEquals(FileCheck.Ok, checkGameFile(spec("crc32" to "ABCD"), zeros))
    }

    @Test fun wrongFileRefused() {
        assertEquals(FileCheck.NoHashMatch, checkGameFile(spec("sha256" to "deadbeef"), hash("abc", "sha256")))
        assertEquals(FileCheck.WrongSize(4, 3), checkGameFile(spec("md5" to "900150983cd24fb0d6963f7d28e17f72", size = 4), hash("abc", "md5")))
    }

    @Test fun noPublishedHashesPasses() = assertEquals(FileCheck.Ok, checkGameFile(spec(), hash("abc")))
}
