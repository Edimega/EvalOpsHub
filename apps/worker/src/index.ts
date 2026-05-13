import { Worker } from "bullmq";
import { evaluationQueueName, executeEvaluationRun, getRedisConnection } from "@evalops/core";

const connection = getRedisConnection();

if (!connection) {
  throw new Error("REDIS_URL is required for the evaluation worker");
}

const worker = new Worker(evaluationQueueName, async (job) => {
  const runId = job.data?.runId;
  if (typeof runId !== "string") throw new Error("Job payload must include runId");
  await executeEvaluationRun(runId);
}, {
  connection,
  concurrency: Number(process.env.EVALUATION_WORKER_CONCURRENCY ?? 2)
});

worker.on("completed", (job) => {
  console.log(`Evaluation run job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`Evaluation run job ${job?.id ?? "unknown"} failed`, error);
});

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
