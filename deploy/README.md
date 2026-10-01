# Phase 8 deployment and owner validation

Local implementation is ready for validation. Nothing in this directory has been applied to EC2 or AWS. Do not mark Phase 8 complete until the checks below pass. Keep the current PM2 process name if it differs from `game-library`, and avoid running two app processes.

## 1. Mount the attached data volume

On EC2, inspect `lsblk -f`, `findmnt /` and the attached volume ID in the EC2 console. Identify the separate data volume, its filesystem and UUID. Do not format a volume containing data. If the new volume has no filesystem, create one only after matching its device to the intended EBS volume ID, following the [AWS EBS instructions](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-using-volumes.html).

```sh
sudo mkdir -p /mnt/game-library-data
sudo cp /etc/fstab /etc/fstab.before-game-library
```

Add one entry to `/etc/fstab`, replacing `DATA_FILESYSTEM_UUID` and `FILESYSTEM_TYPE` with the verified values. Use `ext4` with final field `2`, or `xfs` with final field `0`.

```text
UUID=DATA_FILESYSTEM_UUID /mnt/game-library-data FILESYSTEM_TYPE defaults,nofail 0 2
```

```sh
sudo mount /mnt/game-library-data
findmnt --mountpoint /mnt/game-library-data -o SOURCE,UUID,FSTYPE,TARGET
sudo chown ec2-user:ec2-user /mnt/game-library-data
sudo chmod 750 /mnt/game-library-data
```

The directory must be on the separate filesystem. SQLite's journal/sidecar files stay beside the database. The startup and migration guards require both this exact mount and its configured UUID; they reject the root filesystem.

## 2. Configure S3 and IAM

In `us-east-1`, confirm bucket `infs3701-game-library-images` has all four Block Public Access settings enabled, Object Ownership set to Bucket owner enforced, and default SSE-S3 encryption. Remove public grants if any exist. Do not add public ACLs or a public bucket policy. If SSE-KMS is required instead, an appropriate KMS policy is additionally needed; the supplied policy assumes SSE-S3.

Create or reuse an EC2 role with the trust policy in `ec2-role-trust.json`. Attach `s3-cover-policy.json`, put the role in an instance profile, and attach that profile to this EC2 instance. The app uses the AWS SDK credential chain and requires no static access keys. Bucket management and snapshot administration are operator permissions, separate from this role. The app has no authentication; application image endpoints remain publicly readable.

## 3. Install and start the updated app

Copy the reviewed source, lockfile, Prisma migrations and deploy files to `/home/ec2-user/infs3701-game-library`. Stop the old app before switching. Use Node.js 24. Create `.env` in that directory with:

```dotenv
STORAGE_MODE=ebs
DATABASE_URL=file:/mnt/game-library-data/game-library.sqlite
EBS_VOLUME_UUID=DATA_FILESYSTEM_UUID
AWS_REGION=us-east-1
S3_BUCKET=infs3701-game-library-images
```

Do not set `S3_ENDPOINT` or AWS access keys on EC2. Install dev dependencies too, since the migration CLI and cleanup runner use them.

```sh
cd /home/ec2-user/infs3701-game-library
npm ci
npm run db:deploy
npm run build
```

In the existing Nginx server block, set `client_max_body_size 6m;` and `proxy_read_timeout 180s;`. The application independently enforces 5 MiB for the file, plus a bounded multipart envelope. Run `sudo nginx -t` before reloading Nginx.

For the PM2 startup service, confirm its name with `systemctl status pm2-ec2-user`. Install `pm2-mount.conf` as `/etc/systemd/system/pm2-ec2-user.service.d/mount.conf` (adjust for the actual service). Run `sudo systemctl daemon-reload`. This dependency applies to every app managed by that PM2 service; use a dedicated service if other apps must run without the volume.

```sh
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 logs game-library --lines 50
```

If PM2 startup integration is absent, run `pm2 startup` as `ec2-user` and execute the exact installation command it prints, then `pm2 save`. Do not use `STORAGE_MODE=local` on EC2.

Copy `game-library-cleanup.service` and `game-library-cleanup.timer` to `/etc/systemd/system/`. First update the service's PATH if Node/npm are installed under nvm; use the directory shown by `command -v node` and `command -v npm`.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now game-library-cleanup.timer
sudo systemctl start game-library-cleanup.service
sudo journalctl -u game-library-cleanup.service -n 30
```

Failed deletions remain in SQLite and retry every five minutes, even without browser traffic. Pending uploads left by a crash become eligible after 24 hours. Each run processes at most 100 objects. Monitor failed service runs; a long outage may need repeated `npm run covers:cleanup` runs to drain a backlog.

## 4. Validate the running app

Record results, screenshots and relevant logs for these checks:

1. Create a game with every field. Reload, edit, clear optional fields, move Kanban status, and delete another record. A duplicate title with changed case, spaces or full-width Latin letters must return 409. Concurrent duplicate requests must produce one record.
2. Restart the app with `pm2 restart game-library`. Confirm the game and fields remain. Reboot EC2, reconnect, confirm the EBS mount, PM2 and cleanup timer, then check the same record again.
3. Upload a JPEG, PNG and WebP. Confirm the preview before saving and image delivery after reloading. Edit only the title and confirm the same uploaded image remains. Reject files over 5 MiB, SVG, corrupt images and files whose bytes do not match their declared type. Still images are limited to 40 megapixels.
4. Replace an upload with another upload, an external URL and a placeholder. Delete a game with an upload. Check in the S3 console that the old `covers/` objects are gone. A duplicate-title save with a new image must leave the original record/cover unchanged and remove the unused object.
5. Temporarily deny `s3:DeleteObject` on the test role, replace/delete a cover, then restore the permission. The game change should succeed; the old object should disappear after cleanup retries. Temporarily deny `s3:PutObject`; saving an upload should fail with the form and selected image available for retry. Restore permissions afterward.
6. Copy a current object's key from the S3 console. From an unauthenticated client, `curl -I 'https://infs3701-game-library-images.s3.us-east-1.amazonaws.com/covers/OBJECT_ID'` must return 403. The matching `/api/covers/OBJECT_ID` application URL must return 200 and an image content type.

### Missing-mount test

Use a maintenance window. Stop PM2's systemd service and the cleanup timer/service, verify no process is using the volume, then unmount it. From the app directory run `npm run db:deploy` and `npm start`; both must fail before opening a database. Confirm no `game-library.sqlite` appeared in the underlying root-volume directory. Remount the volume, start the PM2 service and cleanup timer, then verify the saved game. If unmount reports busy, identify the process; do not force-unmount.

## 5. Configure and verify EBS backups

In the EBS console create a Data Lifecycle Manager custom EBS snapshot policy targeting only the separate data volume via a dedicated tag such as `Backup=game-library`. Suggested starting schedule: daily, retain seven snapshots. Use the DLM service role, not the app's S3 role. Record the policy ID, selected volume and a completed snapshot. For application-consistent scheduled snapshots configure DLM pre/post scripts to pause writers; the schedule alone does not prove application consistency. See [AWS DLM snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-ami-policy.html) and [application-consistent snapshots](https://docs.aws.amazon.com/en_en/ebs/latest/userguide/automate-app-consistent-backups.html).

For the initial restore drill, stop the PM2 app and cleanup service/timer, run `sync`, create a manual snapshot of the data volume, wait until it is complete, and then resume services. AWS recommends pausing volume writes for consistent snapshots. See [EBS snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-snapshots.html).

Create a new volume from that snapshot in the instance's Availability Zone. Attach it and mount its explicitly identified device at `/mnt/game-library-restore`; never replace or format the live volume during the drill. Restored filesystems may have the original UUID, so mount by the verified device, and use the filesystem's documented duplicate-UUID option if needed. Query the restored database read-only:

```sh
sqlite3 -readonly /mnt/game-library-restore/game-library.sqlite 'PRAGMA integrity_check; SELECT id, titleKey FROM Game;'
```

Expected result is `ok` plus the saved game. Install the SQLite CLI if it is not available. Keep the snapshot and restore evidence; unmount and remove only the temporary restored volume after verification.

EBS snapshots back up database records, including object references, but do not back up S3 objects. Covers deleted since an older snapshot cannot be recovered from EBS; recovering historical cover images needs a separate S3 retention/version-recovery policy. Do not claim full image recovery from this drill.

Phase 8 remains awaiting owner validation until the deployment, restart, missing-mount, S3 privacy/cleanup and backup/restore checks above are recorded.
