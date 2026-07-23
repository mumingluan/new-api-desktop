import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const semiUiDir = path.resolve(
  path.dirname(require.resolve('@douyinfe/semi-ui')),
  '../..',
)
const semiDateFnsDir = path.dirname(require.resolve('date-fns/package.json'))

// VChart 在 classic 依赖树里存在多份物理副本，会各自持有独立的单例，导致两类问题：
//
// 1) 渲染环境单例（vrender-core 的 application.global）：react-vchart 与 vchart 各自
//    嵌套一份 vrender-core（0.17.17）。多份副本 = 多个互不相通的单例，registerBrowserEnv
//    注册到其中一份，而 <VChart> 渲染时读取的是另一份，application.global.envContribution
//    仍为 undefined，首个图表 createCanvas 崩溃。
//
// 2) 主题单例（@visactor/vchart 的 VChart.ThemeManager）：应用通过 react-vchart →
//    classic 自带的 @visactor/vchart 渲染，而 vchart-semi-theme 内部 `import VChart from
//    '@visactor/vchart'` 命中的是它自己嵌套的另一份 vchart。initVChartSemiTheme 把 Semi
//    深色主题 registerTheme/setCurrentTheme 到了后者的 ThemeManager 上，渲染用的却是前者的
//    ThemeManager，于是图表深色模式完全失效（只显示浅色）。
//
// 解决：把 @visactor/vchart 以及它依赖的底层 vrender-*/vutils 全部指向 classic 明确锁定的
// 那一份（vchart 1.8.11 + vrender 0.17.17 完整集合）。这样渲染、环境注册、主题注册
// 都落在同一组单例上。注意不能指向 workspace 顶层 hoist 的 vchart 2.1.2 / vrender 1.1.4：
// 那是给新前端用的，与 classic 的 1.8.11 大版本不兼容。
const vchartDir = path.dirname(require.resolve('@visactor/vchart/package.json'))
const visactorDedupeAlias = {
  '@visactor/vchart': vchartDir,
  ...Object.fromEntries(
    [
      '@visactor/vrender-core',
      '@visactor/vrender-kits',
      '@visactor/vrender-components',
      '@visactor/vutils',
    ].map((pkg) => [pkg, path.resolve(path.dirname(require.resolve(pkg)), '..')]),
  ),
}

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const clientServerUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    ''
  const proxyServerUrl =
    clientServerUrl ||
    'http://localhost:3000'
  const isProd = envMode === 'production'
  const devProxy = Object.fromEntries(
    (['/api', '/mj', '/pg'] as const).map((key) => [
      key,
      { target: proxyServerUrl, changeOrigin: true },
    ]),
  ) as Record<string, { target: string; changeOrigin: boolean }>

  return {
    plugins: [pluginReact()],
    source: {
      entry: {
        index: './src/index.jsx',
      },
      define: {
        'import.meta.env.VITE_REACT_APP_SERVER_URL': JSON.stringify(
          clientServerUrl,
        ),
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@douyinfe/semi-ui/dist/css/semi.css': path.resolve(
          semiUiDir,
          'dist/css/semi.css',
        ),
        'date-fns': semiDateFnsDir,
        // Force a single physical copy of @visactor/vchart and its vrender-*/vutils
        // deps so the render engine, browser-env, and Semi theme all share one set
        // of singletons (see visactorDedupeAlias above).
        ...visactorDedupeAlias,
      },
    },
    html: {
      template: './index.html',
    },
    server: {
      host: '0.0.0.0',
      strictPort: false,
      proxy: devProxy,
    },
    output: {
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
    },
    performance: {
      removeConsole: isProd ? ['log'] : false,
      buildCache: {
        cacheDigest: [process.env.VITE_REACT_APP_VERSION],
      },
    },
    tools: {
      rspack: {
        module: {
          rules: [
            {
              test: /src[\\/].*\.js$/,
              type: 'javascript/auto',
              use: [
                {
                  loader: 'builtin:swc-loader',
                  options: {
                    jsc: {
                      parser: {
                        syntax: 'ecmascript',
                        jsx: true,
                      },
                      transform: {
                        react: {
                          runtime: 'automatic',
                          development: !isProd,
                          refresh: !isProd,
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  }
})
