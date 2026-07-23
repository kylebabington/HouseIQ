import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Auth0 + Cockroach round-trips need more than the default.
        testTimeout: 30000,
        hookTimeout: 60000,
        fileParallelism: false,
    },
});
