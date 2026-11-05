# winlax-admin

Trang quản trị VPS tại https://db.winlax.id.vn: thông số máy, trạng thái và deploy/restart/rollback
3 web (winlax-v2, local-film, tkbww), log trực tiếp, lịch sử deploy, nhật ký thao tác, sửa biến môi
trường, sao lưu/khôi phục PostgreSQL, chạy SQL trên mọi database và terminal root trên web.

Sửa biến môi trường, tải/khôi phục bản sao lưu, Database & SQL và Terminal đều đòi nhập lại mật khẩu
(hiệu lực 10 phút). Terminal dùng `bin/pty-bridge.py` (module `pty` của Python) thay cho node-pty,
vì node-pty cần trình biên dịch C++20 mà Ubuntu 20.04 không có.

- Đăng nhập: Google (chỉ `ADMIN_EMAIL`) rồi mật khẩu. Lần đầu (chưa có mật khẩu) trang tự hỏi đặt mật khẩu
  mới, nhập 2 lần, ít nhất 8 ký tự. Mật khẩu lưu dạng hash scrypt trong `admin_settings` (key
  `password_hash`). Sai 5 lần trong 15 phút từ một IP (hoặc 20 lần/giờ tổng) thì khoá 15 phút. Thao tác
  nguy hiểm đòi nhập lại mật khẩu.
- Chạy bằng `deploy winlax-admin` như các web khác (root, pm2, sau nginx).
- Deploy/restart/rollback chạy trong unit `systemd-run` riêng nên không bị ngắt khi web này tự khởi động lại.

## Vault 2FA (/vault)

Chuyển từ winlax-v2 vào `app/(admin)/vault` và `lib/vault/`. Dữ liệu vẫn nằm trong database
`winlax_v2`, đọc bằng role `winlax_v2` (`VAULT_DATABASE_URL`) và giải mã bằng `TWO_FA_MASTER_KEY`.

Vault không có khoá riêng: đăng nhập trang quản trị (Google + mật khẩu) là mở được. Không còn mật khẩu
vault, mã mở khoá, tự khoá hay danh sách phiên. Mỗi server action tự kiểm tra phiên đăng nhập quản
trị, vì action gọi được bằng POST trực tiếp mà không qua layout. Bảng `vault_sessions` và
`vault_settings` vẫn còn trong `winlax_v2` nhưng không dùng nữa (keep-alive của winlax-v2 vẫn dọn
`vault_sessions`, nên đừng xoá bảng).

## Biến môi trường (`/var/www/winlax-admin/shared/.env.production.local`)

| Biến | Ý nghĩa |
|---|---|
| `PUBLIC_URL` | `https://db.winlax.id.vn` (mọi URL tuyệt đối dựng từ đây vì sau nginx `request.url` là localhost) |
| `ADMIN_EMAIL` | Email Google duy nhất được vào |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client, redirect URI `https://db.winlax.id.vn/api/auth/google/callback` |
| `DATABASE_URL` | Postgres `winlax_admin` (role superuser, dùng cho SQL console) |
| `ADMIN_SECRET_KEY` | 32 byte base64, mã hoá cookie OAuth |
| `VAULT_DATABASE_URL` | Database `winlax_v2` (role `winlax_v2`), nơi có bảng vault và hộp thư liên hệ |
| `TWO_FA_MASTER_KEY`, `SECURITY_HASH_SECRET` | Giống hệt winlax-v2; đổi `TWO_FA_MASTER_KEY` là mất toàn bộ dữ liệu vault |

## Quên mật khẩu

Xoá mật khẩu cũ bằng lệnh dưới đây. Lần đăng nhập Google sau, trang sẽ hỏi đặt mật khẩu mới.

```bash
ssh winlax-vps "cd /tmp && sudo -u postgres psql -d winlax_admin -c \"delete from admin_settings where key = 'password_hash'\""
```
