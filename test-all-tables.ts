import db from './lib/db';
async function test() {
  const q1 = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('shareview tables:', q1.rows.map(r => r.table_name));
  const q2 = await db.queryAnalytics("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('analytics tables:', q2.rows.map(r => r.table_name));
  process.exit(0);
}
test();
