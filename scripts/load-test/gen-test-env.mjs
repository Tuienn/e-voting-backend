// Generate .env.test files from .env.development for every service:
//   - rename the DB <name>Db -> <name>Db_test  (isolated, safe to drop after testing)
//   - raise THROTTLE_LIMIT so rate limiting does not block the load test
// The original .env.development files are left untouched.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// [source dev env, output test env]
const files = [
    ['apps/identity/.env.development', 'apps/identity/.env.test'],
    ['apps/coordinator/.env.development', 'apps/coordinator/.env.test'],
    ['apps/reveal-vote/.env.development', 'apps/reveal-vote/.env.test'],
    ['apps/bff/.env.development', 'apps/bff/.env.test'],
    ['apps/signing-node/.node1.env.development', 'apps/signing-node/.node1.env.test'],
    ['apps/signing-node/.node2.env.development', 'apps/signing-node/.node2.env.test'],
    ['apps/signing-node/.node3.env.development', 'apps/signing-node/.node3.env.test']
]

function transform(text) {
    return (
        text
            // identityDb?  ->  identityDb_test?   (only inside the mongodb connection string)
            .replace(/\/([A-Za-z0-9]+Db)(\?)/g, '/$1_test$2')
            // raise the rate-limit ceiling (if the service has one)
            .replace(/^THROTTLE_LIMIT=.*/m, 'THROTTLE_LIMIT=100000000')
    )
}

for (const [src, dst] of files) {
    const srcPath = resolve(root, src)
    if (!existsSync(srcPath)) {
        console.warn(`! skipped (missing): ${src}`)
        continue
    }
    const out = transform(readFileSync(srcPath, 'utf8'))
    writeFileSync(resolve(root, dst), out)
    const db = out.match(/\/([A-Za-z0-9]+Db_test)\?/)?.[1] ?? '(no DB)'
    console.log(`ok ${dst}  [${db}]`)
}
console.log('\nDone. Start services with the test env: scripts/load-test/serve-test.sh')
