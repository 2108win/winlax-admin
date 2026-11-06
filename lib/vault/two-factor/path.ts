/**
 * The vault lives at /vault of the admin site, behind its Google + 2FA login,
 * so it no longer needs the secret path it had on winlax.id.vn.
 */
export const INTERNAL_VAULT_PATH = "/vault";

export function getVaultAccessPath(): string {
  return INTERNAL_VAULT_PATH;
}
