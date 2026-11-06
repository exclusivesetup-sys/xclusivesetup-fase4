import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFileName =
  process.env.ENV_FILE ||
  (process.env.APP_ENV === "academico" ? ".env.academico" : ".env");
const envPath = path.join(__dirname, envFileName);

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
