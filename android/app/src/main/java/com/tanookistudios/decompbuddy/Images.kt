package com.tanookistudios.decompbuddy

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File

// shortcut: a tiny box-art loader (memory + disk cache, no request de-duplication); swap for Coil if art gets heavier.
private val memory = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
}
private val gate = Semaphore(4)

private suspend fun loadBitmap(cacheDir: File, url: String, sizePx: Int): Bitmap? = memory.get(url) ?: withContext(Dispatchers.IO) {
    gate.withPermit {
        runCatching {
            val file = File(cacheDir, "art/${url.hashCode().toUInt()}")
            if (!file.exists()) {
                file.parentFile?.mkdirs()
                val c = open(url)
                try {
                    if (c.responseCode != 200) return@runCatching null
                    val tmp = File(file.path + ".part")
                    c.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
                    tmp.renameTo(file)
                } finally { c.disconnect() }
            }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.path, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= sizePx && bounds.outHeight / (sample * 2) >= sizePx) sample *= 2
            BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
        }.getOrNull()?.also { memory.put(url, it) }
    }
}

/** Box art, falling back to the project icon, then to a plain tile. Decorative: the title sits right beside it. */
@Composable
fun GameArt(game: Game, modifier: Modifier, sizePx: Int = 256) {
    val context = LocalContext.current
    val urls = listOfNotNull(game.boxartUrl, game.iconUrl).filter { it.startsWith("https://") }
    var bitmap by remember(game.id) { mutableStateOf(urls.firstNotNullOfOrNull { memory.get(it) }) }
    LaunchedEffect(game.id) {
        if (bitmap == null) bitmap = urls.firstNotNullOfOrNull { loadBitmap(context.cacheDir, it, sizePx) }
    }
    val b = bitmap
    if (b != null) Image(b.asImageBitmap(), contentDescription = null, modifier = modifier, contentScale = ContentScale.Fit)
    else Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant))
}
