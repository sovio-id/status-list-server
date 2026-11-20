# status-list-server

A lightweight server for managing status lists, enabling credential issuers to publish and update the revocation/suspension status of verifiable credentials.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Hono** - Lightweight, performant server framework
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - External relational database
- **Biome** - Linting & formatting

## Getting Started

Install the dependencies:

```bash
bun install
```

Create a `.env` file in the `apps/server` directory with the following variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URL, e.g. `postgresql://user:password@host:5432/statuslist` |
| `API_KEY` | Yes | Secret key used to authenticate write requests via the `x-api-key` header |
| `PORT` | Yes | Port the server listens on |

Example `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/statuslist
API_KEY=your-secret-api-key
PORT=3000
```

## Database Setup

This project uses an external PostgreSQL database with Drizzle ORM. Migrations are not run automatically when the application process starts.

Apply migrations before starting the server or before deploying a new image:

```bash
bun run db:migrate
```

Run the development server:

```bash
bun run dev
```

The API is running at [http://localhost:3000](http://localhost:3000).

### Migrating data from SQLite

If an existing SQLite database must be preserved, apply the PostgreSQL migrations first, then run:

```bash
SQLITE_DB_PATH=/path/to/status-list.db DATABASE_URL=postgresql://user:password@host:5432/statuslist \
  bun run db:migrate:sqlite-to-postgres
```

The importer preserves `id`, `status_list`, `format`, `version`, and timestamp values.

## API Endpoints

All write endpoints require the `x-api-key` header with the configured `API_KEY` value.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `POST` | `/status-lists` | Required | Create a new status list |
| `PATCH` | `/status-lists/:list_id` | Required | Update an existing status list |
| `GET` | `/status-lists/:list_id` | None | Retrieve a status list |

### POST /status-lists

```json
{
  "id": "<uuid>",
  "jwt": "<status-list-jwt>"
}
```

or:

```json
{
  "id": "<uuid>",
  "vc": "<bitstring-status-list-credential>"
}
```

### PATCH /status-lists/:list_id

```json
{
  "jwt": "<updated-status-list-jwt>"
}
```

or:

```json
{
  "vc": "<updated-bitstring-status-list-credential>"
}
```

`GET /status-lists/:list_id` returns the stored list with the matching content type: `application/statuslist+jwt` for token lists or `application/ld+json` for bitstring lists.

## Docker

Build and run with Docker:

```bash
docker build -t status-list-server .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:password@host:5432/statuslist \
  -e API_KEY=your-secret-api-key \
  status-list-server
```

The container runs PostgreSQL migrations once before starting the API.

To use a custom port:

```bash
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://user:password@host:5432/statuslist \
  -e API_KEY=your-secret-api-key \
  -e PORT=8080 \
  status-list-server
```

## Testing

Tests require a dedicated PostgreSQL database:

```bash
TEST_DATABASE_URL=postgresql://user:password@host:5432/statuslist_test \
  bun run --filter server test
```

## Project Structure

```
status-list-server/
├── apps/
│   └── server/          # Backend API (Hono)
├── packages/
│   ├── db/              # Database schema, migrations & queries
│   └── env/             # Environment variable validation
└── scripts/             # One-time data migration scripts
```

## Available Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start the server in development mode |
| `bun run build` | Build all packages |
| `bun run check-types` | Check TypeScript types across all packages |
| `bun run db:generate` | Generate Drizzle migration files |
| `bun run db:migrate` | Run database migrations manually |
| `bun run db:migrate:sqlite-to-postgres` | Import data from a legacy SQLite database |
| `bun run db:studio` | Open Drizzle Studio UI |
| `bun run style:check` | Run Biome linter and formatter check |
| `bun run style:fix` | Run Biome linter and auto-fix formatting |
