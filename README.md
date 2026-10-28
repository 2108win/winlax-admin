# winlax-admin

Trang quản trị VPS tại https://db.winlax.id.vn: thông số máy, trạng thái và deploy/restart/rollback
3 web (winlax-v2, local-film, tkbww), log trực tiếp, lịch sử deploy, nhật ký thao tác, sửa biến môi
trường, sao lưu/khôi phục PostgreSQL, chạy SQL trên mọi database và terminal root trên web.

Sửa biến môi trường, tải/khôi phục bản sao lưu, Database & SQL và Terminal đều đòi nhập lại mã 2FA
(hiệu lực 10 phút). Terminal dùng `bin/pty-bridge.py` (module `pty` của Python) thay cho node-pty,
vì node-pty cần trình biên dịch C++20 mà Ubuntu 20.04 không có.

- Đăng nhập: Google (chỉ `ADMIN_EMAIL`) rồi mã 2FA (TOTP). Thao tác nguy hiểm đòi nhập lại mã 2FA.
- Chạy bằng `deploy winlax-admin` như các web khác (root, pm2, sau nginx).
- Deploy/restart/rollback chạy trong unit `systemd-run` riêng nên không bị ngắt khi web này tự khởi động lại.

## Vault 2FA (/vault)

Chuyển nguyên từ winlax-v2 (`src/app/2fa`, `src/lib/two-factor`, `db`, `security`, `contact`,
`components/ui`) vào `app/(admin)/vault` và `lib/vault/`; code mã hoá, kho và phiên giữ nguyên
từng dòng. Dữ liệu vẫn nằm trong database `winlax_v2`, đọc bằng role `winlax_v2`
(`VAULT_DATABASE_URL`) với cùng `TWO_FA_MASTER_KEY`, `TWO_FA_VAULT_PASSWORD`,
`SECURITY_HASH_SECRET`. Vault giờ nằm sau đăng nhập Google + 2FA của trang quản trị và vẫn
giữ mật khẩu vault riêng, nên không còn cần đường dẫn bí mật.

## Biến môi trường (`/var/www/winlax-admin/shared/.env.production.local`)

| Biến | Ý nghĩa |
|---|---|
| `PUBLIC_URL` | `https://db.winlax.id.vn` (mọi URL tuyệt đối dựng từ đây vì sau nginx `request.url` là localhost) |
| `ADMIN_EMAIL` | Email Google duy nhất được vào |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client, redirect URI `https://db.winlax.id.vn/api/auth/google/callback` |
| `DATABASE_URL` | Postgres `winlax_admin` (role superuser, dùng cho SQL console) |
| `ADMIN_SECRET_KEY` | 32 byte base64, mã hoá secret 2FA và cookie OAuth |
| `VAULT_DATABASE_URL` | Database `winlax_v2` (role `winlax_v2`), nơi có bảng vault và hộp thư liên hệ |
| `TWO_FA_MASTER_KEY`, `TWO_FA_VAULT_PASSWORD`, `SECURITY_HASH_SECRET` | Giống hệt winlax-v2; đổi `TWO_FA_MASTER_KEY` là mất toàn bộ dữ liệu vault |

## Đặt lại 2FA (mất điện thoại)

```bash
ssh winlax-vps "cd /tmp && sudo -u postgres psql -d winlax_admin -c \"delete from admin_settings where key = 'totp_secret'\""
```

Lần đăng nhập sau sẽ hiện mã QR mới.
