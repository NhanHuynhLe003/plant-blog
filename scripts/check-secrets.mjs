// Chặn khoá API thật lọt vào git: quét mọi tệp git đang theo dõi (và tệp sắp commit)
// theo mẫu khoá của các nhà cung cấp. Chạy tự động trước `npm test` và `npm run build`.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PATTERNS = [
  ['Anthropic', /sk-ant-[A-Za-z0-9_-]{24,}/],
  ['OpenAI', /sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{24,}/],
  ['OpenAI / DeepSeek', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['Google', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub', /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{30,}/],
  ['Khoá riêng', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean)
const files = [...new Set([...git('ls-files'), ...git('diff', '--cached', '--name-only', '--diff-filter=ACM')])].filter((f) => !/^(package-lock\.json|dist\/|node_modules\/)/.test(f) && !/\.(png|jpe?g|webp|ico|zip|pdf)$/i.test(f))

const hits = []
for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of PATTERNS) if (re.test(line)) hits.push(`${file}:${i + 1}  trông giống khoá ${name}`)
  })
}

if (hits.length) {
  console.error(`\n✖ Phát hiện ${hits.length} chuỗi giống khoá API thật — KHÔNG commit:\n  ${hits.join('\n  ')}\n\nXoá khoá khỏi tệp (và thu hồi khoá nếu đã lỡ đẩy lên git).\n`)
  process.exit(1)
}
console.log(`✓ Không có khoá API trong ${files.length} tệp được git theo dõi`)
