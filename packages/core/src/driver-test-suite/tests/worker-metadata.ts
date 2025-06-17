import { describe, test, expect } from "vitest";
import type { DriverTestConfig } from "../mod";
import { setupDriverTest } from "../utils";

export function runWorkerMetadataTests(
  driverTestConfig: DriverTestConfig
) {
  describe("Worker Metadata Tests", () => {
    describe("Worker Name", () => {
      test("should provide access to worker name", async (c) => {
        const { client } = await setupDriverTest(
          c,
          driverTestConfig,
          
        );

        // Get the worker name
        const handle = client.metadataWorker.getOrCreate();
        const workerName = await handle.getWorkerName();
        
        // Verify it matches the expected name
        expect(workerName).toBe("metadataWorker");
      });

      test("should preserve worker name in state during onStart", async (c) => {
        const { client } = await setupDriverTest(
          c,
          driverTestConfig,
          
        );

        // Get the stored worker name
        const handle = client.metadataWorker.getOrCreate();
        const storedName = await handle.getStoredWorkerName();
        
        // Verify it was stored correctly
        expect(storedName).toBe("metadataWorker");
      });
    });

    describe("Worker Tags", () => {
      test("should provide access to tags", async (c) => {
        const { client } = await setupDriverTest(
          c,
          driverTestConfig,
          
        );

        // Create worker and set up test tags
        const handle = client.metadataWorker.getOrCreate();
        await handle.setupTestTags({ 
          "env": "test", 
          "purpose": "metadata-test" 
        });
        
        // Get the tags
        const tags = await handle.getTags();
        
        // Verify the tags are accessible
        expect(tags).toHaveProperty("env");
        expect(tags.env).toBe("test");
        expect(tags).toHaveProperty("purpose");
        expect(tags.purpose).toBe("metadata-test");
      });

      test("should allow accessing individual tags", async (c) => {
        const { client } = await setupDriverTest(
          c,
          driverTestConfig,
          
        );

        // Create worker and set up test tags
        const handle = client.metadataWorker.getOrCreate();
        await handle.setupTestTags({ 
          "category": "test-worker", 
          "version": "1.0" 
        });
        
        // Get individual tags
        const category = await handle.getTag("category");
        const version = await handle.getTag("version");
        const nonexistent = await handle.getTag("nonexistent");
        
        // Verify the tag values
        expect(category).toBe("test-worker");
        expect(version).toBe("1.0");
        expect(nonexistent).toBeNull();
      });
    });

    describe("Metadata Structure", () => {
      test("should provide complete metadata object", async (c) => {
        const { client } = await setupDriverTest(
          c,
          driverTestConfig,
          
        );

        // Create worker and set up test metadata
        const handle = client.metadataWorker.getOrCreate();
        await handle.setupTestTags({ "type": "metadata-test" });
        await handle.setupTestRegion("us-west-1");
        
        // Get all metadata
        const metadata = await handle.getMetadata();
        
        // Verify structure of metadata
        expect(metadata).toHaveProperty("name");
        expect(metadata.name).toBe("metadataWorker");
        
        expect(metadata).toHaveProperty("tags");
        expect(metadata.tags).toHaveProperty("type");
        expect(metadata.tags.type).toBe("metadata-test");
        
        // Region should be set to our test value
        expect(metadata).toHaveProperty("region");
        expect(metadata.region).toBe("us-west-1");
      });
    });

    describe("Region Information", () => {
      test("should retrieve region information", async (c) => {
        const { client } = await setupDriverTest(
          c,
          driverTestConfig,
          
        );

        // Create worker and set up test region
        const handle = client.metadataWorker.getOrCreate();
        await handle.setupTestRegion("eu-central-1");
        
        // Get the region
        const region = await handle.getRegion();
        
        // Verify the region is set correctly
        expect(region).toBe("eu-central-1");
      });
    });
  });
}
