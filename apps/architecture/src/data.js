// =====================================================================
// Everything the diagram shows lives here. To change the diagram, edit
// this file only — App.jsx just draws whatever is in these lists.
//
// Each node:
//   id       unique key
//   name     label on the tile
//   sub      small second line on the tile
//   icon     key into the icons in Icons.jsx
//   access   "public" | "private" | "platform" | "external" | "infra"
//   ns       Kubernetes namespace (optional)
//   url      link shown in the popup (optional, public pages only matter)
//   about    one or two plain sentences: what it is
//   facts    short bullet points shown in the popup
// =====================================================================

// ---------------------------------------------------------------------
// View 1: how a visitor's request reaches an app
// ---------------------------------------------------------------------
export const requestPath = {
  // layers ABOVE the cluster box
  outside: [
    {
      id: "visitors",
      label: "Visitors",
      nodes: [
        {
          id: "browser",
          name: "Browser",
          sub: "phone or laptop",
          icon: "browser",
          access: "external",
          about: "Anyone on the internet opening an *.xtemplate.cc address.",
          facts: [
            "Talks HTTPS to Cloudflare only, never to the home network directly",
            "Signed-in visitors carry one cookie shared across .xtemplate.cc",
          ],
        },
      ],
      link: "HTTPS",
    },
    {
      id: "edge",
      label: "Edge",
      nodes: [
        {
          id: "cloudflare",
          name: "Cloudflare",
          sub: "DNS + HTTPS",
          icon: "cloud",
          access: "external",
          about:
            "Owns the xtemplate.cc domain. Terminates public HTTPS and forwards each hostname down the tunnel.",
          facts: [
            "One published route per subdomain → Traefik inside the cluster",
            "Routes use No TLS Verify because Traefik serves a self-signed cert",
            "Hides the home IP address from visitors",
          ],
        },
      ],
      link: "outbound tunnel · no open ports",
    },
  ],

  // layers INSIDE the cluster box
  cluster: [
    {
      id: "entry",
      label: "Way in",
      nodes: [
        {
          id: "cloudflared",
          name: "cloudflared",
          sub: "tunnel pod",
          icon: "tunnel",
          access: "infra",
          ns: "cloudflare",
          about:
            "A pod that dials OUT to Cloudflare and keeps the connection open. Requests come back down that connection, so the router needs no port forwarding.",
          facts: [
            "Tunnel token kept in a Kubernetes Secret, never in git",
            "The only way into the cluster from the internet",
          ],
        },
      ],
      link: "every request",
    },
    {
      id: "routing",
      label: "Routing + login",
      nodes: [
        {
          id: "traefik",
          name: "Traefik",
          sub: "routes by hostname",
          icon: "route",
          access: "infra",
          ns: "traefik",
          about:
            "The ingress controller. Reads the hostname (each app has its own subdomain) and sends the request to the matching app's Service.",
          facts: [
            "Installed with Helm; k3s's bundled Traefik is turned off",
            "Private apps have a ForwardAuth middleware on their Ingress",
            "Roughly the same job as an OpenShift Route",
          ],
        },
        {
          id: "oauth2",
          name: "oauth2-proxy",
          sub: "GitHub team check",
          icon: "lock",
          access: "infra",
          ns: "auth",
          about:
            "Before a private app answers, Traefik asks oauth2-proxy: is this person signed in with GitHub and in the right team? If not, they go to the GitHub login page.",
          facts: [
            "Must be a member of an approved GitHub team",
            "One login covers every subdomain",
            "Passes the GitHub username to apps as X-Auth-Request-User",
          ],
        },
      ],
      link: "hostname → Service",
    },
    {
      id: "apps",
      label: "Apps",
      nodes: [
        {
          id: "public-apps",
          name: "Public apps",
          sub: "open to anyone",
          icon: "globe",
          access: "public",
          about:
            "Apps anyone can open without signing in. Their Ingress has no login middleware, so Traefik sends requests straight through.",
          facts: [
            "Each app gets its own namespace and subdomain",
            "Public apps store nothing about visitors on the server",
            "Includes this page: static files served by unprivileged nginx",
          ],
        },
        {
          id: "private-apps",
          name: "Private apps",
          sub: "login required",
          icon: "lock",
          access: "private",
          about:
            "Apps only approved people can use. Traefik checks with oauth2-proxy first; anyone not signed in is sent to the GitHub login.",
          facts: [
            "Each app gets its own namespace and subdomain",
            "Apps know who is signed in from a header oauth2-proxy adds",
            "Most follow a frontend + backend pattern (two pods)",
            "Data kept on persistent volumes, per signed-in user",
          ],
        },
      ],
      link: "reads / writes",
    },
    {
      id: "platform",
      label: "Platform · admin only",
      nodes: [
        {
          id: "argocd",
          name: "Argo CD",
          sub: "GitOps",
          icon: "sync",
          access: "platform",
          ns: "argocd",
          about:
            "Watches the app-deployments/ folder in GitHub and makes the cluster match it. Pushing to git is how things get deployed.",
          facts: [
            "One Application per app, auto-sync on",
            "UI at argocd.xtemplate.cc, behind the same login",
          ],
        },
        {
          id: "headlamp",
          name: "Headlamp",
          sub: "cluster console",
          icon: "console",
          access: "platform",
          ns: "headlamp",
          about: "A web dashboard for browsing pods, logs and resources, similar to the OpenShift console.",
          facts: ["Served at console.xtemplate.cc, behind the login"],
        },
        {
          id: "monitoring",
          name: "Monitoring",
          sub: "Prometheus · Grafana",
          icon: "chart",
          access: "platform",
          ns: "monitoring",
          about:
            "kube-prometheus-stack: Prometheus collects metrics, Grafana draws dashboards, Alertmanager sends alerts.",
          facts: [
            "Scrapes every 60 s, keeps 5 days (or 8 GB)",
            "Alerts go to a Discord channel, including when resolved",
            "Grafana at grafana.xtemplate.cc, behind the login",
          ],
        },
        {
          id: "trivy",
          name: "Trivy Operator",
          sub: "daily CVE scans",
          icon: "shield",
          access: "platform",
          ns: "trivy-system",
          about:
            "Re-scans every running image once a day, so newly published vulnerabilities show up even if nothing was rebuilt.",
          facts: [
            "Results stored as VulnerabilityReport objects",
            "Covers third-party images too (Traefik, Grafana, …)",
          ],
        },
      ],
      link: "stores data on",
    },
    {
      id: "storage",
      label: "Storage",
      nodes: [
        {
          id: "localpath",
          name: "local-path",
          sub: "volumes on NVMe",
          icon: "disk",
          access: "infra",
          about:
            "k3s's built-in storage provisioner. A PersistentVolumeClaim becomes a folder on the EliteDesk's disk.",
          facts: [
            "Holds app databases, Prometheus (10 GB) and Grafana",
            "Single disk, backups are manual for now",
          ],
        },
        {
          id: "minio",
          name: "MinIO",
          sub: "S3 object store",
          icon: "bucket",
          access: "infra",
          about: "An S3-compatible store for file uploads.",
          facts: ["A NetworkPolicy lets only the owning app's backend reach it"],
        },
      ],
    },
  ],

  // the box the cluster layers sit in
  node: {
    id: "elitedesk",
    name: "HP EliteDesk 800 G4",
    sub: "k3s · single node · Ubuntu",
    icon: "server",
    access: "infra",
    about:
      "One small desktop PC runs the whole cluster 24/7. k3s is a lightweight Kubernetes that fits in a single process.",
    facts: [
      "i5-8500T, 16 GB RAM, 512 GB NVMe",
      "Ubuntu, managed over SSH; dual-boots Windows",
      "Every app namespace enforces Pod Security 'restricted'",
      "Containers run non-root with a read-only filesystem",
    ],
  },

  // services the apps call out to (shown under the cluster box)
  external: {
    label: "Outside services the cluster calls",
    nodes: [
      {
        id: "github-oauth",
        name: "GitHub OAuth",
        sub: "login",
        icon: "github",
        access: "external",
        about: "oauth2-proxy sends visitors here to sign in, then checks their team membership.",
        facts: ["Only members of an approved team get through"],
      },
      {
        id: "public-apis",
        name: "Public APIs",
        sub: "live data",
        icon: "globe",
        access: "external",
        about: "Some apps pull live data from free public APIs.",
        facts: [
          "Called from each app's backend, not the visitor's browser",
          "API keys kept in Kubernetes Secrets, never in git",
        ],
      },
      {
        id: "discord",
        name: "Discord",
        sub: "alerts",
        icon: "bell",
        access: "external",
        about: "Alertmanager posts firing and resolved alerts to a Discord webhook.",
        facts: ["Noisy info-level and heartbeat alerts are dropped"],
      },
    ],
  },
};

// ---------------------------------------------------------------------
// View 2: how code gets from a git push to a running pod
// ---------------------------------------------------------------------
export const deployPath = [
  {
    id: "push",
    step: "01",
    name: "git push to main",
    sub: "edit code under apps/",
    icon: "git",
    access: "external",
    about: "All changes start as a commit. No kubectl from a laptop.",
    facts: [
      "Each image has its own small workflow",
      "A workflow only runs when files in its app folder change",
    ],
  },
  {
    id: "build",
    step: "02",
    name: "Build",
    sub: "GitHub Actions",
    icon: "build",
    access: "infra",
    about: "The shared build-image workflow builds the Docker image on a GitHub runner, but doesn't push it yet.",
    facts: [
      "One reusable template, one caller per image",
      "Third-party actions pinned to commit SHAs",
    ],
  },
  {
    id: "scan",
    step: "03",
    name: "Scan",
    sub: "Trivy",
    icon: "shield",
    access: "infra",
    about: "Trivy checks the fresh image for HIGH and CRITICAL vulnerabilities that already have a fix.",
    facts: ["Currently reports without blocking (exit-code 0)"],
  },
  {
    id: "ghcr",
    step: "04",
    name: "Push",
    sub: "GHCR",
    icon: "box",
    access: "infra",
    about: "The image is pushed to GitHub's container registry, tagged with the git commit.",
    facts: [
      "Logs in with the short-lived per-run GITHUB_TOKEN",
      "A weekly job keeps the 5 newest versions of each image",
    ],
  },
  {
    id: "commit",
    step: "05",
    name: "Pin digest",
    sub: "bot commit",
    icon: "pin",
    access: "infra",
    about:
      "A second job writes image@sha256:<digest> into the app's deployment.yaml and commits it as github-actions[bot].",
    facts: [
      "Pinning by digest means what runs is exactly what was scanned",
      "Only this job gets permission to write to the repo",
    ],
  },
  {
    id: "sync",
    step: "06",
    name: "Sync",
    sub: "Argo CD",
    icon: "sync",
    access: "platform",
    about: "Argo CD sees the new commit and rolls the change out to the cluster automatically.",
    facts: ["Auto-sync is on, so step 05 is what actually deploys"],
  },
  {
    id: "run",
    step: "07",
    name: "Running",
    sub: "k3s on the EliteDesk",
    icon: "server",
    access: "public",
    about: "Kubernetes starts the new pod, waits for it to be ready, then retires the old one.",
    facts: ["Trivy Operator keeps re-scanning it daily from here on"],
  },
];

// ---------------------------------------------------------------------
// Coming next (from the README roadmap), drawn as dashed tiles
// ---------------------------------------------------------------------
export const roadmap = [
  {
    id: "more-apps",
    name: "More apps",
    sub: "home automation",
    icon: "bulb",
    access: "planned",
    about: "New apps, including one to control a smart device on the home network.",
    facts: ["Planned"],
  },
  {
    id: "kafka",
    name: "Kafka + Redis",
    sub: "learning lab",
    icon: "stream",
    access: "planned",
    about: "A simulated scenario in the lab to learn event streaming and caching.",
    facts: ["Planned"],
  },
  {
    id: "storage4tb",
    name: "4 TB drive",
    sub: "storage + backups",
    icon: "disk",
    access: "planned",
    about: "Attach a portable drive for cluster storage and automatic backups.",
    facts: ["Planned"],
  },
  {
    id: "tailscale",
    name: "Tailscale",
    sub: "remote access",
    icon: "tunnel",
    access: "planned",
    about: "Reach the EliteDesk over SSH from anywhere without opening ports.",
    facts: ["Planned"],
  },
];

// labels + colours for the little badge in tiles and popups
export const accessInfo = {
  public: { label: "Public", tint: "111, 214, 196" },
  private: { label: "Login required", tint: "181, 140, 240" },
  platform: { label: "Admin · login", tint: "242, 166, 90" },
  infra: { label: "Infrastructure", tint: "103, 232, 249" },
  external: { label: "Outside the cluster", tint: "143, 168, 255" },
  planned: { label: "Planned", tint: "142, 163, 167" },
};
