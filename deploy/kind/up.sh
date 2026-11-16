#!/usr/bin/env bash
# Creates the local cluster (if missing), builds the images, loads them into the cluster and
# installs the Helm chart. Safe to run again after changing code or chart: it upgrades in place.
#
# Usage (from anywhere, Git Bash on Windows):  deploy/kind/up.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

CLUSTER=plaza
NAMESPACE=plaza
TRAEFIK_CHART_VERSION=42.4.0

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  kind create cluster --config deploy/kind/cluster.yaml
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

echo "==> Installing the Traefik ingress controller"
helm upgrade --install traefik traefik \
  --repo https://traefik.github.io/charts --version "$TRAEFIK_CHART_VERSION" \
  --namespace traefik --create-namespace \
  --values deploy/kind/traefik-values.yaml --wait

echo "==> Building images"
docker build --tag plaza-store-api:local services/store-api
docker build --tag plaza-web:local web

# kind nodes cannot see the images of the laptop's Docker: copy them into the node.
echo "==> Loading images into the cluster"
kind load docker-image plaza-store-api:local plaza-web:local --name "$CLUSTER"

echo "==> Installing the Plaza chart"
helm upgrade --install plaza deploy/helm/plaza \
  --namespace "$NAMESPACE" --create-namespace \
  --values deploy/helm/plaza/values-local.yaml \
  --wait --timeout 5m

# Pods only restart when their spec changes. The image tag is always "local", so force a
# restart to pick up freshly built images.
kubectl --namespace "$NAMESPACE" rollout restart deployment/plaza-store-api deployment/plaza-web
kubectl --namespace "$NAMESPACE" rollout status deployment/plaza-store-api --timeout=3m
kubectl --namespace "$NAMESPACE" rollout status deployment/plaza-web --timeout=2m

echo
echo "Plaza is running: http://plaza.localhost"
echo "API docs:         http://plaza.localhost/swagger-ui.html"
echo "Pods:             kubectl -n $NAMESPACE get pods"
