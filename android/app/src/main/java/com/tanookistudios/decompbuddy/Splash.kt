package com.tanookistudios.decompbuddy

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** The app, with the logo (always on the logo's own near-black, in light mode too) shown on top for about a second and a half at startup, then faded away. */
@Composable
fun WithSplash(content: @Composable () -> Unit) {
    var showing by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) { delay(1400); showing = false }
    Box(Modifier.fillMaxSize()) {
        content()
        AnimatedVisibility(visible = showing, enter = androidx.compose.animation.EnterTransition.None, exit = fadeOut()) {
            Column(
                Modifier.fillMaxSize().background(Color(0xFF0E0E10)),
                verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Image(painterResource(R.drawable.mascot), contentDescription = null, modifier = Modifier.size(200.dp))
                Text(
                    buildAnnotatedString { append("Decomp "); withStyle(SpanStyle(color = Color(0xFFFF6B9D))) { append("Buddy") } },
                    fontSize = 36.sp, fontWeight = FontWeight.ExtraBold, color = Color.White,
                )
            }
        }
    }
}
