package com.tanookistudios.decompbuddy

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val dark = isSystemInDarkTheme()
            val colors = when {
                Build.VERSION.SDK_INT >= 31 -> if (dark) dynamicDarkColorScheme(this) else dynamicLightColorScheme(this)
                dark -> darkColorScheme()
                else -> lightColorScheme()
            }
            MaterialTheme(colorScheme = colors) {
                Surface(Modifier.fillMaxSize()) { App(vm) }
            }
        }
    }
}

private fun android.content.Context.openUrl(url: String) {
    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: ActivityNotFoundException) {}
}

@Composable
fun App(vm: AppViewModel) {
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.onResume() }
    val context = LocalContext.current

    vm.waitingForInstallPermission?.let {
        AlertDialog(
            onDismissRequest = { vm.waitingForInstallPermission = null },
            title = { Text(stringResource(R.string.perm_install_title)) },
            text = { Text(stringResource(R.string.perm_install_body)) },
            confirmButton = {
                TextButton(onClick = {
                    context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
                }) { Text(stringResource(R.string.open_settings)) }
            },
            dismissButton = { TextButton(onClick = { vm.waitingForInstallPermission = null }) { Text(stringResource(R.string.not_now)) } },
        )
    }

    val open = vm.selected
    if (open != null) {
        BackHandler { vm.selected = null }
        GamePage(vm, open)
        return
    }
    Column(Modifier.safeDrawingPadding()) {
        PrimaryTabRow(selectedTabIndex = vm.tab.ordinal) {
            Tab.entries.forEach { t ->
                val label = stringResource(when (t) { Tab.Browse -> R.string.tab_browse; Tab.Installed -> R.string.tab_installed; Tab.About -> R.string.tab_about })
                Tab(selected = vm.tab == t, onClick = { vm.tab = t }, text = { Text(label) })
            }
        }
        when (vm.tab) {
            Tab.Browse -> Browse(vm)
            Tab.Installed -> Installed(vm)
            Tab.About -> About()
        }
    }
}

@Composable
private fun Browse(vm: AppViewModel) {
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = vm.query, onValueChange = { vm.query = it }, singleLine = true,
            label = { Text(stringResource(R.string.search_label)) },
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        )
        when {
            vm.loading && vm.games.isEmpty() -> Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(24.dp))
                Spacer(Modifier.width(12.dp))
                Text(stringResource(R.string.loading))
            }
            vm.loadError != null -> Column(Modifier.padding(16.dp)) {
                Text(vm.loadError!!, color = MaterialTheme.colorScheme.error)
                Button(onClick = vm::load, modifier = Modifier.padding(top = 8.dp)) { Text(stringResource(R.string.retry)) }
            }
            else -> {
                if (vm.offline) Text(stringResource(R.string.offline_note), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp))
                Text(stringResource(R.string.game_count, vm.games.size, vm.games.count { it.installable }),
                    style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                val list = vm.visibleGames
                if (list.isEmpty()) Text(stringResource(R.string.no_matches), modifier = Modifier.padding(16.dp))
                LazyColumn {
                    items(list, key = { it.game.id }) { ag ->
                        Row(
                            Modifier.fillMaxWidth().clickable { vm.selected = ag }.padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            GameArt(ag.game, Modifier.size(64.dp))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(ag.game.title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(stringResource(R.string.console_project, ag.game.console, ag.game.project),
                                    style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    if (ag.scannedClean) Label(stringResource(R.string.scanned_chip))
                                    if (!ag.installable) Label(stringResource(R.string.coming_soon))
                                }
                            }
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

/** A small read-only tag (not a control). */
@Composable
private fun Label(text: String) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.small) {
        Text(text, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
    }
}

@Composable
private fun StatusLine(s: InstallStatus?) {
    when (s) {
        null -> Unit
        is InstallStatus.Working -> Column(Modifier.padding(vertical = 8.dp)) {
            Text(s.text)
            if (s.progress != null) LinearProgressIndicator(progress = { s.progress }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
            else LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 4.dp))
        }
        is InstallStatus.Done -> Text(s.text, modifier = Modifier.padding(vertical = 8.dp))
        is InstallStatus.Error -> Text(s.text, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp))
    }
}

@Composable
private fun Heading(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp, bottom = 4.dp).semantics { heading() })
}

@Composable
private fun GamePage(vm: AppViewModel, ag: AndroidGame) {
    val context = LocalContext.current
    val plan = ag.plan
    val have = vm.installedEntry(ag.game.id)
    var explainSoon by remember { mutableStateOf(false) }
    var storageAskFor by remember { mutableIntStateOf(-1) }
    var pickFor by remember { mutableIntStateOf(-1) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && pickFor >= 0) vm.placeFile(ag, pickFor, uri)
    }
    val legacyStorage = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val index = storageAskFor
        storageAskFor = -1
        if (index < 0) return@rememberLauncherForActivityResult
        if (ok) { pickFor = index; picker.launch(arrayOf("*/*")) } else vm.showManualCopy(ag, index)
    }

    if (storageAskFor >= 0 && Build.VERSION.SDK_INT >= 30) {
        val index = storageAskFor
        AlertDialog(
            onDismissRequest = { storageAskFor = -1 },
            title = { Text(stringResource(R.string.perm_storage_title)) },
            text = { Text(stringResource(R.string.perm_storage_body)) },
            confirmButton = {
                TextButton(onClick = {
                    storageAskFor = -1
                    try {
                        context.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}")))
                    } catch (_: ActivityNotFoundException) { // some handheld builds drop the per-app screen
                        context.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                    }
                }) { Text(stringResource(R.string.open_settings)) }
            },
            dismissButton = { TextButton(onClick = { storageAskFor = -1; vm.showManualCopy(ag, index) }) { Text(stringResource(R.string.not_now)) } },
        )
    }

    Column(Modifier.safeDrawingPadding().verticalScroll(rememberScrollState()).padding(16.dp)) {
        TextButton(onClick = { vm.selected = null }) { Text(stringResource(R.string.back)) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            GameArt(ag.game, Modifier.size(96.dp), sizePx = 384)
            Spacer(Modifier.width(16.dp))
            Column {
                Text(ag.game.title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
                Text(stringResource(R.string.console_project, ag.game.console, ag.game.project))
                ag.installTag?.let { Text(stringResource(R.string.version, it), style = MaterialTheme.typography.bodySmall) }
                if (ag.scannedClean) Spacer(Modifier.height(4.dp))
                if (ag.scannedClean) Label(stringResource(R.string.scanned_chip))
            }
        }
        Spacer(Modifier.height(16.dp))

        if (ag.installable) {
            val label = stringResource(when { have == null -> R.string.install; have.tag != ag.installTag -> R.string.update; else -> R.string.reinstall })
            Button(onClick = { vm.install(ag) }, enabled = vm.status[ag.game.id] !is InstallStatus.Working, modifier = Modifier.fillMaxWidth()) { Text(label) }
            if (!ag.scannedClean && plan?.build?.scanned?.flagged != true) Text(stringResource(R.string.not_scanned_note), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
            StatusLine(vm.status[ag.game.id])
        } else {
            // Pressable, and says why, rather than greyed out and silent.
            OutlinedButton(onClick = { explainSoon = true }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.coming_soon)) }
            if (explainSoon) Text(stringResource(R.string.coming_soon_why), modifier = Modifier.padding(top = 8.dp))
        }
        if (ag.game.repoUrl.startsWith("https://")) {
            OutlinedButton(onClick = { context.openUrl(ag.game.repoUrl) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(stringResource(R.string.view_project)) }
        }

        if (!plan?.gameFiles.isNullOrEmpty()) {
            Heading(stringResource(R.string.game_files_heading))
            plan.gameFiles.forEachIndexed { i, f ->
                Text(f.label, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                if (f.description.isNotBlank()) Text(f.description, style = MaterialTheme.typography.bodyMedium)
                if (f.acceptedFormats.isNotEmpty()) Text(stringResource(R.string.game_file_formats, f.acceptedFormats.joinToString(", ")), style = MaterialTheme.typography.bodySmall)
                val chooseDesc = stringResource(R.string.choose_file_for, f.label)
                OutlinedButton(
                    onClick = {
                        if (!f.pushTo.isNullOrBlank() && !vm.installer.canWriteStorage()) {
                            storageAskFor = i
                            if (Build.VERSION.SDK_INT < 30) legacyStorage.launch(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        } else { pickFor = i; picker.launch(arrayOf("*/*")) }
                    },
                    enabled = vm.fileStatus["${ag.game.id}#$i"] !is InstallStatus.Working,
                    modifier = Modifier.padding(top = 4.dp).semantics { contentDescription = chooseDesc },
                ) { Text(stringResource(R.string.choose_file)) }
                StatusLine(vm.fileStatus["${ag.game.id}#$i"])
            }
        }
        if (!plan?.firstRun.isNullOrEmpty()) {
            Heading(stringResource(R.string.first_run_heading))
            plan.firstRun.forEachIndexed { i, step -> Text("${i + 1}. $step", modifier = Modifier.padding(vertical = 2.dp)) }
        }
        if (!plan?.notes.isNullOrEmpty()) {
            Heading(stringResource(R.string.notes_heading))
            plan.notes.forEach { Text("• $it", modifier = Modifier.padding(vertical = 2.dp)) }
        }
    }
}

@Composable
private fun Installed(vm: AppViewModel) {
    val context = LocalContext.current
    if (vm.installed.isEmpty()) {
        Text(stringResource(R.string.installed_empty), modifier = Modifier.padding(16.dp))
        return
    }
    val noLauncher = stringResource(R.string.no_launcher)
    LazyColumn {
        items(vm.installed, key = { it.id }) { g ->
            val current = vm.games.firstOrNull { it.game.id == g.id }
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text(g.title, fontWeight = FontWeight.SemiBold)
                g.tag?.let { Text(stringResource(R.string.installed_version, it), style = MaterialTheme.typography.bodySmall) }
                val newer = current?.takeIf { it.installable && it.installTag != g.tag }
                newer?.installTag?.let { Text(stringResource(R.string.update_available, it), style = MaterialTheme.typography.bodySmall) }
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val launchDesc = stringResource(R.string.launch_game, g.title)
                    Button(onClick = {
                        val intent = context.packageManager.getLaunchIntentForPackage(g.packageId)
                        if (intent != null) context.startActivity(intent) else Toast.makeText(context, noLauncher, Toast.LENGTH_LONG).show()
                    }, modifier = Modifier.semantics { contentDescription = launchDesc }) { Text(stringResource(R.string.launch)) }
                    if (newer != null) {
                        val updateDesc = stringResource(R.string.update_game, g.title)
                        OutlinedButton(onClick = { vm.selected = newer; vm.install(newer) }, modifier = Modifier.semantics { contentDescription = updateDesc }) { Text(stringResource(R.string.update)) }
                    }
                    val removeDesc = stringResource(R.string.remove_game, g.title)
                    OutlinedButton(onClick = {
                        context.startActivity(Intent(Intent.ACTION_DELETE, Uri.parse("package:${g.packageId}")))
                    }, modifier = Modifier.semantics { contentDescription = removeDesc }) { Text(stringResource(R.string.remove)) }
                }
            }
            HorizontalDivider()
        }
    }
}

@Composable
private fun About() {
    val context = LocalContext.current
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text(stringResource(R.string.tab_about), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.about_body), modifier = Modifier.padding(vertical = 12.dp))
        Button(onClick = { context.openUrl("https://tanookistudios.com/SupportMe") }) { Text(stringResource(R.string.support_button)) }
        Text(stringResource(R.string.support_note), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
    }
}
