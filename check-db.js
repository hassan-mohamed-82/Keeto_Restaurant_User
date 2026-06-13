const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDb() {
  console.log('Connecting to:', process.env.DATABASE_NAME);
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });

  try {
    const [notifications] = await connection.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10');
    console.log('--- LATEST 10 NOTIFICATIONS ---');
    console.dir(notifications, { depth: null });

    const [orders] = await connection.query('SELECT id, order_number, restaurant_id, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10');
    console.log('--- LATEST 10 ORDERS ---');
    console.dir(orders, { depth: null });

    const [restaurantadmins] = await connection.query('SELECT id, name, email, restaurant_id, type FROM restrauntadmins LIMIT 10');
    console.log('--- RESTAURANT ADMINS ---');
    console.dir(restaurantadmins, { depth: null });

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

checkDb();
