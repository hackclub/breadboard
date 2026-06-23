.PHONY: build up down restart logs ps clean db-migrate db-push db-studio db-generate shell-nextjs shell-backend shell-db pull pull-base build-nocache up-prod help

# ── Docker Compose ──────────────────────────────────────────────

COMPOSE := docker compose

build: ## Build all service images
	$(COMPOSE) build

build-nocache: ## Build without cache
	$(COMPOSE) build --no-cache

build-nextjs: ## Build the Next.js image only
	$(COMPOSE) build nextjs

build-backend: ## Build the editor backend image only
	$(COMPOSE) build editor-backend

up: ## Start all services (detached)
	$(COMPOSE) up -d

up-attached: ## Start all services (foreground, with logs)
	$(COMPOSE) up

down: ## Stop all services and remove containers
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) down && $(COMPOSE) up -d

restart-nextjs: ## Restart only the Next.js container
	$(COMPOSE) restart nextjs

restart-backend: ## Restart only the editor backend
	$(COMPOSE) restart editor-backend

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

logs-nextjs: ## Tail Next.js logs
	$(COMPOSE) logs -f nextjs

logs-backend: ## Tail editor backend logs
	$(COMPOSE) logs -f editor-backend

ps: ## Show running services
	$(COMPOSE) ps

clean: ## Stop services and remove containers, networks, and images
	$(COMPOSE) down --rmi all --volumes --remove-orphans

clean-volumes: ## Remove all named volumes (destroys DB data and build caches)
	$(COMPOSE) down -v

# ── Database ────────────────────────────────────────────────────

db-generate: ## Generate Drizzle migrations from schema changes
	bunx --bun drizzle-kit generate

db-migrate: ## Run pending Drizzle migrations against the database
	bunx --bun drizzle-kit migrate

db-push: ## Push schema directly to database (no migration file)
	bunx --bun drizzle-kit push

db-studio: ## Open Drizzle Studio on http://localhost:4983
	bunx --bun drizzle-kit studio

db-shell: ## Open psql shell in the postgres container
	docker compose exec postgres psql -U breadboard

# ── Shell access ─────────────────────────────────────────────────

shell-nextjs: ## Open shell in the Next.js container
	docker compose exec nextjs sh

shell-backend: ## Open shell in the editor backend container
	docker compose exec editor-backend bash

shell-db: ## Open sql shell in the postgres container
	docker compose exec postgres psql -U breadboard

# ── Local development ───────────────────────────────────────────

dev: ## Start Next.js dev server (hot reload)
	bun run dev

dev-backend: ## Start editor backend locally (port 8001)
	bun run editor:backend

# ── Production (pull prebuilt images, no local build) ────────────

pull: ## Pull latest prebuilt images from GHCR
	docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

up-prod: ## Start from prebuilt images (no local build)
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# ── Deployment helpers ──────────────────────────────────────────

pull-base: ## Pull latest base images (for local building)
	docker pull oven/bun:1.3.6
	docker pull node:22-slim
	docker pull postgres:16-alpine
	docker pull python:3.12-slim

prune: ## Remove unused Docker data
	docker system prune -f

# ── Help ────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	| sort \
	| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
