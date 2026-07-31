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
  const gradle = read('src-tauri/gen/android/app/build.gradle.kts')
  const activity = read('src-tauri/gen/android/app/src/main/java/com/newapi/desktop/MainActivity.kt')
  const adaptiveIcon = read('src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml')
  const buildScript = read('scripts/build-android.cmd')

  assert.match(gradle, /manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*"true"/)
  assert.match(activity, /WindowInsetsCompat\.Type\.systemBars\(\)/)
  assert.match(activity, /WindowInsetsCompat\.Type\.displayCutout\(\)/)
  assert.match(activity, /view\.setPadding\(/)
  assert.match(adaptiveIcon, /@drawable\/ic_launcher_foreground_inset/)
  assert.match(buildScript, /apksigner\.bat/)
  assert.match(buildScript, /New-API-Desktop_1\.1\.3_arm64-release\.apk/)
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
