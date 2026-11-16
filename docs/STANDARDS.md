# Standards, permissions and session protocol

Faithful English translation of the "Estándares durante la construcción", "Permisos y límites"
and "Protocolo de cada sesión" sections of the original project brief (written in Spanish).
These rules are binding for every working session. `docs/ROADMAP.md` decides in which session
each standard is introduced.

## Build standards

These are the end goal, not day-one requirements: the roadmap decides when each one comes in.
For the MVP it is enough to have CI with lint, tests and build, docker compose, deployment with a
public URL, OpenAPI and health checks. Do not block the MVP on advanced observability or
infrastructure as code.

- Small commits with Conventional Commits, one branch per feature and a PR to main. Anthony
  reviews and merges every PR; nothing is pushed directly to main.
- Unit tests, integration tests (Testcontainers) and e2e tests where applicable.
- CI that runs lint, tests, image builds and security scanning (Trivy, Dependabot).
- Multi-stage Dockerfiles and images published to GHCR.
- Configuration through environment variables, with `.env.example`. Never commit secrets.
- API documented with OpenAPI and authentication with a standard (OAuth2/OIDC + JWT).
- Basic observability: structured logs and health checks. When the roadmap allows it, metrics
  with OpenTelemetry, Prometheus and Grafana.
- Infrastructure as code (Terraform or OpenTofu) for the deployed environment, if viable.
- If a cloud with a registered card is used, configure budget alerts.
- Professional README with:
  - description and live demo;
  - screenshots or GIF;
  - architecture;
  - how to run it locally with a single command;
  - technical decisions.

## Permissions and limits

- Ask Anthony for confirmation before creating or deleting repositories, pushing or merging to
  main, creating cloud resources, running `terraform apply` / `tofu apply`, or doing anything
  that could generate costs.
- If something needs credentials, say what is needed and where to configure it (GitHub Secrets,
  local variables). Never ask him to paste them in the chat.

## Session protocol

- At the start: read `docs/PROGRESS.md` and the recent `git log`. Propose the
  session goal according to the roadmap and confirm it with Anthony.
- During: if the context is running out, stop and update `docs/PROGRESS.md` before continuing.
- At the end: leave the tests passing and commit. Update `docs/PROGRESS.md` with the concrete
  next step and tell Anthony what is still pending.
- Learning: explain the important decisions and new concepts, because Anthony must be able to
  defend every part of the project in a technical interview. In every session leave at least one
  small part for him to implement or modify, and at the end ask him 2-3 interview-style questions
  about what was done.
