import 'dotenv/config';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// This command intentionally cannot target a production or remote database.
const databaseUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || databaseUrl !== testUrl)
  throw new Error('DATABASE_URL must exactly equal TEST_DATABASE_URL.');
let database;
try {
  database = new URL(databaseUrl);
} catch {
  throw new Error('A valid local test database URL is required.');
}
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
  !decodeURIComponent(database.pathname).toLowerCase().includes('test')
)
  throw new Error('A local database whose name contains test is required.');
if (process.env.PAYMONGO_MODE !== 'test')
  throw new Error('PAYMONGO_MODE=test is required.');
const selfTest = process.argv.includes('--self-test');
const checkOnly = process.argv.includes('--check');
const apiKey = process.env.PAYMONGO_SECRET_KEY;
if (
  !selfTest &&
  (!apiKey?.startsWith('sk_test_') || /xxx|your_|placeholder/i.test(apiKey))
)
  throw new Error('A securely configured test API key is required.');
if (checkOnly) {
  console.log('Local test database and test-mode configuration checks passed.');
  process.exit(0);
}
process.env.PAYMONGO_ENABLED = 'false';
process.env.PAYMONGO_API_URL = 'https://api.paymongo.com';
process.env.PAYMONGO_WEBHOOK_SECRET = randomBytes(32).toString('hex');
const { NestFactory, BaseExceptionFilter } = await import('@nestjs/core');
const { AppModule } = await import('../dist/app.module.js');
const { PrismaService } = await import('../dist/database/prisma.service.js');
const { PaymentService } = await import('../dist/payment/payment.service.js');
const { parsePayMongoEvent, paidCheckoutDetails } =
  await import('../dist/payment/paymongo-webhook-event.js');

let app, prisma, tunnel, fixture, endpointUrl, hookId;
let stopping = false;
let deliveryCount = 0;
let firstSettlement;
let deliveryChecks = Promise.resolve();
let completed = false;
let authenticatedDelivery;
let sandboxSessionId;
let phase = 'local startup';
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
  });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function provider(path, method = 'GET', body) {
  const response = await fetch(`https://api.paymongo.com${path}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    let codes = [];
    let fields = [];
    try {
      const errorBody = await response.json();
      codes = (errorBody.errors ?? [])
        .map((error) => error.code)
        .filter(
          (code) => typeof code === 'string' && /^[a-z0-9_]+$/i.test(code),
        );
      fields = (errorBody.errors ?? [])
        .map((error) => error.source?.attribute ?? error.source?.pointer)
        .filter((field) =>
          [
            'url',
            'events',
            '/data/attributes/url',
            '/data/attributes/events',
          ].includes(field),
        );
    } catch {
      /* Never print a raw provider error body. */
    }
    const failure = new Error('Provider request rejected');
    failure.safeDetails = { httpStatus: response.status, codes, fields };
    throw failure;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function stopTunnel() {
  if (!tunnel?.pid || tunnel.exitCode !== null || tunnel.signalCode !== null)
    return;
  const ended = once(tunnel, 'exit');
  tunnel.kill('SIGTERM');
  await Promise.race([ended, delay(3000)]);
  if (tunnel.exitCode === null && tunnel.signalCode === null) {
    tunnel.kill('SIGKILL');
    await Promise.race([ended, delay(2000)]);
  }
}

try {
  app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
  app.setGlobalPrefix('api');
  // Only structural flags are logged: never raw payloads, headers, or customer data.
  app.useGlobalFilters(
    new (class extends BaseExceptionFilter {
      catch(error, host) {
        if (error?.getStatus?.() === 400) {
          const body = host.switchToHttp().getRequest().body;
          const event = body?.data;
          const session = event?.attributes?.data;
          const attributes = session?.attributes;
          console.log(
            JSON.stringify({
              rejectedPayloadShape: {
                rootDataPresent: event !== undefined,
                rootDataArray: Array.isArray(event),
                eventTypeValid: event?.type === 'event',
                eventIdPresent: typeof event?.id === 'string',
                eventModeBoolean:
                  typeof event?.attributes?.livemode === 'boolean',
                checkoutEventType:
                  event?.attributes?.type === 'checkout_session.payment.paid',
                checkoutResourceType: session?.type === 'checkout_session',
                referencePresent:
                  typeof attributes?.reference_number === 'string',
                paymentsArray: Array.isArray(attributes?.payments),
                paymentCount: Array.isArray(attributes?.payments)
                  ? attributes.payments.length
                  : null,
                flatEventTypePresent: typeof body?.event_type === 'string',
                nestedFlatEventTypePresent:
                  typeof event?.event_type === 'string',
              },
            }),
          );
        }
        super.catch(error, host);
      }
    })(app.getHttpAdapter()),
  );
  // The tunnel never exposes login, administration, customer, or checkout routes.
  app.use((req, res, next) => {
    res.setHeader('X-Caffeinawa-Webhook-Verification', 'local-test-only');
    if (req.method !== 'POST' || req.url !== '/api/webhooks/paymongo') {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.on('finish', () => {
      if (res.statusCode >= 400)
        console.log(JSON.stringify({ webhookHttpStatus: res.statusCode }));
    });
    next();
  });
  await app.listen(0, '127.0.0.1');
  prisma = app.get(PrismaService);
  const customer = await prisma.customer.create({
    data: {
      name: 'Isolated Webhook Verification',
      email: `webhook-${randomUUID()}@example.test`,
    },
  });
  fixture = {
    customerId: customer.id,
    sessionId: `cs_verify_${randomUUID().replaceAll('-', '')}`,
  };
  const order = await prisma.order.create({
    data: { customerId: customer.id, total: '250.00' },
  });
  fixture.orderId = order.id;
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'PAYMONGO',
      checkoutSessionId: fixture.sessionId,
      amount: '250.00',
      currency: 'PHP',
    },
  });
  fixture.paymentId = payment.id;
  const service = app.get(PaymentService);
  const settle = service.handlePayMongoPaymentPaid.bind(service);
  service.handlePayMongoPaymentPaid = async (event, rawBody) => {
    const details = paidCheckoutDetails(parsePayMongoEvent(event));
    // A temporary account webhook may receive unrelated sandbox events. Ignore
    // them after authentication, without writing unrelated test database rows.
    if (
      details.checkoutSessionId !== fixture.sessionId ||
      details.referenceNumber !== fixture.orderId
    )
      return;
    await settle(event, rawBody);
    authenticatedDelivery ??= { event, rawBody };
    deliveryChecks = deliveryChecks.then(async () => {
      const current = await prisma.payment.findUniqueOrThrow({
        where: { id: fixture.paymentId },
      });
      const currentOrder = await prisma.order.findUniqueOrThrow({
        where: { id: fixture.orderId },
      });
      const result = {
        paidAt: current.paidAt?.toISOString(),
        eventId: current.providerEventId,
      };
      if (current.status !== 'PAID' || currentOrder.status !== 'CONFIRMED')
        throw new Error('Settlement state verification failed');
      if (
        firstSettlement &&
        (firstSettlement.paidAt !== result.paidAt ||
          firstSettlement.eventId !== result.eventId)
      )
        throw new Error('Duplicate delivery changed settlement');
      firstSettlement ??= result;
      deliveryCount++;
      console.log(
        JSON.stringify({
          acceptedDeliveries: deliveryCount,
          paymentStatus: current.status,
          orderStatus: currentOrder.status,
          settlementPreserved: true,
          verification: selfTest
            ? 'local synthetic signature'
            : 'provider delivery',
        }),
      );
    });
    await deliveryChecks;
  };
  const template = {
    data: {
      id: `evt_verify_${randomUUID().replaceAll('-', '')}`,
      type: 'event',
      attributes: {
        type: 'checkout_session.payment.paid',
        livemode: false,
        data: {
          id: fixture.sessionId,
          type: 'checkout_session',
          attributes: {
            reference_number: order.id,
            payment_intent: { id: 'pi_isolated_verification' },
            payments: [
              {
                id: 'pay_isolated_verification',
                type: 'payment',
                attributes: {
                  status: 'paid',
                  amount: 25000,
                  currency: 'PHP',
                  payment_intent_id: 'pi_isolated_verification',
                },
              },
            ],
          },
        },
      },
    },
  };
  const address = app.getHttpServer().address();
  const localUrl = `http://127.0.0.1:${address.port}`;
  if (selfTest) {
    const blocked = await fetch(`${localUrl}/api/health/ready`);
    if (blocked.status !== 404) throw new Error('Route isolation failed');
    for (let i = 0; i < 2; i++) {
      const rawBody = JSON.stringify(template, null, 2);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const digest = createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET)
        .update(timestamp)
        .update('.')
        .update(rawBody)
        .digest('hex');
      const response = await fetch(`${localUrl}/api/webhooks/paymongo`, {
        method: 'POST',
        body: rawBody,
        headers: {
          'Content-Type': 'application/json',
          'Paymongo-Signature': `t=${timestamp},te=${digest},li=`,
        },
      });
      if (response.status !== 200)
        throw new Error(
          `Local signed HTTP verification failed: ${response.status}`,
        );
      await response.body?.cancel();
    }
  } else {
    phase = 'temporary tunnel startup';
    tunnel = spawn(
      'cloudflared',
      [
        'tunnel',
        '--no-autoupdate',
        '--metrics',
        '127.0.0.1:0',
        '--url',
        localUrl,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const hostname = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Temporary HTTPS tunnel startup timed out')),
        45000,
      );
      function scan(chunk) {
        const match = chunk
          .toString()
          .match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      }
      tunnel.stdout.on('data', scan);
      tunnel.stderr.on('data', scan);
      tunnel.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      tunnel.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Temporary HTTPS tunnel stopped'));
      });
    });
    endpointUrl = `${hostname}/api/webhooks/paymongo`;
    phase = 'temporary HTTPS reachability';
    console.log(JSON.stringify({ temporaryEndpointUrl: endpointUrl }));
    let reachable = false;
    for (let i = 0; i < 30 && !stopping; i++) {
      if (tunnel.exitCode !== null) throw new Error('Temporary tunnel stopped');
      try {
        const probe = await fetch(hostname, {
          redirect: 'error',
          signal: AbortSignal.timeout(2000),
        });
        const reached =
          probe.status === 404 &&
          probe.headers.get('X-Caffeinawa-Webhook-Verification') ===
            'local-test-only';
        await probe.body?.cancel();
        if (reached) {
          reachable = true;
          break;
        }
      } catch {
        /* A new hostname may need time to become reachable. */
      }
      await delay(1000);
    }
    if (!reachable)
      throw new Error('Temporary HTTPS receiver is not reachable');
    phase = 'test webhook registration';
    const created = await provider('/v1/webhooks', 'POST', {
      data: {
        attributes: {
          url: endpointUrl,
          events: ['checkout_session.payment.paid'],
        },
      },
    });
    hookId = created?.data?.id;
    const a = created?.data?.attributes;
    if (
      typeof hookId !== 'string' ||
      !hookId.startsWith('hook_') ||
      a?.livemode !== false ||
      a?.url !== endpointUrl ||
      typeof a?.secret_key !== 'string' ||
      !a.secret_key
    )
      throw new Error(
        'Temporary test webhook registration could not be verified',
      );
    process.env.PAYMONGO_WEBHOOK_SECRET = a.secret_key;
    phase = 'one-attempt sandbox checkout creation';
    // Do not retry creation on failure: a timed-out response may be ambiguous.
    console.log(
      JSON.stringify({ sandboxOrderReference: order.id, creationAttempts: 1 }),
    );
    const createdSession = await provider('/v2/checkout_sessions', 'POST', {
      data: {
        attributes: {
          line_items: [
            {
              name: 'Isolated webhook verification',
              amount: 25000,
              currency: 'PHP',
              quantity: 1,
            },
          ],
          payment_method_types: ['qrph'],
          reference_number: order.id,
          description: 'Isolated test-only webhook verification',
          send_email_receipt: false,
          show_line_items: true,
        },
      },
    });
    const session = createdSession?.data;
    if (
      session?.type !== 'checkout_session' ||
      !/^cs_[a-z0-9_]+$/i.test(session.id ?? '')
    )
      throw new Error('Invalid sandbox session response');
    sandboxSessionId = session.id;
    const verifiedSession = await provider(
      `/v1/checkout_sessions/${encodeURIComponent(session.id)}`,
    );
    const sessionAttributes = verifiedSession?.data?.attributes;
    if (
      sessionAttributes?.livemode !== false ||
      sessionAttributes?.reference_number !== order.id
    )
      throw new Error('Sandbox session mode or reference mismatch');
    const checkoutUrl = new URL(sessionAttributes.checkout_url);
    if (
      checkoutUrl.protocol !== 'https:' ||
      checkoutUrl.hostname !== 'checkout.paymongo.com' ||
      checkoutUrl.port ||
      checkoutUrl.username ||
      checkoutUrl.password
    )
      throw new Error('Invalid sandbox checkout origin');
    fixture.sessionId = session.id;
    await prisma.payment.update({
      where: { id: fixture.paymentId },
      data: { checkoutSessionId: session.id },
    });
    phase = 'waiting for sandbox simulator payment';
    console.log(
      JSON.stringify({
        temporaryTestWebhookId: hookId,
        endpointUrl,
        sandboxCheckoutUrl: checkoutUrl.href,
        sessionId: session.id,
        action:
          'Open this sandbox checkout and use ONLY the PayMongo test simulator. Never scan with a banking app or transfer real funds.',
      }),
    );
    const deadline = Date.now() + 15 * 60 * 1000;
    while (!stopping && deliveryCount < 1 && Date.now() < deadline)
      await delay(250);
    if (deliveryCount < 1)
      throw new Error(
        'Stopped before an authenticated sandbox payment delivery',
      );
    await deliveryChecks;
    // Replay the authenticated event locally to check settlement idempotency.
    // This is not a second provider delivery and is reported separately.
    await settle(authenticatedDelivery.event, authenticatedDelivery.rawBody);
    const replayed = await prisma.payment.findUniqueOrThrow({
      where: { id: fixture.paymentId },
    });
    const replayedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
    });
    if (
      replayed.status !== 'PAID' ||
      replayedOrder.status !== 'CONFIRMED' ||
      replayed.paidAt?.toISOString() !== firstSettlement.paidAt ||
      replayed.providerEventId !== firstSettlement.eventId
    )
      throw new Error('Authenticated event replay changed settlement');
    console.log(
      JSON.stringify({
        authenticatedProviderDeliveries: deliveryCount,
        localServiceReplayPreservedSettlement: true,
      }),
    );
  }
  await deliveryChecks;
  completed = deliveryCount >= (selfTest ? 2 : 1);
  console.log(
    JSON.stringify({
      signedWebhookVerification: completed ? 'passed' : 'incomplete',
      mode: 'test',
      database: 'isolated local test database',
      providerDelivery: !selfTest,
    }),
  );
} catch (error) {
  process.exitCode = 1;
  console.error(
    JSON.stringify({
      verificationFailedDuring: phase,
      ...(error.safeDetails ?? {}),
    }),
  );
} finally {
  if (sandboxSessionId) {
    try {
      const snapshot = await provider(
        `/v1/checkout_sessions/${encodeURIComponent(sandboxSessionId)}`,
      );
      const attributes = snapshot?.data?.attributes;
      if (
        attributes?.livemode !== false ||
        attributes?.reference_number !== fixture?.orderId
      )
        throw new Error('Sandbox session cleanup ownership mismatch');
      const paid = attributes.payments?.some(
        (p) => p.attributes?.status === 'paid',
      );
      if (!paid && attributes.status !== 'expired')
        await provider(
          `/v1/checkout_sessions/${encodeURIComponent(sandboxSessionId)}/expire`,
          'POST',
        );
      console.log(
        JSON.stringify({
          sandboxSessionCleanup: paid
            ? 'paid test record retained by provider'
            : 'expired',
        }),
      );
    } catch {
      process.exitCode = 1;
      console.error(
        `Sandbox session cleanup needs review: ${sandboxSessionId}`,
      );
    }
  }
  // A timed-out creation response can still leave a hook. The unique temporary
  // URL establishes ownership; cleanup never selects another endpoint by name.
  if (endpointUrl) {
    try {
      const listed = await provider('/v1/webhooks');
      const owned =
        listed?.data?.filter(
          (h) =>
            h.attributes?.url === endpointUrl &&
            h.attributes?.livemode === false,
        ) ?? [];
      for (const hook of owned) {
        // Disabling stops pending deliveries; deletion rejects active processes.
        await provider(
          `/v1/webhooks/${encodeURIComponent(hook.id)}/disable`,
          'POST',
        );
        await provider(`/v1/webhooks/${encodeURIComponent(hook.id)}`, 'DELETE');
      }
      console.log(
        JSON.stringify({ temporaryTestWebhooksDeleted: owned.length }),
      );
    } catch {
      process.exitCode = 1;
      console.error(
        `Temporary webhook cleanup needs manual review: ${hookId ?? endpointUrl}`,
      );
    }
  }
  await stopTunnel();
  if (prisma && fixture) {
    try {
      await deliveryChecks.catch(() => undefined);
      if (fixture.orderId)
        await prisma.paymentReconciliationIssue.deleteMany({
          where: {
            OR: [
              { orderId: fixture.orderId },
              { checkoutSessionId: fixture.sessionId },
            ],
          },
        });
      if (fixture.orderId)
        await prisma.payment.deleteMany({
          where: { orderId: fixture.orderId },
        });
      if (fixture.orderId)
        await prisma.order.deleteMany({ where: { id: fixture.orderId } });
      await prisma.customer.delete({ where: { id: fixture.customerId } });
      console.log('Isolated test fixtures deleted.');
    } catch {
      process.exitCode = 1;
      console.error('Isolated test fixture cleanup needs review.');
    }
  }
  if (app) await app.close();
}
