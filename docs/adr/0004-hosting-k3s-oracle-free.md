# ADR-0004: Production on single-node k3s in Oracle Cloud Always Free

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

The project needs a public URL and Kubernetes in production if the budget allows it. The budget
is USD 0. Checked in October 2026:

- **Oracle Cloud Always Free:** Ampere A1 (ARM64) up to 2 OCPU and 12 GB RAM (1,500 OCPU-hours
  and 9,000 GB-hours per month, halved in 2026), 200 GB block storage, 10 TB egress. Needs a card
  for verification. Instances idle for 7 days (CPU, network and memory under 20 %) may be
  reclaimed.
- **Azure for Students:** USD 100 for 12 months, no card; VM sizes in the free hours have 1 GB
  RAM, too small for this stack, so a bigger VM would consume the credit.
- **Render free tier:** services sleep after 15 minutes, free PostgreSQL expires after 30 days,
  no free background workers.
- Fly.io, Railway and Koyeb no longer have permanent free plans for new accounts. GCP's free
  e2-micro has 1 GB RAM.

## Decision

Run production on **one Oracle Cloud Ampere A1 VM (2 OCPU, 12 GB) with k3s**, Traefik (bundled)
as ingress, cert-manager with Let's Encrypt for TLS, and the same Helm chart used with kind,
with a production values file. Images are built for amd64 and arm64.

Fallbacks, in order:

1. **Plan B:** the same setup on an Azure VM paid with the student credit (check how many months
   the credit covers before creating it).
2. **Plan C:** Render (web services) + Neon (PostgreSQL) + Upstash (Redis) + CloudAMQP
   (RabbitMQ), with Kubernetes only in local and CI.

## Alternatives considered

| Option | Why not |
|---|---|
| Managed Kubernetes (EKS, GKE, AKS) | Worker nodes cost money; the free credits would run out in weeks |
| Cheap VPS (Hetzner, about EUR 5-6 per month) | Costs money; kept as a paid option if Oracle fails |
| PaaS only | No Kubernetes in production, and cold starts in the demo |

## Consequences

- What a single-node k3s loses against a managed cluster: no high availability (if the VM goes
  down, everything goes down), no node autoscaling, no cloud load balancer, and databases run
  inside the cluster on a local volume instead of a managed service with backups. A backup
  CronJob is planned (S15).
- What it keeps: Deployments, Services, Ingress, ConfigMaps, Secrets, probes, resource limits,
  rolling updates and Helm releases.
- The ARM64 architecture requires multi-arch images.
- Idle reclamation must be watched; real traffic plus the JVM normally keep memory above 20 %.
- A budget alert is configured in the Oracle console in S4 and as code in S14.
