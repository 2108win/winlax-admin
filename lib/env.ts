function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

export const env = {
  get publicUrl() {
    return required("PUBLIC_URL").replace(/\/+$/, "");
  },
  get adminEmail() {
    return required("ADMIN_EMAIL").toLowerCase();
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  get secretKey() {
    const key = Buffer.from(required("ADMIN_SECRET_KEY"), "base64");
    if (key.length !== 32) throw new Error("ADMIN_SECRET_KEY phải là 32 byte base64");
    return key;
  },
};

/**
 * Behind nginx, request.url is https://localhost:PORT, so every absolute URL
 * (redirects included) must be built from the public origin.
 */
export function publicUrl(path: string): URL {
  return new URL(path, env.publicUrl);
}
