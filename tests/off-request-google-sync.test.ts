import test from "node:test";
import assert from "node:assert/strict";

import { buildOffRequestGoogleSheetSync } from "../lib/google/off-schedule.ts";

test("approve weekly off generates OFF_WEEKLY update", () => {
  const updates = buildOffRequestGoogleSheetSync({
    rider_code: "R001",
    rider_name: "Nguyễn Văn A",
    off_date: "2026-08-18",
    request_type: "WEEKLY",
    action: "APPROVE",
  });

  assert.deepEqual(updates, [{
    rider_code: "R001",
    rider_name: "Nguyễn Văn A",
    work_date: "2026-08-18",
    status: "OFF_WEEKLY",
  }]);
});

test("reject approved off clears the sheet cell", () => {
  const updates = buildOffRequestGoogleSheetSync({
    rider_code: "R002",
    rider_name: "Trần Thị B",
    off_date: "2026-08-19",
    request_type: "PLANNED",
    action: "REJECT",
  });

  assert.deepEqual(updates, [{
    rider_code: "R002",
    rider_name: "Trần Thị B",
    work_date: "2026-08-19",
    status: "ON",
  }]);
});
