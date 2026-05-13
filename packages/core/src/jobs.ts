import { Queue } from "bullmq";
import IORedis from "ioredis";

export const evaluationQueueName = "evaluation-runs";

export const getRedisConnection = () => {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new IORedis(url, { maxRetriesPerRequest: null });
};

export const enqueueEvaluationRun = async (runId: string) => {
  const connection = getRedisConnection();
  if (!connection) return false;

  const queue = new Queue(evaluationQueueName, { connection });
  await queue.add("execute", { runId }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500
  });
  await queue.close();
  await connection.quit();
  return true;
};
