# status-list-server

A lightweight server for managing [Token Status List (TSL)](https://datatracker.ietf.org/doc/draft-ietf-oauth-status-list), enabling credential issuers to publish and update the revocation/suspension status of verifiable credentials.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Hono** - Lightweight, performant server framework
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **SQLite** - File-based database engine
- **Biome** - Linting & formatting

## Getting Started

Install the dependencies:

```bash
bun install
```

## Environment Variables

Create a `.env` file in the `apps/server` directory with the following variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite database file path (e.g. `file:local.db`) |
| `CORS_ORIGIN` | Yes | Allowed CORS origin URL (e.g. `http://localhost:3000`) |
| `API_KEY` | Yes | Secret key used to authenticate write requests via the `x-api-key` header |
| `NODE_ENV` | No | Runtime environment — `development`, `production`, or `test` (default: `development`) |

Example `.env`:

```env
DATABASE_URL=file:local.db
CORS_ORIGIN=http://localhost:3000
API_KEY=your-secret-api-key
NODE_ENV=development
```

## Database Setup

This project uses SQLite (file-based) with Drizzle ORM. Migrations run automatically on server startup.

1. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

The API is running at [http://localhost:3000](http://localhost:3000).

## API Endpoints

All write endpoints require the `x-api-key` header with the configured `API_KEY` value.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `POST` | `/status-lists` | Required | Create a new status list |
| `PATCH` | `/status-lists/:list_id` | Required | Update an existing status list |
| `GET` | `/status-lists/:list_id` | None | Retrieve a status list JWT |

### POST /status-lists

```json
{
  "id": "<uuid>",
  "jwt": "<status-list-jwt>"
}
```

### PATCH /status-lists/:list_id

```json
{
  "jwt": "<updated-status-list-jwt>"
}
```

`GET /status-lists/:list_id` returns the status list as `application/statuslist+jwt`.

## Docker

Build and run with Docker:

```bash
docker build -t status-list-server .
docker run -p 3000:3000 \
  -e DATABASE_URL=file:local.db \
  -e CORS_ORIGIN=http://localhost:3000 \
  -e API_KEY=your-secret-api-key \
  status-list-server
```

## Project Structure

```
status-list-server/
├── apps/
│   └── server/          # Backend API (Hono)
├── packages/
│   ├── db/              # Database schema, migrations & queries
│   └── env/             # Environment variable validation
```

## Available Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start the server in development mode |
| `bun run dev:server` | Start only the server |
| `bun run build` | Build all packages |
| `bun run check-types` | Check TypeScript types across all packages |
| `bun run db:push` | Push schema changes to the database |
| `bun run db:generate` | Generate Drizzle migration files |
| `bun run db:migrate` | Run database migrations |
| `bun run db:studio` | Open Drizzle Studio UI |
| `bun run style:check` | Run Biome linter and formatter check |
| `bun run style:fix` | Run Biome linter and auto-fix formatting |
