# Thiết kế Backup/Restore Vote Secrets

## 1. Tổng quan kiến trúc

Tính năng cho phép voter sao lưu toàn bộ vote-secret (tham số bỏ phiếu Schnorr) lên server và khôi phục về thiết bị mới. Thiết kế tuân theo nguyên tắc **zero-knowledge**: server lưu dữ liệu mờ (không thể giải mã), chỉ voter biết PIN mới khôi phục được.

Có **hai lớp mã hóa** chồng nhau:

```
PlaintextObj (VoteSecretBackupMap)
    │
    ▼  [Lớp 1 – Client] PBKDF2-SHA256(PIN, clientSalt, 100000) → AES-256-GCM
    │
BackupEnvelope (JSON string)          ← server nhận cái này, không parse được
    │
    ▼  [Lớp 2 – Server] argon2id(BACKUP_SECRET, serverSalt) → AES-256-GCM
    │
cipher (base64)                       ← ghi vào MongoDB
```

---

## 2. Dữ liệu được backup

### Kiểu `VoteSecretBackupMap` (`mobile/types/backup.ts`)

```typescript
// Map từ voteId → secrets của phiếu đó
type VoteSecretBackupMap = Record<string, VoteSecretBackupEntry>

interface VoteSecretBackupEntry {
    params: VoteParamsSecret | null // tham số Schnorr để prove/reveal
    status: VoteStatus | null // trạng thái đã reveal chưa, chọn candidateId nào
}

interface VoteParamsSecret {
    h: string // commitment blinding factor (hex)
    sPrime: string // Schnorr signature component (hex)
}

interface VoteStatus {
    candidateIds: string[] // danh sách ứng viên đã chọn (multi-candidate)
    revealed: boolean // true nếu đã reveal phiếu lên chain
}
```

---

## 3. Lớp 1 — Client-side encryption (Zero-Knowledge)

**File:** `mobile/lib/backup-crypto.ts`  
**Thư viện:** `@noble/ciphers`, `@noble/hashes`

### 3.1 Cấu trúc BackupEnvelope

```typescript
interface BackupEnvelope {
    v: number // version = 1
    kdf: {
        algo: 'PBKDF2-SHA256'
        iter: number // 100000 vòng
        salt: string // 16 bytes ngẫu nhiên, hex
    }
    enc: {
        algo: 'AES-256-GCM'
        iv: string // 12 bytes nonce, hex
        ct: string // ciphertext + GCM auth tag 16B, hex
    }
}
```

### 3.2 Mã hóa (Backup)

```
PIN (6 số, string)
clientSalt (16B random)
    │
    ▼ PBKDF2-SHA256, 100 000 vòng, dkLen=32
key (32B)
    │
    ▼ AES-256-GCM, iv (12B random)
ct = encrypt(JSON.stringify(VoteSecretBackupMap))
    ↳ ct bao gồm 16B GCM auth tag ở cuối (noble/ciphers mặc định)
    │
    ▼ JSON.stringify
envelope (string) → gửi lên server qua POST /api/v1/identity/me/vote-secret-backup
```

### 3.3 Giải mã (Restore)

```
payload (string) từ server
    │ JSON.parse
BackupEnvelope
    │
    ▼ PBKDF2-SHA256 với kdf.salt, kdf.iter
key (32B)
    │
    ▼ AES-256-GCM decrypt với enc.iv
    ├─ GCM auth fail → ném Error('Mã PIN không đúng')   ← PIN sai bị phát hiện ở đây
    └─ OK → JSON.parse → VoteSecretBackupMap
```

**Đảm bảo zero-knowledge:** server nhận `envelope` nguyên khối dạng JSON string, không parse, không biết cấu trúc bên trong. Chỉ khi client có đúng PIN mới decrypt được.

---

## 4. Lớp 2 — Server-side at-rest encryption

**File:** `apps/identity/src/app/backup/app.service.ts`  
**Thư viện:** `argon2`, Node.js built-in `crypto`

### 4.1 Key derivation

```
BACKUP_SECRET (env var, chuỗi mạnh)
serverSalt (16B random, per-record)
    │
    ▼ argon2id, hashLength=32, raw=true
atKey (32B)
    │
    ▼ AES-256-GCM, iv (12B random)
cipher = encrypt(envelope JSON string)
```

`BACKUP_SECRET` được đặt trong env identity service. Fallback `'default_backup_secret'` chỉ dùng ở dev — **phải đặt giá trị mạnh ở production**.

### 4.2 Lý do dùng argon2id thay PBKDF2

Argon2id memory-hard: brute-force BACKUP_SECRET tốn RAM nhiều, phù hợp at-rest key derivation phía server. Client dùng PBKDF2 vì môi trường mobile không kiểm soát RAM.

---

## 5. Schema MongoDB

**Collection:** `vote_secret_backups`  
**Prisma model:** `VoteSecretBackup`

| Field        | Type     | Mô tả                                            |
| ------------ | -------- | ------------------------------------------------ |
| `id`         | ObjectId | PK, auto                                         |
| `userId`     | ObjectId | FK → User, **unique** (1 user 1 bản ghi, upsert) |
| `cipher`     | String   | Ciphertext của envelope JSON (base64)            |
| `iv`         | String   | Server AES-256-GCM nonce 12B (base64)            |
| `authTag`    | String   | Server GCM auth tag 16B (base64)                 |
| `serverSalt` | String   | argon2id salt 16B để dẫn at-rest key (base64)    |
| `version`    | Int      | Phiên bản schema, hiện = 1                       |
| `createdAt`  | DateTime | Auto                                             |
| `updatedAt`  | DateTime | Auto update                                      |

Mỗi lần backup ghi đè (`upsert where userId`) — chỉ giữ bản mới nhất.

---

## 6. Luồng Backup (Save)

```
[Mobile] User nhấn "Sao lưu & Đăng xuất" → nhập PIN 6 số
    │
    ├─ collectVoteSecretsForBackup()          ← đọc SecureStore, list key qua voteSecretIndex
    │
    ├─ encryptBackup(secrets, pin)            ← lớp 1: PBKDF2 + AES-GCM → envelope JSON string
    │
    ├─ POST /api/v1/identity/me/vote-secret-backup  { payload: envelopeString }
    │       ↓ (BFF nhận, lấy userId từ JWT @CurrentUser)
    ├─ identity service: saveVoteSecretBackup({ userId, payload })
    │       ├─ serverSalt = random 16B
    │       ├─ iv = random 12B
    │       ├─ atKey = argon2id(BACKUP_SECRET, serverSalt)    ← lớp 2
    │       ├─ cipher = AES-256-GCM(atKey, iv).encrypt(payload)
    │       └─ upsert vào MongoDB { cipher, iv, authTag, serverSalt, version }
    │
    ├─ Toast "Đã sao lưu" → clearAllSecureData() → logout → redirect /login
```

---

## 7. Luồng Restore

```
[Mobile] Màn hình đăng nhập / restore sheet → nhập PIN 6 số
    │
    ├─ GET /api/v1/identity/me/vote-secret-backup
    │       ↓ (BFF lấy userId từ JWT)
    ├─ identity service: getVoteSecretBackup({ userId })
    │       ├─ findUnique where userId
    │       ├─ atKey = argon2id(BACKUP_SECRET, record.serverSalt)
    │       ├─ decipher = AES-256-GCM(atKey, record.iv, record.authTag)
    │       └─ payload = decipher.decrypt(record.cipher) → envelope JSON string
    │
    ├─ res.data.payload (envelope string, vẫn mờ với server)
    │
    ├─ decryptBackup(payload, pin)             ← lớp 1 giải mã tại client
    │       ├─ PIN sai → GCM auth fail → Error('Mã PIN không đúng')
    │       └─ PIN đúng → VoteSecretBackupMap
    │
    └─ restoreVoteSecretsFromBackup(secrets)   ← ghi lại vào SecureStore
```

---

## 8. Message patterns (giao tiếp BFF ↔ Identity qua TCP microservice)

| Pattern constant          | Value                       | Chiều          |
| ------------------------- | --------------------------- | -------------- |
| `SAVE_VOTE_SECRET_BACKUP` | `'backup.save_vote_secret'` | BFF → Identity |
| `GET_VOTE_SECRET_BACKUP`  | `'backup.get_vote_secret'`  | BFF → Identity |

---

## 9. Bảo mật tóm tắt

| Mối đe dọa                   | Biện pháp                                                              |
| ---------------------------- | ---------------------------------------------------------------------- |
| Server bị xâm phạm (DB leak) | Lớp 1 client-side ZK: server không có PIN, không giải được             |
| Brute-force BACKUP_SECRET    | argon2id memory-hard per-record; mỗi record có serverSalt riêng        |
| Replay / tamper envelope     | GCM auth tag: sửa cipher → auth fail khi restore                       |
| PIN brute-force ở client     | PBKDF2 100k vòng; không có rate-limit server-side vì kiểm tra ở client |
| Payload bất thường           | DTO validate `MaxLength(256KB)`                                        |
| Thiếu env BACKUP_SECRET      | Fallback dev-only; production phải đặt giá trị mạnh                    |
