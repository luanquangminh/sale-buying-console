import type { Bindings } from "../worker/types";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Bindings {
    TEST_MIGRATIONS: D1Migration[];
  }
}
