# E-Voting Backend — Tài liệu kiến trúc & luồng hoạt động

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Bảng service & port](#2-bảng-service--port)
3. [Giao tiếp giữa các service](#3-giao-tiếp-giữa-các-service)
4. [Cơ sở dữ liệu từng service](#4-cơ-sở-dữ-liệu-từng-service)
5. [Luồng hoạt động chi tiết theo chức năng](#5-luồng-hoạt-động-chi-tiết-theo-chức-năng)
    - 5.1 [Đăng nhập & xác thực](#51-đăng-nhập--xác-thực)
    - 5.2 [Quản lý người dùng (ADMIN)](#52-quản-lý-người-dùng-admin)
    - 5.3 [Tạo cuộc bầu cử](#53-tạo-cuộc-bầu-cử)
    - 5.4 [Thêm / xóa ứng viên (PENDING)](#54-thêm--xóa-ứng-viên-khỏi-cuộc-bầu-cử-pending)
    - 5.5 [Thêm / xóa cử tri (PENDING)](#55-thêm--xóa-cử-tri-khỏi-cuộc-bầu-cử-pending)
    - 5.6 [Bắt đầu cuộc bầu cử (Start Election)](#56-bắt-đầu-cuộc-bầu-cử-start-election)
    - 5.7 [Quy trình bỏ phiếu mù (Blind Voting)](#57-quy-trình-bỏ-phiếu-mù-blind-voting)
    - 5.8 [Đóng cuộc bầu cử (Close Election)](#58-đóng-cuộc-bầu-cử-close-election)
    - 5.9 [Giải mù phiếu bầu (Reveal Vote)](#59-giải-mù-phiếu-bầu-reveal-vote)
    - 5.10 [Xác minh phiếu bầu (Verify Vote)](#510-xác-minh-phiếu-bầu-verify-vote)
    - 5.11 [Xem kết quả bầu cử (Tally Result)](#511-xem-kết-quả-bầu-cử-tally-result)
6. [Giao tiếp với Chainlaunch (Hyperledger Fabric)](#6-giao-tiếp-với-chainlaunch-hyperledger-fabric)
7. [Bảo mật & chống gian lận](#7-bảo-mật--chống-gian-lận)
8. [Thư viện dùng chung (libs)](#8-thư-viện-dùng-chung-libs)

---

## 1. Tổng quan kiến trúc

Hệ thống backend được tổ chức theo kiến trúc **NestJS microservices trong Nx monorepo**. Toàn bộ giao tiếp nội bộ giữa các service dùng **TCP transport** của NestJS. Chỉ service `bff` (Backend For Frontend) phơi HTTP ra ngoài. Service `reveal-vote` phơi thêm một HTTP port riêng để nhận request giải mù ẩn danh.

```
Client Web / Admin Web
        │
        │ HTTP/REST (JWT Bearer Token)
        ▼
┌──────────────────────────────────────────────────┐
│                  BFF (:3000 HTTP, :3301 TCP)     │
│  - Xác thực JWT                                  │
│  - Rate limiting (Throttler)                     │
│  - Proxy request → Identity / Coordinator        │
└──────────────┬────────────────┬─────────────────┘
               │ TCP            │ TCP
     ┌─────────▼──────┐   ┌────▼───────────────────┐
     │  Identity      │   │  Coordinator            │
     │  (:3302)       │   │  (:3303)                │
     │  - Auth        │   │  - Election CRUD        │
     │  - User CRUD   │   │  - Vote session         │
     │  - JWT issue   │   │  - Sign orchestrate     │
     │  - Prisma/Mongo│   │  - Fabric client        │
     └────────────────┘   └──┬──────────────────────┘
                             │ TCP (broadcast tới 3 node)
               ┌─────────────┼──────────────────────┐
               │             │                      │
     ┌─────────▼──┐  ┌───────▼────┐  ┌─────────────▼─┐
     │ Signing    │  │ Signing    │  │  Signing        │
     │ Node 1     │  │ Node 2     │  │  Node 3         │
     │ (:3304)    │  │ (:3305)    │  │  (:3306)        │
     └────────────┘  └────────────┘  └─────────────────┘

Client (anonymous) ─── HTTP ──→ Reveal-Vote (:3308 HTTP, :3307 TCP)
                                   │ TCP → Coordinator
                                   │ TCP → Identity
                                   │ HTTP → Chainlaunch

   (Coordinator + Reveal-Vote) ─── HTTP REST ──→ Chainlaunch/Fabric (:8100)
```

---

## 2. Bảng service & port

| Service          | Giao thức    | Port mặc định             | Vai trò                                      |
| ---------------- | ------------ | ------------------------- | -------------------------------------------- |
| `bff`            | HTTP + TCP   | HTTP `:3000`, TCP `:3301` | Gateway duy nhất nhận request từ web client  |
| `identity`       | TCP only     | `:3302`                   | Quản lý user, auth, phát hành JWT            |
| `coordinator`    | TCP only     | `:3303`                   | Quản lý election, điều phối voting & signing |
| `signing-node-1` | TCP only     | `:3304`                   | Ký partial EC-Schnorr node 1                 |
| `signing-node-2` | TCP only     | `:3305`                   | Ký partial EC-Schnorr node 2                 |
| `signing-node-3` | TCP only     | `:3306`                   | Ký partial EC-Schnorr node 3                 |
| `reveal-vote`    | HTTP + TCP   | HTTP `:3308`, TCP `:3307` | Giải mù phiếu, kiểm phiếu, audit             |
| `MongoDB`        | MongoDB wire | `:27017`                  | Database chung (replica set rs0)             |
| `Redis`          | Redis        | `:6379`                   | Cache session bỏ phiếu, vote count           |
| `Chainlaunch`    | HTTP REST    | `:8100`                   | Hyperledger Fabric API gateway               |

---

## 3. Giao tiếp giữa các service

### 3.1 Giao thức TCP NestJS (Message Pattern)

Tất cả giao tiếp nội bộ dùng `@MessagePattern` + `ClientProxy.send()` (request-response) hoặc `ClientProxy.emit()` (fire-and-forget). Các pattern được định nghĩa tại `libs/constants/src/lib/message-patterns.constant.ts`.

**Identity Message Patterns:**

| Pattern                   | Sender                    | Receiver | Mô tả                                 |
| ------------------------- | ------------------------- | -------- | ------------------------------------- |
| `auth.sign_in`            | BFF                       | Identity | Đăng nhập, trả access + refresh token |
| `auth.refresh_token`      | BFF                       | Identity | Làm mới access token                  |
| `auth.sign_out`           | BFF                       | Identity | Đăng xuất, vô hiệu hóa refresh token  |
| `user.create_user`        | BFF                       | Identity | Tạo 1 user                            |
| `user.create_bulk_users`  | BFF                       | Identity | Tạo nhiều user cùng lúc               |
| `user.delete_bulk_users`  | BFF                       | Identity | Xóa nhiều user                        |
| `user.get_user_by_id`     | BFF / Coordinator         | Identity | Lấy thông tin 1 user                  |
| `user.get_users_by_ids`   | Coordinator / Reveal-Vote | Identity | Lấy nhiều user theo danh sách ID      |
| `user.filter_users`       | BFF                       | Identity | Tìm kiếm / lọc user theo điều kiện    |
| `user.disable_user_by_id` | BFF                       | Identity | Vô hiệu hóa user (isActive = false)   |
| `user.enable_user_by_id`  | BFF                       | Identity | Kích hoạt lại user                    |
| `user.update_user_by_id`  | BFF                       | Identity | Cập nhật thông tin user               |
| `user.delete_user_by_id`  | BFF                       | Identity | Xóa user                              |

**Coordinator Message Patterns:**

| Pattern                                    | Sender                 | Receiver    | Mô tả                                     |
| ------------------------------------------ | ---------------------- | ----------- | ----------------------------------------- |
| `election.filter_elections`                | BFF                    | Coordinator | Lọc / tìm kiếm danh sách election         |
| `election.create_election`                 | BFF                    | Coordinator | Tạo election mới                          |
| `election.start_election`                  | BFF                    | Coordinator | Bắt đầu election (sinh khóa, ACTIVE)      |
| `election.end_election`                    | BFF                    | Coordinator | Đóng election (Merkle root, CLOSED)       |
| `election.complete_election`               | Reveal-Vote            | Coordinator | Hoàn thành election sau khi reveal đủ     |
| `election.get_election_by_id`              | BFF / Reveal-Vote      | Coordinator | Lấy chi tiết một election                 |
| `election.get_election_all_info`           | BFF                    | Coordinator | Lấy chi tiết đầy đủ election (kèm voters) |
| `election.add_candidates_to_election`      | BFF                    | Coordinator | Thêm danh sách ứng viên vào election      |
| `election.delete_candidates_from_election` | BFF                    | Coordinator | Xóa danh sách ứng viên khỏi election      |
| `election.add_voters_to_election`          | BFF                    | Coordinator | Thêm danh sách voter vào election         |
| `election.delete_voters_from_election`     | BFF                    | Coordinator | Xóa danh sách voter khỏi election         |
| `election.get_voter_in_election`           | Coordinator (internal) | Coordinator | Kiểm tra voter thuộc election             |
| `election.get_elections_by_voter_id`       | BFF                    | Coordinator | Lấy danh sách election của một voter      |
| `election.get_elections_by_candidate_id`   | BFF                    | Coordinator | Lấy danh sách election của một candidate  |
| `vote.start_vote_session`                  | BFF                    | Coordinator | Khởi tạo phiên bỏ phiếu                   |
| `vote.sign_blinded_vote`                   | BFF                    | Coordinator | Điều phối ký phiếu mù tập thể             |
| `vote.submit_blinded_commitment`           | BFF                    | Coordinator | Nộp phiếu mù đã ký lên chain + DB         |
| `vote.get_vote_count`                      | Reveal-Vote            | Coordinator | Đếm tổng số phiếu đã nộp                  |
| `vote.filter_votes`                        | BFF                    | Coordinator | Lọc danh sách phiếu trong election        |
| `vote.verify_vote`                         | BFF                    | Coordinator | Xác minh phiếu bầu đa tầng                |

**Signing Node Message Patterns:**

| Pattern                             | Sender      | Receiver      | Mô tả                                     |
| ----------------------------------- | ----------- | ------------- | ----------------------------------------- |
| `signing_node.generate_key_pair`    | Coordinator | Signing Nodes | Sinh cặp khóa EC-Schnorr cho election     |
| `signing_node.create_commitment`    | Coordinator | Signing Nodes | Sinh commitment (nonce k, R = k·G)        |
| `signing_node.sign_partial`         | Coordinator | Signing Nodes | Tính partial signature s_i                |
| `signing_node.delete_session_nonce` | Coordinator | Signing Nodes | Xóa nonce (fire-and-forget, chống reuse)  |
| `signing_node.cleanup_election`     | Coordinator | Signing Nodes | Dọn dẹp key và signed_voters sau election |

### 3.2 Giao tiếp Client ↔ BFF (HTTP REST)

Client (Web/Admin) chỉ giao tiếp với `bff` qua HTTP. Mọi request đều đi qua pipeline:

1. **Helmet** — bảo vệ HTTP headers
2. **CORS** — chỉ chấp nhận origin được cấu hình
3. **Throttler** — rate limiting (mặc định 100 req/60s)
4. **AuthenticatorGuard** — verify JWT access token (trừ route `@Public()`)
5. **AuthorizationGuard** — kiểm tra `@Roles('ADMIN')` hoặc `@Roles('VOTER')`

- **Base URL:** `http://localhost:3000/api/v1`
- **Swagger UI:** `http://localhost:3000/api/v1/docs`

### 3.3 Giao tiếp Client ↔ Reveal-Vote (HTTP REST, anonymous)

Endpoint reveal của `reveal-vote` nhận request trực tiếp từ voter mà **không yêu cầu JWT**. Đây là thiết kế cố ý: server không biết voter nào đang reveal phiếu nào, bảo vệ tính ẩn danh.

- **Base URL:** `http://localhost:3308/reveal-vote`

---

## 4. Cơ sở dữ liệu từng service

Mỗi service sử dụng **MongoDB database riêng biệt** (logical separation). Tất cả chia sẻ cùng một MongoDB instance chạy trong Docker với replica set `rs0` (yêu cầu để Prisma dùng transactions).

### Identity DB

```
Collection: users
{
  _id:       ObjectId,
  email:     String (unique),
  password:  String (bcrypt hash),
  name:      String,
  role:      "ADMIN" | "VOTER" | "CANDIDATE",
  isActive:  Boolean (default: true),
  createdAt: DateTime,
  updatedAt: DateTime
}
Index: role
```

### Coordinator DB

```
Collection: elections
{
  _id:                  ObjectId,
  name:                 String (unique),
  status:               "PENDING" | "ACTIVE" | "CLOSING" | "CLOSED" | "COMPLETED",
                                    // CLOSING = trạng thái trung gian khi đóng election (Write-DB-First, xem §5.8)
  candidateIds:         String[],
  maxSelectableCandidates: Int,     // số ứng viên tối đa được chọn mỗi lá phiếu (default 1); backend enforce ở reveal
  collectivePublicKey:  String?,   // EC point hex 66 chars (sinh khi START)
  merkleRoot:           String?,   // SHA256 hex 64 chars (sinh khi CLOSE)
  blockchainRef:        String?,   // Fabric txID của CommitMerkleRoot (ghi khi confirm CLOSED)
  startDate:            DateTime?,
  endDate:              DateTime?,
  createdAt:            DateTime,
  updatedAt:            DateTime
}
Index: (status, startDate, endDate)

Collection: election_voters
{
  _id:        ObjectId,
  electionId: ObjectId,
  voterId:    ObjectId,
  votes:      Vote[]
}
Unique: (electionId, voterId)
Index:  (voterId, electionId)

Collection: votes
{
  _id:               ObjectId,
  electionId:        ObjectId,
  voterId:           ObjectId,     // ElectionVoter._id (dùng chặn double-vote)
  blindedCommitment: String,       // SHA256 hex 64 chars của điểm mù C'
  status:            "PENDING_CHAIN" | "CONFIRMED",  // Write-DB-First: ghi PENDING_CHAIN trước, CONFIRMED sau khi chain xác nhận (xem §5.7)
  blockchainRef:     String?,      // Fabric txID của SubmitVote (null khi PENDING_CHAIN, ghi khi CONFIRMED)
  createdAt:         DateTime,
  updatedAt:         DateTime
}
Unique: (electionId, voterId)           // chặn double-vote (PENDING_CHAIN cũng giữ slot)
Unique: (electionId, blindedCommitment) // đảm bảo commitment unique
Index:  (electionId, createdAt)
Index:  (status, createdAt)             // reconciler quét các vote PENDING_CHAIN cũ
```

### Signing Node DB (mỗi node có database riêng)

```
Collection: key_pairs
{
  _id:        ObjectId,
  electionId: ObjectId (unique),
  publicKey:  String,   // EC point hex 66 chars
  privateKey: String,   // AES-256-GCM encrypted scalar hex
  createdAt:  DateTime
}

Collection: signed_voters
{
  _id:        ObjectId,
  electionId: ObjectId,
  voterId:    ObjectId,
  sessionId:  String,
  signedAt:   DateTime
}
Unique: (electionId, voterId)   // mỗi voter chỉ được node này ký 1 lần
```

### Reveal-Vote DB

```
Collection: revealed_votes
{
  _id:          ObjectId,
  electionId:   ObjectId,
  candidateIds: ObjectId[], // các ứng viên đã chọn (canonical: dedupe + sort); plaintext nhưng không có voterId. 1 lá phiếu = 1 record
  revealKey:    String,     // SHA256(h_bytes || sPrime_bytes) hex 64 chars
  signature: {
    h:      String,         // scalar hex 64 chars
    sPrime: String          // scalar hex 64 chars
  },
  blockchainRef: String?,   // Fabric txID của RevealVoteCompact (null khi record được phục hồi qua Option B, xem §5.9)
  revealedAt:    DateTime
}
Unique: (electionId, revealKey)
Unique: (electionId, signature.h, signature.sPrime)
Index:  (electionId)   // tally per-candidate qua aggregateRaw $unwind '$candidateIds'
```

---

## 5. Luồng hoạt động chi tiết theo chức năng

### 5.1 Đăng nhập & xác thực

```
POST /api/v1/identity/auth/sign-in
Body: { email, password }
```

```
Client
  │ POST /api/v1/identity/auth/sign-in
  ▼
BFF
  │ Route @Public() → bypass JWT guard
  │ Kiểm tra Origin: VOTER/CANDIDATE từ Admin Web origin → 401
  │ TCP send → auth.sign_in { email, password }
  ▼
Identity
  │ Tìm user theo email
  │ bcrypt.compare(password, user.password)
  │ Phát hành accessToken (JWT, TTL ngắn, ký bằng JWT_ACCESS_SECRET)
  │ Phát hành refreshToken (JWT, TTL dài, lưu hash vào Redis)
  │ Trả { accessToken, refreshToken, role, userId, name }
  ▼
BFF → Client: 200 OK + tokens
```

**Xác thực mọi request có auth:**

```
Header: Authorization: Bearer <accessToken>
  ▼
BFF AuthenticatorGuard
  │ JWT.verify(token, JWT_ACCESS_SECRET) → { userId, role }
  │ Gắn vào request context
  ▼
AuthorizationGuard
  │ So khớp @Roles với role của user
  │ Sai role → 403 Forbidden
  ▼
Handler nhận @CurrentUser() user: { userId, role }
```

**Làm mới token:**

```
POST /api/v1/identity/auth/refresh-token
Body: { refreshToken }
→ BFF → Identity → verify refresh token → phát accessToken mới
```

**Lấy hồ sơ của người dùng đang đăng nhập:**

```
GET /api/v1/identity/auth/me
Header: Authorization: Bearer <accessToken>
```

```
Client
  │ GET /api/v1/identity/auth/me
  ▼
BFF
  │ AuthenticatorGuard verify accessToken → { userId, role }
  │ TCP send → user.get_user_by_id { id: userId }
  ▼
Identity
  │ users.findUnique({ id: userId })
  │ Trả thông tin user (omit password)
  ▼
BFF → Client: 200 OK + { id, email, name, role, isActive, ... }
```

> Endpoint dành cho cả `ADMIN` và `VOTER` / `CANDIDATE`: bất kỳ user đã xác thực JWT đều có quyền xem hồ sơ của chính mình. BFF lấy `userId` từ JWT trong `AuthenticatorGuard`, không cho phép truyền tham số từ client.

---

### 5.2 Quản lý người dùng (ADMIN)

Tất cả API yêu cầu role `ADMIN`. BFF nhận HTTP rồi forward qua TCP đến Identity.

| HTTP Endpoint                           | TCP Pattern               | Mô tả                                             |
| --------------------------------------- | ------------------------- | ------------------------------------------------- |
| `POST /identity/user/create-user`       | `user.create_user`        | Tạo 1 user, bcrypt hash password                  |
| `POST /identity/user/create-bulk-users` | `user.create_bulk_users`  | Bulk create, trả `{ count }`                      |
| `DELETE /identity/user/bulk`            | `user.delete_bulk_users`  | Bulk delete theo IDs                              |
| `GET /identity/user/filter`             | `user.filter_users`       | Tìm kiếm paginated                                |
| `GET /identity/user/:id`                | `user.get_user_by_id`     | Lấy thông tin 1 user                              |
| `GET /identity/user/:id/all`            | (BFF aggregate)           | Lấy thông tin user + danh sách election liên quan |
| `PATCH /identity/user/:id`              | `user.update_user_by_id`  | Cập nhật email, name, role                        |
| `PATCH /identity/user/:id/disable`      | `user.disable_user_by_id` | isActive = false                                  |
| `PATCH /identity/user/:id/enable`       | `user.enable_user_by_id`  | isActive = true                                   |
| `DELETE /identity/user/:id`             | `user.delete_user_by_id`  | Xóa user                                          |

---

### 5.3 Tạo cuộc bầu cử

```
POST /api/v1/coordinator/election/create
Roles: ADMIN
Body: { name, candidateIds: ["id1", "id2"], maxSelectableCandidates?: 1 }
```

```
BFF → TCP send: election.create_election { name, candidateIds, maxSelectableCandidates }
  ▼
Coordinator
  │ TCP send: user.get_users_by_ids { ids: candidateIds, role: "CANDIDATE" }
  ▼
Identity → trả danh sách candidate users
  ▼
Coordinator
  │ Kiểm tra tất cả IDs tồn tại, role = CANDIDATE, isActive = true
  │ maxSelectableCandidates: default 1; validate 1 <= max <= candidateIds.length
  │ MongoDB: election.create { name, candidateIds, maxSelectableCandidates, status: PENDING }
  │ Omit collectivePublicKey, blockchainRef, merkleRoot khỏi response
  │ Trả election object
  ▼
BFF → Client: 201 Created
```

---

### 5.4 Thêm / xóa ứng viên khỏi cuộc bầu cử (PENDING)

```
POST   /api/v1/coordinator/election/:id/add-candidates
DELETE /api/v1/coordinator/election/:id/delete-candidates
Roles: ADMIN
Body:  { candidateIds: ["id1", ...] }
```

```
BFF → TCP send: election.add_candidates_to_election { id, candidateIds }
             / election.delete_candidates_from_election { id, candidateIds }
  ▼
Coordinator
  │ Kiểm tra election.status = PENDING
  │ TCP send: user.get_users_by_ids { ids: candidateIds, role: "CANDIDATE" }
  ▼
Identity → trả danh sách candidate users
  ▼
Coordinator
  │ Kiểm tra tất cả IDs tồn tại, role = CANDIDATE, isActive = true
  │ Thêm: append candidateIds vào election.candidateIds (bỏ qua trùng)
  │ Xóa:  loại candidateIds khỏi election.candidateIds
  │ Trả election đã cập nhật
  ▼
BFF → Client: 201 Created / 200 OK
```

---

### 5.5 Thêm / xóa cử tri khỏi cuộc bầu cử (PENDING)

```
POST   /api/v1/coordinator/election/:id/add-voters
DELETE /api/v1/coordinator/election/:id/delete-voters
Roles: ADMIN
Body:  { voterIds: ["id1", ...] }
```

```
BFF → TCP send: election.add_voters_to_election { id, voterIds }
             / election.delete_voters_from_election { id, voterIds }
  ▼
Coordinator
  │ Kiểm tra election.status = PENDING
  │ TCP send: user.get_users_by_ids { ids: voterIds, role: "VOTER" }
  ▼
Identity → trả danh sách voter users
  ▼
Coordinator
  │ Kiểm tra tất cả IDs tồn tại, role = VOTER, isActive = true
  │ Thêm — Transaction:
  │   Re-validate status = PENDING (chống race condition)
  │   createMany ElectionVoter { electionId, voterId }
  │ Xóa — Transaction:
  │   Re-validate status = PENDING
  │   deleteMany ElectionVoter { electionId, voterId IN voterIds }
  │ Trả election + electionVoters
  ▼
BFF → Client: 201 Created / 200 OK
```

---

### 5.6 Bắt đầu cuộc bầu cử (Start Election)

Bước này **sinh khóa EC-Schnorr tập thể** cho election.

```
PATCH /api/v1/coordinator/election/:id/start
Roles: ADMIN
```

```
BFF → TCP send: election.start_election { id }
  ▼
Coordinator
  │ Kiểm tra: status = PENDING, >= 2 candidates, >= 3 voters
  │
  │ [Ngoài transaction — tránh giữ lock]
  │ TCP send (parallel) tới Signing Node 1, 2, 3:
  │   signing_node.generate_key_pair { electionId }
  ▼
Signing Node 1, 2, 3 (đồng thời)
  │ Mỗi node:
  │   - Idempotent: nếu đã có KeyPair → trả publicKey cũ (chống mất key khi retry)
  │   - Sinh d_i ∈ [1, n-1]  (private key scalar)
  │   - Tính P_i = d_i · G   (public key point secp256k1)
  │   - Mã hóa d_i bằng AES-256-GCM với ENCRYPTION_KEY
  │   - MongoDB: keyPair.create { electionId, publicKey: P_i hex, privateKey: encrypted }
  │   - Trả { publicKey: P_i hex 66 chars }
  ▼
Coordinator
  │ Nhận [P_1, P_2, P_3]
  │ P_agg = P_1 + P_2 + P_3  (EC point addition)
  │ collectivePublicKeyHex = pointToHex(P_agg)  // 66 chars compressed
  │
  │ [Transaction ngắn]
  │ Re-validate status = PENDING
  │ election.update {
  │   status: ACTIVE,
  │   startDate: now(),
  │   collectivePublicKey: collectivePublicKeyHex
  │ }
  │ Trả election (omit blockchainRef, merkleRoot)
  ▼
BFF → Client: 200 OK + election data
```

---

### 5.7 Quy trình bỏ phiếu mù (Blind Voting)

Gồm **3 request API** riêng biệt. Giữa các bước, client thực hiện phép toán mật mã trong browser.

#### Bước 1 — Khởi tạo phiên (`start-session`)

```
POST /api/v1/coordinator/vote/:electionId/start-session
Roles: VOTER
```

```
BFF
  │ Lấy voterId từ JWT
  │ TCP send: vote.start_vote_session { electionId, voterId }
  ▼
Coordinator
  │ Kiểm tra election.status = ACTIVE
  │ Kiểm tra voter thuộc election và isActive
  │ Kiểm tra voter chưa có Vote record (chưa vote)
  │ Nếu có session cũ trong Redis:
  │   emit (fire-and-forget) → signing nodes:
  │     signing_node.delete_session_nonce { sessionId: oldId }
  │   (phòng nonce reuse attack khi voter bắt đầu phiên mới)
  │
  │ sessionId = UUID v4
  │ TCP send (parallel) → Signing Node 1, 2, 3:
  │   signing_node.create_commitment { sessionId, electionId }
  ▼
Signing Node 1, 2, 3 (đồng thời)
  │ Mỗi node:
  │   - Lấy publicKey P_i từ MongoDB theo electionId
  │   - Sinh nonce k_i ngẫu nhiên (lưu trong CryptoService memory, key = sessionId)
  │   - Tính R_i = k_i · G  (commitment point)
  │   - Trả { cI: R_i hex, rhoI: P_i hex }
  ▼
Coordinator
  │ Xác thực cI, rhoI là valid EC points (compressed hex 66 chars)
  │ R_agg = R_1 + R_2 + R_3  (collective commitment)
  │ P_check = P_1 + P_2 + P_3
  │ Kiểm tra P_check === election.collectivePublicKey
  │   (phòng cross-election replay: ai đó dùng node của election khác)
  │ Redis.set(session:signed:{voterId}, {
  │   sessionId, signed: false, electionId, voted: false
  │ }, TTL: 120s)
  │ Trả { sessionId, collectiveCommitment: R_agg hex, collectivePublicKey, numNodes }
  ▼
BFF → Client
```

**Client thực hiện blind (trong browser, không gửi lên server):**

```
Nhận: { sessionId, collectiveCommitment: R_hex, collectivePublicKey: P_hex }

1. Chọn candidateIds (1..maxSelectableCandidates ứng viên)
2. payload = JSON.stringify(canonical(candidateIds))   // dedupe + sort lexicographic
   M = buildVoteMessage(electionId, candidateIds)
     = SHA256("ev-vote-v2" || 0x00 || UTF8(electionId) || 0x00 || UTF8(payload))
3. Sinh α, β ∈ [1, n-1]  ngẫu nhiên (blinding factors, bí mật)
4. C' = R_agg + α·G + β·P_agg  (blinded commitment)
5. h  = SHA256(M || compressed(C')) mod n  (blinded challenge)
6. r  = (h - β) mod n                      (challenge gửi server)
7. Lưu localStorage/secret: { candidateIds, α, β, h, sessionId }
```

#### Bước 2 — Ký phiếu mù (`sign`)

```
POST /api/v1/coordinator/vote/sign
Roles: VOTER
Body: { rHex: r hex, sessionId }
```

```
BFF
  │ Lấy voterId từ JWT
  │ TCP send: vote.sign_blinded_vote { rHex, sessionId, voterId }
  ▼
Coordinator
  │ Kiểm tra session tồn tại trong Redis và signed = false
  │ Validate độ dài rHex hợp lệ
  │ TCP send (parallel) → Signing Node 1, 2, 3:
  │   signing_node.sign_partial { sessionId, rHex, electionId, voterId }
  ▼
Signing Node 1, 2, 3 (đồng thời)
  │ Mỗi node, trong database transaction:
  │   1. signedVoter.create { electionId, voterId, sessionId }
  │      Unique(electionId, voterId) → chặn double-signing
  │      Nếu fail → transaction rollback → voter phải thử lại
  │   2. Lấy k_i (nonce) từ memory theo sessionId
  │   3. Lấy d_i (private key) từ MongoDB → AES decrypt
  │   4. Tính s_i = (k_i − d_i · r) mod n
  │   5. Xóa k_i khỏi memory  (one-time nonce)
  │   6. Trả { sI: s_i hex 64 chars }
  ▼
Coordinator
  │ Nhận [s_1, s_2, s_3]
  │ s = (s_1 + s_2 + s_3) mod n  (aggregate)
  │ Redis.update session: { signed: true, signatureHex: s hex }
  │ Trả { signatureHex: s hex }
  ▼
BFF → Client
```

**Client unblind (trong browser):**

```
Nhận: { signatureHex: s hex }
s' = (s + α) mod n   (unblinded signature)
Chữ ký cuối: (h, s') — đây là chữ ký Schnorr mù đã giải

Verify local trước khi nộp:
  C_check = s'·G + h·P_agg
  h_check = SHA256(M || compressed(C_check)) mod n
  Nếu h !== h_check → không nộp, chữ ký bị lỗi
```

#### Bước 3 — Nộp phiếu (`submit-blinded-commitment`)

```
POST /api/v1/coordinator/vote/:electionId/submit-blinded-commitment
Roles: VOTER
Body: { blindedCommitment, signatureHex, sessionId }
```

```
Client
  │ blindedCommitment = SHA256(pointToBuffer(C')) hex 64 chars
  │ signatureHex = s hex  (aggregate partial, trước khi unblind)
  ▼
BFF
  │ Lấy voterId từ JWT
  │ TCP send: vote.submit_blinded_commitment
  │   { blindedCommitment, signatureHex, sessionId, electionId, voterId }
  ▼
Coordinator
  │ Kiểm tra session Redis:
  │   - Tồn tại, signed=true, signatureHex khớp, sessionId khớp, electionId khớp
  │   - voted = false
  │ Kiểm tra election.status = ACTIVE
  │ voteId = new ObjectId().hex  (key nhất quán giữa chain và DB)
  │
  │ ┌─ Write-DB-First (chống lệch chain↔DB, xem §nhất quán dữ liệu) ──────────┐
  │ │ ① MongoDB vote.create {                                                │
  │ │      id: voteId, electionId, voterId, blindedCommitment,               │
  │ │      status: PENDING_CHAIN, blockchainRef: null                        │
  │ │    }                                                                   │
  │ │    Unique(electionId, voterId) → chặn double-vote NGAY (trước cả chain) │
  │ │                                                                        │
  │ │ ② HTTP POST → Chainlaunch:                                             │
  │ │      submitVote(electionId, voteId, blindedCommitment.toLowerCase())   │
  │ │      → invoke SubmitVote → Chain kiểm tra chưa committed Merkle root    │
  │ │      → Chain lưu VoteView + tăng stats.TotalVoteCount                   │
  │ │      → Trả { result: { transactionId } }                               │
  │ │    Nếu invoke ném lỗi → query GetVote(electionId, voteId):              │
  │ │      • có trên chain → coi như thành công, recover txId từ GetVote      │
  │ │      • chưa có        → DELETE record PENDING (rollback) + ném lỗi      │
  │ │                                                                        │
  │ │ ③ MongoDB vote.update { status: CONFIRMED, blockchainRef: txId }       │
  │ └────────────────────────────────────────────────────────────────────────┘
  │
  │ Redis.update session: { voted: true }
  │ Trả Vote record (receipt)
  ▼
BFF → Client: 200 OK + { voteId, blindedCommitment, blockchainRef, status: CONFIRMED, ... }
```

> **Lưu ý:** API chỉ trả về sau khi vote đã `CONFIRMED`. Một record còn `PENDING_CHAIN` chỉ tồn tại khi process crash giữa bước ② và ③ — reconciler sẽ tự đồng bộ lại theo chain (xem §nhất quán dữ liệu). Các hàm đọc vote (`getVoteCount`, `filterVotes`, `getMyElectionAllInfo`, ...) mặc định chỉ tính vote `CONFIRMED`.

---

### 5.8 Đóng cuộc bầu cử (Close Election)

```
PATCH /api/v1/coordinator/election/:id/close
Roles: ADMIN
```

```
BFF → TCP send: election.end_election { id }
  ▼
Coordinator
  │ Kiểm tra election: status=ACTIVE, có startDate, chưa có endDate
  │
  │ [Ngoài transaction — tránh giữ lock trong ~2s gọi Fabric]
  │ Lấy blindedCommitment của các vote CONFIRMED (sort by createdAt asc)
  │ buildCommitmentMerkleTree(leaves):
  │   leaf_i = SHA256(UTF8(commitment_i_hex))
  │   → Build binary Merkle tree bottom-up
  │   → root = hex 64 chars
  │
  │ ┌─ Write-DB-First (chống lệch chain↔DB, xem §nhất quán dữ liệu) ──────────┐
  │ │ ① [Transaction ngắn] Re-validate status=ACTIVE rồi update             │
  │ │      { status: CLOSING, merkleRoot: root }                            │
  │ │    CLOSING vừa là điểm phục hồi cho reconciler, vừa là "lock" chống    │
  │ │    closeElection đồng thời (call thứ 2 thấy status≠ACTIVE → reject)    │
  │ │                                                                        │
  │ │ ② HTTP POST → Chainlaunch:                                             │
  │ │      commitMerkleRoot(electionId, root, leaves.length)                 │
  │ │      → invoke CommitMerkleRoot → Chain kiểm tra voteCount ===          │
  │ │        stats.TotalVoteCount, root chưa commit                          │
  │ │      → Chain lưu MerkleRootView { committed: true, merkleRoot, ... }    │
  │ │      → Trả { result: { transactionId } }                               │
  │ │    Nếu invoke ném lỗi → query GetMerkleRoot(electionId):               │
  │ │      • đã committed → recover txId + merkleRoot từ chain               │
  │ │      • chưa committed → rollback { status: ACTIVE, merkleRoot: null }   │
  │ │        + ném lỗi để admin retry                                        │
  │ │                                                                        │
  │ │ ③ election.update { status: CLOSED, merkleRoot, blockchainRef: txId }  │
  │ └────────────────────────────────────────────────────────────────────────┘
  │
  │ Đếm voteCount (CONFIRMED) + cache Redis: election:vote:count:{id}
  │ Trả updated election
  ▼
BFF → Client: 200 OK
```

> **Lưu ý:** Merkle tree chỉ build từ vote `CONFIRMED` để root khớp đúng những phiếu thực sự có trên chain. Election kẹt ở `CLOSING` (process crash giữa ② và ③) được reconciler đồng bộ lại theo chain.

---

### 5.9 Giải mù phiếu bầu (Reveal Vote)

Sau khi election đóng, voter gửi chữ ký Schnorr đã unblind lên endpoint **ẩn danh**.

```
POST http://localhost:3308/reveal-vote/:electionId/reveal
Public (không JWT)
Body: { candidateIds: ["id1", "id2"], h, sPrime }
```

```
Client (VOTER) — không kèm JWT
  │ Lấy { candidateIds, h, sPrime } từ localStorage/secret
  │ POST /reveal-vote/:electionId/reveal
  ▼
Reveal-Vote (HTTP handler)
  │ Validate h, sPrime là valid scalar hex
  │
  │ TCP send: election.get_election_by_id { id: electionId }
  ▼
Coordinator → trả election data
  ▼
Reveal-Vote
  │ Kiểm tra status = CLOSED
  │ Kiểm tra election có collectivePublicKey
  │ candidateIds = canonical(dto.candidateIds)   // dedupe + sort lexicographic
  │ Kiểm tra MỌI candidateId thuộc election.candidateIds
  │ Kiểm tra candidateIds.length <= election.maxSelectableCandidates
  │
  │ [Verify EC-Schnorr — điểm tin cậy duy nhất]
  │ M = buildVoteMessage(electionId, candidateIds)
  │   = SHA256("ev-vote-v2" || 0x00 || electionId || 0x00 || JSON.stringify(candidateIds))
  │ isValid = verify(M, h, sPrime, ecParams, P_agg)
  │   C_check = sPrime·G + h·P_agg
  │   h_check = SHA256(M || compressed(C_check)) mod n
  │   valid   = (h === h_check)
  │ Nếu không valid → 400 Invalid signature
  │
  │ revealKey = SHA256(h_bytes32 || sPrime_bytes32) hex
  │ candidateIdsJson = JSON.stringify(candidateIds)   // chuỗi canonical duy nhất
  │ revealPayloadHash = SHA256("reveal-v2" || uint32be(len(candidateIdsJson)) || candidateIdsJson || h32 || sPrime32)
  │
  │ HTTP POST → Chainlaunch:  (Option B — giữ thứ tự chain-first)
  │   FabricClientService.revealVote(electionId, candidateIdsJson, revealKey, revealPayloadHash)
  │   → Chainlaunch invoke: RevealVoteCompact(electionId, candidateIdsJson, revealKey, hash)
  │   → Chain kiểm tra Merkle root đã committed
  │   → Chain kiểm tra revealKey chưa dùng (chống replay on-chain)
  │   → Chain: usedRevealKey.put(revealKey → candidateIds)
  │   → Chain: tally[mỗi candidateId]++ , stats.RevealCount++ (1 lần/phiếu)
  │   → Trả { result: { transactionId } }
  │   Nếu invoke ném lỗi → query GetUsedReveal(electionId, revealKey):
  │     • chain CHƯA có revealKey → lỗi thật, ném tiếp
  │     • chain ĐÃ có (candidateIds khớp) → retry sau partial-fail:
  │         blockchainRef = null (GetUsedReveal không trả txId), đi tiếp xuống create
  │
  │ MongoDB: revealedVote.create {
  │   electionId, candidateIds, revealKey,
  │   signature: { h, sPrime }, blockchainRef   // null nếu là record phục hồi
  │ }
  │ Unique(electionId, revealKey):
  │   - create OK  → ghi/phục hồi thành công
  │   - P2002      → DB đã có (replay thật) → "This vote has already been revealed"
  │
  │ [Auto-complete check]
  │ revealCount = count(revealedVote where electionId)
  │ TCP send: vote.get_vote_count { id: electionId } → Coordinator
  │ Nếu revealCount >= voteCount:
  │   TCP send: election.complete_election { id: electionId }
  │   → Coordinator: election.update { status: COMPLETED, endDate: now() }
  │   → emit → signing nodes: cleanup_election { electionId }
  │     → Xóa SignedVoter + KeyPair của election
  │
  │ Trả { revealedVote, electionCompleted: bool }
  ▼
Client: 200 OK
```

---

### 5.10 Xác minh phiếu bầu (Verify Vote)

```
POST /api/v1/coordinator/vote/:voteId/verify
Public
Body: { electionId, blindedCommitment, blockchainRef }
```

Quy trình verify **7 bước đa tầng**:

```
Coordinator.verifyVote()
  │
  │ Bước 1 — Kiểm tra election tồn tại
  │
  │ Bước 2 — Verify với MongoDB
  │   vote.findUnique({ id: voteId, electionId })
  │   Kiểm tra: id khớp, blindedCommitment khớp, blockchainRef khớp
  │
  │ Bước 3 — Verify với Fabric (vote record trực tiếp)
  │   HTTP POST Chainlaunch: GetVote(electionId, voteId)
  │   → Lấy VoteView từ chain
  │   Kiểm tra: vote tồn tại, txId khớp blockchainRef, blindedCommitment khớp
  │
  │ [Chỉ khi election CLOSED hoặc COMPLETED:]
  │
  │ Bước 4 — Build Merkle Proof từ DB
  │   Lấy blindedCommitment của các vote CONFIRMED (khớp leaves đã commit lên chain)
  │   computeCommitmentProof(leaves, targetCommitment)
  │   → root, proof path
  │   Kiểm tra: root === election.merkleRoot (trong MongoDB)
  │
  │ Bước 5 — Verify Proof locally
  │   verifyCommitmentProof(commitment, proof, root) → true/false
  │
  │ Bước 6 — So khớp Merkle Root với Blockchain
  │   HTTP POST Chainlaunch: GetMerkleRoot(electionId)
  │   Kiểm tra: root DB === root on-chain
  │
  │ Bước 7 — Verify Proof với Blockchain
  │   HTTP POST Chainlaunch: VerifyVoteReceipt(electionId, blindedCommitment, proof[])
  │   → Chain tính lại từ leaf + proof path
  │   Kiểm tra: inElection = true
  │
  │ Tổng hợp:
  │   valid = db.valid AND chain.valid AND merkle.valid
  │
  ▼
BFF → Client: chi tiết kết quả từng bước
```

---

### 5.11 Xem kết quả bầu cử (Tally Result)

```
GET http://localhost:3308/reveal-vote/:electionId/tally
Public
```

```
Reveal-Vote
  │ TCP send: election.get_election_by_id
  │ Kiểm tra status = CLOSED | COMPLETED
  │
  │ Song song:
  │   1. prisma.revealedVote.aggregateRaw([$match, $unwind '$candidateIds', $group _id count])
  │      → { candidateId, count }[] từ DB (groupBy thường KHÔNG unwind được mảng)
  │      + count(revealedVote) = số LÁ PHIẾU đã reveal (dbRevealedBallots)
  │   2. HTTP POST Chainlaunch: GetTally(electionId) → { tally: { [candidateId]: count } } (lượt chọn)
  │      + GetAuditCounts(electionId) → revealCount = số phiếu trên chain (chainRevealedBallots)
  │   3. TCP send: user.get_users_by_ids { ids: candidateIds, role: "CANDIDATE" }
  │      → Identity → tên ứng viên
  │
  │ Build kết quả cho mỗi candidateId:
  │   { candidateId, candidateName, dbRevealCount, chainRevealCount }
  │
  │ Trả thêm 4 con số tách bạch:
  │   dbRevealedBallots / chainRevealedBallots   (số PHIẾU đã reveal)
  │   dbTotalSelections / chainTotalSelections   (tổng LƯỢT CHỌN = ∑ per-candidate; >= số phiếu)
  ▼
Client: kết quả có thể kiểm chứng chéo DB ↔ Blockchain
```

**Audit so sánh số phiếu:**

```
GET http://localhost:3308/reveal-vote/:electionId/audit

Reveal-Vote, song song:
  1. count(revealedVote where electionId) từ DB
  2. TCP send: vote.get_vote_count → Coordinator → count(vote) từ DB
  3. HTTP POST Chainlaunch: GetAuditCounts(electionId)
     → AuditCountsView { totalVoteCount, revealCount, rootCommitted, revealVoteMatch }
→ Trả so sánh DB vs Chain
```

---

## 6. Giao tiếp với Chainlaunch (Hyperledger Fabric)

`FabricClientService` (`libs/fabric/src/lib/fabric-client/fabric-client.service.ts`) là lớp trung gian duy nhất giao tiếp với Fabric. Service gọi HTTP REST API của **Chainlaunch** thay vì dùng Fabric SDK trực tiếp, giúp đơn giản hóa quản lý identity và channel.

### Khởi tạo kết nối

```typescript
// Tự động chạy khi module khởi động
onModuleInit():
  HTTP POST {FABRIC_HOST}/auth/login { username, password }
  → Chainlaunch trả session cookie
  → Cookie jar (axios-cookiejar-support) tự attach vào mọi request sau
```

### Format gọi chaincode

```json
// Invoke (write transaction — tạo transaction trên ledger)
POST /sc/fabric/chaincodes/{chaincodeId}/invoke
{
  "function": "FunctionName",
  "args": ["arg1", "arg2", "arg3"],
  "channel": "votechannel",
  "key_id": "orgId"
}

// Query (read-only — không tạo transaction)
POST /sc/fabric/chaincodes/{chaincodeId}/query
{ same format }
```

### Bảng hàm chaincode

| Hàm chaincode                                                             | Loại   | Được gọi khi                                                | Service gọi |
| ------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- | ----------- |
| `SubmitVote(electionId, voteId, blindedCommitment)`                       | invoke | Voter nộp phiếu                                             | Coordinator |
| `GetVote(electionId, voteId)`                                             | query  | Verify bước 3 / reconcile vote PENDING_CHAIN                | Coordinator |
| `CommitMerkleRoot(electionId, merkleRoot, voteCount)`                     | invoke | Admin đóng election                                         | Coordinator |
| `GetMerkleRoot(electionId)`                                               | query  | Verify bước 6 / reconcile election CLOSING                  | Coordinator |
| `VerifyVoteReceipt(electionId, commitment, proofJSON)`                    | query  | Verify phiếu bước 7                                         | Coordinator |
| `RevealVoteCompact(electionId, candidateIdsJson, revealKey, payloadHash)` | invoke | Voter reveal phiếu (candidateIdsJson = mảng JSON canonical) | Reveal-Vote |
| `GetUsedReveal(electionId, revealKey)`                                    | query  | Recover reveal (Option B, §5.9)                             | Reveal-Vote |
| `GetTally(electionId)`                                                    | query  | Xem kết quả                                                 | Reveal-Vote |
| `GetAuditCounts(electionId)`                                              | query  | Audit cuộc bầu cử                                           | Reveal-Vote |

### Response types

```typescript
// Invoke response
InvokeChaincodeResponse: {
  result: {
    transactionId: string,
    // payload JSON string từ chaincode
  }
}

// Query response
QueryChaincodeResponse: {
  result: string,    // JSON string, cần JSON.parse()
  message: string    // error message nếu fail
}
```

---

## 7. Bảo mật & chống gian lận

### Chống double-vote

| Tầng                 | Cơ chế                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Redis session        | Mỗi `voterId` 1 session; flag `voted=true` sau khi submit                                                                                  |
| MongoDB Coordinator  | Unique index `(electionId, voterId)` trên `votes` — Write-DB-First nên slot bị giữ NGAY từ khi tạo record `PENDING_CHAIN` (trước cả chain) |
| MongoDB Signing Node | Unique index `(electionId, voterId)` trên `signed_voters` — ngăn tích lũy chữ ký                                                           |
| Blockchain           | `SubmitVote` kiểm tra vote record chưa tồn tại trước khi ghi                                                                               |

### Chống Nonce reuse

Khi voter gọi `start-session` lần thứ hai, Coordinator tự động `emit DELETE_SESSION_NONCE` đến tất cả signing nodes trước khi cấp session mới — ngăn nonce cũ bị dùng để recover private key.

### Chống cross-election replay

- Coordinator kiểm tra `collectivePublicKey` từ signing nodes phải khớp với `election.collectivePublicKey` khi tạo session.
- `buildVoteMessage(electionId, candidateIds)` (domain `ev-vote-v2`) binding `electionId` + tập `candidateIds` canonical vào M: chữ ký valid trong election A không verify được trong election B.

### Chống replay reveal

- `revealKey = SHA256(h || sPrime)` là fingerprint của chữ ký.
- Unique index `(electionId, revealKey)` trên MongoDB `revealed_votes`.
- Chaincode lưu `usedRevealKey` trên ledger, từ chối mọi reveal trùng.
- Option B recovery (§5.9) KHÔNG nới lỏng anti-replay: khi chain báo "revealKey đã dùng", `create` vẫn ném `P2002` nếu DB đã có record (replay thật) — chỉ phục hồi khi DB còn trống (partial-fail).

### Privacy (Unlinkability)

- Submit: server lưu `blindedCommitment = SHA256(C')` phụ thuộc blinding factors α, β bí mật của voter.
- Reveal: server lưu `candidateIds` không có `voterId`.
- Không tồn tại JOIN nào nối `Vote.voterId ↔ RevealedVote.candidateIds`.

### Bảo vệ private key signing node

Private key được mã hóa AES-256-GCM với `ENCRYPTION_KEY` (32 bytes base64) từ env trước khi lưu MongoDB. Chỉ decrypt trong memory khi ký, không log, không truyền đi.

### Nhất quán dữ liệu blockchain ↔ MongoDB (Write-DB-First + Reconciler)

Ghi blockchain rồi ghi MongoDB là **dual-write không atomic**: nếu DB fail sau khi chain đã thành công thì hai bên lệch nhau. Hệ thống xử lý theo 2 chiến lược:

**Write-DB-First + trạng thái trung gian + reconciler** (SubmitVote §5.7, CloseElection §5.8):

1. Ghi DB trạng thái trung gian trước (`Vote.status=PENDING_CHAIN` / `Election.status=CLOSING`), `blockchainRef=null`.
2. Gọi chain.
3. Chain OK → confirm DB (`CONFIRMED` / `CLOSED` + `blockchainRef=txId`).
4. Chain ném lỗi → **query chain để phân định** (`GetVote` / `GetMerkleRoot`): đã lên chain → confirm (recover txId); chưa lên chain → rollback (xóa vote PENDING / đưa election về `ACTIVE`) rồi ném lỗi.

**Option B — giữ chain-first + recover khi retry** (RevealVoteCompact §5.9): không đổi thứ tự; khi `revealVote` báo lỗi, query `GetUsedReveal` — nếu chain đã có revealKey thì coi là retry sau partial-fail và `create` lại DB record (`blockchainRef=null` vì `GetUsedReveal` không trả txId), unique index vẫn chặn replay thật.

**Reconciler** (`apps/coordinator/src/app/reconciler`): chạy nền bằng `setInterval` (trong `OnApplicationBootstrap`), mỗi `RECONCILER_INTERVAL_MS` (mặc định 60s) quét các record kẹt **cũ hơn** `RECONCILER_STALE_MS` (mặc định 120s, tránh tranh chấp với request đang chạy):

- `Vote` còn `PENDING_CHAIN` → `GetVote`: có → `CONFIRMED`, không → xóa.
- `Election` còn `CLOSING` → `GetMerkleRoot`: committed → `CLOSED`, không → về `ACTIVE`.

Chain là **nguồn sự thật** để reconcile. Hệ quả: các hàm đọc vote mặc định chỉ tính `status=CONFIRMED` (`getVoteCount`, `getCommitmentVotesByElectionId`, `filterVotes`, `getMyElectionAllInfo`, `getElectionsByVoterId`); riêng check double-vote ở `startSession` và `verifyVote` cố ý giữ status-agnostic (PENDING vẫn tính là đã vote; verify cần thấy cả PENDING để lộ lệch DB↔chain).

---

## 8. Thư viện dùng chung (libs)

| Library         | Path                 | Mục đích                                                                  |
| --------------- | -------------------- | ------------------------------------------------------------------------- |
| `ec-schnorr`    | `libs/ec-schnorr`    | Toán học EC-Schnorr: keygen, commitment, sign, aggregate, unblind, verify |
| `fabric`        | `libs/fabric`        | FabricClientService + Merkle tree builder/verifier                        |
| `configuration` | `libs/configuration` | Typed env config có validation cho từng service                           |
| `constants`     | `libs/constants`     | Message patterns, HTTP status, text messages                              |
| `types`         | `libs/types`         | Shared DTOs (Request body, Response types)                                |
| `utils`         | `libs/utils`         | Prisma error handler, AES crypto, vote message builder                    |
| `decorators`    | `libs/decorators`    | `@CurrentUser`, `@Public`, `@Roles`                                       |
| `interceptors`  | `libs/interceptors`  | HTTP/TCP logger, cache, timeout, exception mapping                        |
| `filters`       | `libs/filters`       | Global exception filter                                                   |
| `guards`        | `libs/guards`        | Rate-limit throttler guard                                                |
| `modules`       | `libs/modules`       | Redis cache module, TCP client module factory                             |
| `pipes`         | `libs/pipes`         | Custom validation pipe với class-validator                                |

### ec-schnorr — hàm chính

| Hàm                                           | Mô tả                                 |
| --------------------------------------------- | ------------------------------------- |
| `getParams()`                                 | Lấy params secp256k1 cố định          |
| `generateKeyPair(params)`                     | Sinh `(d, P = d·G)` ngẫu nhiên        |
| `generateCommitment(params)`                  | Sinh `(k, R = k·G)` ngẫu nhiên        |
| `computeCollectivePublicKey(points, params)`  | `P_agg = ΣP_i`                        |
| `computeCollectiveCommitment(points, params)` | `R_agg = ΣR_i`                        |
| `signPartial(sessionId, rHex, privateKey)`    | `s_i = (k_i − d_i·r) mod n`           |
| `aggregateSignatures(partials, params)`       | `s = Σs_i mod n`                      |
| `verify(msg, h, sPrime, params, pubKey)`      | Kiểm tra `h == SHA256(M ∥ C_check)`   |
| `hexToPoint / pointToHex`                     | Encode/decode EC point (66 hex chars) |
| `hexToScalar / scalarToHex`                   | Encode/decode scalar (64 hex chars)   |

[Learn more about this workspace setup and its capabilities](https://nx.dev/nx-api/nest?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

## Run tasks

To run the dev server for your app, use:

```sh
npx nx serve your-app
```

To create a production bundle:

```sh
npx nx build your-app
```

To see all available targets to run for a project, run:

```sh
npx nx show project your-app
```

These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Add new projects

While you could add new projects to your workspace manually, you might want to leverage [Nx plugins](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) and their [code generation](https://nx.dev/features/generate-code?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) feature.

Use the plugin's generator to create new projects.

To generate a new application, use:

```sh
npx nx g @nx/nest:app demo
```

To generate a new library, use:

```sh
npx nx g @nx/node:lib mylib
```

You can use `npx nx list` to get a list of installed plugins. Then, run `npx nx list <plugin-name>` to learn about more specific capabilities of a particular plugin. Alternatively, [install Nx Console](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) to browse plugins and generators in your IDE.

[Learn more about Nx plugins &raquo;](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) | [Browse the plugin registry &raquo;](https://nx.dev/plugin-registry?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Set up CI!

### Step 1

To connect to Nx Cloud, run the following command:

```sh
npx nx connect
```

Connecting to Nx Cloud ensures a [fast and scalable CI](https://nx.dev/ci/intro/why-nx-cloud?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) pipeline. It includes features such as:

- [Remote caching](https://nx.dev/ci/features/remote-cache?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task distribution across multiple machines](https://nx.dev/ci/features/distribute-task-execution?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Automated e2e test splitting](https://nx.dev/ci/features/split-e2e-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task flakiness detection and rerunning](https://nx.dev/ci/features/flaky-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

### Step 2

Use the following command to configure a CI workflow for your workspace:

```sh
npx nx g ci-workflow
```

[Learn more about Nx on CI](https://nx.dev/ci/intro/ci-with-nx#ready-get-started-with-your-provider?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/nx-api/nest?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Learn about Nx on CI](https://nx.dev/ci/intro/ci-with-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Releasing Packages with Nx release](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:

- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
