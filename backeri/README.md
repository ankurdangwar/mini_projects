# Backeri — Artisan Bakery Ordering & Kitchen Operations Platform

Full-stack bakery ordering storefront and real-time Baker/Admin operations dashboard built as a TypeScript monorepo.

## Architecture Overview

- **Customer Storefront (`apps/web`)**: Next.js 15 App Router (SSR menu, product customizer with pre-signed direct cake photo uploads, smart lead-time slot picker, 10-minute Redis checkout soft-lock countdown, built-in sandbox payment simulator, and live order tracker).
- **Admin & Baker Dashboard (`apps/web/src/app/admin`)**: Role-based SPA with a real-time Kanban Order Board (SSE + Redis Pub/Sub + Web Audio kitchen chime), Daily Prep Sheet (`SUM(quantity) GROUP BY product_id, variant_id`), Calendar/Slot Capacity Manager, one-click Sold Out controls, Sales & Waste Analytics, and Notification Audit Log.
- **Core Backend API (`apps/api`)**: Node.js + Express + TypeScript modular monolith (`auth`, `catalog`, `slots`, `orders`, `payments`, `realtime`, `dashboard`, `uploads`, `notifications`).
- **Database & Cache (`docker-compose.yml`)**: PostgreSQL 16 (Prisma ORM + `SELECT ... FOR UPDATE` ACID slot locking) + Redis 7 (menu cache, atomic Lua 10-minute checkout holds, Pub/Sub real-time event broker).

## Quick Start

```bash
# 1. Start PostgreSQL 16 & Redis 7
docker compose up -d

# 2. Install dependencies
npm install

# 3. Build shared package, push database schema, and seed sample data
npm --workspace=@backeri/shared run build
npm run db:generate
npm run db:push
npm run db:seed

# 4. Run API (port 4000) & Web (port 3000) together
npm run dev
```

Open:
- **Customer Storefront**: http://localhost:3000
- **Admin / Baker Dashboard**: http://localhost:3000/admin/login
- **API Health**: http://localhost:4000/health

## Seeded Demo Accounts

| Role | Email | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@backeri.local` | `password123` | Full access: Order Board, Prep Sheet, Slot/Holiday Manager, Pricing, Refunds, Analytics, Notification Log |
| **Baker** | `baker@backeri.local` | `password123` | Kitchen ops: Live Order Board, Daily Prep Sheet, Slot adjustments, one-click "Sold Out" toggle |
| **Customer** | `customer@backeri.local` | `password123` | Storefront ordering, cake customization & uploads, checkout, live order tracking |

## Running Integration & Concurrency Tests

```bash
npm test
```

Tests verify Redis menu caching, lead-time filtering, 10-minute Redis soft-locks, order & webhook idempotency, HMAC webhook verification, 10-way concurrent payment webhooks against a 3-slot cap (`SELECT ... FOR UPDATE`), Daily Prep Sheet SQL aggregation, and RBAC across all 3 roles.
