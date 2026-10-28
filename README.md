# winlax-admin

Trang quản trị VPS tại https://db.winlax.id.vn: thông số máy, trạng thái và deploy/restart/rollback
3 web (winlax-v2, local-film, tkbww), log trực tiếp, lịch sử deploy, nhật ký thao tác.

- Đăng nhập: Google (chỉ `ADMIN_EMAIL`) rồi mã 2FA (TOTP). Thao tác nguy hiểm đòi nhập lại mã 2FA.
- Chạy bằng `deploy winlax-admin` như các web khác (root, pm2, sau nginx).
- Deploy/restart/rollback chạy trong unit `systemd-run` riêng nên không bị ngắt khi web này tự khởi động lại.

## Biến môi trường (`/var/www/winlax-admin/shared/.env.production.local`)

| Biến | Ý nghĩa |
|---|---|
| `PUBLIC_URL` | `https://db.winlax.id.vn` (mọi URL tuyệt đối dựng từ đây vì sau nginx `request.url` là localhost) |
| `ADMIN_EMAIL` | Email Google duy nhất được vào |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client, redirect URI `https://db.winlax.id.vn/api/auth/google/callback` |
| `DATABASE_URL` | Postgres `winlax_admin` (role superuser, dùng cho SQL console) |
| `ADMIN_SECRET_KEY` | 32 byte base64, mã hoá secret 2FA và cookie OAuth |

## Đặt lại 2FA (mất điện thoại)

```bash
ssh winlax-vps "cd /tmp && sudo -u postgres psql -d winlax_admin -c \"delete from admin_settings where key = 'totp_secret'\""
```

Lần đăng nhập sau sẽ hiện mã QR mới.
