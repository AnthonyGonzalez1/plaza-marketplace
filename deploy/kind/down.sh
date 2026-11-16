#!/usr/bin/env bash
# Deletes the local cluster and everything in it (including the database volume).
set -euo pipefail
kind delete cluster --name plaza
