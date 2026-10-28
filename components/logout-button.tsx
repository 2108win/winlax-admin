"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }
  return (
    <button onClick={logout} className="text-left text-sm text-white/50 hover:text-white">
      Đăng xuất
    </button>
  );
}
