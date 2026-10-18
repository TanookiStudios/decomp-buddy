package com.tanookistudios.decompbuddy

import java.io.InputStream
import java.security.MessageDigest
import java.util.zip.CRC32

/**
 * A plan's push_to + a file name -> the path under shared storage ("Ports/wads/doom.wad"), or null when
 * either part could reach outside it: a leading slash, "..", a backslash, a drive letter or control characters.
 */
fun safeStoragePath(pushTo: String?, name: String?): String? {
    val dir = pushTo?.trim().orEmpty()
    val file = name?.trim().orEmpty()
    if (dir.isEmpty() || file.isEmpty()) return null
    if (dir.startsWith("/") || '\\' in dir || '\\' in file || '/' in file) return null
    if (Regex("^[A-Za-z]:").containsMatchIn(dir) || (dir + file).any { it.code < 0x20 }) return null
    val parts = dir.split('/').filter { it.isNotEmpty() && it != "." } + file
    if (parts.any { it == ".." } || file == ".") return null
    return parts.joinToString("/")
}

enum class ScanDecision { Install, NotScanned, Mismatch, Flagged }

/** Decomp Buddy's malware scan: a flagged build is never installed, and a scanned one must be that exact file. */
fun scanDecision(scanned: Scanned?, downloadedSha256: String?): ScanDecision = when {
    scanned?.flagged == true -> ScanDecision.Flagged
    scanned?.sha256.isNullOrBlank() -> ScanDecision.NotScanned
    downloadedSha256 == null -> ScanDecision.Install // before the download: nothing to compare yet
    scanned.sha256.trim().equals(downloadedSha256, ignoreCase = true) -> ScanDecision.Install
    else -> ScanDecision.Mismatch
}

/** Streams once and returns size plus lowercase hex digests for each requested algorithm (sha1, md5, sha256, crc32). */
object Hasher {
    val supported = setOf("sha1", "md5", "sha256", "crc32")

    class Result(val size: Long, val digests: Map<String, String>)

    fun hash(input: InputStream, algos: Set<String>, onBytes: (Long) -> Unit = {}): Result {
        val wanted = algos.map { it.lowercase() }.filter { it in supported }.toSet()
        val digests = wanted.filter { it != "crc32" }.associateWith {
            MessageDigest.getInstance(when (it) { "sha1" -> "SHA-1"; "md5" -> "MD5"; else -> "SHA-256" })
        }
        val crc = if ("crc32" in wanted) CRC32() else null
        val buf = ByteArray(1 shl 16)
        var size = 0L
        input.use {
            while (true) {
                val n = it.read(buf)
                if (n < 0) break
                digests.values.forEach { d -> d.update(buf, 0, n) }
                crc?.update(buf, 0, n)
                size += n
                onBytes(size)
            }
        }
        val out = digests.mapValues { (_, d) -> d.digest().joinToString("") { b -> "%02x".format(b) } }.toMutableMap()
        if (crc != null) out["crc32"] = "%08x".format(crc.value)
        return Result(size, out)
    }
}

sealed interface FileCheck {
    data object Ok : FileCheck
    data class WrongSize(val expected: Long, val actual: Long) : FileCheck
    data object NoHashMatch : FileCheck
}

/** Algorithms worth computing for this file: only the ones the plan publishes. */
fun algosFor(spec: GameFile) = spec.expectedHashes.map { it.algo.lowercase() }.filter { it in Hasher.supported }.toSet()

/** The picked file passes when its size matches (if given) and any one published hash matches (they list regions or revisions). */
fun checkGameFile(spec: GameFile, result: Hasher.Result): FileCheck {
    spec.expectedSize?.takeIf { it > 0 }?.let { if (it != result.size) return FileCheck.WrongSize(it, result.size) }
    val hashes = spec.expectedHashes.filter { it.algo.lowercase() in Hasher.supported }
    if (hashes.isEmpty()) return FileCheck.Ok
    val match = hashes.any { h ->
        val algo = h.algo.lowercase()
        var want = h.value.trim().lowercase().removePrefix("0x")
        if (algo == "crc32") want = want.padStart(8, '0') // docs often drop leading zeros
        result.digests[algo] == want
    }
    return if (match) FileCheck.Ok else FileCheck.NoHashMatch
}
