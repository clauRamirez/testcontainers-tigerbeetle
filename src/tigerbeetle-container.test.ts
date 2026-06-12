import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, id, CreateAccountError, CreateTransferError, type Account, type Client, type Transfer } from "tigerbeetle-node";
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

function accountErrorNames(errors: { index: number; result: number }[]): string[] {
  return errors.map((e) => `[${e.index}] ${CreateAccountError[e.result]}`);
}

function transferErrorNames(errors: { index: number; result: number }[]): string[] {
  return errors.map((e) => `[${e.index}] ${CreateTransferError[e.result]}`);
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

  it("exposes working accessors", () => {
    expect(container.getAddress()).toMatch(/^\d+\.\d+\.\d+\.\d+:\d+$/);
    expect(container.getAddress()).not.toContain("localhost");
    expect(container.getPort()).toBeGreaterThan(0);
    expect(container.getClusterId()).toBe(0n);
  });
});
