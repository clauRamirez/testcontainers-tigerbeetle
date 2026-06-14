# testcontainers-tigerbeetle

Node.js library for **[TigerBeetle](https://tigerbeetle.com/) integration testing via
[Testcontainers](https://testcontainers.com/)**.

## Install

```bash
npm install --save-dev testcontainers-tigerbeetle
```

## Usage

Create an instance of `TigerBeetleContainer` and then call `start` method which returns `StartedTigerBeetleContainer`.

Creates a container using the specified image. Defaults to the latest stable TigerBeetle release (currently `0.17.6`).

### `StartedTigerBeetleContainer`

| Method | Returns | Description |
| --- | --- | --- |
| `getAddress()` | `string` | `host:port` address for the TigerBeetle client |
| `getPort()` | `number` | Mapped host port |
| `getClusterId()` | `bigint` | Cluster ID (always `0n`) |
| `logs()` | `Promise<ReadableStream>` | Container log stream |
| `stop()` | `Promise<void>` | Stops and removes the container |

## Example

```ts
import { createClient, id } from 'tigerbeetle-node';
import { TigerBeetleContainer } from 'testcontainers-tigerbeetle';

async function run() {
  const container = await new TigerBeetleContainer().start();

  const client = createClient({
    cluster_id: container.getClusterId(),
    replica_addresses: [container.getAddress()],
  });

  await client.createAccounts([
    {
      // ...
    },
  ]);

  client.destroy();
  await container.stop();
}

run();
```
