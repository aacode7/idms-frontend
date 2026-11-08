#!/usr/bin/env bash
# Start the IDMS frontend.
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${script_dir}/docker-compose.yml"

echo "Formatting frontend..."
(cd "${script_dir}" && npm run format)

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Starting frontend..."
  exec docker compose --env-file "${script_dir}/.env.local" \
    --project-directory "${script_dir}" -f "${compose_file}" up -d --build
fi

case "$1" in
  rebuild)
    echo "Rebuilding and recreating frontend..."
    exec docker compose --env-file "${script_dir}/.env.local" \
      --project-directory "${script_dir}" -f "${compose_file}" \
      up -d --build --force-recreate
    ;;
  down|stop|restart|logs|ps)
    exec docker compose --env-file "${script_dir}/.env.local" \
      --project-directory "${script_dir}" -f "${compose_file}" "$@"
    ;;
  *)
    exec docker compose --env-file "${script_dir}/.env.local" \
      --project-directory "${script_dir}" -f "${compose_file}" "$@"
    ;;
esac
