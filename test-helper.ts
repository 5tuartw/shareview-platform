import db from './lib/db';
async function test() {
  const id1 = await db.getAnalyticsNetworkId('qvc');
  console.log('qvc ->', id1);
  const ids = await db.getAnalyticsNetworkIds(['qvc', 'boots']);
  console.log('qvc, boots ->', ids);
  process.exit(0);
}
test();
