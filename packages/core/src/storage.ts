import { PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

export const getS3Client = () => {
  const config: S3ClientConfig = {
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"
  };

  if (process.env.S3_ENDPOINT) config.endpoint = process.env.S3_ENDPOINT;
  if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    };
  }

  return new S3Client(config);
};

export const storeArtifact = async (key: string, body: string, contentType: string) => {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is required to store artifacts");

  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  }));

  return { bucket, key };
};
