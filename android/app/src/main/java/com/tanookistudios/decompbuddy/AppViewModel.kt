package com.tanookistudios.decompbuddy

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

enum class Tab { Browse, Installed, About }

/** What the install button area shows for the game being installed. */
sealed interface InstallStatus {
    data class Working(val text: String, val progress: Float? = null) : InstallStatus
    data class Done(val text: String) : InstallStatus
    data class Error(val text: String) : InstallStatus
}

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = Repository(app.filesDir)
    val installer = Installer(app)
    private fun str(id: Int, vararg args: Any) = getApplication<Application>().getString(id, *args)

    var games by mutableStateOf<List<AndroidGame>>(emptyList()); private set
    var loading by mutableStateOf(true); private set
    var loadError by mutableStateOf<String?>(null); private set
    var offline by mutableStateOf(false); private set
    var query by mutableStateOf("")
    var tab by mutableStateOf(Tab.Browse)
    var selected by mutableStateOf<AndroidGame?>(null)
    var installed by mutableStateOf(repo.installed()); private set

    /** Install status per game id; game-file messages per "gameId#index". */
    val status = mutableStateMapOf<String, InstallStatus>()
    val fileStatus = mutableStateMapOf<String, InstallStatus>()

    /** Set when Install was tapped without the install permission; the install carries on once it is granted. */
    var waitingForInstallPermission by mutableStateOf<AndroidGame?>(null)

    init { load() }

    fun load() {
        loading = true
        loadError = null
        viewModelScope.launch {
            try {
                val (list, stale) = repo.loadGames()
                games = list.sortedByDescending { it.installable } // ready-to-install first; already alphabetical
                offline = stale
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                loadError = str(R.string.load_failed, e.message ?: str(R.string.unknown_error))
            }
            loading = false
        }
    }

    val visibleGames: List<AndroidGame>
        get() {
            val q = query.trim()
            if (q.isEmpty()) return games
            return games.filter { listOf(it.game.title, it.game.console, it.game.project).any { s -> s.contains(q, ignoreCase = true) } }
        }

    fun installedEntry(id: String) = installed.firstOrNull { it.id == id }

    /** Called when the app comes back to the front: the user may have granted a permission or removed a game. */
    fun onResume() {
        val pm = getApplication<Application>().packageManager
        val still = installed.filter { runCatching { pm.getPackageInfo(it.packageId, 0) }.isSuccess }
        if (still.size != installed.size) { installed = still; repo.saveInstalled(still) }
        waitingForInstallPermission?.let { if (installer.canInstall()) { waitingForInstallPermission = null; install(it) } }
    }

    fun install(ag: AndroidGame) {
        val plan = ag.plan ?: return
        val id = ag.game.id
        if (status[id] is InstallStatus.Working) return
        // Refuse a flagged build before anything is downloaded.
        if (scanDecision(plan.build.scanned, null) == ScanDecision.Flagged) { status[id] = InstallStatus.Error(str(R.string.flagged)); return }
        if (ag.game.host != "github") { status[id] = InstallStatus.Error(str(R.string.unsupported_host)); return }
        if (!installer.canInstall()) { waitingForInstallPermission = ag; return }
        viewModelScope.launch {
            try {
                status[id] = InstallStatus.Working(str(R.string.status_finding))
                val asset = plan.build.releaseAsset!!
                val url = repo.releaseAssetUrl(ag.repoForReleases, ag.installTag ?: error("no release tag"), asset)
                var shown = -1
                val (apk, sha) = installer.download(url, asset) { p ->
                    val pct = ((p ?: 0f) * 100).toInt()
                    if (pct != shown) { shown = pct; status[id] = InstallStatus.Working(str(R.string.status_downloading), p) }
                }
                when (scanDecision(plan.build.scanned, sha)) {
                    ScanDecision.Mismatch -> { apk.delete(); status[id] = InstallStatus.Error(str(R.string.mismatch)); return@launch }
                    ScanDecision.Flagged -> { apk.delete(); status[id] = InstallStatus.Error(str(R.string.flagged)); return@launch }
                    else -> Unit
                }
                val pkg = installer.packageNameOf(apk)
                if (pkg == null) { apk.delete(); status[id] = InstallStatus.Error(str(R.string.not_apk)); return@launch }
                status[id] = InstallStatus.Working(str(R.string.status_installing))
                val outcome = installer.install(apk)
                apk.delete()
                status[id] = when (outcome) {
                    Installer.Outcome.Installed -> {
                        val entry = InstalledGame(id, ag.game.title, pkg, ag.installTag, sha)
                        installed = installed.filter { it.id != id } + entry
                        repo.saveInstalled(installed)
                        InstallStatus.Done(str(R.string.status_installed, ag.game.title))
                    }
                    Installer.Outcome.Cancelled -> InstallStatus.Error(str(R.string.status_cancelled))
                    is Installer.Outcome.Failed -> InstallStatus.Error(str(R.string.status_failed, outcome.message ?: str(R.string.unknown_error)))
                }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                status[id] = InstallStatus.Error(str(R.string.status_failed, e.message ?: str(R.string.unknown_error)))
            }
        }
    }

    /** Checks a picked game file against the plan, then copies it to where the port looks for it. */
    fun placeFile(ag: AndroidGame, index: Int, uri: Uri) {
        val spec = ag.plan?.gameFiles?.getOrNull(index) ?: return
        val key = "${ag.game.id}#$index"
        viewModelScope.launch {
            try {
                fileStatus[key] = InstallStatus.Working(str(R.string.file_checking))
                if (spec.expectedHashes.isNotEmpty() || (spec.expectedSize ?: 0) > 0) {
                    when (val check = checkGameFile(spec, installer.hashPicked(uri, algosFor(spec)))) {
                        is FileCheck.WrongSize -> { fileStatus[key] = InstallStatus.Error(str(R.string.file_wrong_size, check.actual, check.expected)); return@launch }
                        FileCheck.NoHashMatch -> { fileStatus[key] = InstallStatus.Error(str(R.string.file_no_match)); return@launch }
                        FileCheck.Ok -> Unit
                    }
                }
                if (spec.pushTo.isNullOrBlank()) { fileStatus[key] = InstallStatus.Done(str(R.string.file_ok_keep)); return@launch }
                val rel = safeStoragePath(spec.pushTo, spec.expectedFilename ?: installer.displayName(uri))
                if (rel == null) { fileStatus[key] = InstallStatus.Error(str(R.string.file_bad_path)); return@launch }
                val dest = installer.copyToStorage(uri, rel)
                fileStatus[key] = InstallStatus.Done(str(R.string.file_placed, dest.path))
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                fileStatus[key] = InstallStatus.Error(str(R.string.file_failed, e.message ?: str(R.string.unknown_error)))
            }
        }
    }

    fun showManualCopy(ag: AndroidGame, index: Int) {
        val spec = ag.plan?.gameFiles?.getOrNull(index) ?: return
        fileStatus["${ag.game.id}#$index"] = InstallStatus.Done(str(R.string.manual_copy, spec.pushTo.orEmpty()))
    }

}
