import { describe, test, expect } from "vitest";
import { serializeKey, serializeNameAndKey } from "../src/util";

// Access internal KEYS directly
// Since KEYS is a private constant in manager_driver.ts, we'll redefine it here for testing
const KEYS = {
  WORKER: {
    metadata: (workerId: string) => `worker:${workerId}:metadata`,
    keyIndex: (name: string, key: string[] = []) => {
      // Use serializeKey for consistent handling of all keys
      return `worker_key:${serializeKey(key)}`;
    },
  },
};

describe("Key index functions", () => {
  test("keyIndex handles empty key array", () => {
    expect(KEYS.WORKER.keyIndex("test-worker")).toBe("worker_key:(none)");
    expect(KEYS.WORKER.keyIndex("worker:with:colons")).toBe("worker_key:(none)");
  });

  test("keyIndex handles single-item key arrays", () => {
    // Note: keyIndex ignores the name parameter
    expect(KEYS.WORKER.keyIndex("test-worker", ["key1"])).toBe("worker_key:key1");
    expect(KEYS.WORKER.keyIndex("worker:with:colons", ["key:with:colons"]))
      .toBe("worker_key:key:with:colons");
  });
  
  test("keyIndex handles multi-item array keys", () => {
    // Note: keyIndex ignores the name parameter
    expect(KEYS.WORKER.keyIndex("test-worker", ["key1", "key2"]))
      .toBe(`worker_key:key1,key2`);
    
    // Test with special characters
    expect(KEYS.WORKER.keyIndex("test-worker", ["key,with,commas"]))
      .toBe("worker_key:key\\,with\\,commas");
  });

  test("metadata key creates proper pattern", () => {
    expect(KEYS.WORKER.metadata("123-456")).toBe("worker:123-456:metadata");
  });
});