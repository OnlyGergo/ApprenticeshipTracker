// Usage: bun run hash-password 'your-password'  ->  paste the printed line into .env
// Bun's .env loader expands `$name`, so every `$` in the hash must be written as `\$`.
const password = Bun.argv[2];
if (!password) {
  console.error("Usage: bun run hash-password '<password>'");
  process.exit(1);
}
const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
console.log(`BASIC_AUTH_PASS_HASH=${hash.replaceAll("$", "\\$")}`);

export {};
