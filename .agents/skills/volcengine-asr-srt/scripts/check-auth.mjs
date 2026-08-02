#!/usr/bin/env node

import {createHeaders, createTaskId, loadConfig, postJson} from "./asr-common.mjs";

try {
  const config = await loadConfig();
  const taskId = createTaskId();
  const response = await postJson(config.queryUrl, createHeaders(config, taskId), {});
  const taskMissing = response.statusCode === "45000000" && /cannot find task/i.test(response.message);

  if (!taskMissing) {
    console.error(JSON.stringify({
      valid: false,
      httpStatus: response.httpStatus,
      statusCode: response.statusCode,
      message: response.message,
      logId: response.logId,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    valid: true,
    authMode: config.authMode,
    resourceId: config.resourceId,
    check: "authenticated query reached task lookup",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({valid: false, error: error.message}, null, 2));
  process.exit(1);
}
