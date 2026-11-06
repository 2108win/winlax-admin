export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type VaultTotp = Readonly<{
  algorithm: TotpAlgorithm;
  digits: 6 | 8;
  period: number;
  secret: string;
}>;

export type VaultPayload = Readonly<{
  account: string;
  issuer: string;
  notes?: string;
  password?: string;
  totp?: VaultTotp;
  version: 2;
  website?: string;
}>;

export type VaultImportInput = Readonly<{
  account?: string;
  issuer?: string;
  source: string;
}>;

export type EncryptedVaultPayload = Readonly<{
  authTag: string;
  ciphertext: string;
  iv: string;
}>;

export type VaultEntryView = Readonly<{
  account: string;
  createdAt: string;
  currentCode?: string;
  expiresAt?: number;
  hasNotes: boolean;
  hasPassword: boolean;
  hasTotp: boolean;
  id: string;
  isCorrupted: boolean;
  issuer: string;
  nextCode?: string;
  period?: number;
  website?: string;
}>;

export type VaultPrivateDetails = Readonly<{
  notes?: string;
  password?: string;
}>;

export type VaultRevealState = Readonly<{
  details?: VaultPrivateDetails;
  message: string;
  status: "error" | "idle" | "success";
}>;

export type VaultActionState = Readonly<{
  fieldErrors?: Partial<
    Record<
      | "account"
      | "code"
      | "credentialPassword"
      | "entries"
      | "issuer"
      | "notes"
      | "password"
      | "secret"
      | "website",
      string
    >
  >;
  message: string;
  status: "error" | "idle" | "success";
  submittedAt?: number;
}>;

export type VaultBackupState = Readonly<{
  backup?: Readonly<{ content: string; count: number; filename: string }>;
  message: string;
  status: "error" | "success";
}>;

export type UnlockTotpSetupState = Readonly<{
  message: string;
  /** Present only while setting up: shown once as a QR code and as text, never stored yet. */
  setup?: Readonly<{ otpauthUri: string; secret: string }>;
  status: "error" | "idle" | "success";
}>;
