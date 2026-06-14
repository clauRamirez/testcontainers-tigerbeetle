import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createClient,
  id,
  CreateAccountStatus,
  CreateTransferStatus,
  type CreateAccountResult,
  type CreateTransferResult,
  type Account,
  type Client,
  type Transfer,
} from "tigerbeetle-node";
import { StartedTigerBeetleContainer, TigerBeetleContainer } from "./tigerbeetle-container";

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

function transfer(debitAccountId: bigint, creditAccountId: bigint, amount: bigint): Transfer {
  return {
    id: id(),
    debit_account_id: debitAccountId,
    credit_account_id: creditAccountId,
    amount,
    pending_id: 0n,
    user_data_128: 0n,
    user_data_64: 0n,
    user_data_32: 0,
    timeout: 0,
    ledger: LEDGER,
    code: CODE,
    flags: 0,
    timestamp: 0n,
  };
}

function accountErrorNames(results: CreateAccountResult[]): string[]{
  return results
    .filter((r) => r.status !== CreateAccountStatus.created)
    .map((r) => CreateTransferStatus[r.status]);
}

function transferErrorNames(results: CreateTransferResult[]): string[] {
  return results
    .filter((r) => r.status !== CreateTransferStatus.created)
    .map((r) => CreateTransferStatus[r.status]);
}

describe("TigerBeetleContainer", () => {
  let container: StartedTigerBeetleContainer;
  let client: Client;

  beforeAll(async () => {
    container = await new TigerBeetleContainer().start();
    client = createClient({
      cluster_id: container.getClusterId(),
      replica_addresses: [container.getAddress()],
    });
  });

  afterAll(async () => {
    client?.destroy();
    await container?.stop();
  });

  it("creates two accounts and transfers between them", async () => {
    const debitAccountId = id();
    const creditAccountId = id();

    const accountErrors = await client.createAccounts([account(debitAccountId), account(creditAccountId)]);
    expect(accountErrorNames(accountErrors)).toEqual([]);

    const transferErrors = await client.createTransfers([transfer(debitAccountId, creditAccountId, 100n)]);
    expect(transferErrorNames(transferErrors)).toEqual([]);

    const accounts = await client.lookupAccounts([debitAccountId, creditAccountId]);
    expect(accounts).toHaveLength(2);
    const debitAccount = accounts.find((a) => a.id === debitAccountId);
    const creditAccount = accounts.find((a) => a.id === creditAccountId);
    expect(debitAccount?.debits_posted).toBe(100n);
    expect(creditAccount?.credits_posted).toBe(100n);
  });

  it("serves multiple concurrent clients", async () => {
    const secondClient = createClient({
      cluster_id: container.getClusterId(),
      replica_addresses: [container.getAddress()],
    });
    try {
      const [debitA, creditA, debitB, creditB] = [id(), id(), id(), id()];

      const [accountErrors1, accountErrors2] = await Promise.all([
        client.createAccounts([account(debitA), account(creditA)]),
        secondClient.createAccounts([account(debitB), account(creditB)]),
      ]);
      expect(accountErrorNames(accountErrors1)).toEqual([]);
      expect(accountErrorNames(accountErrors2)).toEqual([]);

      const [transferErrors1, transferErrors2] = await Promise.all([
        client.createTransfers([transfer(debitA, creditA, 10n)]),
        secondClient.createTransfers([transfer(debitB, creditB, 20n)]),
      ]);
      expect(transferErrorNames(transferErrors1)).toEqual([]);
      expect(transferErrorNames(transferErrors2)).toEqual([]);
    } finally {
      secondClient.destroy();
    }
  });

  it("exposes container logs", async () => {
    const stream = await container.logs();
    const content = await new Promise<string>((resolve) => {
      let buffer = "";
      const finish = () => resolve(buffer);
      const timer = setTimeout(finish, 5_000);
      stream.on("data", (chunk: Buffer | string) => {
        buffer += String(chunk);
        clearTimeout(timer);
        finish();
      });
      stream.on("end", finish);
    });
    expect(content).toMatch(/\S/);
  });

  it("exposes working accessors", () => {
    expect(container.getAddress()).toMatch(/^\d+\.\d+\.\d+\.\d+:\d+$/);
    expect(container.getAddress()).not.toContain("localhost");
    expect(container.getPort()).toBeGreaterThan(0);
    expect(container.getClusterId()).toBe(0n);
  });
});
