# Bảo mật & Tối ưu hóa — E-Voting Backend

## Mục lục

1. [Tổng quan mô hình tin cậy](#1-tổng-quan-mô-hình-tin-cậy)
2. [Lớp mật mã — EC-Schnorr Blind Multisignature](#2-lớp-mật-mã--ec-schnorr-blind-multisignature)
3. [Xác thực & phân quyền — JWT hai tầng](#3-xác-thực--phân-quyền--jwt-hai-tầng)
4. [Quản lý session — Redis](#4-quản-lý-session--redis)
5. [Lớp blockchain — Hyperledger Fabric Private Network](#5-lớp-blockchain--hyperledger-fabric-private-network)
6. [Tối ưu throughput blockchain — Chainlaunch Batch](#6-tối-ưu-throughput-blockchain--chainlaunch-batch)
7. [Kiểm chứng toàn vẹn dữ liệu — Merkle Tree](#7-kiểm-chứng-toàn-vẹn-dữ-liệu--merkle-tree)
8. [Bảo mật tầng HTTP — Helmet, CORS, Rate Limiting](#8-bảo-mật-tầng-http--helmet-cors-rate-limiting)
9. [Giao tiếp nội bộ — Microservice TCP + mTLS](#9-giao-tiếp-nội-bộ--microservice-tcp--mtls)
10. [Bảo vệ dữ liệu tĩnh — AES-256-GCM](#10-bảo-vệ-dữ-liệu-tĩnh--aes-256-gcm)
11. [Tối ưu hiệu năng hệ thống](#11-tối-ưu-hiệu-năng-hệ-thống)
12. [Bổ sung đề xuất](#12-bổ-sung-đề-xuất)

---

## 1. Tổng quan mô hình tin cậy

Hệ thống được thiết kế theo nguyên tắc **"không tin cậy bất kỳ tầng đơn lẻ nào"** (defense in depth). Mỗi lớp bảo vệ độc lập — một tầng bị xâm phạm không đủ để phá vỡ tính toàn vẹn bầu cử:

```
┌─────────────────────────────────────────────────────────────┐
│  Tầng 1: HTTP Security (Helmet, CORS, Rate Limit)           │
│  Tầng 2: JWT Authentication + Role Authorization            │
│  Tầng 3: Redis Session (TTL, single-use, voted flag)        │
│  Tầng 4: EC-Schnorr Blind Multisignature (crypto privacy)   │
│  Tầng 5: MongoDB Constraints (unique index, transactions)   │
│  Tầng 6: Merkle Tree (commitment integrity)                 │
│  Tầng 7: Hyperledger Fabric (immutable ledger, CA, MSP)     │
│  Tầng 8: mTLS — mã hoá + xác thực 2 chiều mọi kênh nội bộ  │
└─────────────────────────────────────────────────────────────┘
```

**Tính chất bầu cử được đảm bảo:**

| Tính chất                                    | Cơ chế đảm bảo                                               |
| -------------------------------------------- | ------------------------------------------------------------ |
| **Tính bí mật** (ballot secrecy)             | Blind signature: server không biết voter bầu ai              |
| **Tính duy nhất** (one voter one vote)       | Redis session + MongoDB unique index + Signing Node dedup    |
| **Tính xác thực** (vote authenticity)        | EC-Schnorr verify tại reveal phase                           |
| **Tính không thể chối bỏ** (non-repudiation) | Blockchain ghi bất biến txID                                 |
| **Tính minh bạch** (verifiability)           | Merkle proof cho phép bất kỳ ai verify                       |
| **Tính ẩn danh** (unlinkability)             | `Vote.voterId` và `RevealedVote.candidateIds` không thể JOIN |

---

## 2. Lớp mật mã — EC-Schnorr Blind Multisignature

### 2.1 Lý do chọn EC-Schnorr trên secp256k1

| Tiêu chí              | DSA/RSA 2048-bit | EC-Schnorr secp256k1              |
| --------------------- | ---------------- | --------------------------------- |
| Bảo mật               | ~112-bit         | ~128-bit                          |
| Kích thước scalar     | 256 bytes        | 32 bytes (8× nhỏ hơn)             |
| Kích thước point      | N/A              | 33 bytes compressed               |
| Tốc độ scalar mult    | baseline         | ~5–25× nhanh hơn                  |
| Linearity (aggregate) | Không            | **Có** — s = Σs_i                 |
| Hỗ trợ blind          | Phức tạp         | **Tự nhiên** qua blinding factors |

Tính **linearity** của Schnorr là yếu tố quyết định: `s = Σs_i mod n` cho phép 3 node ký độc lập và coordinator chỉ cần cộng scalar — không cần round-trip thêm, không cần phụ thuộc vào nhau trong quá trình ký.

### 2.2 Giao thức đầy đủ

**Tham số hệ thống (cố định):**

```
Curve:  secp256k1 (@noble/curves)
n:      FFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFE BAAEDCE6 AF48A03B BFD25E8C D0364141
G:      generator point (chuẩn secp256k1)
SCALAR_BYTES = 32,  POINT_BYTES = 33 (compressed)
```

**Pha 0 — Sinh khóa (khi Start Election):**

```
Mỗi Signing Node i:
  d_i  ∈ [1, n-1]      (private key, random, lưu AES-256-GCM encrypted)
  P_i  = d_i · G       (public key point)

Coordinator:
  P_agg = P_1 + P_2 + P_3   (collective public key, lưu vào election record)
```

**Pha 1 — Commitment (khi Start Session):**

```
Mỗi Signing Node i:
  k_i  ∈ [1, n-1]      (nonce, random, lưu trong memory, key = sessionId)
  R_i  = k_i · G       (commitment point)

Coordinator:
  R    = R_1 + R_2 + R_3   (collective commitment, trả về client)
```

**Pha 2 — Blind (trong browser, không gửi lên server):**

```
Client:
  α, β   ∈ [1, n-1]    (blinding factors, bí mật tuyệt đối, không rời browser)
  C'     = R + α·G + β·P_agg
  payload = JSON.stringify(canonical(candidateIds))   // dedupe + sort lexicographic
  M      = SHA256("ev-vote-v2" ‖ 0x00 ‖ electionId ‖ 0x00 ‖ payload)
  h      = SHA256(M ‖ compressed(C')) mod n
  r      = (h − β) mod n       ← gửi lên server
```

> `M` dùng domain separator `ev-vote-v2` để ngăn collision với các hash khác. Mỗi lá phiếu có thể chọn **nhiều** ứng viên; `payload` là chuỗi JSON canonical (dedupe + sort) phải giống hệt giữa client (lúc ký) và backend (lúc verify).

**Pha 3 — Sign Partial (Signing Node):**

```
s_i = (k_i − d_i · r) mod n

Sau khi ký: xóa k_i khỏi memory ngay lập tức (one-time nonce)
```

**Pha 4 — Aggregate (Coordinator):**

```
s = (s_1 + s_2 + s_3) mod n
```

**Pha 5 — Unblind (trong browser):**

```
s' = (s + α) mod n
Chữ ký cuối: (h, s')
```

**Pha 6 — Verify (Schnorr equation):**

```
C_check = s'·G + h·P_agg
h_check = SHA256(M ‖ compressed(C_check)) mod n
valid   = (h === h_check)
```

Lý do verify đúng: thay vào:

```
s'·G + h·P_agg
= (s + α)·G + h·ΣP_i
= (Σs_i + α)·G + h·ΣP_i
= Σ(k_i − d_i·r)·G + α·G + h·ΣP_i
= ΣR_i − r·ΣP_i·G + α·G + h·ΣP_i        [r = h − β]
= R − (h−β)·ΣP_i + α·G + h·ΣP_i
= R + α·G + β·ΣP_i
= C'     ✓
```

### 2.3 Đặc tính bảo mật

**Blindness (Tính mù):** Server chỉ thấy `r` (blinded challenge) và `blindedCommitment = SHA256(C')`. Không thể recover `candidateIds` hay `(α, β)` từ các giá trị này.

**Unlinkability:** Do `r = (h − β) mod n` phụ thuộc vào `β` random, mỗi lần vote tạo ra `r` hoàn toàn khác nhau dù cùng tập candidateIds. Server không thể liên kết `r` với phiếu reveal sau này.

**Cross-election replay prevention:** `M` bind `electionId` — chữ ký `(h, s')` valid trong election A sẽ cho `h_check ≠ h` khi verify trong election B (vì `M` khác).

**Thư viện:** `@noble/curves` (secp256k1) + `@noble/hashes` (SHA256) — constant-time implementation, không phụ thuộc native bindings, chạy được cả Node.js lẫn browser.

---

## 3. Xác thực & phân quyền — JWT hai tầng

### 3.1 Kiến trúc token

Hệ thống dùng **hai cặp secret riêng biệt** cho access token và refresh token:

```
JWT_ACCESS_SECRET   ← BFF verify trực tiếp (không cần gọi Identity)
JWT_REFRESH_SECRET  ← Identity giữ riêng
```

| Loại           | TTL mặc định | Lưu tại                              | Dùng để              |
| -------------- | ------------ | ------------------------------------ | -------------------- |
| `accessToken`  | 15 phút      | Client memory                        | Xác thực mọi request |
| `refreshToken` | 7 ngày       | Redis (key: `refreshToken:{userId}`) | Lấy accessToken mới  |

**JWT Payload:**

```typescript
JwtPayload {
    sub:   string   // userId (MongoDB ObjectId hex)
    email: string
    role:  "ADMIN" | "VOTER" | "CANDIDATE"
    iat:   number   // issued at
    exp:   number   // expiry
}
```

### 3.2 Refresh Token Rotation

Mỗi lần refresh: **xóa token cũ, cấp cặp token mới** hoàn toàn. Cơ chế này ngăn chặn refresh token bị đánh cắp và dùng lại:

```
POST /auth/refresh-token { refreshToken }
  ▼
Identity.TokenService
  │ jwtService.verifyAsync(refreshToken, JWT_REFRESH_SECRET)
  │ Redis.get("refreshToken:{userId}") → cachedToken
  │ Nếu cachedToken !== refreshToken → 401 (reuse hoặc đã revoke)
  │ Redis.del("refreshToken:{userId}")
  │ generateTokens() → issue cặp mới
  │ Redis.set("refreshToken:{userId}", newRefreshToken, TTL: 7 ngày)
  ▼
Trả { accessToken: mới, refreshToken: mới }
```

Khi phát hiện token cũ bị dùng lại (refresh token reuse attack): người dùng buộc phải đăng nhập lại vì refresh token hiện tại cũng không còn trong Redis.

### 3.3 Xác thực tại BFF — Zero round-trip

BFF verify `accessToken` **cục bộ** bằng `JWT_ACCESS_SECRET` mà không cần gọi Identity service. Điều này:

- Loại bỏ round-trip TCP cho mỗi request
- Giảm latency ~5–15ms/request
- Identity service không bị quá tải bởi verify requests

```typescript
// BFF AuthenticatorGuard — verify locally
const payload = await jwtService.verifyAsync(token, { secret: JWT_ACCESS_SECRET })
// gắn { userId, role } vào request context
```

### 3.4 Access Control (RBAC)

```typescript
@Roles('ADMIN')   → chỉ ADMIN truy cập
@Roles('VOTER')   → chỉ VOTER truy cập
@Public()         → không cần JWT (sign-in, filter elections, verify vote, reveal)
```

BFF ngăn VOTER/CANDIDATE đăng nhập vào Admin Web bằng kiểm tra `Origin` header:

```typescript
if (['VOTER', 'CANDIDATE'].includes(result.role) && origin === ADMIN_WEB_ORIGIN) {
    throw new UnauthorizedException('Admin users can only access the admin web')
}
```

---

## 4. Quản lý session — Redis

### 4.1 Kiến trúc cache hai tầng (L1 + L2)

`RedisCacheModule` sử dụng cấu trúc **L1 in-process memory (LRU) + L2 Redis**:

```typescript
stores: [
    new Keyv({ store: new KeyvCacheableMemory({ ttl, lruSize: 5000 }) }), // L1
    new KeyvRedis(redisUrl) // L2
]
```

**Luồng đọc:** L1 hit → trả ngay (sub-millisecond). L1 miss → L2 Redis → populate L1.  
**Luồng ghi:** Ghi đồng thời vào cả L1 và L2.  
**Lợi ích:** Giảm round-trip mạng đến Redis cho các giá trị truy cập thường xuyên (vote count, session).

### 4.2 Session bỏ phiếu

```
key:   session:signed:{voterId}
value: {
    sessionId:    string   // UUID v4
    signed:       boolean  // false → true sau khi ký
    electionId:   string
    signatureHex: string?  // chỉ có sau khi ký
    voted:        boolean  // false → true sau khi nộp phiếu
}
TTL: REDIS_SESSION_CACHE_TTL (mặc định 120 giây)
```

**State machine session:**

```
[start-session] → { signed: false, voted: false }
      │
      ▼
[sign]          → { signed: true, signatureHex: "..." }
      │
      ▼
[submit]        → { voted: true }
```

Nếu voter bắt đầu session mới trước khi hoàn thành: session cũ bị ghi đè, đồng thời `DELETE_SESSION_NONCE` được emit đến tất cả signing nodes để hủy nonce cũ — ngăn nonce reuse attack (biết `k_i` + hai cặp `(r, s_i)` → recover `d_i`).

### 4.3 Refresh token cache

```
key:   refreshToken:{userId}
value: <refreshToken JWT string>
TTL:   JWT_REFRESH_EXPIRES_IN (mặc định 7 ngày)
```

Redis là **nguồn sự thật** cho trạng thái đăng nhập — xóa entry này là đăng xuất ngay lập tức kể cả khi refresh token JWT chưa hết hạn.

### 4.4 Vote count cache

```
key:   election:vote:count:{electionId}
value: number
TTL:   REDIS_VOTE_COUNT_CACHE_TTL (mặc định 7 ngày)
```

Được thiết lập khi closeElection. Reveal-Vote service dùng để so sánh `revealCount >= voteCount` mà không cần query MongoDB mỗi lần reveal.

### 4.5 Bảo mật Redis

- Kết nối xác thực bằng password: `redis://:${password}@host:port`
- `maxmemory-policy: allkeys-lru` — tự động evict khi đầy (ưu tiên bỏ key ít dùng nhất)
- `appendonly: yes` — persistence AOF, phục hồi sau restart
- Timeout request: `TimeoutInterceptor` (5000ms mặc định) ngăn Redis chặn request quá lâu
- **mTLS (production)**: khi `MTLS_ENABLED=true`, toàn bộ client chuyển sang `rediss://` (TLS) + trình cert mTLS; Redis server bật `--tls-auth-clients yes` — chỉ client có cert do CA nội bộ ký mới kết nối được (xem §9.7)

---

## 5. Lớp blockchain — Hyperledger Fabric Private Network

### 5.1 Tại sao chọn Hyperledger Fabric (Private Blockchain)

| Tiêu chí         | Ethereum/Public   | Hyperledger Fabric                |
| ---------------- | ----------------- | --------------------------------- |
| Quyền tham gia   | Mở (ai cũng được) | **Được cấp phép** (permissioned)  |
| Danh tính node   | Ẩn danh           | **X.509 Certificate** (CA-issued) |
| Throughput       | ~15–30 TPS (PoW)  | **3001+ TPS** (PBFT/Raft)         |
| Latency finality | 6–60 giây         | **< 1 giây** (deterministic)      |
| Chi phí          | Gas fee           | **Không có** (private infra)      |
| Dữ liệu nhạy cảm | Public            | **Có thể private qua channels**   |
| Chaincode        | Solidity (EVM)    | **Go / Java / Node.js**           |

Cho hệ thống bầu cử, **identity được xác minh** (biết ai là peer, ai là orderer) và **finality xác định** (không có fork, không có uncle) là bắt buộc.

### 5.2 Mô hình Membership Service Provider (MSP)

Hyperledger Fabric dùng **PKI với CA (Certificate Authority)** để xác minh danh tính mỗi participant:

```
┌─────────────────────────────────────────────────────────┐
│  Root CA (Fabric CA)                                    │
│    ├── Org1 CA                                          │
│    │     ├── Admin MSP cert (quản trị channel)          │
│    │     ├── Peer MSP cert (peer node trong mạng)       │
│    │     └── Client MSP cert (app gọi chaincode)        │
│    └── Orderer CA                                       │
│          └── Orderer MSP cert                           │
└─────────────────────────────────────────────────────────┘
```

**Mỗi transaction được ký bằng X.509 cert** của client (backend service). Chainlaunch quản lý việc gắn cert vào request trước khi submit proposal đến peer. Fabric peer verify chữ ký X.509 trước khi execute chaincode — không có cert hợp lệ, proposal bị reject ngay tại tầng network.

### 5.3 Channel Isolation

Channel `votechannel` là **ledger riêng biệt** chỉ có các org được cấp phép mới nhận transaction:

```
Channel: votechannel
  │
  ├── Peer Org1 (validator + endorser)
  ├── Peer Org2 (validator + endorser)  [tùy cấu hình]
  └── Orderer (ordering service)
```

Dữ liệu trong `votechannel` không visible với các channel khác — ngay cả khi chạy trên cùng một peer.

### 5.4 Endorsement Policy

Chaincode `VoteLedgerContract` được cấu hình với **endorsement policy**: transaction chỉ hợp lệ khi có đủ số lượng peer endorsement theo policy (ví dụ `AND('Org1MSP.peer', 'Org2MSP.peer')`). Một peer bị compromise không đủ để forge transaction.

### 5.5 External Chaincode (SCC)

Chaincode chạy ở mode **external** (`shim.ChaincodeServer`), không nhúng vào peer process:

```go
server := &shim.ChaincodeServer{
    CCID:    os.Getenv("CHAINCODE_ID"),
    Address: "0.0.0.0:9999",
    CC:      chaincode,
    TLSProps: shim.TLSProperties{ Disabled: true }
}
```

**Lợi ích external chaincode:**

- Deploy độc lập, không cần restart peer khi update chaincode
- Có thể scale horizontally
- Debug dễ hơn (process riêng, log riêng)
- Peer kết nối đến chaincode qua gRPC — chaincode không trực tiếp truy cập peer filesystem

### 5.6 Immutability đảm bảo gì

Sau khi `SubmitVote` được committed vào block:

- Hash của block chứa transaction được tính vào block tiếp theo (chain linkage)
- Thay đổi bất kỳ transaction nào → hash sai → tất cả block sau đó invalid
- Cần compromised **đa số** peer để rewrite history (PBFT Byzantine fault tolerance)

Với `CommitMerkleRoot`: một khi Merkle root đã committed, không thể:

1. Thêm phiếu vào election (chaincode reject SubmitVote sau khi committed)
2. Thay đổi root (chaincode reject CommitMerkleRoot lần 2)
3. Modify root trên chain (immutability của Fabric ledger)

### 5.7 Xác thực với Chainlaunch (Session-based)

Backend service xác thực với Chainlaunch REST API bằng **session cookie** (không phải API key cố định):

```typescript
// FabricClientService.onModuleInit()
await this.client.post('/auth/login', { username, password })
// axios-cookiejar-support tự attach cookie vào mọi request sau đó
```

Session được tạo mới khi service khởi động (`onModuleInit`). Chainlaunch quản lý mapping từ session → X.509 identity để submit transaction. Backend service không cần giữ certificate trực tiếp.

### 5.8 Nhất quán dữ liệu blockchain ↔ MongoDB (Write-DB-First + Reconciler)

**Vấn đề — dual-write không atomic.** Ghi blockchain và ghi MongoDB là hai hệ thống tách biệt, không thể bọc trong một transaction chung. Nếu ghi chain trước rồi ghi DB sau (chain-first), DB fail **sau khi** chain đã commit sẽ làm hai bên lệch nhau — và vì ledger bất biến, không thể "undo" chain. Ba điểm dual-write và hậu quả khi lệch:

| Thao tác            | Nếu chain OK nhưng DB fail (chain-first)                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SubmitVote`        | Chain có phiếu, DB thiếu → `voteCount ≠ stats.TotalVoteCount` → `CommitMerkleRoot` reject khi đóng election |
| `RevealVoteCompact` | Chain đã dùng `revealKey`, DB thiếu → voter retry bị chain reject "revealKey already used" → kẹt            |
| `CommitMerkleRoot`  | Chain đã đóng, DB còn `ACTIVE` → retry bị chain reject (idempotent) → election kẹt                          |

**Giải pháp 1 — Write-DB-First + trạng thái trung gian + reconciler** (cho `SubmitVote` và `CommitMerkleRoot`):

```
① Ghi DB trạng thái trung gian trước:
     Vote.status = PENDING_CHAIN   |  Election.status = CLOSING
     blockchainRef = null
② Gọi chain (invoke).
③ Chain OK   → confirm DB: CONFIRMED / CLOSED + blockchainRef = txId
④ Chain lỗi  → query chain để phân định (chain là nguồn sự thật):
     GetVote / GetMerkleRoot
       • đã có trên chain  → confirm DB (recover txId từ query)
       • chưa có           → rollback DB (xóa vote PENDING /
                              đưa election về ACTIVE) rồi ném lỗi
```

Vì DB được ghi **trước**, unique index `(electionId, voterId)` chặn double-vote ngay từ bước ① (trước cả khi đụng chain). Với close election, trạng thái `CLOSING` còn đóng vai trò **lock** chống `closeElection` chạy đồng thời.

**Giải pháp 2 — Option B (giữ chain-first + tự phục hồi khi retry)** cho `RevealVoteCompact`: không đổi thứ tự (chain trước, DB sau). Khi `revealVote` invoke ném lỗi, query `GetUsedReveal(electionId, revealKey)`:

- Chain **chưa** có `revealKey` → lỗi thật, ném tiếp.
- Chain **đã** có (và `candidateIds` khớp) → đây là retry sau partial-fail → `create` lại record DB với `blockchainRef = used.transactionId || null`. `GetUsedReveal` trả `transactionId` của transaction gốc (được lưu on-chain bởi `RevealVoteCompact` qua `ctx.GetStub().GetTxID()`); record cũ chưa lưu txId thì `blockchainRef = null` (tương thích ngược). Unique index `(electionId, revealKey)` vẫn ném `P2002` nếu DB đã có record ⇒ replay thật vẫn bị chặn, chỉ phục hồi khi DB còn trống.

> Reveal dùng Option B thay vì Write-DB-First vì revealKey là idempotency-key tự nhiên trên chain — chain tự chống trùng, nên retry an toàn mà không cần trạng thái trung gian.

**Reconciler nền** (`apps/coordinator/src/infrastructure/reconciler`): xử lý ca process **crash** giữa bước ② và ③ (synchronous path chưa kịp confirm/rollback). Dùng `@nestjs/schedule` với cron `RECONCILER_CRON_EXPRESSION` (mặc định `*/1 * * * *`) để quét record kẹt **cũ hơn** `RECONCILER_STALE_MS` (mặc định 120s — tránh tranh chấp với request đang chạy), có cờ chống overlap:

- `Vote` còn `PENDING_CHAIN` → `GetVote`: có → `CONFIRMED` + txId; không → xóa record.
- `Election` còn `CLOSING` → `GetMerkleRoot`: committed → `CLOSED` + recover txId/root; không → về `ACTIVE`.

**Hệ quả về invariant đọc dữ liệu.** "Phiếu hợp lệ" = phiếu đã `CONFIRMED` (đã có trên chain). Do đó các hàm đọc vote **mặc định lọc `status = CONFIRMED`**: `getVoteCount`, `getCommitmentVotesByElectionId` (Merkle chỉ build từ phiếu CONFIRMED để khớp chain), `filterVotes`, `getMyElectionAllInfo`, `getElectionsByVoterId`. Hai ngoại lệ **cố ý giữ status-agnostic**:

- Check double-vote trong `startSession` — phiếu `PENDING_CHAIN` vẫn phải tính là "đã vote" để không cho vote lại trong lúc đang chờ chain.
- `verifyVote` (forensic) — cần thấy cả phiếu `PENDING_CHAIN` để phát hiện và báo cáo lệch DB ↔ chain.

> **Lưu ý vận hành:** đây là mô hình **eventual consistency** — khi chain tạm thời không phản hồi, một phiếu có thể nằm `PENDING_CHAIN` cho tới khi reconciler đồng bộ được. Trong cửa sổ đó voter thấy "đã vote" (slot bị giữ) nhưng phiếu chưa được tính vào tally/Merkle cho tới khi `CONFIRMED`.

---

## 6. Tối ưu throughput blockchain — Chainlaunch Batch

### 6.1 Hyperledger Fabric Block Cutting

Fabric không commit từng transaction riêng lẻ mà **nhóm transactions vào block** theo quy tắc **BatchSize + BatchTimeout** tại tầng Orderer. Đây là điểm quan trọng nhất để tối ưu throughput.

**Cấu hình BatchSize (configtx.yaml — Orderer section):**

```yaml
Orderer:
    BatchSize:
        MaxMessageCount: 500 # số transaction tối đa trong 1 block
        AbsoluteMaxBytes: 10 MB # kích thước tối đa tuyệt đối của block
        PreferredMaxBytes: 2 MB # kích thước ưu tiên — block được cắt khi đạt mức này

    BatchTimeout: 2s # thời gian tối đa chờ đủ batch trước khi cắt block
```

**Quy tắc cắt block (block cutting rules):**

```
Block được tạo khi THỎA MỘT TRONG CÁC ĐIỀU KIỆN:
  ├── Số tx trong batch đạt MaxMessageCount (500)
  ├── Tổng kích thước batch vượt AbsoluteMaxBytes (10 MB)
  ├── Tổng kích thước vượt PreferredMaxBytes (2 MB)
  │   [ngay cả khi chưa đủ MaxMessageCount]
  └── BatchTimeout hết hạn (2 giây)
       [dù chỉ có 1 tx trong batch]
```

### 6.2 Trade-off BatchTimeout

| BatchTimeout | Throughput             | Latency          | Phù hợp                               |
| ------------ | ---------------------- | ---------------- | ------------------------------------- |
| 0.5s         | Thấp (nhiều block nhỏ) | **Thấp (nhanh)** | Hệ thống real-time, ít người dùng     |
| 2s           | **Trung bình**         | Trung bình       | **Cân bằng — khuyến nghị cho bầu cử** |
| 5s           | **Cao** (block dày)    | Cao (chậm)       | Batch ingest, import dữ liệu lớn      |

Với hệ thống bầu cử: mỗi vote là 1 transaction `SubmitVote` (~300–500 bytes payload). Ở BatchTimeout = 2s:

- 100 voter vote đồng thời → tất cả 100 tx vào 1 block (nếu tổng < 2MB)
- Latency finality: **BatchTimeout + block propagation ≈ 2–3 giây**

### 6.3 Tính BatchSize phù hợp

Payload mỗi transaction `SubmitVote`:

```
electionId:          24 bytes
voteId:              24 bytes
blindedCommitment:   64 bytes hex
overhead (protobuf): ~200 bytes
Total:               ~312 bytes/tx
```

Với `PreferredMaxBytes = 2 MB`:

```
2,000,000 / 312 ≈ 6,400 transactions/block
```

Thực tế nên đặt `MaxMessageCount = 500` để đảm bảo block không quá lớn và propagation nhanh.

### 6.4 Chainlaunch: Tối ưu connection pooling

Chainlaunch quản lý **connection pool đến peer** thay vì mở kết nối mới cho mỗi request. Backend service chỉ cần gọi REST API — Chainlaunch xử lý:

```
Backend → HTTP REST → Chainlaunch → gRPC connection pool → Fabric Peer
```

**Lợi ích:**

- Tái sử dụng gRPC connection (tránh TLS handshake overhead mỗi lần)
- Load balancing giữa nhiều peer (nếu cấu hình)
- Retry logic và circuit breaker xử lý tại Chainlaunch, không cần backend tự implement

### 6.5 Query vs Invoke

Backend phân biệt rõ hai loại call để tránh tạo transaction không cần thiết:

| Operation                                                                                      | Loại       | Tạo transaction?        | Latency              |
| ---------------------------------------------------------------------------------------------- | ---------- | ----------------------- | -------------------- |
| `SubmitVote`, `CommitMerkleRoot`, `RevealVoteCompact`                                          | **invoke** | Có → vào block → ledger | ~2–3s (BatchTimeout) |
| `GetVote`, `GetMerkleRoot`, `GetUsedReveal`, `GetTally`, `GetAuditCounts`, `VerifyVoteReceipt` | **query**  | Không                   | < 100ms              |

Query đọc trực tiếp từ World State của peer, không qua orderer — rất nhanh và không tốn quota block.

**Khác biệt xử lý lỗi (quan trọng cho cơ chế reconcile §5.8):** `FabricClientService` để invoke **ném** `BadRequestException` khi lỗi, còn query **trả** `{ message, result: '' }` (không ném). Nhờ vậy luồng phục hồi sau khi invoke fail có thể gọi query (`GetVote`/`GetMerkleRoot`/`GetUsedReveal`) để phân định "đã lên chain hay chưa" mà không bị exception cắt ngang.

### 6.6 Đề xuất cấu hình Chainlaunch cho production

```yaml
# configtx.yaml — Orderer
BatchSize:
    MaxMessageCount: 500
    AbsoluteMaxBytes: 10485760 # 10 MB
    PreferredMaxBytes: 2097152 # 2 MB
BatchTimeout: 2s

# Channel policies
Policies:
    Readers:
        Type: ImplicitMeta
        Rule: 'ANY Readers'
    Writers:
        Type: ImplicitMeta
        Rule: 'ANY Writers'
    Admins:
        Type: ImplicitMeta
        Rule: 'MAJORITY Admins'
```

Ở `MaxMessageCount = 500`, `BatchTimeout = 2s`:

- Throughput lý thuyết: 500 tx / 2s = **250 TPS**
- Thực tế (với overhead): ~100–150 TPS
- Đủ cho hệ thống bầu cử quy mô vừa (10,000 voter hoàn thành trong ~70 giây đồng thời)

---

## 7. Kiểm chứng toàn vẹn dữ liệu — Merkle Tree

### 7.1 Cấu trúc Merkle Tree

```
Commitment Merkle Tree (khi close election):

        Root = H(H12, H34)
       /                   \
  H12 = H(H1, H2)     H34 = H(H3, H4)
  /        \             /          \
H1         H2          H3           H4
|          |           |            |
leaf1      leaf2       leaf3        leaf4
(SHA256    (SHA256     (SHA256      (SHA256
 commit1)   commit2)   commit3)     commit4)
```

**Leaf computation:**

```
leaf_i = SHA256(UTF8(blindedCommitment_i_hex))
```

> Dùng SHA256 của chuỗi hex string (không phải raw bytes). Cả off-chain (`libs/fabric/src/lib/merketree/index.ts`) và on-chain (`merkle_proof.go`) đều dùng cùng quy tắc này.

**Cấu hình merkletreejs:**

```typescript
new MerkleTree(leaves, sha256Buffer, {
    sortLeaves: true, // sort leaves để tree deterministic
    sortPairs: true, // sort pair trước khi hash → proof không cần kèm position
    duplicateOdd: true // duplicate leaf cuối nếu số lẻ → tree luôn đầy
})
```

`sortPairs: true` đồng bộ với chaincode Go:

```go
func hashSortedPair(a, b []byte) []byte {
    first, second := a, b
    if bytes.Compare(a, b) > 0 { first, second = b, a }
    return sha256Bytes(append(first, second...))
}
```

### 7.2 Merkle Root đảm bảo gì

Sau khi `commitMerkleRoot` được ghi trên chain:

1. **Snapshot bất biến:** Tập hợp phiếu bầu tại thời điểm đóng election được "đóng băng" vào một hash 32 bytes. Bất kỳ thay đổi nào (thêm/xóa/sửa phiếu) đều tạo ra root khác.

2. **Membership proof:** Bất kỳ phiếu nào cũng có thể tự chứng minh thuộc election mà không cần tiết lộ các phiếu khác (zero-knowledge-like property với Merkle proof).

3. **Cross-check DB vs Chain:** `election.merkleRoot` trong MongoDB được kiểm chứng khớp với `MerkleRootView.merkleRoot` trên chain — ngăn backend tự ý thay đổi root sau khi ghi lên chain.

### 7.3 Proof độ phức tạp

```
Merkle proof path: O(log₂ N) hashes
Ví dụ:
  N = 1,000 phiếu → proof path dài 10 hashes = 320 bytes
  N = 10,000 phiếu → proof path dài 14 hashes = 448 bytes
```

### 7.4 Luồng verify 7 bước

Verify phiếu không chỉ kiểm tra blockchain — kiểm tra đồng thời 3 nguồn độc lập:

```
DB Check (bước 2)     Chain Check (bước 3)     Merkle Check (bước 4–7)
     │                      │                           │
     ▼                      ▼                           ▼
vote.findUnique       GetVote on-chain           computeProof từ DB
voteId match?         txId match?                root = election.merkleRoot?
commitment match?     commitment match?           proof valid locally?
blockchainRef match?                              root match chain root?
                                                  chainVerifyProof?

     └──────────────────────┴───────────────────────────┘
                             │
                        valid = ALL true
```

Chỉ khi cả 3 nguồn đồng thuận → phiếu được xác nhận hoàn toàn hợp lệ.

---

## 8. Bảo mật tầng HTTP — Helmet, CORS, Rate Limiting

### 8.1 Helmet Security Headers

BFF áp dụng `helmet` với cấu hình tùy theo môi trường:

| Header                            | Dev | Prod                  | Chức năng                   |
| --------------------------------- | --- | --------------------- | --------------------------- |
| `Content-Security-Policy`         | Tắt | Bật (strict)          | Ngăn XSS, chỉ cho phép self |
| `X-Frame-Options: DENY`           | Bật | Bật                   | Ngăn clickjacking           |
| `X-Powered-By`                    | Ẩn  | Ẩn                    | Che giấu framework          |
| `X-Content-Type-Options: nosniff` | Bật | Bật                   | Ngăn MIME sniffing          |
| `Strict-Transport-Security`       | Tắt | Bật (1 năm + preload) | Force HTTPS                 |
| `Referrer-Policy: no-referrer`    | Bật | Bật                   | Không leak URL              |
| `Cross-Origin-Opener-Policy`      | Tắt | `same-origin`         | Process isolation           |
| `Cross-Origin-Resource-Policy`    | Tắt | `same-origin`         | Resource isolation          |

Production CSP config:

```javascript
{
    defaultSrc: ["'none'"],
    connectSrc: ["'self'"],
    imgSrc:     ["'self'", "data:"],
    styleSrc:   ["'self'"],
    scriptSrc:  ["'self'"],
    objectSrc:  ["'none'"],
    frameSrc:   ["'none'"],
    upgradeInsecureRequests: []
}
```

### 8.2 CORS

```typescript
app.enableCors({
    origin: CORS_ORIGINS.split(','), // danh sách whitelist domain
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    maxAge: 3600 // cache preflight 1 giờ
})
```

Chỉ các origin trong `CORS_ORIGINS` env mới được phép gọi API — ngăn request từ domain không được phép (CSRF qua XHR).

### 8.3 Rate Limiting (Throttler)

```
THROTTLE_TTL:   60,000 ms (1 phút)
THROTTLE_LIMIT: 100 requests/phút/IP
```

`HttpThrottlerGuard` chỉ áp dụng cho HTTP context — **bỏ qua TCP context** (giao tiếp nội bộ giữa các microservice không bị rate limit):

```typescript
override canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return Promise.resolve(true)
    return super.canActivate(context)
}
```

### 8.4 Request Timeout

```typescript
// TimeoutInterceptor: 5000ms
timeout(5000) // rxjs operator
```

Ngăn slow request tiêu thụ connection indefinitely. Đặc biệt quan trọng khi Fabric node chậm phản hồi — request sẽ trả `408 Request Timeout` thay vì treo mãi.

---

## 9. Giao tiếp nội bộ — Microservice TCP + mTLS

### 9.1 NestJS TCP Transport

Tất cả service nội bộ giao tiếp qua **NestJS TCP transport** — không phải REST HTTP. Lý do:

- **Không qua tầng HTTP parser** → latency thấp hơn (~1–3ms vs ~5–15ms)
- **Không expose HTTP port** → các service không trực tiếp accessible từ ngoài
- **Structured message routing** qua `@MessagePattern` — type-safe, không cần parse URL
- **Automatic serialization/deserialization** của payload
- **mTLS** (production): toàn bộ kênh TCP được mã hoá và xác thực hai chiều (xem §9.7)

### 9.2 Kiến trúc isolation

```
Internet → BFF (:3001) → [mTLS TCP] → Identity (:3302)
                       → [mTLS TCP] → Coordinator (:3303)
                                         → [mTLS TCP] → Signing Node 1 (:3304)
                                         → [mTLS TCP] → Signing Node 2 (:3305)
                                         → [mTLS TCP] → Signing Node 3 (:3306)

Voter (anonymous) → Reveal-Vote (:3007) → [mTLS TCP] → Coordinator
                                         → [mTLS TCP] → Identity

Coordinator / BFF / Identity / Reveal-Vote / Socket → [mTLS] → Redis (event bus + cache)
```

Identity, Coordinator, Signing Nodes **không có HTTP port** — không thể bị gọi trực tiếp từ ngoài. Chỉ BFF và Reveal-Vote mới expose HTTP.

### 9.3 Error propagation

Lỗi từ microservice TCP được chuyển đổi thành HTTP error tại BFF bởi `RpcToHttpExceptionInterceptor`:

```typescript
// Microservice throw: BadRequestException { statusCode: 400, message: "..." }
// BFF nhận RpcException → extract statusCode, message → new HttpException(message, 400)
```

Điều này đảm bảo client nhận được HTTP status code chính xác thay vì luôn nhận `500 Internal Server Error`.

### 9.4 Parallel fan-out đến Signing Nodes

Coordinator gọi cả 3 signing nodes **đồng thời** bằng `Promise.all`:

```typescript
const commitmentResults = await Promise.all(
    this.signingNodeClients.map((client) => lastValueFrom(client.send(CREATE_COMMITMENT, { sessionId, electionId })))
)
```

Latency tổng = max(latency_node1, latency_node2, latency_node3) thay vì tổng. Với 3 node mỗi node ~5ms → tổng ~5ms thay vì 15ms.

### 9.5 Fire-and-forget cho side effects

Các operation không cần chờ kết quả dùng `emit()` (one-way) thay vì `send()` (request-response):

```typescript
// Xóa nonce cũ — không cần biết kết quả
this.signingNodeClients.map((client) => client.emit(DELETE_SESSION_NONCE, { sessionId }).subscribe())

// Cleanup election sau khi complete
client.emit(CLEANUP_ELECTION, { electionId }).subscribe()
```

Điều này không block luồng chính, tránh tăng latency cho người dùng.

### 9.6 TCP Client Module

`TcpClientModule` là global dynamic module, inject `ClientProxy` theo tên `TCP_{SERVICE_NAME}`:

```typescript
// Đăng ký
TcpClientModule.register([
    { serviceName: 'IDENTITY', host, port },
    { serviceName: 'COORDINATOR', host, port },
    // signing nodes: mảng động từ env SIGNING_NODES_TCP_NAME/HOST/PORT
])

// Inject
@Inject('TCP_IDENTITY') private readonly identityClient: ClientProxy
```

Tên service từ env cho phép override host/port trong Docker mà không cần sửa code. Khi mTLS bật, `tlsOptions` được inject tự động từ `getClientTlsOptions()` — không cần sửa nơi sử dụng.

### 9.7 mTLS — Mutual TLS cho mọi kênh nội bộ

> Tham chiếu đầy đủ: `MTLS.md`. Phần này tóm tắt thiết kế và các file liên quan.

**Mô hình trust:**

- **1 CA nội bộ** (`certs/ca.crt`) làm trust anchor cho cả mesh — sinh bằng `scripts/gen-mtls-certs.sh`.
- **Mỗi service 1 cert riêng** do CA ký, EKU `serverAuth + clientAuth` (dùng chung cho cả TCP server, TCP client, Redis client):

| Service        | Cert                           |
| -------------- | ------------------------------ |
| bff            | `certs/bff.crt/key`            |
| identity       | `certs/identity.crt/key`       |
| coordinator    | `certs/coordinator.crt/key`    |
| signing-node-1 | `certs/signing-node-1.crt/key` |
| signing-node-2 | `certs/signing-node-2.crt/key` |
| signing-node-3 | `certs/signing-node-3.crt/key` |
| reveal-vote    | `certs/reveal-vote.crt/key`    |
| socket         | `certs/socket.crt/key`         |
| redis          | `certs/redis.crt/key`          |

3 signing node có **cert riêng biệt** → revoke/rotate độc lập từng node, coordinator xác nhận đúng node qua SAN.

**Triển khai kỹ thuật:**

```
libs/configuration/src/lib/mtls.config.ts
  getServerTlsOptions()  → { cert, key, ca, requestCert: true, rejectUnauthorized: true }
  getClientTlsOptions()  → { cert, key, ca, rejectUnauthorized: true, servername? }
  getRedisTlsOptions()   → { cert, key, ca, rejectUnauthorized: true }
  — tất cả trả undefined khi MTLS_ENABLED != 'true' (an toàn cho dev)
```

| Kênh                           | File                                         | Cơ chế                                                                                 |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| TCP server (5 service)         | `apps/*/src/main.ts`                         | `tlsOptions: getServerTlsOptions()` trong `createMicroservice` / `connectMicroservice` |
| TCP client                     | `libs/modules/src/lib/tcp-client.module.ts`  | `tlsOptions: getClientTlsOptions(host)` — phủ toàn bộ nơi register                     |
| Redis event bus (ioredis)      | `libs/modules/src/lib/event-bus.module.ts`   | `tls: getRedisTlsOptions()`                                                            |
| Redis cache (node-redis/@keyv) | `libs/modules/src/lib/redis-cache.module.ts` | `rediss://` + `socket: { tls: true, ...certs }`                                        |
| Redis consumer (socket)        | `apps/socket/src/main.ts`                    | `tls: getRedisTlsOptions()`                                                            |
| Redis server                   | `docker-compose.mtls.yml`                    | `--tls-port 6379 --port 0 --tls-auth-clients yes`                                      |

**"Mutual"** nằm ở `requestCert: true + rejectUnauthorized: true` phía server TCP, và `--tls-auth-clients yes` phía Redis — cả hai đầu đều phải trình cert hợp lệ mới kết nối được.

**Vận hành:**

```bash
# Sinh cert lần đầu (chạy 1 lần, CA giữ 10 năm, cert service 1 năm)
bash scripts/gen-mtls-certs.sh

# Bật mTLS ở tất cả file .env runtime (8 service)
bash scripts/toggle-mtls.sh on

# Xem trạng thái MTLS_ENABLED từng service
bash scripts/toggle-mtls.sh status

# Tắt (fallback về plaintext — dev local)
bash scripts/toggle-mtls.sh off

# Khởi động Redis ở chế độ TLS (sau khi đã bật MTLS_ENABLED)
docker compose -f docker-compose.yml -f docker-compose.mtls.yml up -d redis
```

**Rotation cert (hằng năm):**

```bash
# Giữ nguyên CA (ca.key + ca.crt), chỉ tái sinh cert service
bash scripts/gen-mtls-certs.sh    # CA đã tồn tại → chỉ tái sinh cert service
# Rolling-restart từng service — không cần downtime toàn hệ thống
```

> **SELinux (Fedora/RHEL):** volume mount Redis cần flag `:z` (`./certs:/certs:ro,z`) để relabel context — đã cấu hình sẵn trong `docker-compose.mtls.yml`.

**Giới hạn hiện tại:**

- **Authn ≠ Authz**: mTLS đảm bảo "peer thuộc mesh" (cert do CA ký), **không** giới hạn "service A mới được gọi service B". Lớp authz per-service là bước tiếp theo nếu cần.
- **`ENCRYPTION_KEY` của 3 signing node phải KHÁC nhau** ở production — nếu dùng chung thì mTLS cert tách biệt cũng không đủ để đảm bảo key share thực sự độc lập.
- **Rollout đồng thời**: phải bật `MTLS_ENABLED=true` **cùng lúc** cả 2 đầu của một kênh (ví dụ coordinator + cả 3 signing node). Một bên TLS, một bên plaintext → kết nối bị từ chối.
- **Fabric ↔ Chaincode TLS** vẫn `Disabled: true` (xem §12.5).

---

## 10. Bảo vệ dữ liệu tĩnh — AES-256-GCM

### 10.1 Mã hóa private key Signing Node

Private key EC-Schnorr (`d_i`, 32 bytes scalar) **không bao giờ được lưu plaintext**. Trước khi lưu MongoDB:

```typescript
// Mã hóa: AES-256-GCM với random IV
encrypt(privateKeyHex, encryptionKeyBuf):
  iv  = randomBytes(12)                    // 96-bit IV, unique mỗi lần
  cipher = AES-256-GCM(key=encryptionKeyBuf, iv)
  ciphertext = cipher.update(privateKeyHex) + cipher.final()
  authTag = cipher.getAuthTag()            // 128-bit authentication tag
  storage = base64(iv || authTag || ciphertext)
```

```typescript
// Giải mã: xác thực authTag trước
decrypt(encryptedText, encryptionKeyBuf):
  combined = base64.decode(encryptedText)
  iv       = combined[0:12]
  authTag  = combined[12:28]
  ciphertext = combined[28:]
  decipher.setAuthTag(authTag)   // PHẢI verify, throw nếu tampered
  plaintext = decipher.update() + decipher.final()
```

**AES-256-GCM vs AES-256-CBC:**

- GCM cung cấp **Authenticated Encryption** — phát hiện ngay nếu ciphertext bị giả mạo
- CBC chỉ encrypt, không authenticate — có thể bị padding oracle attack
- IV ngẫu nhiên 12 bytes mỗi lần → cùng plaintext cho ciphertext khác nhau (semantic security)

### 10.2 Encryption key management

`ENCRYPTION_KEY` (32 bytes, base64 encoded) đến từ environment variable — không hard-code trong code:

```typescript
const encryptKeyBuf = Buffer.from(CONFIGURATION.SIGNING_NODE_CONFIG.ENCRYPTION_KEY, 'base64')
if (encryptKeyBuf.length !== 32) {
    throw new BadGatewayException('ENCRYPTION_KEY must be 32 bytes (256-bit) for AES-256')
}
```

Validation xảy ra tại runtime — nếu key sai kích thước, service từ chối khởi động thay vì hoạt động với key yếu.

### 10.3 Vòng đời private key trong memory

```
1. Signing node nhận sign request
2. Fetch KeyPair từ MongoDB → decrypt privateKey vào bigint (in-process memory)
3. Thực hiện phép tính s_i = k_i − d_i·r
4. BigInt garbage collected sau khi hàm return
5. Không log, không serialize, không truyền d_i ra khỏi process
```

---

## 11. Tối ưu hiệu năng hệ thống

### 11.1 MongoDB Replica Set + Transactions

Chạy MongoDB với `--replSet rs0` để hỗ trợ **multi-document ACID transactions** của Prisma:

```typescript
// Prisma transaction ngắn: re-validate + write
await this.prisma.$transaction(async (tx) => {
    const current = await tx.election.findUniqueOrThrow({ where: { id } })
    if (current.status !== ElectionStatus.PENDING) throw new ConflictException(...)
    return await tx.election.update({ where: { id }, data: { status: ACTIVE } })
})
```

**Pattern "validate ngoài, commit trong transaction":**

1. Pre-validate (đọc) **ngoài** transaction → tránh giữ lock lâu
2. Side effects nặng (gọi Fabric ~2s) **ngoài** transaction
3. Transaction chỉ làm: re-validate (chống race condition) + write
4. Transaction ngắn → lock thời gian ngắn → throughput cao hơn

### 11.2 HTTP Response Cache

`HttpCacheInterceptor` cache GET responses trong Redis với key = `path?sorted_query_string`:

```typescript
// Chỉ cache GET, key sort theo alphabet để đảm bảo consistency
trackBy(context): string {
    if (method !== 'GET') return undefined
    const entries = Object.keys(query).sort().flatMap(...)
    return `${path}?${new URLSearchParams(entries).toString()}`
}
```

`?page=0&pageSize=10` và `?pageSize=10&page=0` cho cùng cache key — tránh cache miss do order query params khác nhau.

### 11.3 Vote count cache

```typescript
// Sau closeElection: cache vote count 7 ngày
await this.cacheManager.set(`election:vote:count:${id}`, voteCount, 7 * 24 * 60 * 60 * 1000)

// reveal-vote: đọc từ cache, không query MongoDB mỗi lần
const cached = await this.cacheManager.get(`election:vote:count:${id}`)
if (cached !== null) return cached
// Chỉ đếm vote CONFIRMED để khớp stats.TotalVoteCount trên chain (xem §5.8)
return await this.prisma.vote.count({ where: { electionId: id, status: VoteStatus.CONFIRMED } })
```

### 11.4 MongoDB Index strategy

```
elections:   index(status, startDate, endDate)  → filter elections by status + date range
election_voters: unique(electionId, voterId)     → O(1) lookup + dedup
             index(voterId, electionId)          → find elections of a voter
votes:       unique(electionId, voterId)         → O(1) dedup check
             unique(electionId, blindedCommitment)
             index(electionId, createdAt)        → ordered retrieval for merkle tree
             index(status, createdAt)            → reconciler quét vote PENDING_CHAIN cũ (§5.8)
revealed_votes: unique(electionId, revealKey)   → O(1) replay prevention
             unique(electionId, sig.h, sig.sPrime)
             index(electionId)                   → tally per-candidate qua aggregateRaw $unwind '$candidateIds'
```

### 11.5 Parallel queries

Mọi nơi có thể song song hóa đều dùng `Promise.all`:

```typescript
// Reveal-vote: 3 queries parallel
const [dbRevealCount, dbVoteCount, fabricRes] = await Promise.all([
    this.prisma.revealedVote.count({ where: { electionId } }),
    lastValueFrom(this.coordinatorClient.send(GET_VOTE_COUNT, { id })),
    this.fabricClient.getAuditCounts(electionId)
])
```

---

## 12. Bổ sung đề xuất

Các điểm có thể bổ sung để tăng cường bảo mật và hiệu năng trong triển khai thực tế:

### 12.1 mTLS cho TCP nội bộ + Redis ✅ Đã triển khai

~~Hiện tại TCP giữa các service không có transport-layer encryption.~~

mTLS đã được triển khai đầy đủ cho **toàn bộ kênh nội bộ** (TCP RPC + Redis event bus + Redis cache). Xem chi tiết tại **§9.7** và `MTLS.md`.

### 12.2 Distributed Signing Node

Hiện tại 3 signing node có thể chạy trên cùng một máy. Để chống **single point of failure**:

- Mỗi node chạy trên máy chủ vật lý khác hoặc availability zone khác
- Key share của mỗi node chỉ được lưu trên máy đó (không backup tập trung)
- Coordinator vẫn hoạt động ngay cả khi 1 node tạm thời không phản hồi (cần cơ chế threshold signature `t-of-n`, ví dụ 2-of-3)

### 12.3 Threshold Signing (2-of-3)

Hiện tại: cần cả 3 node. Cải thiện: **Threshold Schnorr** (2-of-3):

- Voter vẫn nhận chữ ký hợp lệ ngay cả khi 1 node offline
- Tăng availability từ `P(3/3 up)` → `P(≥2/3 up)`

### 12.4 Audit Log bất biến

Ghi mọi action (login, start election, submit vote, reveal) vào một append-only audit log (Fabric event, Kafka, hoặc PostgreSQL với INSERT-only table). Cho phép forensic sau sự cố.

### 12.5 Fabric TLS giữa Peer và Chaincode

Hiện tại external chaincode chạy với `TLSProps: { Disabled: true }`. Trong production, bật TLS:

```go
TLSProps: shim.TLSProperties{
    Disabled:   false,
    Key:        tlsKey,
    Cert:       tlsCert,
    ClientCACerts: caCert,
}
```

### 12.6 HTTPS cho BFF và Reveal-Vote

Hiện tại HTTP plaintext. Production cần terminate TLS tại nginx/load balancer trước BFF, hoặc bật HTTPS trực tiếp trong NestJS.

### 12.7 Secret Management

`ENCRYPTION_KEY` (mỗi signing node khác nhau), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FABRIC_PASSWORD`, và đặc biệt là **`certs/ca.key`** (CA private key — nếu lộ, kẻ tấn công có thể cấp cert giả mạo cho mọi service trong mesh) nên được quản lý bởi **HashiCorp Vault** hoặc **AWS/GCP Secrets Manager** thay vì lưu trong `.env` file hay thư mục `certs/` trên disk. Lý tưởng nhất là giữ `ca.key` offline sau khi sinh xong cert.
