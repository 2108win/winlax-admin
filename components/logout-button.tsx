"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }
  return (
    <button onClick={logout} className="btn btn-ghost btn-sm w-full justify-start">
      Đăng xuất
    </button>
  );
}
