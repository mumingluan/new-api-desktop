(function () {
  const supported = new Set(['en', 'zh', 'fr', 'ja', 'ru', 'vi'])

  function normalizeLanguage(config) {
    const selected = String(config?.desktopLanguage || 'auto')
    const locale = selected === 'auto'
      ? String(config?.appLocale || navigator.language || 'en')
      : selected
    const normalized = locale.replaceAll('_', '-').toLowerCase()
    if (normalized.startsWith('zh')) return 'zh'
    const short = normalized.split('-')[0]
    return supported.has(short) ? short : 'en'
  }

  function localeFor(language) {
    return {
      en: 'en-US', zh: 'zh-CN', fr: 'fr-FR', ja: 'ja-JP', ru: 'ru-RU', vi: 'vi-VN',
    }[language] || 'en-US'
  }

  async function createDesktopI18n(messages = {}) {
    const config = await window.newApiDesktop.getConfig().catch(() => null)
    const language = normalizeLanguage(config)
    const translate = (key, values = {}) => {
      const template = messages[language]?.[key] ?? messages.en?.[key] ?? key
      return String(template).replace(/\{\{(\w+)\}\}/g, (_match, name) => String(values[name] ?? ''))
    }
    const apply = (root = document) => {
      root.querySelectorAll('[data-i18n]').forEach((node) => {
        node.textContent = translate(node.dataset.i18n)
      })
      root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
        node.placeholder = translate(node.dataset.i18nPlaceholder)
      })
      root.querySelectorAll('[data-i18n-title]').forEach((node) => {
        node.title = translate(node.dataset.i18nTitle)
      })
      root.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
        node.setAttribute('aria-label', translate(node.dataset.i18nAriaLabel))
      })
      document.documentElement.lang = localeFor(language)
    }
    window.newApiDesktop.onConfigChanged?.((nextConfig) => {
      if (normalizeLanguage(nextConfig) !== language) location.reload()
    })
    return { language, locale: localeFor(language), t: translate, apply }
  }

  window.createDesktopI18n = createDesktopI18n
})()
