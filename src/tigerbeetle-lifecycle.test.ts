import { describe, expect, it } from 'vitest';
import {
  createClient,
  id,
  CreateAccountStatus,
  type CreateAccountResult,
  type Account,
  type Client,
} from 'tigerbeetle-node';
import { StartedTigerBeetleContainer, TigerBeetleContainer } from './tigerbeetle-container';

const LEDGER = 1;
const CODE = 1;

function account(accountId: bigint): Account {
  return {
    id: accountId,
    debits_pending: 0n,
    debits_posted: 0n,
    credits_pending: 0n,
    credits_posted: 0n,
    user_data_128: 0n,
    user_data_64: 0n,
    user_data_32: 0,
    reserved: 0,
    ledger: LEDGER,
    code: CODE,
    flags: 0,
    timestamp: 0n,
  };
}

function accountErrorNames(results: CreateAccountResult[]): string[] {
  return results.filter((r) => r.status !== CreateAccountStatus.created).map((r) => CreateAccountStatus[r.status]);
}

function clientFor(container: StartedTigerBeetleContainer): Client {
  return createClient({
    cluster_id: container.getClusterId(),
    replica_addresses: [container.getAddress()],
  });
}

describe('TigerBeetleContainer lifecycle', () => {
  it('runs two isolated instances concurrently', async () => {
    const [a, b] = await Promise.all([new TigerBeetleContainer().start(), new TigerBeetleContainer().start()]);
    let clientA: Client | undefined;
    let clientB: Client | undefined;
    try {
      expect(a.getAddress()).not.toBe(b.getAddress());

      clientA = clientFor(a);
      clientB = clientFor(b);

      const accountIdA = id();
      const errorsA = await clientA.createAccounts([account(accountIdA)]);
      expect(accountErrorNames(errorsA)).toEqual([]);

      // Data isolation: the account created in A must not be visible from B.
      const lookupOnB = await clientB.lookupAccounts([accountIdA]);
      expect(lookupOnB).toHaveLength(0);

      // B is functional, not just empty.
      const accountIdB = id();
      const errorsB = await clientB.createAccounts([account(accountIdB)]);
      expect(accountErrorNames(errorsB)).toEqual([]);
    } finally {
      clientA?.destroy();
      clientB?.destroy();
      await Promise.all([a.stop(), b.stop()]);
    }
  });

  it('starts fresh after a previous instance stopped', async () => {
    const rememberedId = id();

    const first = await new TigerBeetleContainer().start();
    try {
      const firstClient = clientFor(first);
      try {
        const errors = await firstClient.createAccounts([account(rememberedId)]);
        expect(accountErrorNames(errors)).toEqual([]);
      } finally {
        firstClient.destroy();
      }
    } finally {
      await first.stop();
    }

    const second = await new TigerBeetleContainer().start();
    let secondClient: Client | undefined;
    try {
      secondClient = clientFor(second);

      // No data bleed between sequential instances.
      const lookup = await secondClient.lookupAccounts([rememberedId]);
      expect(lookup).toHaveLength(0);

      // The second instance is fully functional.
      const errors = await secondClient.createAccounts([account(id())]);
      expect(accountErrorNames(errors)).toEqual([]);
    } finally {
      secondClient?.destroy();
      await second.stop();
    }
  });

  it('stop() is safe to call twice', async () => {
    const container = await new TigerBeetleContainer().start();
    await container.stop();
    await expect(container.stop()).resolves.not.toThrow();
  });

  it('boots an explicit image passed via the constructor', async () => {
    const container = await new TigerBeetleContainer('ghcr.io/tigerbeetle/tigerbeetle:0.17.6').start();
    let client: Client | undefined;
    try {
      client = clientFor(container);
      const accountId = id();
      const errors = await client.createAccounts([account(accountId)]);
      expect(accountErrorNames(errors)).toEqual([]);
      const lookup = await client.lookupAccounts([accountId]);
      expect(lookup).toHaveLength(1);
    } finally {
      client?.destroy();
      await container.stop();
    }
  }, 30_000);

  it('fails fast on a nonexistent image', async () => {
    await expect(
      new TigerBeetleContainer('ghcr.io/tigerbeetle/tigerbeetle:0.0.0-does-not-exist').start(),
    ).rejects.toThrow();
  });
});
