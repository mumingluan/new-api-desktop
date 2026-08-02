const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('Tauri tool pages load shared i18n and mark translatable content', () => {
  for (const page of ['src-ui/key-query/index.html', 'src-ui/key-batch/index.html']) {
    const html = read(page)
    assert.match(html, /<script src="\.\.\/i18n\.js"><\/script>/)
    assert.ok((html.match(/data-i18n=/g) || []).length >= 20)
  }
})

test('Android release permits the loopback proxy and avoids system cutouts', () => {
  const configureScript = read('scripts/configure-android.js')
  const buildScript = read('scripts/build-android.cmd')

  assert.match(configureScript, /android:usesCleartextTraffic=\"true\"/)
  assert.doesNotMatch(configureScript, /manifestPlaceholders\[\"usesCleartextTraffic\"\]/)
  assert.match(configureScript, /isMinifyEnabled = true/)
  assert.match(configureScript, /isShrinkResources = true/)
  assert.match(configureScript, /WindowInsetsCompat\.Type\.systemBars\(\)/)
  assert.match(configureScript, /WindowInsetsCompat\.Type\.displayCutout\(\)/)
  assert.match(configureScript, /view\.setPadding\(/)
  assert.match(configureScript, /@drawable\/ic_launcher_foreground_inset/)
  assert.match(configureScript, /android:insetLeft=\"8dp\"/)
  assert.match(configureScript, /fs\.cpSync\(bundledAndroidIcons, resourceRoot/)
  assert.match(configureScript, /cannot reset branding/)
  assert.match(buildScript, /apksigner\.bat/)
  assert.match(buildScript, /if not exist \"src-tauri\\gen\\android\\gradle\.properties\"/)
  assert.match(buildScript, /npx tauri android init/)
  assert.match(buildScript, /New-API-Desktop_1\.1\.8_arm64-release\.apk/)

  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const icon of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      assert.ok(fs.existsSync(path.join(root, 'src-tauri', 'icons', 'android', `mipmap-${density}`, icon)))
    }
  }

  const generatedRoot = path.join(root, 'src-tauri', 'gen', 'android', 'app')
  if (fs.existsSync(generatedRoot)) {
    const activity = read('src-tauri/gen/android/app/src/main/java/com/newapi/desktop/MainActivity.kt')
    const adaptiveIcon = read('src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml')

    const manifest = read('src-tauri/gen/android/app/src/main/AndroidManifest.xml')
    assert.match(manifest, /android:usesCleartextTraffic="true"/)
    assert.match(activity, /WindowInsetsCompat\.Type\.systemBars\(\)/)
    assert.match(activity, /WindowInsetsCompat\.Type\.displayCutout\(\)/)
    assert.match(adaptiveIcon, /@drawable\/ic_launcher_foreground_inset/)
  }
})

test('Android proxy pill controls are centered, draggable, and remember their position', () => {
  const proxy = read('src-tauri/src/proxy.rs')

  assert.match(proxy, /width:'82px',height:'38px'/)
  assert.match(proxy, /backButton = makeControlButton/)
  assert.match(proxy, /refreshButton = makeControlButton/)
  assert.match(proxy, /refreshButton\.addEventListener\('click', \(\) => reloadCurrentFrontend\(\)\)/)
  assert.match(proxy, /display:'grid',placeItems:'center'/)
  assert.match(proxy, /addEventListener\('pointermove'/)
  assert.match(proxy, /mobileControls\.setPointerCapture\(event\.pointerId\)/)
  assert.match(proxy, /__desktopBackButtonPosition/)
  assert.match(proxy, /Math\.min\(x, innerWidth - width - edge\)/)
})

test('key query includes and highlights failed usage logs', () => {
  const commands = read('src-tauri/src/commands.rs')
  const models = read('src-tauri/src/models.rs')
  const renderer = read('src-ui/key-query/renderer.js')
  const html = read('src-ui/key-query/index.html')

  assert.match(commands, /matches!\(value_i64\(row\.get\("type"\)\), 0 \| 2 \| 5\)/)
  assert.match(commands, /\.get\("reason"\)/)
  assert.match(models, /pub log_type: i64/)
  assert.match(models, /pub error_reason: String/)
  assert.match(renderer, /item\.logType === 5/)
  assert.match(renderer, /item\.errorReason/)
  assert.match(renderer, /error-row/)
  assert.match(html, /data-i18n="Status"/)
  assert.match(html, /colspan="12"/)
})

test('mobile tool pages use a draggable back and refresh pill', () => {
  const bridge = read('src-ui/tauri-bridge.js')

  assert.match(bridge, /tauri-mobile-tool-controls/)
  assert.match(bridge, /width: '82px', height: '38px'/)
  assert.match(bridge, /d="M15 5 8 12l7 7"/)
  assert.match(bridge, /d="M19 8a8 8 0 1 0 1 6"/)
  assert.doesNotMatch(bridge, /&#x2039;|&#x21bb;/)
  assert.match(bridge, /border: '1px solid rgba\(127,127,127,\.38\)'/)
  assert.match(bridge, /boxShadow: '0 4px 14px rgba\(0,0,0,\.24\)'/)
  assert.match(bridge, /controls\.addEventListener\('pointermove'/)
  assert.match(bridge, /controls\.setPointerCapture\(event\.pointerId\)/)
  assert.match(bridge, /__desktopToolButtonPosition/)
  assert.match(bridge, /refresh\.addEventListener\('click', \(\) => window\.newApiDesktop\.reloadWindow\(\)\)/)
})

test('settings page offers selective configuration import and export', () => {
  const html = read('src-ui/index.html')
  const bridge = read('src-ui/tauri-bridge.js')
  const commands = read('src-tauri/src/commands.rs')

  for (const section of ['backends', 'keyQueryProfiles', 'databaseProfiles']) {
    assert.match(html, new RegExp(`value="${section}"`))
  }
  assert.match(bridge, /export_configuration/)
  assert.match(bridge, /import_configuration/)
  assert.match(commands, /CONFIG_TRANSFER_FORMAT/)
  assert.match(commands, /Parse and validate every selected section before replacing/)
})

test('frontend refresh keeps storage and reloads SPA routes through bundled assets', () => {
  const proxy = read('src-tauri/src/proxy.rs')

  assert.match(proxy, /__newApiDesktopStorageContext/)
  assert.match(proxy, /sessionStorage\.getItem\(desktopStorageMarker\)/)
  assert.match(proxy, /next\.searchParams\.set\('__desktop_reload'/)
  assert.match(proxy, /SetAreBrowserAcceleratorKeysEnabled\(false\)/)
  assert.match(proxy, /blocked business webview from falling back to internal URL/)
  assert.match(proxy, /window\.navigate\(restore_url\)/)
  assert.match(proxy, /event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\);\s*reloadCurrentFrontend\(\)/s)
  assert.match(proxy, /fetch\('\/__desktop\/devtools'/)
  assert.match(proxy, /should_proxy\(&path\) && !frontend_document/)
  assert.match(proxy, /frontend_asset_path\(&context\.asset_flavor, path, frontend_document\)/)
  assert.match(proxy, /if frontend_document \|\| relative\.is_empty\(\)/)
  assert.match(proxy, /!frontend_document\s*&& asset\.mime_type\.contains\("text\/html"\)/s)
})

test('Tauri tray exposes both key tools in the expected order', () => {
  const tray = read('src-tauri/src/tray.rs')
  const query = tray.indexOf('.text("key-query", labels.key_query)')
  const batch = tray.indexOf('.text("key-batch", labels.key_batch)')

  assert.ok(query >= 0)
  assert.ok(batch > query)
})
