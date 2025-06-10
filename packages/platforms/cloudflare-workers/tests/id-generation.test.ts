import { describe, test, expect, vi } from "vitest";
import { serializeNameAndKey } from "../src/util";
import { CloudflareWorkersManagerDriver } from "../src/manager-driver";

describe("Deterministic ID generation", () => {
  test("should generate consistent IDs for the same name and key", () => {
    const name = "test-worker";
    const key = ["key1", "key2"];
    
    // Test that serializeNameAndKey produces a consistent string
    const serialized1 = serializeNameAndKey(name, key);
    const serialized2 = serializeNameAndKey(name, key);
    
    expect(serialized1).toBe(serialized2);
    expect(serialized1).toBe("test-worker:key1,key2");
  });
  
  test("should properly escape special characters in keys", () => {
    const name = "test-worker";
    const key = ["key,with,commas", "normal-key"];
    
    const serialized = serializeNameAndKey(name, key);
    expect(serialized).toBe("test-worker:key\\,with\\,commas,normal-key");
  });
  
  test("should properly escape colons in worker names", () => {
    const name = "test:worker:with:colons";
    const key = ["key1", "key2"];
    
    const serialized = serializeNameAndKey(name, key);
    expect(serialized).toBe("test\\:worker\\:with\\:colons:key1,key2");
  });
  
  test("should handle empty key arrays", () => {
    const name = "test-worker";
    const key: string[] = [];
    
    const serialized = serializeNameAndKey(name, key);
    expect(serialized).toBe("test-worker:(none)");
  });
});