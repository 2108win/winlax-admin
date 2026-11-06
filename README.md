# winlax-admin

Trang quản trị VPS tại https://db.winlax.id.vn: thông số máy, trạng thái và deploy/restart/rollback
3 web (winlax-v2, local-film, tkbww), log trực tiếp, lịch sử deploy, nhật ký thao tác, sửa biến môi
trường, sao lưu/khôi phục PostgreSQL, chạy SQL trên database của các dự án (mỗi web trong `apps.conf` một database, ví dụ `winlax-v2` → `winlax_v2`; không có `postgres` hay database khác) và terminal root trên web.

Sửa biến môi trường, tải/khôi phục bản sao lưu, Database & SQL và Terminal đều đòi nhập lại mã 2FA
(hiệu lực 10 phút). Terminal dùng `bin/pty-bridge.py` (module `pty` của Python) thay cho node-pty,
vì node-pty cần trình biên dịch C++20 mà Ubuntu 20.04 không có.

- Đăng nhập: Google (chỉ `ADMIN_EMAIL`) **hoặc** email + mật khẩu, rồi mã 2FA (TOTP) nếu là máy lạ. Thao
  tác nguy hiểm đòi nhập lại mã 2FA.
  - **Ghi nhớ máy** (giống Facebook, theo ý người dùng 06/11/2026): khi nhập mã 2FA có ô “Ghi nhớ máy này”
    (mặc định chọn). Máy được nhớ bằng token ngẫu nhiên trong cookie `__Host-wa_device` (SameSite=Lax để đi
    cùng lượt Google chuyển về), chỉ lưu hash trong `admin_trusted_devices`; không dựa vào IP vì IP đổi và
    mọi request đi qua Cloudflare. Lần sau, sau Google hoặc mật khẩu là vào thẳng, không hỏi mã. Mỗi lần dùng
    gia hạn thêm 90 ngày. Cookie một mình không đăng nhập được: vẫn phải qua Google hoặc mật khẩu.
  - Phiên mở trên máy đã nhớ chưa có step-up, nên terminal, SQL ghi và env vẫn hỏi mã 2FA.
  - Trang **Tài khoản** liệt kê các máy đã nhớ, có nút quên từng máy hoặc tất cả (`DELETE /api/account/devices`).
  - Đăng nhập bằng mật khẩu chỉ thay bước Google. Mặc định tắt. Bật, đổi hoặc tắt ở trang **Tài khoản**
    (cần nhập lại mã 2FA).
  - Mật khẩu ít nhất 8 ký tự, lưu dạng hash scrypt trong `admin_settings` (key `password_hash`).
  - Chỉ nhận email `ADMIN_EMAIL`. Email hoặc mật khẩu sai được tính chung giới hạn với mã 2FA sai: 5 lần trong
    15 phút mỗi IP, hoặc 20 lần/giờ tổng.
- Chạy bằng `deploy winlax-admin` như các web khác (root, pm2, sau nginx).
- Deploy/restart/rollback chạy trong unit `systemd-run` riêng nên không bị ngắt khi web này tự khởi động lại.

## Hộp thư liên hệ (/inbox)

Tin nhắn từ form liên hệ trên winlax.id.vn (bảng `contact_messages` trong database `winlax_v2`, đọc
bằng role `winlax_v2` qua `VAULT_DATABASE_URL`). Code: `app/(admin)/inbox` và `lib/site/`. Mỗi server
action tự kiểm tra phiên đăng nhập, vì action gọi được bằng POST trực tiếp mà không qua layout. Xoá tin
nhắn được ghi vào Nhật ký thao tác (`contact.delete`).

## Vault 2FA (/vault)

Vault là tài khoản `/2fa` của chủ web (`ADMIN_EMAIL`) trên https://winlax.id.vn/2fa: cùng các dòng
trong bảng `twofa_entries` (database `winlax_v2`), nên thêm, đổi tên hay xoá ở bên nào thì bên kia
cũng thấy sau khi tải lại trang. Người dùng khác của /2fa không bao giờ hiện ở đây: mọi truy vấn lọc
theo `user_id` của chủ web.

- Mã hoá bằng `TWOFA_MASTER_KEY`, **phải giống hệt env winlax-v2**. Khác khoá là mọi mục hiện "Không thể
  giải mã" ở trang này.
- `lib/vault/two-factor/shared-crypto.ts` là bản chép của `src/lib/twofa/crypto.ts` bên winlax-v2. Sửa
  bên nào phải sửa y hệt bên kia.
- Giới hạn theo /2fa: tên 120, tài khoản 200 (không bắt buộc), mật khẩu 4.096, ghi chú 5.000 ký tự,
  tối đa 1.000 mục.
- Mã TOTP tính trên server, trình duyệt không nhận secret. Mọi thao tác ghi vào Nhật ký thao tác
  (`vault.create`, `vault.rename`, `vault.delete`, `vault.reveal`, `vault.backup`), chỉ có id và số lượng.

Vault cũ (bảng `two_factor_entries`, khoá `TWO_FA_MASTER_KEY`, dùng tới 06/11/2026) đã chép sang /2fa.
Bảng và khoá vẫn giữ làm bản dự phòng theo ý chủ web, code không còn đọc.

## Biến môi trường (`/var/www/winlax-admin/shared/.env.production.local`)

| Biến | Ý nghĩa |
|---|---|
| `PUBLIC_URL` | `https://db.winlax.id.vn` (mọi URL tuyệt đối dựng từ đây vì sau nginx `request.url` là localhost) |
| `ADMIN_EMAIL` | Email Google duy nhất được vào |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client, redirect URI `https://db.winlax.id.vn/api/auth/google/callback` |
| `DATABASE_URL` | Postgres `winlax_admin` (role superuser, dùng cho SQL console) |
| `ADMIN_SECRET_KEY` | 32 byte base64, mã hoá secret 2FA và cookie OAuth |
| `VAULT_DATABASE_URL` | Database `winlax_v2` (role `winlax_v2`), nơi có hộp thư liên hệ (tên biến giữ từ thời vault) |
| `TWOFA_MASTER_KEY` | Khoá của /2fa, giống hệt env winlax-v2; vault đọc và ghi bằng khoá này |
| `TWO_FA_MASTER_KEY` | Không còn dùng. Khoá đọc bảng vault cũ `two_factor_entries`, giữ làm bản dự phòng |

## Đặt lại 2FA (mất điện thoại)

```bash
ssh winlax-vps "cd /tmp && sudo -u postgres psql -d winlax_admin -c \"delete from admin_settings where key = 'totp_secret'\""
```

Lần đăng nhập sau sẽ hiện mã QR mới.
