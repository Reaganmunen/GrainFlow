const { request, app, seedUsers, as, closeDb, PASSWORD } = require('./helpers');

let tokens;
beforeAll(async () => { tokens = await seedUsers(); });
afterAll(closeDb);

describe('server', () => {
  test('health check answers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  test('unknown API route is refused when signed out', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(401);
  });

  test('unknown API route returns 404 JSON when signed in', async () => {
    const res = await request(app).get('/api/does-not-exist').set(as(tokens.owner));
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('sign in', () => {
  test('wrong password is refused', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'ci_owner', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('right password returns a token and the user', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'ci_owner', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.username).toBe('ci_owner');
  });

  test('protected routes need a token', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
  });

  test('/auth/me returns the signed-in user', async () => {
    const res = await request(app).get('/api/auth/me').set(as(tokens.owner));
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('ci_owner');
  });

  test('a signed-out token stops working', async () => {
    const t = tokens.cashier;
    expect((await request(app).post('/api/auth/logout').set(as(t))).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(as(t))).status).toBe(401);
    tokens = await seedUsers(); // get a fresh cashier token for the tests below
  });
});

describe('owner-only admin routes', () => {
  const routes = ['/api/settings', '/api/settings/profile', '/api/activity-log', '/api/activity-log/categories', '/api/backups', '/api/users', '/api/roles'];

  test.each(routes)('owner can open %s', async (path) => {
    const res = await request(app).get(path).set(as(tokens.owner));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test.each(routes)('cashier is refused on %s', async (path) => {
    const res = await request(app).get(path).set(as(tokens.cashier));
    expect([401, 403]).toContain(res.status);
  });
});

describe('module separation', () => {
  test('a cereal cashier cannot use the posho mill API', async () => {
    const res = await request(app).get('/api/mill/jobs').set(as(tokens.cashier));
    expect([401, 403]).toContain(res.status);
  });

  test('a cereal cashier can use the cereal basics', async () => {
    const res = await request(app).get('/api/customers').set(as(tokens.cashier));
    expect(res.status).toBe(200);
  });
});

describe('settings round trip', () => {
  test('owner can save and read back the business profile', async () => {
    const before = (await request(app).get('/api/settings/profile').set(as(tokens.owner))).body.data || {};
    const name = before.business_name || 'CI Test Business';
    const put = await request(app).put('/api/settings/profile').set(as(tokens.owner)).send({ business_name: name, receipt_footer: 'CI footer' });
    expect(put.status).toBe(200);
    const after = await request(app).get('/api/settings/profile').set(as(tokens.owner));
    expect(after.body.data.receipt_footer).toBe('CI footer');
  });
});