# Database Migrations

This directory contains database migration files for the ScoreBase Backend API using `node-pg-migrate`.

## Prerequisites

- PostgreSQL 15+ database instance
- Environment variables configured (see `.env.example`)

## Environment Variables

Set the following environment variables before running migrations:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=scorebase
DB_USER=postgres
DB_PASSWORD=your_password_here
```

Alternatively, set `DATABASE_URL`:

```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/scorebase
```

## Migration Commands

### Create a new migration

```bash
npm run migrate:create -- <migration-name>
```

Example:
```bash
npm run migrate:create -- create-initial-schema
```

This creates a new TypeScript migration file in the `migrations/` directory.

### Run pending migrations

```bash
npm run migrate:up
```

Applies all pending migrations to the database.

### Rollback the last migration

```bash
npm run migrate:down
```

Reverts the most recently applied migration.

### Check migration status

```bash
npm run migrate:status
```

Shows which migrations have been applied and which are pending.

### Redo the last migration

```bash
npm run migrate:redo
```

Rolls back and re-applies the last migration (useful for testing).

## Migration File Structure

Each migration file exports two functions:

```typescript
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Apply schema changes
  pgm.createTable('example', {
    id: 'id',
    name: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('NOW()') }
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Revert schema changes
  pgm.dropTable('example');
}
```

## Best Practices

1. **Reversible Migrations**: Always implement both `up` and `down` functions
2. **Test Before Production**: Run migrations on staging environment first
3. **Atomic Changes**: Keep migrations focused on a single logical change
4. **No Data Loss**: Ensure `down` migrations preserve data when possible
5. **Multi-Tenant Aware**: All tables must include `tenant_id` column with appropriate indexes

## Multi-Tenant Requirements

Every table MUST include:

```typescript
pgm.createTable('table_name', {
  id: 'id',
  tenant_id: { type: 'uuid', notNull: true },
  // ... other columns
});

// Add index for tenant isolation
pgm.createIndex('table_name', 'tenant_id');

// Add foreign key to tenants table
pgm.addConstraint('table_name', 'fk_table_name_tenant', {
  foreignKeys: {
    columns: 'tenant_id',
    references: 'tenants(id)',
    onDelete: 'CASCADE'
  }
});
```

## Deployment

Migrations should be run as part of the deployment pipeline:

1. **Development**: Run manually using `npm run migrate:up`
2. **Staging**: Run via CI/CD before deploying Lambda
3. **Production**: Run via CI/CD with approval gate before deploying Lambda

## Troubleshooting

### Connection Issues

If migrations fail to connect:

1. Verify database credentials in environment variables
2. Check database is accessible from your network
3. Verify PostgreSQL is running and accepting connections
4. Check security groups (AWS RDS) allow connections

### Migration Failures

If a migration fails mid-execution:

1. Check the migration status: `npm run migrate:status`
2. Manually fix any partial changes in the database
3. Re-run the migration: `npm run migrate:up`
4. If needed, rollback: `npm run migrate:down`

### Rollback Issues

If rollback fails:

1. Check the `down` function is properly implemented
2. Verify no dependent data exists (foreign key constraints)
3. Manually clean up if necessary
4. Fix the migration file and retry
