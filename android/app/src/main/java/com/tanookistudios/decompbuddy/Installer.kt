package com.tanookistudios.decompbuddy

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.security.DigestInputStream
import java.security.MessageDigest
import kotlin.coroutines.resume

/** Downloads, checks and installs APKs, and copies game files into shared storage. */
class Installer(private val context: Context) {

    /** Downloads [url] to the app's cache, hashing as it goes. Returns the file and its SHA-256. */
    suspend fun download(url: String, name: String, progress: (Float?) -> Unit): Pair<File, String> = withContext(Dispatchers.IO) {
        val dest = File(context.cacheDir, "downloads/${name.substringAfterLast('/')}").apply { parentFile?.mkdirs() }
        val c = open(url)
        try {
            if (c.responseCode != 200) throw HttpException(c.responseCode, url)
            val total = c.contentLengthLong
            val md = MessageDigest.getInstance("SHA-256")
            DigestInputStream(c.inputStream, md).use { input ->
                dest.outputStream().use { out ->
                    val buf = ByteArray(1 shl 16)
                    var done = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        progress(if (total > 0) done.toFloat() / total else null)
                    }
                }
            }
            dest to md.digest().joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            dest.delete()
            throw e
        } finally { c.disconnect() }
    }

    fun packageNameOf(apk: File): String? = context.packageManager.getPackageArchiveInfo(apk.path, 0)?.packageName

    fun canInstall() = context.packageManager.canRequestPackageInstalls()

    /** True when this app may write to shared storage (All Files Access on Android 11+, the storage permission before). */
    fun canWriteStorage() = if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
    else ContextCompat.checkSelfPermission(context, android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED

    sealed interface Outcome {
        data object Installed : Outcome
        data object Cancelled : Outcome
        data class Failed(val message: String?) : Outcome
    }

    /** Installs [apk] with the session API. Android shows its own confirmation screen; this waits for the answer. */
    suspend fun install(apk: File): Outcome {
        val installer = context.packageManager.packageInstaller
        val sessionId = withContext(Dispatchers.IO) {
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            val id = installer.createSession(params)
            installer.openSession(id).use { s ->
                s.openWrite("game.apk", 0, apk.length()).use { out -> apk.inputStream().use { it.copyTo(out) }; s.fsync(out) }
            }
            id
        }
        val action = "${context.packageName}.INSTALL_STATUS.$sessionId"
        return suspendCancellableCoroutine { cont ->
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context, intent: Intent) {
                    when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                        PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                            @Suppress("DEPRECATION")
                            val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                            else intent.getParcelableExtra(Intent.EXTRA_INTENT)
                            confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let(context::startActivity)
                        }
                        else -> {
                            context.unregisterReceiver(this)
                            if (cont.isActive) cont.resume(when (status) {
                                PackageInstaller.STATUS_SUCCESS -> Outcome.Installed
                                PackageInstaller.STATUS_FAILURE_ABORTED -> Outcome.Cancelled
                                else -> Outcome.Failed(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
                            })
                        }
                    }
                }
            }
            ContextCompat.registerReceiver(context, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
            val pending = PendingIntent.getBroadcast(context, sessionId, Intent(action).setPackage(context.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
            cont.invokeOnCancellation { runCatching { context.unregisterReceiver(receiver) } }
            installer.openSession(sessionId).use { it.commit(pending.intentSender) }
        }
    }

    fun displayName(uri: Uri): String? = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { if (it.moveToFirst()) it.getString(0) else null }

    /** Hashes a picked file with only the algorithms its plan publishes. */
    suspend fun hashPicked(uri: Uri, algos: Set<String>): Hasher.Result = withContext(Dispatchers.IO) {
        Hasher.hash(context.contentResolver.openInputStream(uri) ?: throw IOException("Couldn't open that file"), algos)
    }

    /** Copies a picked file to shared storage at [relPath] (already checked by [safeStoragePath]). Returns where it went. */
    @Suppress("DEPRECATION") // getExternalStorageDirectory is the right root once All Files Access is granted
    suspend fun copyToStorage(uri: Uri, relPath: String): File = withContext(Dispatchers.IO) {
        val dest = File(Environment.getExternalStorageDirectory(), relPath)
        dest.parentFile?.mkdirs()
        val tmp = File(dest.parentFile, ".${dest.name}.part")
        try {
            (context.contentResolver.openInputStream(uri) ?: throw IOException("Couldn't open that file")).use { input ->
                tmp.outputStream().use { input.copyTo(it) }
            }
            if (!tmp.renameTo(dest)) throw IOException("Couldn't save ${dest.path}")
        } finally { tmp.delete() }
        dest
    }
}
