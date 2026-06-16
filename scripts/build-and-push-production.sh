#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_IMAGE_PREFIX="e-voting"
DEFAULT_VERSION="latest"

APP_SERVICES=(
    bff
    identity
    coordinator
    signing-node
    reveal-vote
    socket
)

INFRA_IMAGE_NAMES=(
    mongodb
    redis
)

declare -A INFRA_SOURCE_IMAGES=(
    [mongodb]="mongo:7"
    [redis]="redis:7.2-alpine"
)

die() {
    echo "Error: $*" >&2
    exit 1
}

get_dockerhub_username() {
    local username
    username="$(docker info --format '{{.Username}}' 2>/dev/null || true)"
    if [[ -n "$username" && "$username" != "<no value>" ]]; then
        echo "$username"
        return 0
    fi

    local docker_config="${DOCKER_CONFIG:-$HOME/.docker}"
    local config_file="${docker_config}/config.json"
    [[ -f "$config_file" ]] || return 1

    local auth
    auth="$(
        sed -nE '/(https:\/\/index\.docker\.io\/v1\/|index\.docker\.io|registry-1\.docker\.io)/,/}/ s/.*"auth"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$config_file" \
            | head -n 1
    )"
    if [[ -n "$auth" ]]; then
        username="$(printf '%s' "$auth" | base64 -d 2>/dev/null | sed 's/:.*//')"
        if [[ -n "$username" ]]; then
            echo "$username"
            return 0
        fi
    fi

    return 1
}

bool_enabled() {
    case "${1:-}" in
        1 | true | TRUE | yes | YES | y | Y) return 0 ;;
        0 | false | FALSE | no | NO | n | N) return 1 ;;
        *) die "invalid boolean value: $1" ;;
    esac
}

command -v docker >/dev/null 2>&1 || die "docker is not installed or not in PATH"
docker info >/dev/null 2>&1 || die "docker daemon is not running, or current user cannot access Docker"

DETECTED_DOCKERHUB_USERNAME="$(get_dockerhub_username || true)"
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-$DETECTED_DOCKERHUB_USERNAME}"
[[ -n "$DOCKERHUB_USERNAME" ]] || die "Docker Hub login is required. Run: docker login"

IMAGE_PREFIX="${IMAGE_PREFIX:-$DEFAULT_IMAGE_PREFIX}"
VERSION="${VERSION:-${IMAGE_TAG:-${1:-$DEFAULT_VERSION}}}"
PUSH="${PUSH:-true}"
INCLUDE_INFRA="${INCLUDE_INFRA:-true}"
NO_CACHE="${NO_CACHE:-false}"
PLATFORM="${PLATFORM:-}"

[[ -n "$IMAGE_PREFIX" ]] || die "IMAGE_PREFIX must not be empty"
[[ -n "$VERSION" ]] || die "VERSION must not be empty"

if [[ ! "$IMAGE_PREFIX" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]]; then
    die "invalid IMAGE_PREFIX. Use lowercase letters, numbers, dots, underscores, or dashes"
fi

if [[ ! "$VERSION" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
    die "invalid version tag. Use only letters, numbers, underscores, dots, or dashes; max length is 128 characters"
fi

bool_enabled "$PUSH" && SHOULD_PUSH=true || SHOULD_PUSH=false
bool_enabled "$INCLUDE_INFRA" && SHOULD_INCLUDE_INFRA=true || SHOULD_INCLUDE_INFRA=false
bool_enabled "$NO_CACHE" && SHOULD_NO_CACHE=true || SHOULD_NO_CACHE=false

build_app_image() {
    local service="$1"
    local image="${DOCKERHUB_USERNAME}/${IMAGE_PREFIX}-${service}:${VERSION}"
    local build_args=(--build-arg "APP=${service}" -t "$image")

    if [[ -n "$PLATFORM" ]]; then
        build_args+=(--platform "$PLATFORM")
    fi

    if [[ "$SHOULD_NO_CACHE" == true ]]; then
        build_args+=(--no-cache)
    fi

    echo
    echo "Building app image: ${image}"
    docker build "${build_args[@]}" "$REPO_ROOT"

    if [[ "$SHOULD_PUSH" == true ]]; then
        echo "Pushing app image: ${image}"
        docker push "$image"
    fi
}

mirror_infra_image() {
    local name="$1"
    local source_image="${INFRA_SOURCE_IMAGES[$name]}"
    local target_image="${DOCKERHUB_USERNAME}/${IMAGE_PREFIX}-${name}:${VERSION}"

    echo
    echo "Pulling infra image: ${source_image}"
    docker pull "$source_image"

    echo "Tagging infra image: ${target_image}"
    docker tag "$source_image" "$target_image"

    if [[ "$SHOULD_PUSH" == true ]]; then
        echo "Pushing infra image: ${target_image}"
        docker push "$target_image"
    fi
}

echo "Docker Hub user: ${DOCKERHUB_USERNAME}"
echo "Image prefix: ${IMAGE_PREFIX}"
echo "Version tag: ${VERSION}"
echo "Push images: ${SHOULD_PUSH}"
echo "Include MongoDB/Redis images: ${SHOULD_INCLUDE_INFRA}"

for service in "${APP_SERVICES[@]}"; do
    build_app_image "$service"
done

if [[ "$SHOULD_INCLUDE_INFRA" == true ]]; then
    for name in "${INFRA_IMAGE_NAMES[@]}"; do
        mirror_infra_image "$name"
    done
fi

cat <<EOF

Done.

To deploy with images from Docker Hub:

APP_IMAGE_REPO_PREFIX=${DOCKERHUB_USERNAME}/${IMAGE_PREFIX}- \\
IMAGE_TAG=${VERSION} \\
MONGO_IMAGE=${DOCKERHUB_USERNAME}/${IMAGE_PREFIX}-mongodb:${VERSION} \\
REDIS_IMAGE=${DOCKERHUB_USERNAME}/${IMAGE_PREFIX}-redis:${VERSION} \\
docker compose -f docker-compose.production.yml up -d
EOF
