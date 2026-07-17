#!/bin/sh
set -eu

DEPLOY_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yaml"
ENV_FILE="$DEPLOY_DIR/.env"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or is not available in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: Docker Compose v2 is required." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
  echo "Created $ENV_FILE from .env.example"
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

case "${1:-up}" in
  up)
    compose up -d --build
    compose ps
    ;;
  down)
    compose down
    ;;
  restart)
    compose restart
    compose ps
    ;;
  logs)
    compose logs -f --tail=200
    ;;
  status|ps)
    compose ps
    ;;
  *)
    echo "Usage: $0 {up|down|restart|logs|status}" >&2
    exit 2
    ;;
esac

