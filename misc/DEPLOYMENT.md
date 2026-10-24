# Deployment guide: from a blank machine to a running cluster

This guide rebuilds the whole setup on a new machine. Follow the steps in order.
Each command has a short note on what it does.

Example domain used throughout: `xtemplate.cc`. Replace it with yours if you fork this.

## How the pieces fit together

```
Browser
  -> Cloudflare (DNS + HTTPS)
  -> cloudflared pod (outbound tunnel, no open ports needed)
  -> Traefik (routes by hostname)
  -> oauth2-proxy check (is this person logged in via GitHub?)
  -> the app

Git push to main
  -> GitHub Actions builds image, scans it, pushes to GHCR,
     commits the new image digest into the deployment YAML
  -> Argo CD sees the commit and updates the cluster
```

| Hostname | What it serves | Login needed |
|---|---|---|
| `xtemplate.cc` | Landing page | No |
| `app1.xtemplate.cc` | Currency converter | Yes |
| `app2.xtemplate.cc` | Local LLM chat | Yes |
| `app3.xtemplate.cc` | Exercise tracker | Yes |

---

## 1. Prerequisites

### Accounts

- A **domain on Cloudflare** (its DNS must be managed by Cloudflare).
- A **GitHub account** that owns the repo, plus a **GitHub organisation with a team** (used to decide who may log in).
- Access to GitHub Container Registry (GHCR). It comes with your GitHub account.

### Tools on the new machine

| Tool | Why | Check it works |
|---|---|---|
| Docker | kind runs the cluster inside Docker containers | `docker version` |
| kind | creates the local cluster | `kind version` |
| kubectl | talks to the cluster | `kubectl version --client` |
| Helm | installs Traefik, Argo CD and Trivy Operator | `helm version` |
| git | gets the code | `git --version` |

### Machine size

The LLM app (app2) asks for 2 GB of memory and can use up to 4 GB. Give Docker at least **8 GB of RAM**
(on Docker Desktop: Settings, Resources). Ports **80 and 443** on the host must be free.

---

## 2. Get the code

```bash
git clone https://github.com/xtemplate24/cooltakehomechalenge.git
cd cooltakehomechalenge
```

**Using the original repo and its public images?** Skip to step 3.

**Forking it under your own account/domain?** Change these before going further:

| What | Where |
|---|---|
| Repo URL | `repoURL:` in every file in `gitops/` |
| Image owner (`ghcr.io/xtemplate24/...`) | `image:` line in every `deployment.yaml` under `app-deployments/` |
| Domain (`xtemplate.cc`) | every `ingress.yaml`, `platform/auth/oauth2-proxy.yaml`, `apps/landing/src/App.jsx` |
| GitHub org and team | `--github-org` and `--github-team` in `platform/auth/oauth2-proxy.yaml` |

To find every spot:

```bash
grep -rn "xtemplate" --include="*.yaml" --include="*.jsx" .
```

Then push your changes to your fork's `main` branch. The pipeline will build your images in step 9.

---

## 3. Create the cluster

```bash
kind create cluster --config cluster/kind-config.yaml
```

Creates a one-node cluster named `myowncluster`. The config labels the node `ingress-ready=true`
(Traefik looks for this label) and forwards host ports 80 and 443 into the node.

```bash
kubectl cluster-info --context kind-myowncluster
kubectl get nodes
```

Confirms the cluster answers. The node should show `Ready`.

---

## 4. Install Traefik (the front door)

```bash
helm repo add traefik https://traefik.github.io/charts --version 41.6.0
helm repo update
helm install traefik traefik/traefik \
  --namespace traefik --create-namespace \
  -f platform/traefik-values.yaml
```

Installs Traefik and its custom resource types (the `Middleware` kind used for login). The values file
binds it to the node's ports 80/443 and allows middlewares to be used across namespaces.

```bash
kubectl get pods -n traefik
```

Wait until the pod is `Running` and `1/1` ready.

> **Tip for an exact copy:** on the old machine run `helm list -A` to see chart versions, then add
> `--version X.Y.Z` to each `helm install` here.

---

## 5. Install Argo CD (the deployer)

```bash
helm repo add argo https://argoproj.github.io/argo-helm --version 10.9.2
helm repo update
helm install argocd argo/argo-cd \
  --namespace argocd --create-namespace \
  -f platform/argocd-values.yaml
```

Installs Argo CD. The values file turns off components a small cluster does not need and makes Argo
check the repo every 10 seconds.

```bash
kubectl get pods -n argocd
```

Wait until all pods are `Running`.

### Optional: open the Argo CD web UI

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Leave this running and open `https://localhost:8080` (accept the browser warning). User is `admin`.
Get the password in a second terminal:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

---

## 6. Set up login (GitHub OAuth + oauth2-proxy)

### 6a. Create a GitHub OAuth App

1. GitHub, then **Settings, Developer settings, OAuth Apps, New OAuth App**.
2. Fill in:
   - **Homepage URL:** `https://xtemplate.cc`
   - **Authorization callback URL:** `https://xtemplate.cc/oauth2/callback`
3. Click **Register application**, then **Generate a new client secret**.
4. Keep the **Client ID** and **Client secret** for the next step.

The callback stays on the main domain even though the apps use subdomains.

### 6b. Allow the app to see your organisation

oauth2-proxy only lets in members of the team named in `platform/auth/oauth2-proxy.yaml`
(`team-jared` / `team-xtemplate`). For that check to work:

- The team must exist and your users must be members.
- The organisation must allow the OAuth app: **Org settings, Third-party access** (approve it), or grant
  it access to the org when you first sign in.

### 6c. Create the namespace and the secret

```bash
kubectl apply -f platform/auth/auth-namespace.yaml
```

Creates the `auth` namespace with the `restricted` security level.

> **Check this file first.** The label must sit under `metadata:`, like this. If your copy has it under
> `spec:`, the security level is silently not applied:
> ```yaml
> apiVersion: v1
> kind: Namespace
> metadata:
>   name: auth
>   labels:
>     pod-security.kubernetes.io/enforce: restricted
> ```

```bash
COOKIE_SECRET=$(python3 -c 'import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')

kubectl create secret generic oauth2-proxy -n auth \
  --from-literal=client-id='YOUR_GITHUB_CLIENT_ID' \
  --from-literal=client-secret='YOUR_GITHUB_CLIENT_SECRET' \
  --from-literal=cookie-secret="$COOKIE_SECRET"
```

Stores the three secret values in the cluster. The cookie secret is random and is used to encrypt the
login cookie. The first command generates it, the second saves it.

These secrets are **not in git**. Never commit them.

### 6d. Deploy oauth2-proxy and the login middlewares

```bash
kubectl apply -f platform/auth/oauth2-proxy.yaml
kubectl apply -f platform/auth/oauth2-fowardauth.yaml
kubectl apply -f platform/auth/oauth2-proxy-ingress.yaml
```

- `oauth2-proxy.yaml`: the login service itself.
- `oauth2-fowardauth.yaml`: two Traefik middlewares. One asks oauth2-proxy "is this person logged in?"
  and the other shows the login page when the answer is no.
- `oauth2-proxy-ingress.yaml`: makes `https://xtemplate.cc/oauth2/...` reach oauth2-proxy (needed for the
  GitHub callback).

```bash
kubectl rollout status deployment/oauth2-proxy -n auth
```

Wait for "successfully rolled out".

---

## 7. Connect the internet with a Cloudflare Tunnel

### 7a. Create the tunnel

1. Cloudflare dashboard, **Zero Trust, Networks, Tunnels, Create a tunnel** (type: Cloudflared).
2. Name it, then copy the **token**. It is the long string after `--token` in the install command shown.

### 7b. Add the published routes

In the tunnel, open **Published application routes** and add one route per hostname:

| Hostname | Service |
|---|---|
| `xtemplate.cc` | `https://traefik.traefik.svc.cluster.local:443` |
| `app1.xtemplate.cc` | `https://traefik.traefik.svc.cluster.local:443` |
| `app2.xtemplate.cc` | `https://traefik.traefik.svc.cluster.local:443` |
| `app3.xtemplate.cc` | `https://traefik.traefik.svc.cluster.local:443` |

For every route, open **Additional settings, TLS** and turn on **No TLS Verify**. Traefik uses a
self-signed certificate, and without this setting you get a 502 error.

Cloudflare creates the DNS records for you. Check under **DNS, Records** that each hostname has a proxied
`CNAME` pointing to your tunnel.

### 7c. Run the tunnel inside the cluster

```bash
kubectl create namespace cloudflare

kubectl create secret generic cloudflare-tunnel-secret -n cloudflare \
  --from-literal=tunnel-token='YOUR_TUNNEL_TOKEN'

kubectl apply -f platform/cloudflare/cloudflare-tunnel.yaml
```

Creates the namespace, stores the token as a secret, and starts the `cloudflared` pod that opens an
outbound connection to Cloudflare. No router port forwarding is needed.

```bash
kubectl logs -n cloudflare deployment/cloudflared-tunnel --tail=20
```

Look for a line saying the tunnel connection is registered. In the Cloudflare dashboard the tunnel
should show **Healthy**.

---

## 8. Let Argo CD deploy the apps

```bash
kubectl apply -f gitops/
```

Creates one Argo CD `Application` per app. Each one watches a folder under `app-deployments/` and keeps the
cluster matching it (`prune` removes deleted files, `selfHeal` undoes manual changes).

```bash
kubectl get applications -n argocd
```

Wait until each shows `Synced` and `Healthy`. This can take a few minutes while images download.
If one shows an error about a path not existing, its `Application` file points to a folder that is no
longer in the repo. Delete that file from `gitops/`.

```bash
kubectl get pods -A
```

Every pod should end up `Running`. The app2 LLM pod is slow to start (it loads a large model).

### Images: can the cluster pull them?

GHCR packages are **private by default**. If pods show `ImagePullBackOff`, do one of:

- **Easiest:** on GitHub open the package (your profile, Packages), **Package settings, Change visibility,
  Public**.
- **Or** create a pull secret in each app namespace and reference it in the pod spec
  (`spec.template.spec.imagePullSecrets`):
  ```bash
  kubectl create secret docker-registry ghcr-pull -n <namespace> \
    --docker-server=ghcr.io \
    --docker-username=<github-user> \
    --docker-password=<token-with-read:packages>
  ```

---

## 9. GitHub Actions (building your own images)

Only needed if you forked, or when you change app code. Using the original public images, you can skip it.

- A push to `main` that touches an app folder triggers that app's workflow. You can also run any workflow
  by hand: GitHub, **Actions**, pick the workflow, **Run workflow**.
- Each run builds the image, scans it with Trivy, pushes to `ghcr.io/<owner>/<name>`, then commits the new
  image digest into the app's `deployment.yaml`. Argo CD notices that commit and rolls out the update.
- If you fork, run each workflow once so every `deployment.yaml` gets a digest for an image that exists
  in your registry.
- If you turn on **branch protection** for `main`, the pipeline's commit step will be blocked. Either allow
  the GitHub Actions bot to push, or change the pipeline to open a pull request.

---

## 10. (Optional) Install Trivy Operator (daily in-cluster scans)

```bash
helm repo add aqua https://aquasecurity.github.io/helm-charts/
helm repo update
helm install trivy-operator aqua/trivy-operator \
  --namespace trivy-system --create-namespace \
  -f platform/trivy-values.yaml \
  --set operator.webhookBroadcastURL="https://ntfy.sh/YOUR_SECRET_TOPIC"
```

Installs the scanner. It rescans every workload's image once a day and posts each report to your ntfy topic.
The topic name acts as a password, so choose a long random one and keep it out of git. Leave out the
`--set` line if you do not want notifications.

```bash
kubectl get vulnerabilityreports -A
```

Lists scan results. It may take a few minutes for the first reports to appear.

---

## 11. Check that everything works

Use a **private/incognito browser window** so old cookies do not interfere.

1. Open `https://xtemplate.cc`. The landing page loads with no login.
2. Click through to `https://app1.xtemplate.cc`. You are sent to GitHub, log in, and land on the app.
3. Open `https://app2.xtemplate.cc` and `https://app3.xtemplate.cc`. They open **without** a second
   login (the login cookie is shared across `.xtemplate.cc`).
4. In app3, log a session, then reload. The data stays (it is stored on a persistent volume).
5. Try a user who is not in the GitHub team. They should be refused.

---

## 12. Everyday operations

### Change an app

Edit code under `apps/...`, commit, push to `main`. Pipeline builds, Argo deploys. Nothing else to do.

### Add a new app

1. Create the app under `apps/<name>/` with a Dockerfile (Vite apps use `base: "/"`).
2. Add a small workflow in `.github/workflows/` that calls `build-image.yaml` (copy an existing one).
3. Run the **create-lockfile** workflow once for the new app folder (it generates `package-lock.json`).
4. Add manifests under `app-deployments/<name>/`: namespace, deployment, service, ingress. The ingress uses
   host `<name>.xtemplate.cc`, path `/`, and the two middlewares
   `auth-oauth2-proxy-errors@kubernetescrd, auth-oauth2-proxy-auth@kubernetescrd` (no trailing comma).
5. Add an Argo CD `Application` file in `gitops/` and `kubectl apply -f` it.
6. Add a published route for `<name>.xtemplate.cc` in the Cloudflare tunnel.

### Back up app3's data

app3 keeps its SQLite database on a volume inside the kind node. **Deleting the cluster deletes it.** To
copy it out first:

```bash
POD=$(kubectl get pod -n app3 -l app=app3-backend -o jsonpath='{.items[0].metadata.name}')
kubectl cp app3/$POD:/data/app3.db ./app3-backup.db
```

### Remove everything

```bash
kind delete cluster --name myowncluster
```

Deletes the cluster and everything in it. Also delete the tunnel in Cloudflare and the OAuth app in GitHub
if you no longer need them.

---

## 13. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `404 page not found` on an app host | Ingress path or middleware list is wrong | Path must be `/` (app3 also `/api`). Check the middleware annotation has no trailing comma. |
| Cloudflare 502 | Tunnel cannot reach Traefik | Check `No TLS Verify` is on and `kubectl get pods -n traefik` shows Running. |
| Cloudflare 1033 / tunnel down | `cloudflared` not connected | `kubectl logs -n cloudflare deployment/cloudflared-tunnel`; check the token secret. |
| Page loads but is blank, JS/CSS 404 | Image still has the old Vite `base` | Make sure `base: "/"` is set and the pipeline has rebuilt and redeployed. |
| "Found" link page before GitHub | Normal. The errors middleware shows the redirect body | Click it, or ignore it. Login still works. |
| Login loops or "redirect not allowed" | Cookie/whitelist settings | `kubectl logs deployment/oauth2-proxy -n auth`; check `--cookie-domain`, `--whitelist-domain`, and that the callback URL matches exactly. |
| Login says forbidden | User not in the GitHub team, or org has not approved the OAuth app | Check team membership and org third-party access. |
| `ImagePullBackOff` | GHCR package is private | See "Images: can the cluster pull them?" in step 8. |
| app2-llm pod `Pending` or `OOMKilled` | Not enough memory for Docker | Raise Docker's memory to 8 GB or more. |
| Argo shows `OutOfSync` and reverts your edit | `selfHeal` is working as designed | Change files in git, not with `kubectl edit`. |
| Argo error about a missing path | An `Application` points to a deleted folder | Fix or delete that file in `gitops/`. |

Useful commands:

```bash
kubectl get pods -A                                   # everything running?
kubectl describe pod <name> -n <namespace>            # why is this pod unhappy?
kubectl logs -n traefik deployment/traefik --tail=50  # routing problems
kubectl get ingress -A                                # what hosts and paths exist
kubectl get applications -n argocd                    # Argo sync status
```

---

## 14. Secrets and security notes

- **Secrets that exist outside git:** the `oauth2-proxy` secret (GitHub client ID and secret, cookie secret),
  the `cloudflare-tunnel-secret` (tunnel token), and optionally the ntfy topic. Keep copies in a password
  manager. If one leaks, rotate it: generate a new GitHub client secret, refresh the Cloudflare tunnel token,
  or pick a new ntfy topic, then update the Kubernetes secret and restart the pod.
- **Never commit tokens** to the repo, including notes files. If a token has ever been committed, treat it as
  leaked: rotate it, and remove it from git history as well as from the current files.
- The Traefik certificate is self-signed. This is fine because Cloudflare serves the public HTTPS certificate
  and only talks to Traefik over the private tunnel.
- All app namespaces enforce the `restricted` pod security level: non-root, no privilege escalation, all
  capabilities dropped, read-only root filesystem.
