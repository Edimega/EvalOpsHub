const [command] = process.argv.slice(2);

if (command !== "run") {
  console.error("Usage: npm run evalops -- run --api-url <url> --api-key <key> --dataset <slug> --prompt <name>");
  process.exit(2);
}

const args = new Map<string, string>();
for (let index = 3; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value) args.set(key.slice(2), value);
}

const apiUrl = args.get("api-url") ?? process.env.APP_URL;
const apiKey = args.get("api-key") ?? process.env.EVALOPS_API_KEY;
const datasetSlug = args.get("dataset");
const promptName = args.get("prompt");
const baselineRunId = args.get("baseline-run-id");

if (!apiUrl || !apiKey || !datasetSlug || !promptName) {
  console.error("Missing required --api-url, --api-key, --dataset or --prompt");
  process.exit(2);
}

const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/ci/evaluations`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ datasetSlug, promptName, baselineRunId })
});

const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));

if (!response.ok || payload.regressionDetected || payload.status === "failed") {
  process.exit(1);
}

export {};
