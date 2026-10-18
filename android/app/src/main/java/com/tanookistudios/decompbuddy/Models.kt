package com.tanookistudios.decompbuddy

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// The public catalog and plans, cut down to what the phone app reads. Unknown fields are ignored,
// and every other target (windows, linux...) is skipped while decoding, which keeps the 7 MB plans file light.

val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

@Serializable
data class Catalog(val count: Int = 0, val games: List<Game> = emptyList())

@Serializable
data class Game(
    val id: String,
    val title: String,
    val console: String = "",
    val project: String = "",
    val repo: String = "",
    val repoUrl: String = "",
    val host: String = "github",
    val iconUrl: String? = null,
    val boxartUrl: String? = null,
    val platforms: List<String> = emptyList(),
    val version: String? = null,
    val plan: CatalogPlan? = null,
)

@Serializable
data class CatalogPlan(val targets: List<String> = emptyList())

@Serializable
data class Plans(val plans: Map<String, PlanEntry> = emptyMap())

@Serializable
data class PlanEntry(val tag: String? = null, val targets: Targets = Targets())

@Serializable
data class Targets(val android: Target? = null)

@Serializable
data class Target(@SerialName("redirect_repo") val redirectRepo: String? = null, val games: List<PlanGame> = emptyList())

@Serializable
data class PlanGame(
    @SerialName("game_title") val gameTitle: String = "",
    val console: String = "",
    val build: Build = Build(),
    @SerialName("game_files") val gameFiles: List<GameFile> = emptyList(),
    @SerialName("first_run") val firstRun: List<String> = emptyList(),
    val notes: List<String> = emptyList(),
)

@Serializable
data class Build(
    val method: String = "",
    @SerialName("release_asset") val releaseAsset: String? = null,
    @SerialName("release_tag") val releaseTag: String? = null,
    @SerialName("package_id") val packageId: String? = null,
    val scanned: Scanned? = null,
)

@Serializable
data class Scanned(val sha256: String? = null, val at: String? = null, val engine: String? = null, val flagged: Boolean = false)

@Serializable
data class GameFile(
    val label: String = "",
    val description: String = "",
    @SerialName("accepted_formats") val acceptedFormats: List<String> = emptyList(),
    @SerialName("expected_filename") val expectedFilename: String? = null,
    @SerialName("push_to") val pushTo: String? = null,
    @SerialName("drop_into") val dropInto: String? = null,
    @SerialName("expected_hashes") val expectedHashes: List<ExpectedHash> = emptyList(),
    @SerialName("expected_size") val expectedSize: Long? = null,
)

@Serializable
data class ExpectedHash(val algo: String, val value: String)

/** One Android game for the Browse list. [plan] is null when the catalog lists Android but no install steps exist yet. */
data class AndroidGame(val game: Game, val plan: PlanGame?, val repoForReleases: String) {
    val installable get() = plan != null && plan.build.method == "release" && !plan.build.releaseAsset.isNullOrBlank()
    /** The release this app installs: the plan's tag, else the catalog version. */
    val installTag get() = plan?.build?.releaseTag ?: game.version
    val scannedClean get() = !plan?.build?.scanned?.sha256.isNullOrBlank()
}

/** "<host>:<owner>/<repo>" for a catalog id; collections add "#<game-slug>", which plans.json doesn't use. */
fun planKey(gameId: String) = gameId.substringBefore('#').lowercase()

private fun norm(s: String) = s.lowercase().replace(Regex("[^a-z0-9]"), "")

/**
 * Every game an Android phone or handheld can run: those with an android plan, plus those the catalog
 * lists for Android that have no plan yet (shown as "Install Steps Coming Soon").
 */
fun androidGames(catalog: Catalog, plans: Plans): List<AndroidGame> = catalog.games.mapNotNull { g ->
    val target = plans.plans[planKey(g.id)]?.targets?.android
    val games = target?.games.orEmpty()
    val pg = if (games.size > 1) games.firstOrNull { norm(it.gameTitle) == norm(g.title) } else games.firstOrNull()
    if (pg == null && "Android" !in g.platforms && "android" !in g.plan?.targets.orEmpty()) return@mapNotNull null
    AndroidGame(g, pg, target?.redirectRepo?.takeIf { it.isNotBlank() } ?: g.repo)
}.sortedBy { it.game.title.lowercase() }

@Serializable
data class InstalledGame(val id: String, val title: String, val packageId: String, val tag: String?, val sha256: String)
