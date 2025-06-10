import { describe } from "vitest";
import type { DriverTestConfig } from "../mod";
import { runWorkerStateTests } from "./worker-state";
import { runWorkerScheduleTests } from "./worker-schedule";

export function runWorkerDriverTests(
  driverTestConfig: DriverTestConfig
) {
  describe("Worker Driver Tests", () => {
    // Run state persistence tests
    runWorkerStateTests(driverTestConfig);
    
    // Run scheduled alarms tests
    runWorkerScheduleTests(driverTestConfig);
  });
}