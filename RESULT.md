# E-Voting Load Test — Results

> Generated: 2026-06-02 · Harness: `scripts/load-test/run.mjs` · Full flow: login → create users → election → start → blind vote → close → reveal → tally (qua HTTP thật + Fabric/Chainlaunch).

## Cấu hình chung

| Tham số          | Giá trị                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| Endpoints        | BFF `http://localhost:3001/api/v1`, Reveal `http://localhost:3007/api/v1` |
| Database         | DB test cô lập `*_test` (xóa sau khi xong)                                |
| Candidates       | 3 · `maxSelectableCandidates = 1`                                         |
| vote-delay       | random `[0, 2000]ms` mỗi phiếu (mô phỏng cử tri đến rải rác)              |
| reveal-delay     | random `[0, 3000]ms` mỗi lần reveal                                       |
| request-timeout  | 30000ms                                                                   |
| Fabric chaincode | sau khi fix hot-key counter MVCC (đếm record thay vì counter)             |

> Ghi chú: latency (p50/p95/avg/max) **không** tính random delay; wall-clock/throughput **có** tính (phản ánh pattern cử tri đến rải rác).

## Bảng tổng hợp các mốc

| Voters | Concurrency | VOTE ok/fail | VOTE wall · req/s · p50/p95 | CLOSE | REVEAL ok/fail | REVEAL wall · req/s · p50/p95 | DB↔Chain | Tổng thời gian |
| -----: | ----------: | :----------: | :-------------------------- | :---: | :------------: | :---------------------------- | :-------: | -------------: |
|     10 |          10 |     10/0     | 2113ms · 4.7/s · 373/1331ms |  ✅   |      10/0      | 2937ms · 3.4/s · 1142/2028ms  |  ✅ khớp  |         8295ms |

## Mốc 10 voter — chi tiết

`run=ltmpwdq18j · electionId=6a1e9510775a0caef3592392`

### Các bước chuẩn bị (admin)

| Bước                            | Thời gian |
| ------------------------------- | --------- |
| admin sign-in                   | 97ms      |
| create 3 candidates + 10 voters | 717ms     |
| resolve user ids                | 24ms      |
| create election                 | 95ms      |
| add voters to election          | 50ms      |
| start election (gen keys)       | 99ms      |

### Pha bỏ phiếu (VOTE) — concurrency 10

| Chỉ số     | Giá trị        |
| ---------- | -------------- |
| ok / fail  | 10 / 0         |
| wall-clock | 2113ms         |
| throughput | 4.7 req/s      |
| p50 / p95  | 373ms / 1331ms |
| avg / max  | 496ms / 1331ms |

### Đóng cuộc bầu cử (CLOSE)

| Chỉ số      | Giá trị                                   |
| ----------- | ----------------------------------------- |
| Thời gian   | 2100ms                                    |
| Merkle root | `01f5732bf7dc…` (commit chain thành công) |

### Pha giải mã phiếu (REVEAL) — concurrency 10

| Chỉ số     | Giá trị         |
| ---------- | --------------- |
| ok / fail  | 10 / 0          |
| wall-clock | 2937ms          |
| throughput | 3.4 req/s       |
| p50 / p95  | 1142ms / 2028ms |
| avg / max  | 1098ms / 2028ms |

### Kết quả kiểm phiếu (TALLY) — `status: COMPLETED`

| Candidate | dbRevealCount | chainRevealCount |
| --------- | :-----------: | :--------------: |
| Cand 0    |       4       |        4         |
| Cand 1    |       3       |        3         |
| Cand 2    |       3       |        3         |

| Tổng hợp         | DB  | Chain |
| ---------------- | :-: | :---: |
| Revealed ballots | 10  |  10   |
| Total selections | 10  |  10   |

`chainError: null` → **DB và blockchain khớp tuyệt đối**, không mất phiếu. Xác nhận lỗi MVCC hot-key counter trước đây đã được khắc phục (close thành công ⇒ `TotalVoteCount` on-chain = 10).

---

_Các mốc 100 / 500 / 1000 voter sẽ được bổ sung vào bảng tổng hợp khi chạy._
