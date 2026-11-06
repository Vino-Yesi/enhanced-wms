const HASH_PREFIX = 'pbkdf2-sha256';
const ITERATIONS = 210_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashOfflinePassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derive(password, salt, ITERATIONS);
  return `${HASH_PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(digest)}`;
}

export function isOfflinePasswordHash(value: string | undefined): boolean {
  return value?.startsWith(`${HASH_PREFIX}$`) ?? false;
}

export async function verifyOfflinePassword(password: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  const [prefix, iterationsText, saltText, digestText] = stored.split('$');
  if (prefix !== HASH_PREFIX || !iterationsText || !saltText || !digestText) {
    return stored === password;
  }

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000) return false;
  try {
    const expected = fromBase64(digestText);
    const actual = await derive(password, fromBase64(saltText), iterations);
    if (expected.length !== actual.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ actual[index];
    return difference === 0;
  } catch {
    return false;
  }
}
