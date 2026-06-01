# mTLS cho internal service

Mã hoá + xác thực hai chiều (mutual TLS) cho mọi giao tiếp nội bộ giữa các service:

- **TCP RPC** (NestJS `Transport.TCP`): bff, identity, coordinator, signing-node (×3), reveal-vote
- **Redis** (event bus `Transport.REDIS` + cache `@keyv/redis`): tất cả service ↔ Redis

Toàn bộ được **gate sau biến `MTLS_ENABLED`**. Khi `MTLS_ENABLED != true` → chạy plaintext y như trước (dev local không cần cert).

## Mô hình trust

- **1 CA nội bộ** (`ca.crt`) làm trust anchor cho cả mesh.
- **Mỗi service 1 cert riêng** do CA ký, dùng chung cho cả 3 vai: TCP server, TCP client, Redis client (EKU `serverAuth,clientAuth`).
- Server TCP bật `requestCert + rejectUnauthorized` → chỉ chấp nhận peer có cert do CA của mình ký. Redis bật `tls-auth-clients yes` cho hiệu lực tương đương.
- `signing-node` tách 3 node → **3 cert riêng** (`signing-node-1/2/3`), revoke/rotate độc lập.

## Cấu trúc đã thay đổi

| File                                         | Vai trò                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `libs/configuration/src/lib/mtls.config.ts`  | Helper `getServerTlsOptions` / `getClientTlsOptions` / `getRedisTlsOptions` (đọc env, gate sau `MTLS_ENABLED`) |
| `apps/*/src/main.ts` (5 server TCP)          | Thêm `tlsOptions: getServerTlsOptions()`                                                                       |
| `libs/modules/src/lib/tcp-client.module.ts`  | Thêm `tlsOptions` cho client (phủ mọi nơi register)                                                            |
| `libs/modules/src/lib/event-bus.module.ts`   | Thêm `tls` cho Redis ClientProxy                                                                               |
| `libs/modules/src/lib/redis-cache.module.ts` | `rediss://` + socket TLS cho cache khi bật mTLS                                                                |
| `apps/socket/src/main.ts`                    | Thêm `tls` cho Redis consumer                                                                                  |
| `scripts/gen-mtls-certs.sh`                  | Sinh CA + cert mọi service                                                                                     |
| `docker-compose.mtls.yml`                    | Override bật TLS/mTLS cho Redis server                                                                         |

## Bật mTLS (production)

### 1. Sinh cert

```bash
bash scripts/gen-mtls-certs.sh
# => ./certs/{ca.crt, bff.crt/key, identity..., signing-node-1/2/3..., redis...}
```

> Giữ `certs/ca.key` thật cẩn thận (lý tưởng là offline / secret manager). Thư mục `certs/` đã được gitignore.

### 2. Bật flag cho từng service

Mỗi `.env` (và `.nodeN.env` của signing-node) đã có sẵn block, chỉ cần đổi:

```dotenv
MTLS_ENABLED=true
TLS_CA_PATH=./certs/ca.crt
TLS_CERT_PATH=./certs/<service>.crt   # đã trỏ đúng cert của service đó
TLS_KEY_PATH=./certs/<service>.key
```

Khi deploy bằng container: mount `certs/` (read-only) vào và trỏ `TLS_*_PATH` tới đường dẫn trong container. Mỗi container chỉ nên thấy cert của chính nó + `ca.crt`.

### 3. Chạy Redis ở chế độ TLS

```bash
docker compose -f docker-compose.yml -f docker-compose.mtls.yml up -d redis
```

## Lưu ý quan trọng

- **Verify danh tính node**: client lấy `host` làm `servername` để verify SAN. Cert sinh kèm SAN = tên service + `localhost` nên chạy được cả docker (DNS service name) lẫn local. Ở production nên gọi signing node bằng DNS name riêng (`signing-node-1/2/3`) để verify đúng node.
- **`ENCRYPTION_KEY` của 3 signing node phải KHÁC nhau** ở production (file example đang để giống) — nếu không thì tách node mất ý nghĩa.
- **Authn ≠ Authz**: cấu hình này đảm bảo "peer thuộc mesh" (cert do CA ký). Giới hạn "service A mới được gọi service B" là lớp authz riêng, chưa làm ở đây.
- **Rotation**: cert service mặc định 1 năm. Chạy lại `gen-mtls-certs.sh` để phát hành cert mới (CA giữ nguyên), rồi rolling-restart. Muốn tự động hoá có thể chuyển sang smallstep `step-ca`.
- **Bật từng phần khi rollout**: vì gate sau `MTLS_ENABLED`, nên bật đồng loạt cả 2 đầu của một kênh (vd coordinator + cả 3 signing node) để tránh một bên TLS một bên plaintext gây từ chối kết nối.

## Tắt lại

Đặt `MTLS_ENABLED=false` (hoặc bỏ biến) và chạy Redis bằng base compose (`docker compose up -d redis`). Không cần đụng code.
