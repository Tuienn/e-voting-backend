#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

APP_TEMPLATE_DIR="$SCRIPT_DIR/template"
ENV_TEMPLATE_FILE="$SCRIPT_DIR/configuration/env.config.ts.txt"
LIBS_CONFIG_DIR="$PROJECT_ROOT/libs/configuration/src/lib"

# ── Case conversion helpers ──────────────────────────────────────────────────

to_pascal_case() {
    local result=""
    IFS='-' read -ra parts <<< "$1"
    for part in "${parts[@]}"; do
        result+="${part^}"
    done
    echo "$result"
}

to_screaming_snake() {
    echo "$1" | tr '-' '_' | tr '[:lower:]' '[:upper:]'
}

to_title_case() {
    local result=""
    IFS='-' read -ra parts <<< "$1"
    for part in "${parts[@]}"; do
        result+="${part^} "
    done
    echo "${result% }"
}

validate_kebab_case() {
    [[ "$1" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]
}

sedi() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║     NestJS App Generator (from template)    ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

if [ ! -d "$APP_TEMPLATE_DIR" ]; then
    echo -e "${RED}Error: app template not found at scripts/generate-app/template/${NC}"
    exit 1
fi

if [ ! -f "$ENV_TEMPLATE_FILE" ]; then
    echo -e "${RED}Error: env template not found at scripts/generate-app/configuration/env.config.ts.txt${NC}"
    exit 1
fi

# ── Prompt for app name ──────────────────────────────────────────────────────

while true; do
    read -rp "$(echo -e "${YELLOW}Enter app name (kebab-case, e.g. user-service, gateway):${NC} ")" APP_NAME

    if [ -z "$APP_NAME" ]; then
        echo -e "${RED}  App name cannot be empty.${NC}"
        continue
    fi

    if [ "$APP_NAME" = "bff" ]; then
        echo -e "${RED}  Cannot use 'bff' — it's the template itself.${NC}"
        continue
    fi

    if validate_kebab_case "$APP_NAME"; then
        break
    else
        echo -e "${RED}  Invalid! Must be kebab-case: lowercase letters, numbers, hyphens.${NC}"
        echo -e "${RED}  Examples: user-service, gateway, invoice-processor${NC}"
    fi
done

# ── Prompt for transport mode ───────────────────────────────────────────────

while true; do
    echo -e "${YELLOW}Select app mode:${NC}"
    echo "  1) TCP only"
    echo "  2) HTTP + TCP"
    read -rp "$(echo -e "${YELLOW}Choose [1-2] (default 2):${NC} ")" APP_MODE_CHOICE

    case "$APP_MODE_CHOICE" in
        ""|2)
            APP_MODE="http-tcp"
            break
            ;;
        1)
            APP_MODE="tcp"
            break
            ;;
        *)
            echo -e "${RED}  Invalid choice. Please enter 1 or 2.${NC}"
            ;;
    esac
done

# ── Derive all case variants ─────────────────────────────────────────────────

KEBAB="$APP_NAME"
PASCAL=$(to_pascal_case "$KEBAB")
SCREAMING_SNAKE=$(to_screaming_snake "$KEBAB")
TITLE=$(to_title_case "$KEBAB")

echo ""
echo -e "${CYAN}Name variants that will be used:${NC}"
echo -e "  kebab-case            →  ${GREEN}${KEBAB}${NC}              (folders, files, tags)"
echo -e "  PascalCase            →  ${GREEN}${PASCAL}${NC}              (class names)"
echo -e "  SCREAMING_SNAKE_CASE  →  ${GREEN}${SCREAMING_SNAKE}${NC}              (constants)"
echo -e "  Title Case            →  ${GREEN}${TITLE}${NC}              (Swagger docs)"
echo -e "  App mode              →  ${GREEN}${APP_MODE}${NC}"
echo ""

# ── Pre-flight checks ────────────────────────────────────────────────────────

APP_DIR="$PROJECT_ROOT/apps/$KEBAB"
ENV_CONFIG="$LIBS_CONFIG_DIR/${KEBAB}-env.config.ts"

ERRORS=0

if [ -d "$APP_DIR" ]; then
    echo -e "${RED}  ✗ apps/${KEBAB}/ already exists${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$ENV_CONFIG" ]; then
    echo -e "${RED}  ✗ libs/configuration/src/lib/${KEBAB}-env.config.ts already exists${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo -e "${RED}Aborting due to conflicts above.${NC}"
    exit 1
fi

# ── Confirm ──────────────────────────────────────────────────────────────────

echo -e "${BOLD}The following will be created:${NC}"
echo -e "  ${CYAN}apps/${KEBAB}/${NC}                                    (app directory)"
echo -e "  ${CYAN}libs/configuration/src/lib/${KEBAB}-env.config.ts${NC}  (env config)"
echo ""
read -rp "$(echo -e "${YELLOW}Proceed? (y/N):${NC} ")" CONFIRM
if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
    echo -e "${RED}Aborted.${NC}"
    exit 0
fi

echo ""

# ── Step 1: Copy app directory ───────────────────────────────────────────────

echo -e "${YELLOW}[1/4]${NC} Copying app template..."
cp -r "$APP_TEMPLATE_DIR" "$APP_DIR"

# Rename all *.txt template files to real file names (e.g. main.ts.txt -> main.ts)
while IFS= read -r template_file; do
    mv "$template_file" "${template_file%.txt}"
done < <(find "$APP_DIR" -type f -name "*.txt")

# Apply mode-specific templates
if [ "$APP_MODE" = "tcp" ]; then
    cp "$APP_DIR/src/only-tcp-main.ts" "$APP_DIR/src/main.ts"
    cp "$APP_DIR/src/app/only-tcp-app.module.ts" "$APP_DIR/src/app/app.module.ts"
else
    cp "$APP_DIR/src/http-tcp-main.ts" "$APP_DIR/src/main.ts"
fi

# Cleanup helper template files from generated app
rm -f "$APP_DIR/src/http-tcp-main.ts" "$APP_DIR/src/only-tcp-main.ts" "$APP_DIR/src/app/only-tcp-app.module.ts"

# ── Step 2: Copy & rename env config in libs ─────────────────────────────────

echo -e "${YELLOW}[2/4]${NC} Creating environment configuration..."
cp "$ENV_TEMPLATE_FILE" "$ENV_CONFIG"

# ── Step 3: Replace all references ───────────────────────────────────────────

echo -e "${YELLOW}[3/4]${NC} Replacing references..."

# --- libs env config: class name ---
sedi "s|BffEnvConfiguration|${PASCAL}EnvConfiguration|g" "$ENV_CONFIG"
sedi "s|BFF_|${SCREAMING_SNAKE}_|g" "$ENV_CONFIG"

# --- project.json: name, paths, build targets (all are kebab) ---
sedi "s|bff|${KEBAB}|g" "$APP_DIR/project.json"

# --- webpack.config.js: output path ---
sedi "s|apps/bff|apps/${KEBAB}|g" "$APP_DIR/webpack.config.js"

# --- .env.example: service name ---
cp "$APP_DIR/.env.example" "$APP_DIR/.env"
sedi "s|bff-service|${KEBAB}-service|g" "$APP_DIR/.env.example"
sedi "s|bff-service|${KEBAB}-service|g" "$APP_DIR/.env"

# --- src/main.ts (order: longest match first to avoid partial replacements) ---
sedi "s|BFF_CONFIG|${SCREAMING_SNAKE}_CONFIG|g"                      "$APP_DIR/src/main.ts"
sedi "s|'BFF API documentation'|'${TITLE} API documentation'|g"      "$APP_DIR/src/main.ts"
sedi "s|'BFF API'|'${TITLE} API'|g"                                  "$APP_DIR/src/main.ts"
sedi "s|addTag('bff')|addTag('${KEBAB}')|g"                          "$APP_DIR/src/main.ts"

# --- src/configuration/index.ts: imports, class, constant ---
sedi "s|BffEnvConfiguration|${PASCAL}EnvConfiguration|g"             "$APP_DIR/src/configuration/index.ts"
sedi "s|bff-env.config|${KEBAB}-env.config|g"                       "$APP_DIR/src/configuration/index.ts"
sedi "s|BFF_CONFIG|${SCREAMING_SNAKE}_CONFIG|g"                      "$APP_DIR/src/configuration/index.ts"

# --- src/app/app.module.ts: config constant ---
sedi "s|BFF_CONFIG|${SCREAMING_SNAKE}_CONFIG|g"                      "$APP_DIR/src/app/app.module.ts"

# --- fallback pass: keep every generated file aligned with the app name ---
while IFS= read -r -d '' generated_file; do
    sedi "s|BFF_CONFIG|${SCREAMING_SNAKE}_CONFIG|g"                  "$generated_file"
    sedi "s|BffEnvConfiguration|${PASCAL}EnvConfiguration|g"         "$generated_file"
    sedi "s|bff-env.config|${KEBAB}-env.config|g"                   "$generated_file"
    sedi "s|bff-service|${KEBAB}-service|g"                         "$generated_file"
    sedi "s|'BFF API documentation'|'${TITLE} API documentation'|g"  "$generated_file"
    sedi "s|'BFF API'|'${TITLE} API'|g"                              "$generated_file"
    sedi "s|addTag('bff')|addTag('${KEBAB}')|g"                      "$generated_file"
done < <(find "$APP_DIR" -type f \( -name "*.ts" -o -name "*.js" -o -name ".env" -o -name ".env.example" -o -name "project.json" -o -name "webpack.config.js" \) -print0)

# ── Step 4: Reset Nx daemon to pick up the new project ──────────────────────

echo -e "${YELLOW}[4/4]${NC} Resetting Nx daemon..."
cd "$PROJECT_ROOT"
npx nx reset > /dev/null 2>&1 || true

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║         App created successfully!            ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}App directory${NC}    apps/${KEBAB}/"
echo -e "  ${BOLD}Env config${NC}       libs/configuration/src/lib/${KEBAB}-env.config.ts"
echo -e "  ${BOLD}Environment${NC}      apps/${KEBAB}/.env  ${CYAN}(copied from template)${NC}"
echo ""
echo -e "${YELLOW}${BOLD}Next steps:${NC}"
echo -e "  1. Update port numbers in ${CYAN}apps/${KEBAB}/.env${NC} to avoid conflicts with other services"
echo -e "  2. Customize env variables in ${CYAN}libs/configuration/src/lib/${KEBAB}-env.config.ts${NC}"
echo -e "  3. Start developing: ${CYAN}npx nx serve ${KEBAB}${NC}"
echo ""
echo -e "  ${BOLD}Note:${NC} Nx auto-discovers the new app via project.json — no workspace registration needed."
echo ""
