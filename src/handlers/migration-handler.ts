import { runMigrations } from '../scripts/run-migrations';

export async function handler(): Promise<any> {
  console.log('Migration handler invoked');
  const result = await runMigrations();
  return {
    statusCode: result.success ? 200 : 500,
    body: JSON.stringify(result),
  };
}
