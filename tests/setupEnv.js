// Runs before every test file. dotenv never overwrites values that are already set,
// so in CI the workflow's env wins and locally .env.test is used.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.test') });
process.env.NODE_ENV = 'test';
