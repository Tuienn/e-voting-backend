#!/usr/bin/env node
// block-stats.mjs
// -----------------------------------------------------------------------------
// Gọi API explorer (GET .../networks/fabric/<channel>/blocks) lấy toàn bộ block,
// phân loại từng transaction thành 3 loại (vote / root-merkle / reveal), gán block
// vào từng phase load-test theo electionId, rồi xuất:
//   - Tỉ lệ % số lượng tx trong 1 block (phân bố 1,2,3,... tx/block)
//   - Tỉ lệ % theo loại transaction
//   - Thời gian tạo block (block interval = createdAt[n] - createdAt[n-1])
// Kết quả ghi ra scripts/load-test/results/block-stats.md (+ .json).
//
// Chạy:  node scripts/load-test/block-stats.mjs
// Tuỳ chọn qua env:
//   EXPLORER_BASE   (default http://192.168.122.133:8100)
//   FABRIC_CHANNEL  (default 1)
//   EXPLORER_COOKIE (default = cookie mẫu bên dưới — đổi nếu session hết hạn)
// -----------------------------------------------------------------------------

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')

const BASE = process.env.EXPLORER_BASE || 'http://192.168.122.133:8100'
const CHANNEL = process.env.FABRIC_CHANNEL || '1'
const COOKIE =
    process.env.EXPLORER_COOKIE ||
    'session_id=8Ql0KwZldAuLIBOAwWu-ht5ABITiGSjh7ytQkGg5_XA=.ERVLJep8ZE6SLg6U7egzCHZyyYUEz-Miv1jCs8m0mPo='

const PAGE = 300 // limit tối đa API chấp nhận trong 1 lần gọi
const MIN_BLOCK = 0
const NUL = String.fromCharCode(0) // null byte phan tach trong writeKey

// electionId của từng phase (lấy từ results/*.log). Block nào chứa tx có electionId
// khớp ở đây sẽ được gán vào phase tương ứng.
const PHASES = [
    {
        id: 'P1',
        label: 'PHASE 1 — 50 voters (normal)',
        voters: 50,
        candidates: 5,
        negative: false,
        electionId: '6a1ea16ef2120f75cb87b0ff',
        hint: 'block ~55–133'
    },
    {
        id: 'P2',
        label: 'PHASE 2 — 100 voters (normal)',
        voters: 100,
        candidates: 10,
        negative: false,
        electionId: '6a1ea959f2120f75cb87b132',
        hint: 'block ~133–252'
    },
    {
        id: 'P3',
        label: 'PHASE 3 — 500 voters (normal)',
        voters: 500,
        candidates: 15,
        negative: false,
        electionId: '6a1eba5cc9f7326f9739878f',
        hint: 'block ~252–454'
    },
    {
        id: 'P4',
        label: 'PHASE 4 — 100 voters (integrity / negative)',
        voters: 100,
        candidates: 10,
        negative: true,
        electionId: '6a1eed6e48b7b67e4a5357ad',
        hint: 'block ~455–576'
    },
    {
        id: 'P5',
        label: 'PHASE 5 — 500 voters (integrity / negative)',
        voters: 500,
        candidates: 15,
        negative: true,
        electionId: '6a1ef06871330482fd776ef7',
        hint: 'block ~577–665'
    }
]

const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${BASE}/networks/${CHANNEL}/blocks`,
    Cookie: COOKIE
}

// ----------------------------------------------------------------------------- fetch
async function getBlocks({ limit, offset, reverse }) {
    const url = `${BASE}/api/v1/networks/fabric/${CHANNEL}/blocks?limit=${limit}&offset=${offset}&reverse=${reverse}`
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
    const text = await res.text()
    let json
    try {
        json = JSON.parse(text)
    } catch {
        throw new Error(
            `Response không phải JSON (session hết hạn? đặt EXPLORER_COOKIE). Đầu response:\n${text.slice(0, 200)}`
        )
    }
    if (!json.blocks) throw new Error(`Thiếu field 'blocks' trong response: ${text.slice(0, 200)}`)
    return json.blocks
}

async function fetchAllBlocks() {
    // 1) tìm block mới nhất
    const latestArr = await getBlocks({ limit: 1, offset: 0, reverse: true })
    const latest = latestArr[0].number
    process.stderr.write(`Latest block = ${latest}. Đang tải block ${MIN_BLOCK}..${latest}...\n`)

    // 2) phân trang reverse=false, offset == số block đầu trang
    const byNumber = new Map()
    for (let off = MIN_BLOCK; off <= latest; off += PAGE) {
        const blocks = await getBlocks({ limit: PAGE, offset: off, reverse: false })
        for (const b of blocks) byNumber.set(b.number, b)
        process.stderr.write(`  tải offset=${off} -> ${blocks.length} block (tổng ${byNumber.size})\n`)
    }
    return [...byNumber.values()].sort((a, b) => a.number - b.number)
}

// ----------------------------------------------------------------------------- phân loại
function decodeResponse(tx) {
    try {
        const raw = Buffer.from(tx.response || '', 'base64').toString('utf8')
        if (raw && raw.trim().startsWith('{')) return JSON.parse(raw)
    } catch {
        // ignore
    }
    return null
}

// writeKey dạng \0<kind>\0<electionId>\0... -> tách theo NUL
function splitNull(key) {
    return String(key || '').split(NUL)
}

// trả về { type: 'vote'|'root'|'reveal'|'other', electionId }
function classifyTx(tx) {
    const resp = decodeResponse(tx)
    const electionId = resp?.electionId || null
    if (resp) {
        if (resp.docType === 'vote') return { type: 'vote', electionId }
        if (resp.docType === 'root' || resp.merkleRoot) return { type: 'root', electionId }
        if (resp.revealKey || resp.revealPayloadHash) return { type: 'reveal', electionId }
    }
    // fallback: dựa vào writeKey
    for (const w of tx.writes || []) {
        const parts = splitNull(w.key) // ['', kind, electionId, ...]
        const kind = parts[1]
        if (kind === 'vote') return { type: 'vote', electionId: parts[2] || electionId }
        if (kind === 'root') return { type: 'root', electionId: parts[2] || electionId }
        if (kind === 'usedReveal') return { type: 'reveal', electionId: parts[2] || electionId }
    }
    return { type: 'other', electionId }
}

function classifyBlock(b) {
    const counts = { vote: 0, root: 0, reveal: 0, other: 0 }
    const electionIds = new Set()
    for (const tx of b.transactions || []) {
        const { type, electionId } = classifyTx(tx)
        counts[type]++
        if (electionId) electionIds.add(electionId)
    }
    // loại block = loại chiếm đa số tx
    let blockType = 'other'
    let best = -1
    for (const t of ['vote', 'root', 'reveal', 'other']) {
        if (counts[t] > best) {
            best = counts[t]
            blockType = t
        }
    }
    return {
        number: b.number,
        createdAt: b.createdAt ? Date.parse(b.createdAt) : null,
        ntx: (b.transactions || []).length,
        counts,
        blockType,
        electionIds: [...electionIds]
    }
}

// ----------------------------------------------------------------------------- thống kê số học
const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? '-' : Number(n).toFixed(d))
const pct = (x, total) => (total ? (100 * x) / total : 0)

function stats(arr) {
    if (!arr.length) return { n: 0, min: null, max: null, mean: null, median: null, p95: null }
    const s = [...arr].sort((a, b) => a - b)
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]
    const sum = s.reduce((a, b) => a + b, 0)
    return {
        n: s.length,
        min: s[0],
        max: s[s.length - 1],
        mean: sum / s.length,
        median: q(0.5),
        p95: q(0.95)
    }
}

// deltas (giây) giữa các block liên tiếp trong cùng một danh sách (đã sort theo number)
function intervalSeconds(blocks) {
    const d = []
    for (let i = 1; i < blocks.length; i++) {
        const a = blocks[i - 1].createdAt
        const b = blocks[i].createdAt
        if (a != null && b != null) d.push((b - a) / 1000)
    }
    return d
}

// ----------------------------------------------------------------------------- build per-phase
function analyzePhase(phase, allBlocks) {
    const blocks = allBlocks.filter((b) => b.electionIds.includes(phase.electionId)).sort((a, b) => a.number - b.number)

    const txCounts = { vote: 0, root: 0, reveal: 0, other: 0 }
    for (const b of blocks) for (const t of Object.keys(txCounts)) txCounts[t] += b.counts[t]
    const totalTx = Object.values(txCounts).reduce((a, b) => a + b, 0)

    const blockTypeCounts = { vote: 0, root: 0, reveal: 0, other: 0 }
    for (const b of blocks) blockTypeCounts[b.blockType]++

    // phân bố số tx / block (tổng & tách theo segment vote / reveal)
    const distOverall = {}
    const distVote = {}
    const distReveal = {}
    for (const b of blocks) {
        distOverall[b.ntx] = (distOverall[b.ntx] || 0) + 1
        if (b.blockType === 'vote') distVote[b.ntx] = (distVote[b.ntx] || 0) + 1
        if (b.blockType === 'reveal') distReveal[b.ntx] = (distReveal[b.ntx] || 0) + 1
    }

    // thời gian tạo block (block interval)
    const voteBlocks = blocks.filter((b) => b.blockType === 'vote')
    const revealBlocks = blocks.filter((b) => b.blockType === 'reveal')
    const intervalAll = intervalSeconds(blocks)
    const intervalVote = intervalSeconds(voteBlocks)
    const intervalReveal = intervalSeconds(revealBlocks)

    const span =
        blocks.length >= 2 && blocks[0].createdAt != null && blocks[blocks.length - 1].createdAt != null
            ? (blocks[blocks.length - 1].createdAt - blocks[0].createdAt) / 1000
            : null

    return {
        phase,
        nBlocks: blocks.length,
        blockRange: blocks.length ? [blocks[0].number, blocks[blocks.length - 1].number] : null,
        totalTx,
        txCounts,
        blockTypeCounts,
        avgTxPerBlock: blocks.length ? totalTx / blocks.length : 0,
        distOverall,
        distVote,
        distReveal,
        interval: { all: stats(intervalAll), vote: stats(intervalVote), reveal: stats(intervalReveal) },
        span,
        throughputTxPerSec: span ? totalTx / span : null
    }
}

// ----------------------------------------------------------------------------- render
function distTable(dist) {
    const total = Object.values(dist).reduce((a, b) => a + b, 0)
    const keys = Object.keys(dist)
        .map(Number)
        .sort((a, b) => a - b)
    let out = '| tx/block | số block | % |\n|---:|---:|---:|\n'
    for (const k of keys) out += `| ${k} | ${dist[k]} | ${fmt(pct(dist[k], total))}% |\n`
    out += `| **tổng** | **${total}** | **100%** |\n`
    return out
}

function intervalRow(name, s) {
    return `| ${name} | ${s.n} | ${fmt(s.min, 2)} | ${fmt(s.median, 2)} | ${fmt(s.mean, 2)} | ${fmt(s.p95, 2)} | ${fmt(s.max, 2)} |`
}

function renderPhase(a) {
    const p = a.phase
    const t = a.txCounts
    const bt = a.blockTypeCounts
    let md = `\n## ${p.label}\n\n`
    md += `- electionId: \`${p.electionId}\`\n`
    md +=
        `- Block thực tế phát hiện: **${a.nBlocks} block**` +
        (a.blockRange ? ` (block ${a.blockRange[0]}–${a.blockRange[1]}, dự kiến ${p.hint})` : '') +
        `\n`
    md += `- Tổng transaction: **${a.totalTx}** | trung bình **${fmt(a.avgTxPerBlock, 2)} tx/block**\n`
    md += `- Khoảng thời gian phase (block đầu→cuối): **${fmt(a.span, 1)}s** | throughput ghi sổ ≈ **${fmt(a.throughputTxPerSec, 2)} tx/s**\n\n`

    md += `**Tỉ lệ theo loại transaction**\n\n`
    md += `| loại tx | số tx | % |\n|---|---:|---:|\n`
    md += `| vote | ${t.vote} | ${fmt(pct(t.vote, a.totalTx))}% |\n`
    md += `| root (merkle khi close) | ${t.root} | ${fmt(pct(t.root, a.totalTx))}% |\n`
    md += `| reveal | ${t.reveal} | ${fmt(pct(t.reveal, a.totalTx))}% |\n`
    if (t.other) md += `| other | ${t.other} | ${fmt(pct(t.other, a.totalTx))}% |\n`
    md += `| **tổng** | **${a.totalTx}** | **100%** |\n\n`

    md += `**Tỉ lệ theo loại block** (block phân theo loại tx chiếm đa số)\n\n`
    md += `| loại block | số block | % |\n|---|---:|---:|\n`
    md += `| vote-block | ${bt.vote} | ${fmt(pct(bt.vote, a.nBlocks))}% |\n`
    md += `| root-block | ${bt.root} | ${fmt(pct(bt.root, a.nBlocks))}% |\n`
    md += `| reveal-block | ${bt.reveal} | ${fmt(pct(bt.reveal, a.nBlocks))}% |\n`
    if (bt.other) md += `| other-block | ${bt.other} | ${fmt(pct(bt.other, a.nBlocks))}% |\n`
    md += `| **tổng** | **${a.nBlocks}** | **100%** |\n\n`

    md += `**Phân bố số tx/block — TẤT CẢ block**\n\n${distTable(a.distOverall)}\n`
    if (Object.keys(a.distVote).length) md += `**Phân bố số tx/block — chỉ vote-block**\n\n${distTable(a.distVote)}\n`
    if (Object.keys(a.distReveal).length)
        md += `**Phân bố số tx/block — chỉ reveal-block**\n\n${distTable(a.distReveal)}\n`

    md += `**Thời gian tạo block** (block interval = createdAt[n] − createdAt[n−1], đơn vị giây)\n\n`
    md += `| segment | n | min | median | mean | p95 | max |\n|---|---:|---:|---:|---:|---:|---:|\n`
    md += intervalRow('tất cả block trong phase', a.interval.all) + '\n'
    md += intervalRow('chỉ giữa các vote-block', a.interval.vote) + '\n'
    md += intervalRow('chỉ giữa các reveal-block', a.interval.reveal) + '\n'
    md += `\n> Lưu ý: interval bao gồm cả thời gian chờ rỗi giữa các giao dịch (load-test dùng delay ngẫu nhiên), nên **median/min** phản ánh nhịp cắt block thực sự của orderer (≈ BatchTimeout), còn **max** là khoảng trống chờ (vd. close→reveal).\n`
    return md
}

function renderSummary(analyses) {
    let md = `## Bảng tổng hợp các phase\n\n`
    md += `| Phase | Voters | Mode | #block | #tx | vote% | root% | reveal% | avg tx/block | interval median (s) | interval p95 (s) |\n`
    md += `|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|\n`
    for (const a of analyses) {
        const t = a.txCounts
        md += `| ${a.phase.id} | ${a.phase.voters} | ${a.phase.negative ? 'negative' : 'normal'} | ${a.nBlocks} | ${a.totalTx} | ${fmt(pct(t.vote, a.totalTx))}% | ${fmt(pct(t.root, a.totalTx))}% | ${fmt(pct(t.reveal, a.totalTx))}% | ${fmt(a.avgTxPerBlock, 2)} | ${fmt(a.interval.all.median, 2)} | ${fmt(a.interval.all.p95, 2)} |\n`
    }
    return md + '\n'
}

// ----------------------------------------------------------------------------- main
async function main() {
    const raw = await fetchAllBlocks()
    const blocks = raw.map(classifyBlock)

    const analyses = PHASES.map((p) => analyzePhase(p, blocks))

    // báo cáo block không thuộc phase nào (election khác / genesis / config)
    const known = new Set(PHASES.map((p) => p.electionId))
    const unmatched = blocks.filter((b) => !b.electionIds.some((e) => known.has(e)))

    const now = new Date().toISOString()
    let md = `# Thống kê block Hyperledger Fabric — load-test e-voting\n\n`
    md += `- Sinh lúc: ${now}\n`
    md += `- Nguồn: \`${BASE}/api/v1/networks/fabric/${CHANNEL}/blocks\`\n`
    md += `- Tổng số block tải về: **${blocks.length}** (block ${blocks[0]?.number}–${blocks[blocks.length - 1]?.number})\n`
    md += `- Block không khớp phase nào (election khác/genesis/config): ${unmatched.length}\n\n`
    md += renderSummary(analyses)
    for (const a of analyses) md += renderPhase(a)

    const mdPath = join(RESULTS_DIR, 'block-stats.md')
    const jsonPath = join(RESULTS_DIR, 'block-stats.json')
    writeFileSync(mdPath, md, 'utf8')
    writeFileSync(
        jsonPath,
        JSON.stringify(
            { generatedAt: now, source: `${BASE}`, channel: CHANNEL, totalBlocks: blocks.length, phases: analyses },
            null,
            2
        ),
        'utf8'
    )

    // tóm tắt ra console
    process.stderr.write('\n' + renderSummary(analyses).replace(/\|/g, ' ') + '\n')
    process.stderr.write(`✓ Đã ghi:\n  ${mdPath}\n  ${jsonPath}\n`)
}

main().catch((e) => {
    process.stderr.write(`\n✗ Lỗi: ${e.message}\n`)
    process.exit(1)
})
