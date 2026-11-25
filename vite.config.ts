/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Sinh service worker sau khi build: chèn danh sách file cần precache để
 * ứng dụng chạy offline hoàn toàn (kể cả các chunk tải lười như pdf.js).
 */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'inkrecall-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const files: string[] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name)
          if (statSync(full).isDirectory()) walk(full)
          else files.push(relative(outDir, full).split('\\').join('/'))
        }
      }
      walk(outDir)
      const assets = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort()
      const hash = createHash('sha256')
      for (const f of assets) hash.update(f).update(readFileSync(join(outDir, f)))
      const template = readFileSync('src/sw.template.js', 'utf8')
      const out = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('"__PRECACHE__"', JSON.stringify(['./', ...assets.filter((f) => f !== 'index.html')]))
      writeFileSync(join(outDir, 'sw.js'), out)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
