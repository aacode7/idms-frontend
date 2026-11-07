#!/usr/bin/env bash
# Start the complete IDMS stack from the frontend repository.
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${script_dir}/docker-compose.yml"
backend_script="${script_dir}/../idms-backend/run.sh"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Starting backend services..."
  "${backend_script}"
  echo "Starting frontend..."
  exec docker compose --env-file "${script_dir}/.env.local" \
    --project-directory "${script_dir}" -f "${compose_file}" up -d --build
fi

case "$1" in
  rebuild)
    echo "Rebuilding and recreating backend services..."
    "${backend_script}" up -d --build --force-recreate --remove-orphans
    echo "Rebuilding and recreating frontend..."
    exec docker compose --env-file "${script_dir}/.env.local" \
      --project-directory "${script_dir}" -f "${compose_file}" \
      up -d --build --force-recreate
    ;;
  down|stop|restart|logs|ps)
    "${backend_script}" "$@"
    exec docker compose --env-file "${script_dir}/.env.local" \
      --project-directory "${script_dir}" -f "${compose_file}" "$@"
    ;;
  *)
    exec docker compose --env-file "${script_dir}/.env.local" \
      --project-directory "${script_dir}" -f "${compose_file}" "$@"
    ;;
esac
