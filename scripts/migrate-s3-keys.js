#!/usr/bin/env node

/**
 * Migrate existing flat S3 keys to namespaced locations.
 *
 * Copies:
 *   boards.json          -> data/RHOAIENG/boards.json
 *   teams.json           -> data/RHOAIENG/teams.json
 *   dashboard-summary.json -> data/RHOAIENG/dashboard-summary.json
 *   sprints/*.json       -> data/RHOAIENG/sprints/*.json
 *
 * Also writes config/orgs.json with the initial org configuration.
 *
 * Old keys are kept intact for fallback reads during the transition period.
 *
 * Usage:
 *   # Dry run (default) — shows what would be copied
 *   node scripts/migrate-s3-keys.js
 *
 *   # Execute the migration
 *   node scripts/migrate-s3-keys.js --execute
 *
 *   # Use a specific S3 bucket
 *   S3_BUCKET=my-bucket node scripts/migrate-s3-keys.js --execute
 *
 * IMPORTANT: Prepend with rh-aws-saml-login for production:
 *   rh-aws-saml-login iaps-rhods-odh-dev node scripts/migrate-s3-keys.js --execute
 */

const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, CopyObjectCommand } = require('@aws-sdk/client-s3');

const S3_BUCKET = process.env.S3_BUCKET;
const PROJECT_KEY = 'RHOAIENG';
const DRY_RUN = !process.argv.includes('--execute');

if (!S3_BUCKET) {
  console.error('Error: S3_BUCKET environment variable is required.');
  console.error('Usage: S3_BUCKET=my-bucket node scripts/migrate-s3-keys.js [--execute]');
  process.exit(1);
}

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

async function listKeys(prefix) {
  const keys = [];
  let continuationToken;

  do {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken
    });

    const response = await s3Client.send(command);
    if (response.Contents) {
      keys.push(...response.Contents.map(obj => obj.Key));
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function copyKey(sourceKey, destKey) {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${sourceKey} -> ${destKey}`);
    return;
  }

  const command = new CopyObjectCommand({
    Bucket: S3_BUCKET,
    CopySource: `${S3_BUCKET}/${sourceKey}`,
    Key: destKey
  });

  await s3Client.send(command);
  console.log(`  [copied] ${sourceKey} -> ${destKey}`);
}

async function putJson(key, data) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would write ${key}`);
    return;
  }

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json'
  });

  await s3Client.send(command);
  console.log(`  [wrote] ${key}`);
}

async function keyExists(key) {
  try {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NoSuchKey') return false;
    throw error;
  }
}

async function main() {
  console.log(`\nMigrating S3 keys in bucket: ${S3_BUCKET}`);
  console.log(`Project: ${PROJECT_KEY}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (use --execute to apply)' : 'EXECUTING'}\n`);

  let copyCount = 0;

  // 1. Copy top-level files
  const topLevelFiles = ['boards.json', 'teams.json', 'dashboard-summary.json'];
  console.log('--- Top-level files ---');
  for (const file of topLevelFiles) {
    const exists = await keyExists(file);
    if (exists) {
      await copyKey(file, `data/${PROJECT_KEY}/${file}`);
      copyCount++;
    } else {
      console.log(`  [skip] ${file} (not found)`);
    }
  }

  // 2. Copy sprint files
  console.log('\n--- Sprint files ---');
  const sprintKeys = await listKeys('sprints/');
  // Filter out keys that are already namespaced
  const flatSprintKeys = sprintKeys.filter(k => !k.startsWith('data/'));
  console.log(`Found ${flatSprintKeys.length} sprint files`);

  for (const key of flatSprintKeys) {
    await copyKey(key, `data/${PROJECT_KEY}/${key}`);
    copyCount++;
  }

  // 3. Write org config
  console.log('\n--- Org config ---');
  const orgConfig = {
    orgName: 'AI Engineering',
    projects: [
      { key: 'RHOAIENG', name: 'OpenShift AI Engineering', pillar: 'OpenShift AI' }
    ]
  };
  await putJson('config/orgs.json', orgConfig);

  console.log(`\nDone. ${DRY_RUN ? 'Would copy' : 'Copied'} ${copyCount} files.`);
  if (DRY_RUN) {
    console.log('Run with --execute to apply changes.\n');
  }
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
