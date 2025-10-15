# Node Hostname — Kubernetes + Helm (HTTPS-ready)

A tiny Express app that returns the pod’s hostname and app version. It ships with a production-grade Docker image (distroless, non-root), a Helm chart, health probes, and Let’s Encrypt TLS via cert-manager.
To visit Project go to: https://app.34.88.119.206.nip.io/

---

## Quick Start (pre-filled for this environment)

```bash
# Environment
export PROJECT_ID=platform-k8s-1234
export REGION=europe-north1
export REPO=node-hostname
export APP=node-hostname
export VER=0.0.1
export IMAGE_REPO=europe-north1-docker.pkg.dev/platform-k8s-1234/node-hostname/node-hostname
export IMAGE=europe-north1-docker.pkg.dev/platform-k8s-1234/node-hostname/node-hostname:0.0.1
export LB_IP=34.88.119.206
export HOST=app.34.88.119.206.nip.io
export CLUSTER_ISSUER=letsencrypt-prod
```

---

## Features

- Express API with `/`, `/healthz`, `/readyz`
- JSON error handler (no view engine)
- Dockerfile: Node 20 (builder) → **distroless nonroot** (runtime)
- Helm chart: Deployment, Service, Ingress, probes, resources
- HTTPS via cert-manager (`ClusterIssuer: letsencrypt-prod`)
- Works with Google Artifact Registry

---

## Repository Layout

```
.
├─ node-hostname/
│  ├─ app.js
│  ├─ bin/www
│  ├─ routes/
│  │  ├─ index.js
│  │  ├─ users.js
│  │  └─ crash.js
│  ├─ package.json
│  ├─ package-lock.json
│  └─ Dockerfile
├─ helm/
│  └─ node-hostname/
│     ├─ Chart.yaml
│     ├─ values.yaml
│     └─ templates/
│        ├─ deployment.yaml
│        ├─ service.yaml
│        ├─ ingress.yaml
│        └─ _helpers.tpl
└─ clusterissuer.yaml
```

---

## Prerequisites

- Docker, kubectl, **Helm v3**
- A Kubernetes cluster with **ingress-nginx**
- cert-manager installed and a `ClusterIssuer` named `letsencrypt-prod`
- Access to **Artifact Registry**

---

## Build & Push the Image

```bash
gcloud config set project "$PROJECT_ID"
gcloud services enable artifactregistry.googleapis.com

# Create repo (no-op if it already exists) and auth Docker
gcloud artifacts repositories create "$REPO"   --repository-format=docker --location="$REGION" || true
gcloud auth configure-docker "$REGION-docker.pkg.dev"

cd node-hostname
docker build -t "$IMAGE" .
docker push "$IMAGE"
```

### If the cluster can’t pull (403/ErrImagePull)

**Grant the GKE service agent reader access:**
```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT_ID"   --member="serviceAccount:service-$PROJECT_NUMBER@container-engine-robot.iam.gserviceaccount.com"   --role="roles/artifactregistry.reader"
```

**Or create an ImagePullSecret (works everywhere):**
```bash
gcloud iam service-accounts create ar-puller --display-name="Artifact Registry puller"
gcloud projects add-iam-policy-binding "$PROJECT_ID"   --member="serviceAccount:ar-puller@$PROJECT_ID.iam.gserviceaccount.com"   --role="roles/artifactregistry.reader"
gcloud iam service-accounts keys create ar-puller.json   --iam-account="ar-puller@$PROJECT_ID.iam.gserviceaccount.com"

kubectl create secret docker-registry artifact-regcred   --docker-server="$REGION-docker.pkg.dev"   --docker-username="_json_key"   --docker-password="$(cat ar-puller.json)"   --docker-email="ci@$PROJECT_ID.iam.gserviceaccount.com"
rm -f ar-puller.json
```

Add to `helm/node-hostname/values.yaml`:
```yaml
image:
  imagePullSecrets:
    - name: artifact-regcred
```

---

## Recommended `values.yaml` (clean)

```yaml
replicaCount: 2

image:
  repository: europe-north1-docker.pkg.dev/platform-k8s-1234/node-hostname/node-hostname
  tag: "0.0.1"
  pullPolicy: IfNotPresent
  imagePullSecrets:
    - name: artifact-regcred

service:
  type: ClusterIP
  port: 80
  targetPort: 3000

container:
  port: 3000
  env:
    - name: NODE_ENV
      value: "production"
    - name: PORT
      value: "3000"

ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
  host: app.34.88.119.206.nip.io
  tls:
    enabled: true
    clusterIssuer: letsencrypt-prod
    secretName: node-hostname-tls

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 256Mi

probes:
  liveness:
    path: /healthz
    initialDelaySeconds: 5
    periodSeconds: 10
  readiness:
    path: /readyz
    initialDelaySeconds: 2
    periodSeconds: 5

podAnnotations: {}
labels: {}
nodeSelector: {}
tolerations: []
affinity: {}
```
---

## 1. Install Ingress-Nginx

Add the official Ingress-Nginx Helm repository and update your local chart cache.

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
```
Install the controller into a dedicated namespace.

```bash
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace
```
**Verify the LoadBalancer IP:**

Check the status of the service to retrieve the external IP or hostname for your ingress point.

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller
```
## 2. Install Cert-Manager (Autopilot-Safe)

Add the Jetstack Helm repository for Cert-Manager.

```bash
helm repo add jetstack [https://charts.jetstack.io](https://charts.jetstack.io)
helm repo update
```
```bash
helm upgrade --install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace \
  --set installCRDs=true \
  --set leaderElection.namespace=cert-manager
```
## 3. Create the Let’s Encrypt ClusterIssuer

This resource tells **Cert-Manager** how to interact with the **Let's Encrypt ACME server** to issue certificates.

**`clusterissuer.yaml`:**
```bash
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    email: chintham.srinidhi@gmail.com # 📧 IMPORTANT: Update this email
    server: [https://acme-v02.api.letsencrypt.org/directory](https://acme-v02.api.letsencrypt.org/directory)
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```
#### Apply the Configuration:
```bash
kubectl apply -f clusterissuer.yaml
```
**Check Status:**

```bash
kubectl describe clusterissuer letsencrypt-prod
```
#### Deploy the App with Helm (TLS + Redirect Enabled)
Ensure your application's Ingress configuration within its Helm values.yaml is set up to request a certificate and enforce HTTPS.

Example values.yaml Ingress configuration:
```bash
ingress:
  className: nginx
  annotations:
    # Associate the Ingress with the ClusterIssuer
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    # Enable standard SSL redirect from HTTP to HTTPS
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    # Enforce SSL redirect unconditionally
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
  tls:
    enabled: true
    # Secret where the final certificate will be stored
    secretName: node-hostname-tls

```

---

## Deploy with Helm

```bash
helm upgrade --install "$APP" ./helm/node-hostname
kubectl rollout status deploy/$APP
```

---

## Verify

```bash
# HTTP should redirect to HTTPS
curl -I http://$HOST

# HTTPS via Let’s Encrypt
curl -I https://$HOST

# Through the LB with Host header (useful for quick checks)
curl -i -H "Host: $HOST" http://$LB_IP/

# Health endpoints (externally use HTTPS because of redirect)
curl -I https://$HOST/healthz
curl -I https://$HOST/readyz

# Service endpoints should be populated

kubectl get endpoints $APP
```

**Expected:** `HTTP/2 200` on HTTPS; `308 Permanent Redirect` on HTTP.

---

## Application Endpoints

| Method | Path       | Description                                     |
|-------:|------------|-------------------------------------------------|
| GET    | `/`        | `{"hostname":"<pod>","version":"0.0.1"}`       |
| GET    | `/healthz` | Liveness probe                                  |
| GET    | `/readyz`  | Readiness probe                                 |
| GET    | `/users`   | Sample route                                     |
| GET    | `/crash`   | Intentionally throws (for restart testing)       |

> Kubernetes probes hit the **container port** (3000) and aren’t affected by Ingress redirects.

---

## cert-manager (GKE Autopilot note)

On Autopilot, cert-manager must elect a leader in its own namespace. Ensure the controller runs with:
```
--leader-election-namespace=cert-manager
```
and has RBAC to create `leases`/`configmaps` in `cert-manager`.

Check TLS objects:
```bash
kubectl get certificate node-hostname-tls
kubectl get secret node-hostname-tls
```

---

## Local Run (optional)

```bash
cd node-hostname
npm install
npm start
# http://localhost:3000/
```

---

## Troubleshooting

- **ImagePullBackOff / 403**: grant `roles/artifactregistry.reader` to the GKE service agent or use an ImagePullSecret.
- **Ingress 404**: ensure the `Host` header matches `ingress.host`; check endpoints: `kubectl get endpoints $APP`.
- **TLS not issuing**: confirm `ingress.tls.enabled=true`, correct `clusterIssuer`, and that cert-manager created `Certificate` and the Secret.

---

## License

MIT (adjust for your organization as needed).

