const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const androidRoot = path.join(projectRoot, 'src-tauri', 'gen', 'android')
const propertiesPath = path.join(androidRoot, 'gradle.properties')
const appRoot = path.join(androidRoot, 'app')
const gradlePath = path.join(appRoot, 'build.gradle.kts')
const manifestPath = path.join(appRoot, 'src', 'main', 'AndroidManifest.xml')
const activityPath = path.join(
  appRoot,
  'src',
  'main',
  'java',
  'com',
  'newapi',
  'desktop',
  'MainActivity.kt',
)
const adaptiveIconPath = path.join(
  appRoot,
  'src',
  'main',
  'res',
  'mipmap-anydpi-v26',
  'ic_launcher.xml',
)
const insetIconPath = path.join(
  appRoot,
  'src',
  'main',
  'res',
  'drawable',
  'ic_launcher_foreground_inset.xml',
)
const iconColorsPath = path.join(
  appRoot,
  'src',
  'main',
  'res',
  'values',
  'ic_launcher_colors.xml',
)

if (!fs.existsSync(propertiesPath)) {
  throw new Error('Android project is not initialized. Run `npm run android:init` first.')
}

const readRequired = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing generated Android file: ${path.relative(projectRoot, filePath)}`)
  }
  return fs.readFileSync(filePath, 'utf8')
}

const writeIfChanged = (filePath, content) => {
  const normalized = content.replace(/\r\n/g, '\n')
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') === normalized) {
    return
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, normalized)
}

const insertIntoBlock = (source, blockMarker, line, alreadyPresent) => {
  if (alreadyPresent.test(source)) return source
  const markerIndex = source.indexOf(blockMarker)
  if (markerIndex < 0) throw new Error(`Could not find Android Gradle block: ${blockMarker}`)
  const openingBrace = source.indexOf('{', markerIndex)
  if (openingBrace < 0) throw new Error(`Could not find opening brace for: ${blockMarker}`)
  const lineStart = source.lastIndexOf('\n', openingBrace) + 1
  const indentation = source.slice(lineStart, openingBrace).match(/^\s*/)[0]
  return `${source.slice(0, openingBrace + 1)}\n${indentation}    ${line}${source.slice(openingBrace + 1)}`
}

const required = new Map([
  ['kotlin.incremental', 'false'],
  ['kotlin.compiler.execution.strategy', 'in-process'],
])
const lines = fs.readFileSync(propertiesPath, 'utf8').split(/\r?\n/)
const seen = new Set()
const updated = lines.map((line) => {
  const separator = line.indexOf('=')
  if (separator < 0) return line
  const key = line.slice(0, separator).trim()
  if (!required.has(key)) return line
  seen.add(key)
  return `${key}=${required.get(key)}`
})
for (const [key, value] of required) {
  if (!seen.has(key)) updated.push(`${key}=${value}`)
}
writeIfChanged(propertiesPath, `${updated.filter((line, index, all) => (
  line.length > 0 || index < all.length - 1
)).join('\n')}\n`)

let gradle = readRequired(gradlePath)
gradle = insertIntoBlock(
  gradle,
  'defaultConfig',
  'manifestPlaceholders["usesCleartextTraffic"] = "true"',
  /defaultConfig\s*\{[^}]*manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*"true"/s,
)
gradle = insertIntoBlock(
  gradle,
  'getByName("release")',
  'isMinifyEnabled = true',
  /getByName\("release"\)\s*\{[^}]*isMinifyEnabled\s*=\s*true/s,
)
gradle = insertIntoBlock(
  gradle,
  'getByName("release")',
  'isShrinkResources = true',
  /getByName\("release"\)\s*\{[^}]*isShrinkResources\s*=\s*true/s,
)
writeIfChanged(gradlePath, gradle)

let manifest = readRequired(manifestPath)
if (!/android:usesCleartextTraffic="\$\{usesCleartextTraffic\}"/.test(manifest)) {
  manifest = manifest.replace(
    /(<application\s*)/,
    '$1\n        android:usesCleartextTraffic="${usesCleartextTraffic}"',
  )
}
writeIfChanged(manifestPath, manifest)

writeIfChanged(activityPath, `package com.newapi.desktop

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    val initialPaddingLeft = content.paddingLeft
    val initialPaddingTop = content.paddingTop
    val initialPaddingRight = content.paddingRight
    val initialPaddingBottom = content.paddingBottom
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, windowInsets ->
      val safeInsets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      view.setPadding(
        initialPaddingLeft + safeInsets.left,
        initialPaddingTop + safeInsets.top,
        initialPaddingRight + safeInsets.right,
        initialPaddingBottom + safeInsets.bottom
      )
      windowInsets
    }
    ViewCompat.requestApplyInsets(content)
  }
}
`)

writeIfChanged(adaptiveIconPath, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <foreground android:drawable="@drawable/ic_launcher_foreground_inset"/>
  <background android:drawable="@color/ic_launcher_background"/>
</adaptive-icon>
`)

writeIfChanged(insetIconPath, `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@mipmap/ic_launcher_foreground"
    android:insetLeft="8dp"
    android:insetTop="8dp"
    android:insetRight="8dp"
    android:insetBottom="8dp" />
`)

writeIfChanged(iconColorsPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`)

console.log('Configured Android Gradle, system insets, and adaptive icon assets.')
