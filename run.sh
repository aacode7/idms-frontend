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
  echo "Building combined web service and applying database migrations..."
  docker compose --env-file "${script_dir}/.env.local" \
    --project-directory "${script_dir}" -f "${compose_file}" build web
  docker compose --env-file "${script_dir}/.env.local" \
    --project-directory "${script_dir}" -f "${compose_file}" \
    run --rm --no-deps web sh -c 'cd /srv/idms-backend && alembic upgrade head'
}

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
  echo "Starting worker, Redis, and ONLYOFFICE..."
  start_backend_services --build
  apply_web_migrations
  echo "Starting combined web service..."
  exec docker compose --env-file "${script_dir}/.env.local" \
    --project-directory "${script_dir}" -f "${compose_file}" up -d
fi

case "$1" in
  rebuild)
    echo "Rebuilding worker, Redis, and ONLYOFFICE..."
    start_backend_services --build --force-recreate --remove-orphans
    apply_web_migrations
    echo "Rebuilding and recreating combined web service..."
    exec docker compose --env-file "${script_dir}/.env.local" \
      --project-directory "${script_dir}" -f "${compose_file}" \
      up -d --force-recreate
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
