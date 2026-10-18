package com.tanookistudios.decompbuddy

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

const val CATALOG_URL = "https://tanookistudios.com/decomp-buddy/catalog.json"
const val PLANS_URL = "https://tanookistudios.com/decomp-buddy/plans.json"

class HttpException(val code: Int, url: String) : IOException("HTTP $code from $url")

fun open(url: String, headers: Map<String, String> = emptyMap()): HttpURLConnection =
    (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 20_000
        readTimeout = 60_000
        setRequestProperty("User-Agent", "DecompBuddy-Android")
        headers.forEach { (k, v) -> setRequestProperty(k, v) }
    }

/** Network + JSON. Everything is a plain public HTTPS GET: no account, no key, nothing about the user is sent. */
class Repository(private val dir: File) {
    private val releaseCache = mutableMapOf<String, String>()
    private val installedFile = File(dir, "installed.json")

    /** Downloads [url] into the app's files, re-using the saved copy when the server says it hasn't changed (ETag). */
    private fun fetchCached(url: String, name: String): Pair<String, Boolean> {
        val body = File(dir, name)
        val tag = File(dir, "$name.etag")
        try {
            val c = open(url, if (body.exists() && tag.exists()) mapOf("If-None-Match" to tag.readText()) else emptyMap())
            try {
                when (c.responseCode) {
                    304 -> return body.readText() to false
                    200 -> {
                        val text = c.inputStream.bufferedReader().use { it.readText() }
                        body.writeText(text)
                        c.getHeaderField("ETag")?.let { tag.writeText(it) } ?: tag.delete()
                        return text to false
                    }
                    else -> throw HttpException(c.responseCode, url)
                }
            } finally { c.disconnect() }
        } catch (e: IOException) {
            if (body.exists()) return body.readText() to true // offline: the last list still works
            throw e
        }
    }

    /** The Android game list, and whether it came from the saved copy because the network failed. */
    suspend fun loadGames(): Pair<List<AndroidGame>, Boolean> = withContext(Dispatchers.IO) {
        val (catalog, staleA) = fetchCached(CATALOG_URL, "catalog.json")
        val (plans, staleB) = fetchCached(PLANS_URL, "plans.json")
        androidGames(json.decodeFromString(catalog), json.decodeFromString(plans)) to (staleA || staleB)
    }

    @Serializable
    private data class Release(val tag_name: String = "", val assets: List<Asset> = emptyList())

    @Serializable
    private data class Asset(val name: String = "", val browser_download_url: String = "")

    /**
     * The download address of [asset] in release [tag] of [repo] ("owner/name"). GitHub allows 60 of these
     * lookups an hour without an account, so it only runs when Install is tapped, and each answer is kept.
     */
    suspend fun releaseAssetUrl(repo: String, tag: String, asset: String): String = withContext(Dispatchers.IO) {
        val ownerRepo = repo.removePrefix("https://github.com/").trim('/')
        val key = "$ownerRepo@$tag/$asset"
        releaseCache[key]?.let { return@withContext it }
        val url = "https://api.github.com/repos/$ownerRepo/releases/tags/${URLEncoder.encode(tag, "UTF-8").replace("+", "%20")}"
        val c = open(url, mapOf("Accept" to "application/vnd.github+json"))
        val release = try {
            if (c.responseCode != 200) throw HttpException(c.responseCode, url)
            json.decodeFromString<Release>(c.inputStream.bufferedReader().use { it.readText() })
        } finally { c.disconnect() }
        val found = release.assets.firstOrNull { it.name == asset } ?: throw IOException("Release $tag has no file named $asset")
        found.browser_download_url.also { releaseCache[key] = it }
    }

    private val installedSerializer = ListSerializer(InstalledGame.serializer())

    fun installed(): List<InstalledGame> =
        runCatching { json.decodeFromString(installedSerializer, installedFile.readText()) }.getOrDefault(emptyList())

    fun saveInstalled(list: List<InstalledGame>) {
        val tmp = File(dir, "installed.json.tmp")
        tmp.writeText(json.encodeToString(installedSerializer, list))
        tmp.renameTo(installedFile) // whole-file swap, so a crash mid-write never loses the list
    }
}
