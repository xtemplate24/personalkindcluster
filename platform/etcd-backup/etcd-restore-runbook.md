# k3s etcd restore runbook (home lab)

Backups: nightly CronJob `etcd-backup` (namespace `etcd-backup`) uploads encrypted snapshots via rclone to Google Drive folder `k3s-etcd-backups` (encrypted remote `secret:`, transport remote `gdrive:`). Kept 30 days. The k3s server token is uploaded as `secret:k3s-token`.

**What you need:** rclone installed + your `rclone.conf` (from the password manager). Without that file (or the two crypt passwords + Google client ID/secret), the backups cannot be decrypted.

**What a restore brings back:** all cluster state (Deployments, Secrets, ConfigMaps, Ingresses, Argo CD apps, the rclone-config Secret). **Not** data inside volumes (local-path PVs, MinIO files, app databases).

## Part A: Download and decrypt (on your laptop)

1. If rclone.conf isn't on this machine: install rclone, run `rclone config file` to see where it expects the config, and put your saved `rclone.conf` there.
2. List the backups:
   `rclone ls secret:snapshots/`
3. Download one plus the token (rclone decrypts automatically on download):
   ```
   mkdir restore
   rclone copy secret:snapshots/etcd-snapshot-YYYY-MM-DD_HHMM.db.gz ./restore/
   rclone copy secret:k3s-token ./restore/
   ```
4. Unzip: `gunzip restore/etcd-snapshot-YYYY-MM-DD_HHMM.db.gz`
5. Copy to the server:
   `scp restore/* <user>@xtemplatehomelab.local:/tmp/`

## Part B: Restore on the same machine (k3s still installed, cluster broken/messed up)

```
sudo systemctl stop k3s
sudo k3s server --cluster-reset --cluster-reset-restore-path=/tmp/etcd-snapshot-YYYY-MM-DD_HHMM.db
# wait for the message saying to restart without --cluster-reset; it exits by itself
sudo systemctl start k3s
kubectl get nodes
kubectl get pods -A
```
If it complains about the token, add `--token="$(sudo cat /tmp/k3s-token)"` to the cluster-reset command.

## Part C: Restore onto a fresh install (new disk / new machine)

1. Create `/etc/rancher/k3s/config.yaml`:
   ```yaml
   cluster-init: true
   disable: traefik
   token: <paste the full contents of the k3s-token file>
   ```
2. Install k3s (ideally the same version as before):
   `curl -sfL https://get.k3s.io | sh -`
3. Restore:
   ```
   sudo systemctl stop k3s
   sudo k3s server --cluster-reset --cluster-reset-restore-path=/tmp/etcd-snapshot-YYYY-MM-DD_HHMM.db
   sudo systemctl start k3s
   ```
4. If the hostname changed, the old node shows NotReady: `kubectl delete node <old-node-name>`. Pods reschedule onto the new node.
5. Apps with volumes start empty (PV data isn't in etcd). Argo CD resyncs from git; the backup CronJob resumes on its own.
