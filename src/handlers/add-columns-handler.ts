import { getPool } from '../config/database';

export async function handler(): Promise<any> {
  console.log('Adding missing columns...');
  
  try {
    const pool = await getPool();
    
    console.log('Adding color columns to leagues table...');
    await pool.query('ALTER TABLE leagues ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7)');
    await pool.query('ALTER TABLE leagues ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7)');
    console.log('✓ Added color columns to leagues');
    
    console.log('Adding columns to teams table...');
    await pool.query('ALTER TABLE teams ADD COLUMN IF NOT EXISTS abbreviation VARCHAR(10)');
    await pool.query('ALTER TABLE teams ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7)');
    await pool.query('ALTER TABLE teams ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7)');
    console.log('✓ Added columns to teams');
    
    console.log('✅ All columns added successfully!');
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Columns added successfully' }),
    };
  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
    };
  }
}
