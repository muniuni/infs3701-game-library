#!/bin/bash
# Runs ON an app instance as root, for the IAM and TLS evidence (§7 item 8).
# `infra/evidence/capture.sh instance` sends it through SSM Run Command and saves
# the output; it is never stored on the instance. Read-only: the one write it
# tries (outside covers/) is expected to be refused.
set -u
set -a
# shellcheck source=/dev/null
. /etc/game-library/stack.env
set +a
export AWS_PAGER=""

attempt() {
  echo
  echo "\$ $*"
  "$@" 2>&1
  echo "[exit $?]"
}

token=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
meta() { curl -fsS -H "X-aws-ec2-metadata-token: $token" "http://169.254.169.254/latest/meta-data/$1"; }
echo "== $(date -Is) on $(meta instance-id) in $(meta placement/availability-zone), bucket $S3_BUCKET"

echo
echo "--- Who the instance is (LabInstanceProfile → LabRole)"
attempt aws sts get-caller-identity --query Arn --output text

echo
echo "--- Refused: list the bucket (only Get/Put/DeleteObject on covers/* is allowed)"
attempt aws s3 ls "s3://$S3_BUCKET/"
attempt aws s3 ls "s3://$S3_BUCKET/covers/"

echo
echo "--- Refused: read and write outside covers/"
attempt aws s3api head-object --bucket "$S3_BUCKET" --key outside-covers.txt
echo "s4 evidence" >/tmp/s4-outside-covers.txt
attempt aws s3 cp /tmp/s4-outside-covers.txt "s3://$S3_BUCKET/outside-covers.txt"
rm -f /tmp/s4-outside-covers.txt

echo
echo "--- Allowed: read an existing cover the app uploaded"
key=$(curl -fsS http://127.0.0.1:3000/api/games | node -e '
  let body = "";
  process.stdin.on("data", (d) => (body += d)).on("end", () => {
    const game = JSON.parse(body).find((g) => g.cover && g.cover.type === "upload");
    console.log(game ? "covers/" + game.cover.url.split("/").pop() : "");
  });')
if [[ -n $key ]]; then
  attempt aws s3api head-object --bucket "$S3_BUCKET" --key "$key" \
    --query '{ContentType:ContentType,ContentLength:ContentLength,ServerSideEncryption:ServerSideEncryption}'
else
  echo "(no uploaded cover yet: add a game with an uploaded cover, then rerun)"
fi

echo
echo "--- Database connections over TLS (pg_stat_ssl, as the app user through the DB wrapper)"
# shellcheck disable=SC2016 # expanded by node / the inner shell
pg_ssl_js='
const fs = require("fs");
const { Client } = require("pg");
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { ca: fs.readFileSync(process.env.DATABASE_CA_FILE, "utf8"), rejectUnauthorized: true },
});
(async () => {
  await client.connect();
  const { rows } = await client.query(`
    select a.client_addr::text as client, s.ssl, s.version, s.cipher, a.application_name, a.state
    from pg_stat_ssl s join pg_stat_activity a using (pid)
    where a.datname = current_database() order by 1, 5`);
  console.table(rows);
  const server = await client.query("select current_setting(\x27ssl\x27) as ssl, version()");
  console.table(server.rows);
  await client.end();
})().catch((error) => { console.error(error.message); process.exit(1); });'
# shellcheck disable=SC2016
attempt runuser -u game-library -- env -C /opt/game-library HOME=/var/lib/game-library \
  bash -c 'set -a; . /etc/game-library/app.env; set +a; exec node scripts/with-database-url.mjs node -e "$1"' _ "$pg_ssl_js"
