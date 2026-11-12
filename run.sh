#!/usr/bin/env bash
# Start the IDMS frontend.
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${script_dir}/docker-compose.yml"
backend_dir="${script_dir}/../idms-backend"

start_backend_services() {
  docker compose --project-directory "${backend_dir}" -f "${backend_dir}/docker-compose.yml" \
    up -d "$@"
}

apply_web_migrations() {
  echo "Applying database migrations before starting application consumers..."
  docker compose --env-file "${script_dir}/.env.local" \
    --project-directory "${script_dir}" -f "${compose_file}" \
    run --rm --no-deps web sh -c 'cd /srv/idms-backend && alembic upgrade head'
}

build_runtime() {
  docker compose --project-directory "${backend_dir}" -f "${backend_dir}/docker-compose.yml" \
    build worker extraction-dispatcher
  docker compose --env-file "${script_dir}/.env.local" \
    --project-directory "${script_dir}" -f "${compose_file}" build web
}

start_runtime() {
  local mode="${1:-full}"
  build_runtime
  start_backend_services redis
  apply_web_migrations
  if [[ "${mode}" == "extraction" ]]; then
    start_backend_services --no-build worker extraction-dispatcher
  else
    start_backend_services --no-build worker extraction-dispatcher onlyoffice
  fi
  docker compose --env-file "${script_dir}/.env.local" \
    --project-directory "${script_dir}" -f "${compose_file}" up -d --no-build web
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  start_runtime full
  exit
fi

case "$1" in
  rebuild)
    start_runtime full
    ;;
  extraction)
    # Extraction does not require ONLYOFFICE or the host's port 8000.
    start_runtime extraction
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
